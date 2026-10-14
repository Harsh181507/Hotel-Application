// Vehicle booking: the hotel lists its vehicles (with the owner/driver's number and a
// price per hour, day or trip); guests book a date and time slot. A vehicle can't be
// booked twice for overlapping times. The price goes on the room bill.
import { query, transaction } from '../db/pool.js';
import { broadcastMessage, saveMessage } from './chat.js';
import { emitOps } from './realtime.js';
import { HttpError, notFound } from './errors.js';
import { addCharge, billChanged, chargeHasPayment, rupees, voidChargeFor } from './billing.js';
import { checkBookable, formatMoment, formatTime, hotelMoment, hotelNow, localSql } from './hoteltime.js';

export const PRICE_UNITS = ['hour', 'day', 'trip'];
const MAX_UPCOMING_PER_STAY = 5;

const VEHICLE_COLUMNS = 'id, type, name, plate_number, seats, driver_name, driver_phone, price_paise, price_unit, available, note';

export function toVehicle(v, { withDriver = true } = {}) {
  return {
    id: v.id, type: v.type, name: v.name, plateNumber: v.plate_number, seats: v.seats,
    pricePaise: v.price_paise, priceUnit: v.price_unit, available: v.available, note: v.note,
    ...(withDriver && { driverName: v.driver_name, driverPhone: v.driver_phone }),
  };
}

export const vehicleLabel = (v) => [v.name || v.type, v.plate_number && `(${v.plate_number})`].filter(Boolean).join(' ');

/** Price for a booking of `hours`: hourly, per started day, or one price per trip. */
export function vehiclePrice(vehicle, hours) {
  if (vehicle.price_unit === 'hour') return vehicle.price_paise * hours;
  if (vehicle.price_unit === 'day') return vehicle.price_paise * Math.ceil(hours / 24);
  return vehicle.price_paise;
}

// ---------- The fleet (front desk) ----------

export async function listVehicles(hotelId) {
  const { rows } = await query(
    `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE hotel_id = $1 AND NOT archived ORDER BY type, name, id`, [hotelId],
  );
  return rows.map((v) => toVehicle(v));
}

export async function saveVehicle(hotelId, v, vehicleId = null) {
  const values = [v.type, v.name, v.plateNumber, v.seats, v.driverName, v.driverPhone, v.pricePaise, v.priceUnit, v.available, v.note];
  const { rows: [row] } = vehicleId
    ? await query(
      `UPDATE vehicles SET type=$3, name=$4, plate_number=$5, seats=$6, driver_name=$7, driver_phone=$8, price_paise=$9,
              price_unit=$10, available=$11, note=$12
        WHERE id = $1 AND hotel_id = $2 AND NOT archived RETURNING ${VEHICLE_COLUMNS}`,
      [vehicleId, hotelId, ...values],
    )
    : await query(
      `INSERT INTO vehicles (hotel_id, type, name, plate_number, seats, driver_name, driver_phone, price_paise, price_unit, available, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${VEHICLE_COLUMNS}`,
      [hotelId, ...values],
    );
  if (!row) throw notFound('Vehicle not found');
  return toVehicle(row);
}

/** Removes a vehicle from the list (kept for old bills). Not while it has upcoming bookings. */
export async function archiveVehicle(hotelId, vehicleId) {
  const { rows: [busy] } = await query(
    `SELECT 1 FROM vehicle_bookings WHERE vehicle_id = $1 AND hotel_id = $2 AND status = 'confirmed' AND ends_at > now() LIMIT 1`,
    [vehicleId, hotelId],
  );
  if (busy) throw new HttpError(409, 'This vehicle has upcoming bookings. Cancel them first, or switch "Available" off.');
  const { rowCount } = await query('UPDATE vehicles SET archived = true WHERE id = $1 AND hotel_id = $2', [vehicleId, hotelId]);
  if (!rowCount) throw notFound('Vehicle not found');
}

// ---------- Bookings ----------

const BOOKING_SELECT = `
  SELECT b.id, b.vehicle_id, b.stay_id, b.starts_at, b.ends_at, b.note, b.price_paise, b.status, b.created_at,
         v.type, v.name, v.plate_number, v.driver_name, v.driver_phone, v.price_unit,
         r.number AS room_number, s.guest_name,
         ${localSql('b.starts_at', 'h.timezone')} AS start_local, ${localSql('b.ends_at', 'h.timezone')} AS end_local
    FROM vehicle_bookings b
    JOIN vehicles v ON v.id = b.vehicle_id
    JOIN stays s ON s.id = b.stay_id
    JOIN rooms r ON r.id = s.room_id
    JOIN hotels h ON h.id = b.hotel_id`;

const toBooking = (b) => ({
  id: b.id, vehicleId: b.vehicle_id, stayId: b.stay_id,
  vehicle: { type: b.type, name: b.name, plateNumber: b.plate_number, driverName: b.driver_name, driverPhone: b.driver_phone, priceUnit: b.price_unit },
  roomNumber: b.room_number, guestName: b.guest_name,
  startsAt: b.starts_at, endsAt: b.ends_at, startLocal: b.start_local, endLocal: b.end_local,
  hours: Math.round((b.ends_at - b.starts_at) / 3_600_000),
  pricePaise: b.price_paise, status: b.status, note: b.note, createdAt: b.created_at,
});

async function getBooking(hotelId, bookingId) {
  const { rows: [b] } = await query(`${BOOKING_SELECT} WHERE b.id = $1 AND b.hotel_id = $2`, [bookingId, hotelId]);
  return b ? toBooking(b) : null;
}

/** Bookings on a date (hotel time) for the front desk, or all of one guest's bookings. */
export async function listVehicleBookings(hotelId, { date = null, stayId = null } = {}) {
  const { rows } = await query(
    `${BOOKING_SELECT}
      WHERE b.hotel_id = $1
        AND ($2::int IS NULL OR b.stay_id = $2)
        AND ($3::date IS NULL OR (b.starts_at < (($3::date + 1)::timestamp AT TIME ZONE h.timezone)
                                  AND b.ends_at > ($3::date::timestamp AT TIME ZONE h.timezone)))
      ORDER BY ${stayId ? 'b.starts_at DESC' : 'b.starts_at'}
      LIMIT 300`,
    [hotelId, stayId, date],
  );
  return rows.map(toBooking);
}

/**
 * What guests see for a date: every bookable vehicle and the times it's already taken
 * that day (no guest names), plus whether it's out right now.
 */
export async function vehiclesForDay(hotelId, date) {
  const { rows: vehicles } = await query(
    `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE hotel_id = $1 AND NOT archived AND available ORDER BY type, price_paise, id`,
    [hotelId],
  );
  const { rows: taken } = await query(
    `SELECT b.vehicle_id, b.starts_at, b.ends_at,
            ${localSql('b.starts_at', 'h.timezone')} AS start_local, ${localSql('b.ends_at', 'h.timezone')} AS end_local
       FROM vehicle_bookings b JOIN hotels h ON h.id = b.hotel_id
      WHERE b.hotel_id = $1 AND b.status = 'confirmed'
        AND b.starts_at < (($2::date + 1)::timestamp AT TIME ZONE h.timezone)
        AND b.ends_at > GREATEST(now(), $2::date::timestamp AT TIME ZONE h.timezone)
      ORDER BY b.starts_at`,
    [hotelId, date],
  );
  const now = Date.now();
  return vehicles.map((v) => {
    const booked = taken.filter((t) => t.vehicle_id === v.id);
    return {
      ...toVehicle(v, { withDriver: false }),
      booked: booked.map((t) => ({ startsAt: t.starts_at, endsAt: t.ends_at, startLocal: t.start_local, endLocal: t.end_local })),
      busyNow: booked.some((t) => t.starts_at.getTime() <= now && t.ends_at.getTime() > now),
    };
  });
}

async function tellGuest(hotelId, stayId, text) {
  broadcastMessage(hotelId, await saveMessage({ stayId, sender: 'system', body: text }));
}

export async function bookVehicle({ hotelId, stayId, vehicleId, date, time, hours, note = '' }) {
  const { timezone } = await hotelNow({ query }, hotelId);
  const startsAt = await hotelMoment({ query }, timezone, date, time);
  checkBookable(startsAt);
  const endsAt = new Date(startsAt.getTime() + hours * 3_600_000);

  const { bookingId, charge, vehicle } = await transaction(async (db) => {
    // Locking the vehicle row makes two guests booking the same vehicle at once take turns.
    const { rows: [v] } = await db.query(
      `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = $1 AND hotel_id = $2 AND NOT archived FOR UPDATE`, [vehicleId, hotelId],
    );
    if (!v) throw notFound('Vehicle not found. Please refresh.');
    if (!v.available) throw new HttpError(409, 'This vehicle is not available for booking right now.');

    const { rows: [clash] } = await db.query(
      `SELECT starts_at, ends_at FROM vehicle_bookings
        WHERE vehicle_id = $1 AND status = 'confirmed' AND starts_at < $3 AND ends_at > $2
        ORDER BY starts_at LIMIT 1`,
      [v.id, startsAt, endsAt],
    );
    if (clash) {
      throw new HttpError(409, `This vehicle is already booked from ${formatTime(clash.starts_at, timezone, startsAt)} to ${formatTime(clash.ends_at, timezone, startsAt)}. Please pick another time or vehicle.`);
    }
    const { rows: [{ count }] } = await db.query(
      `SELECT count(*)::int AS count FROM vehicle_bookings WHERE stay_id = $1 AND status = 'confirmed' AND ends_at > now()`, [stayId],
    );
    if (count >= MAX_UPCOMING_PER_STAY) throw new HttpError(409, `You already have ${count} upcoming vehicle bookings. Please contact the front desk.`);

    const price = vehiclePrice(v, hours);
    const { rows: [booking] } = await db.query(
      `INSERT INTO vehicle_bookings (hotel_id, vehicle_id, stay_id, starts_at, ends_at, note, price_paise)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [hotelId, v.id, stayId, startsAt, endsAt, note, price],
    );
    const when = `${formatMoment(startsAt, timezone)} – ${formatTime(endsAt, timezone, startsAt)}`;
    const added = await addCharge({
      db, hotelId, stayId, kind: 'vehicle', description: `${vehicleLabel(v)}, ${when}`.slice(0, 300),
      amountPaise: price, vehicleBookingId: booking.id,
    });
    return { bookingId: booking.id, charge: added, vehicle: v };
  });

  const booking = await getBooking(hotelId, bookingId);
  const driver = vehicle.driver_name || vehicle.driver_phone
    ? ` Driver: ${[vehicle.driver_name, vehicle.driver_phone].filter(Boolean).join(', ')}.` : '';
  const tax = charge.tax_paise ? ` + GST ${rupees(charge.tax_paise)}` : '';
  await tellGuest(hotelId, stayId,
    `Vehicle booked: ${vehicleLabel(vehicle)}, ${formatMoment(startsAt, timezone)} – ${formatTime(endsAt, timezone, startsAt)}.${driver} ${rupees(charge.amount_paise)}${tax} added to your room bill.`);
  emitOps(hotelId, null, 'vehicle:booked', booking, stayId);
  billChanged(hotelId, stayId);
  return booking;
}

/** Guests can cancel their own unpaid booking before it starts; the front desk can cancel or complete any. */
export async function setVehicleBookingStatus(hotelId, bookingId, status, { byGuestStayId = null } = {}) {
  const booking = await getBooking(hotelId, bookingId);
  if (!booking || (byGuestStayId && booking.stayId !== byGuestStayId)) throw notFound('Booking not found');
  if (booking.status !== 'confirmed') throw new HttpError(409, `This booking is already ${booking.status}.`);
  if (byGuestStayId) {
    if (status !== 'cancelled') throw new HttpError(403, 'Not allowed');
    if (booking.startsAt.getTime() <= Date.now()) throw new HttpError(409, 'This booking has already started. Please contact the front desk.');
    if (await chargeHasPayment({ query }, 'vehicle_booking_id', bookingId)) {
      throw new HttpError(409, 'This booking is already paid. Please ask the front desk to cancel it.');
    }
  }
  await transaction(async (db) => {
    await db.query('UPDATE vehicle_bookings SET status = $2 WHERE id = $1', [bookingId, status]);
    if (status === 'cancelled') await voidChargeFor(db, 'vehicle_booking_id', bookingId);
  });
  const updated = await getBooking(hotelId, bookingId);
  if (status === 'cancelled') {
    await tellGuest(hotelId, booking.stayId, `Vehicle booking cancelled: ${vehicleLabel({ name: booking.vehicle.name || booking.vehicle.type, plate_number: booking.vehicle.plateNumber })}. It has been removed from your bill.`);
    billChanged(hotelId, booking.stayId);
  }
  emitOps(hotelId, null, 'vehicle:updated', updated, booking.stayId);
  return updated;
}

