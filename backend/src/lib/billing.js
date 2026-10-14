// The room bill: everything a stay is charged for (room service, restaurant, vehicles,
// extras, discounts) and the money received (UPI, cash, card, advance).
// Money is always in paise (₹1 = 100). Amounts are stored before tax; each charge keeps
// the tax rate it was made with, so changing the rates never alters an existing bill.
//
// A payment covers the charges linked to it. An item's status is:
//   paid     linked to a confirmed payment (or the bill is fully covered, e.g. by an advance)
//   pending  linked to a payment the guest sent (UTR) that the front desk hasn't checked yet
//   unpaid   otherwise
import { query, transaction } from '../db/pool.js';
import { broadcastMessage, saveMessage } from './chat.js';
import { emitToConversation, emitToStaff } from './realtime.js';
import { HttpError, notFound } from './errors.js';

export const STAFF_CHARGE_KINDS = ['restaurant', 'extra', 'discount'];
export const PAYMENT_METHODS = ['upi', 'cash', 'card', 'other'];
const TAX_RATE = { room_service: 'tax_food_pct', restaurant: 'tax_food_pct', vehicle: 'tax_vehicle_pct', extra: 'tax_other_pct' };
const METHOD_LABEL = { upi: 'UPI', cash: 'cash', card: 'card', advance: 'advance', other: 'other' };

export const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const taxOf = (amount, pct) => Math.round((amount * Number(pct)) / 100);

/** Adds a bill line. Pass `db` (a transaction client) when it's part of a bigger change. */
export async function addCharge({ db = { query }, hotelId, stayId, kind, description, amountPaise, orderId = null, vehicleBookingId = null, staffId = null }) {
  let pct = 0;
  if (TAX_RATE[kind]) {
    const { rows: [hotel] } = await db.query(`SELECT ${TAX_RATE[kind]} AS pct FROM hotels WHERE id = $1`, [hotelId]);
    pct = Number(hotel?.pct ?? 0);
  }
  const { rows: [charge] } = await db.query(
    `INSERT INTO charges (hotel_id, stay_id, kind, description, amount_paise, tax_pct, tax_paise, order_id, vehicle_booking_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [hotelId, stayId, kind, description, amountPaise, pct, taxOf(amountPaise, pct), orderId, vehicleBookingId, staffId],
  );
  return charge;
}

/** True when a payment (sent or confirmed) already covers this charge. */
export async function chargeHasPayment(db, where, value) {
  const { rows: [row] } = await db.query(
    `SELECT 1 FROM charges c JOIN payment_charges pc ON pc.charge_id = c.id JOIN payments p ON p.id = pc.payment_id
      WHERE c.${where} = $1 AND c.voided_at IS NULL AND p.status <> 'rejected' LIMIT 1`,
    [value],
  );
  return Boolean(row);
}

/** Removes a room-service order or vehicle booking from the bill (when it's cancelled). */
export async function voidChargeFor(db, where, value) {
  await db.query(`UPDATE charges SET voided_at = now() WHERE ${where} = $1 AND voided_at IS NULL`, [value]);
}

// ---------- Reading a bill ----------

async function loadBill(db, hotelId, stayId) {
  const { rows: [stay] } = await db.query(
    `SELECT s.id, s.guest_name, s.guest_login, s.active, s.checked_in_at, s.checked_out_at, r.number AS room_number,
            h.name AS hotel_name, h.gstin
       FROM stays s JOIN rooms r ON r.id = s.room_id JOIN hotels h ON h.id = s.hotel_id
      WHERE s.id = $1 AND s.hotel_id = $2`,
    [stayId, hotelId],
  );
  if (!stay) throw notFound('Bill not found');

  const { rows: charges } = await db.query(
    `SELECT c.id, c.kind, c.description, c.amount_paise, c.tax_pct, c.tax_paise, c.order_id, c.vehicle_booking_id, c.created_at,
            (SELECT p.status FROM payment_charges pc JOIN payments p ON p.id = pc.payment_id
              WHERE pc.charge_id = c.id AND p.status <> 'rejected'
              ORDER BY (p.status = 'confirmed') DESC LIMIT 1) AS pay_status
       FROM charges c
      WHERE c.stay_id = $1 AND c.voided_at IS NULL
      ORDER BY c.created_at, c.id`,
    [stayId],
  );
  const { rows: payments } = await db.query(
    `SELECT p.id, p.amount_paise, p.method, p.utr, p.status, p.note, p.from_guest, p.created_at, p.decided_at,
            st.name AS staff_name,
            COALESCE(array_agg(pc.charge_id ORDER BY pc.charge_id) FILTER (WHERE pc.charge_id IS NOT NULL), '{}') AS charge_ids
       FROM payments p
       LEFT JOIN staff st ON st.id = p.staff_id
       LEFT JOIN payment_charges pc ON pc.payment_id = p.id
      WHERE p.stay_id = $1
      GROUP BY p.id, st.name
      ORDER BY p.created_at, p.id`,
    [stayId],
  );

  const sum = (list, fn) => list.reduce((total, x) => total + fn(x), 0);
  const subtotal = sum(charges.filter((c) => c.kind !== 'discount'), (c) => c.amount_paise);
  const discount = sum(charges.filter((c) => c.kind === 'discount'), (c) => c.amount_paise);
  const tax = sum(charges, (c) => c.tax_paise);
  const total = subtotal + discount + tax;
  const paid = sum(payments.filter((p) => p.status === 'confirmed'), (p) => p.amount_paise);
  const pending = sum(payments.filter((p) => p.status === 'pending'), (p) => p.amount_paise);
  const balance = total - paid;

  const taxes = new Map();
  for (const c of charges) {
    if (c.tax_paise) taxes.set(Number(c.tax_pct), (taxes.get(Number(c.tax_pct)) ?? 0) + c.tax_paise);
  }

  return {
    stay: {
      id: stay.id, roomNumber: stay.room_number, guestName: stay.guest_name, guestLogin: stay.guest_login,
      active: stay.active, checkedInAt: stay.checked_in_at, checkedOutAt: stay.checked_out_at,
    },
    hotel: { name: stay.hotel_name, gstin: stay.gstin },
    items: charges.map((c) => ({
      id: c.id,
      kind: c.kind,
      description: c.description,
      amountPaise: c.amount_paise,
      taxPct: Number(c.tax_pct),
      taxPaise: c.tax_paise,
      totalPaise: c.amount_paise + c.tax_paise,
      orderId: c.order_id,
      vehicleBookingId: c.vehicle_booking_id,
      createdAt: c.created_at,
      status: c.kind === 'discount' ? null
        : c.pay_status === 'confirmed' ? 'paid'
          : c.pay_status === 'pending' ? 'pending'
            : balance <= 0 ? 'paid' : 'unpaid',
    })),
    payments: payments.map((p) => ({
      id: p.id, amountPaise: p.amount_paise, method: p.method, utr: p.utr, status: p.status, note: p.note,
      fromGuest: p.from_guest, staffName: p.staff_name, chargeIds: p.charge_ids, createdAt: p.created_at, decidedAt: p.decided_at,
    })),
    subtotalPaise: subtotal,
    discountPaise: discount,
    taxPaise: tax,
    taxes: [...taxes].sort((a, b) => a[0] - b[0]).map(([pct, paise]) => ({ pct, paise })),
    totalPaise: total,
    paidPaise: paid,
    pendingPaise: pending,
    balancePaise: balance,
    // What can still be paid now (payments waiting for a check are not counted twice).
    dueNowPaise: Math.max(0, balance - pending),
  };
}

export const getBill = (hotelId, stayId) => loadBill({ query }, hotelId, stayId);

/** Current guests (and those who left in the last 30 days) with their totals. */
export async function listBills(hotelId) {
  const { rows } = await query(
    `SELECT s.id, s.guest_name, s.active, s.checked_in_at, s.checked_out_at, r.number AS room_number,
            COALESCE(ch.total, 0)::int AS total, COALESCE(pay.paid, 0)::int AS paid, COALESCE(pay.pending, 0)::int AS pending
       FROM stays s
       JOIN rooms r ON r.id = s.room_id
       LEFT JOIN LATERAL (
         SELECT sum(amount_paise + tax_paise) AS total FROM charges WHERE stay_id = s.id AND voided_at IS NULL
       ) ch ON true
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE status = 'pending') AS pending,
                sum(amount_paise) FILTER (WHERE status = 'confirmed') AS paid
           FROM payments WHERE stay_id = s.id
       ) pay ON true
      WHERE s.hotel_id = $1 AND (s.active OR s.checked_out_at > now() - interval '30 days')
      ORDER BY s.active DESC, length(r.number), r.number, s.checked_out_at DESC`,
    [hotelId],
  );
  return rows.map((s) => ({
    stayId: s.id, roomNumber: s.room_number, guestName: s.guest_name, active: s.active,
    checkedInAt: s.checked_in_at, checkedOutAt: s.checked_out_at,
    totalPaise: s.total, paidPaise: s.paid, balancePaise: s.total - s.paid, pendingPayments: s.pending,
  }));
}

/** Payments guests sent that the front desk still has to check. */
export async function pendingPayments(hotelId) {
  const { rows } = await query(
    `SELECT p.id, p.stay_id, p.amount_paise, p.utr, p.created_at, r.number AS room_number, s.guest_name
       FROM payments p JOIN stays s ON s.id = p.stay_id JOIN rooms r ON r.id = s.room_id
      WHERE p.hotel_id = $1 AND p.status = 'pending'
      ORDER BY p.created_at`,
    [hotelId],
  );
  return rows.map((p) => ({
    id: p.id, stayId: p.stay_id, roomNumber: p.room_number, guestName: p.guest_name,
    amountPaise: p.amount_paise, utr: p.utr, createdAt: p.created_at,
  }));
}

// ---------- Changing a bill ----------

async function tellGuest(hotelId, stayId, text) {
  const message = await saveMessage({ stayId, sender: 'system', body: text });
  broadcastMessage(hotelId, message);
}

export function billChanged(hotelId, stayId) {
  emitToConversation(hotelId, stayId, 'bill:updated', { stayId });
}

/** Front desk adds a restaurant bill, an extra (laundry, minibar...) or a discount. */
export async function addStaffCharge({ hotelId, stayId, staffId, kind, description, amountPaise }) {
  await loadBill({ query }, hotelId, stayId); // 404 if the stay isn't in this hotel
  const signed = kind === 'discount' ? -Math.abs(amountPaise) : Math.abs(amountPaise);
  const charge = await addCharge({ hotelId, stayId, kind, description, amountPaise: signed, staffId });
  billChanged(hotelId, stayId);
  return charge;
}

/** Removes a line the front desk added by mistake. Orders/bookings are removed by cancelling them. */
export async function voidStaffCharge(hotelId, chargeId) {
  const { rows: [charge] } = await query(
    'SELECT id, stay_id, kind FROM charges WHERE id = $1 AND hotel_id = $2 AND voided_at IS NULL', [chargeId, hotelId],
  );
  if (!charge) throw notFound('Bill item not found');
  if (!STAFF_CHARGE_KINDS.includes(charge.kind)) {
    throw new HttpError(409, 'Cancel the order or booking itself to remove it from the bill.');
  }
  if (await chargeHasPayment({ query }, 'id', chargeId)) {
    throw new HttpError(409, 'This item already has a payment. Remove the payment first.');
  }
  await query('UPDATE charges SET voided_at = now() WHERE id = $1', [chargeId]);
  billChanged(hotelId, charge.stay_id);
}

// Picks the charges a new payment covers: the ones asked for (each must still be
// unpaid), or every unpaid one. Runs inside a transaction with the charges locked.
async function chargesToPay(db, stayId, chargeIds) {
  const { rows } = await db.query(
    `SELECT c.id, c.amount_paise + c.tax_paise AS total,
            EXISTS (SELECT 1 FROM payment_charges pc JOIN payments p ON p.id = pc.payment_id
                     WHERE pc.charge_id = c.id AND p.status <> 'rejected') AS covered
       FROM charges c WHERE c.stay_id = $1 AND c.voided_at IS NULL
      ORDER BY c.id FOR UPDATE OF c`,
    [stayId],
  );
  if (!chargeIds?.length) return rows.filter((c) => !c.covered);
  const wanted = rows.filter((c) => chargeIds.includes(c.id));
  if (wanted.length !== new Set(chargeIds).size) throw new HttpError(404, 'Bill item not found. Please refresh.');
  if (wanted.some((c) => c.covered)) throw new HttpError(409, 'That item is already paid or its payment is waiting to be checked.');
  return wanted;
}

async function insertPayment(db, { hotelId, stayId, amountPaise, method, utr, status, note, fromGuest, staffId, chargeIds }) {
  let payment;
  try {
    ({ rows: [payment] } = await db.query(
      `INSERT INTO payments (hotel_id, stay_id, amount_paise, method, utr, status, note, from_guest, staff_id, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $6 = 'confirmed' THEN now() END) RETURNING *`,
      [hotelId, stayId, amountPaise, method, utr, status, note, fromGuest, staffId],
    ));
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'This UPI reference number was already used for another payment.');
    throw err;
  }
  for (const chargeId of chargeIds) {
    await db.query('INSERT INTO payment_charges (payment_id, charge_id) VALUES ($1, $2)', [payment.id, chargeId]);
  }
  return payment;
}

export const normalizeUtr = (utr) => utr.replace(/[\s-]/g, '').toUpperCase();

/**
 * The guest paid with the hotel's UPI QR and sends the UPI reference (UTR).
 * Covers the chosen items, or everything still due. Waits for the front desk to confirm.
 */
export async function guestPayment({ hotelId, stayId, roomNumber, guestName, utr, chargeIds = [] }) {
  const ref = normalizeUtr(utr);
  if (!/^[A-Z0-9]{6,35}$/.test(ref)) throw new HttpError(400, 'Please enter the UPI reference number (UTR) shown in your UPI app.');

  const payment = await transaction(async (db) => {
    const targets = await chargesToPay(db, stayId, chargeIds);
    let amount = targets.reduce((total, c) => total + c.total, 0);
    if (!chargeIds.length) amount = Math.min(amount, (await loadBill(db, hotelId, stayId)).dueNowPaise);
    if (amount <= 0) throw new HttpError(409, 'Nothing is due on your bill right now.');
    return insertPayment(db, {
      hotelId, stayId, amountPaise: amount, method: 'upi', utr: ref, status: 'pending', note: '',
      fromGuest: true, staffId: null, chargeIds: targets.map((c) => c.id),
    });
  });

  await tellGuest(hotelId, stayId, `Payment of ${rupees(payment.amount_paise)} sent (UPI ref ${ref}). The front desk will confirm it shortly.`);
  billChanged(hotelId, stayId);
  emitToStaff(hotelId, 'payment:submitted', {
    id: payment.id, stayId, roomNumber, guestName, amountPaise: payment.amount_paise, utr: ref, createdAt: payment.created_at,
  });
  return payment;
}

/** The front desk received money (cash, card, UPI...) for the chosen items, or for everything due. */
export async function staffPayment({ hotelId, stayId, staffId, method, chargeIds = [], note = '', utr = null }) {
  const ref = utr ? normalizeUtr(utr) || null : null;
  await loadBill({ query }, hotelId, stayId); // 404 if the stay isn't in this hotel
  const payment = await transaction(async (db) => {
    const targets = await chargesToPay(db, stayId, chargeIds); // locks the bill's charges first
    const bill = await loadBill(db, hotelId, stayId);
    let amount = targets.reduce((total, c) => total + c.total, 0);
    if (!chargeIds.length) amount = Math.min(amount, bill.dueNowPaise);
    if (amount <= 0) {
      throw new HttpError(409, bill.pendingPaise ? 'The rest is waiting for you to check the guest\'s UPI payment.' : 'Nothing is due on this bill.');
    }
    return insertPayment(db, {
      hotelId, stayId, amountPaise: amount, method, utr: ref, status: 'confirmed', note,
      fromGuest: false, staffId, chargeIds: targets.map((c) => c.id),
    });
  });
  await tellGuest(hotelId, stayId, `Payment of ${rupees(payment.amount_paise)} received (${METHOD_LABEL[method]}). Thank you!`);
  billChanged(hotelId, stayId);
  return payment;
}

/** Money paid before arriving (e.g. a booking advance). Lowers the balance. */
export async function staffAdvance({ hotelId, stayId, staffId, amountPaise, note = '' }) {
  await loadBill({ query }, hotelId, stayId);
  const payment = await transaction((db) => insertPayment(db, {
    hotelId, stayId, amountPaise, method: 'advance', utr: null, status: 'confirmed', note,
    fromGuest: false, staffId, chargeIds: [],
  }));
  billChanged(hotelId, stayId);
  return payment;
}

/** Front desk checked their UPI app: confirm the guest's payment, or reject it (also undoes a confirmed one). */
export async function decidePayment({ hotelId, paymentId, staffId, confirm, note = '' }) {
  const { rows: [payment] } = await query(
    `UPDATE payments SET status = $3, decided_at = now(), staff_id = $4, note = CASE WHEN $5 = '' THEN note ELSE $5 END
      WHERE id = $1 AND hotel_id = $2 AND status = ANY($6) RETURNING *`,
    [paymentId, hotelId, confirm ? 'confirmed' : 'rejected', staffId, note, confirm ? ['pending'] : ['pending', 'confirmed']],
  );
  if (!payment) throw new HttpError(409, 'This payment was already handled. Please refresh.');
  if (payment.from_guest) {
    await tellGuest(hotelId, payment.stay_id, confirm
      ? `Payment of ${rupees(payment.amount_paise)} confirmed. Thank you!`
      : `We couldn't find your payment of ${rupees(payment.amount_paise)} (UPI ref ${payment.utr}). Please check the reference number or contact the front desk.`);
  }
  billChanged(hotelId, payment.stay_id);
  return payment;
}

/** Shown to guests on the Bill screen: how to pay. */
export async function paymentInfo(hotelId) {
  const { rows: [hotel] } = await query('SELECT payment_qr_image_id, upi_id, payee_name, name FROM hotels WHERE id = $1', [hotelId]);
  return {
    qrImageId: hotel.payment_qr_image_id,
    upiId: hotel.upi_id,
    payeeName: hotel.payee_name || hotel.name,
    ready: Boolean(hotel.payment_qr_image_id || hotel.upi_id),
  };
}
