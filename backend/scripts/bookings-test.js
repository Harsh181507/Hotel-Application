// End-to-end test of the room bill (taxes, discount, advance, UPI payments),
// restaurant table booking and vehicle booking. Start the app first (npm run dev), then:
//   npm run test:bookings
// It checks in a test guest and creates test tables/vehicles, and cleans up after.
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@anemos.local', password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!' };
const RUN = Date.now().toString(36).toUpperCase();
// A 1x1 PNG stands in for the hotel's UPI QR picture.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}
async function ok(method, path, opts) {
  const r = await call(method, path, opts);
  assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
async function fails(status, method, path, opts, text) {
  const r = await call(method, path, opts);
  assert.equal(r.status, status, `${method} ${path} should fail with ${status}, got ${r.status} ${JSON.stringify(r.data)}`);
  if (text) assert.match(r.data.error, text);
  return r.data;
}
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const nextEvent = (socket, event, match = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { socket.off(event, on); reject(new Error(`timed out waiting for ${event}`)); }, ms);
  function on(d) { if (!match(d)) return; clearTimeout(t); socket.off(event, on); resolve(d); }
  socket.on(event, on);
});
const step = (name) => console.log(`  ok  ${name}`);
const section = (name) => console.log(`\n${name}`);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const tax = (paise, pct) => Math.round((paise * pct) / 100);
const item = (bill, fn) => bill.items.find(fn);

const admin = (await ok('POST', '/api/auth/staff/login', { body: ADMIN })).token;
const originalSettings = await ok('GET', '/api/staff/settings', { token: admin });
const created = { staffIds: [], stayId: null, tables: [], vehicles: [], menuSeeded: false };
const sockets = [];

try {
  // ---------- Setup: taxes, UPI QR, restaurant hours, a test guest ----------
  section('Setup');
  const qr = await ok('POST', '/api/staff/dining/images', { token: admin, body: { dataUrl: PNG } });
  await ok('PUT', '/api/staff/settings', {
    token: admin,
    body: {
      tax_food_pct: 5, tax_vehicle_pct: 12, tax_other_pct: 18, payment_qr_image_id: qr.id, upi_id: 'testhotel@okaxis',
      payee_name: 'Test Hotel', restaurant_open: '12:00', restaurant_close: '23:00', table_booking_minutes: 90, autopilot_mode: 'off',
    },
  });
  await fails(400, 'PUT', '/api/staff/settings', { token: admin, body: { upi_id: 'not a upi id' } }, /UPI ID/);
  await fails(400, 'PUT', '/api/staff/settings', { token: admin, body: { tax_food_pct: 80 } });
  step('settings: UPI QR picture, UPI ID, GST rates and restaurant hours saved (bad values refused)');

  const kitchenLogin = `kitchen.b${RUN.toLowerCase()}`;
  const kitchenUser = await ok('POST', '/api/staff/users', { token: admin, body: { name: 'Test chef', login: kitchenLogin, password: 'Test-pass-123', role: 'kitchen' } });
  created.staffIds.push(kitchenUser.id);
  const kitchen = (await ok('POST', '/api/auth/staff/login', { body: { email: kitchenLogin, password: 'Test-pass-123' } })).token;

  const room = (await ok('GET', '/api/staff/rooms', { token: admin })).find((r) => !r.stay);
  assert.ok(room, 'needs a free room');
  const checkin = await ok('POST', `/api/staff/rooms/${room.id}/checkin`, { token: admin, body: { guestName: 'Bill Tester', guestLogin: `bill-${RUN}` } });
  created.stayId = checkin.stay.id;
  const roomToken = new URL(checkin.link).searchParams.get('room');
  const guest = (await ok('POST', '/api/auth/guest/login', { body: { room: roomToken, guestId: checkin.guestId, code: checkin.code } })).token;
  const desk = await connect(admin);
  const chef = await connect(kitchen);
  const phone = await connect(guest);
  sockets.push(desk, chef, phone);
  const info = await ok('GET', '/api/guest/info', { token: guest });
  assert.equal(info.taxes.foodPct, 5);
  assert.equal(info.payment.ready, true);
  assert.equal(info.payment.upiId, 'testhotel@okaxis');
  assert.equal(info.payment.qrImageId, qr.id);
  step(`guest checked into room ${room.number}; guest sees taxes and how to pay`);
  const tomorrow = addDays(info.today, 1);

  // ---------- Room bill ----------
  section('Room bill');
  let menu = await ok('GET', '/api/guest/menu', { token: guest });
  if (!menu.length) {
    await ok('POST', '/api/staff/dining/items/sample', { token: admin });
    created.menuSeeded = true;
    menu = await ok('GET', '/api/guest/menu', { token: guest });
  }
  const [a, b] = menu.filter((m) => m.available);
  const orderTotal = a.price_paise * 2 + b.price_paise;
  const billEvent = nextEvent(phone, 'bill:updated');
  const order = await ok('POST', '/api/guest/orders', { token: guest, body: { items: [{ id: a.id, quantity: 2 }, { id: b.id, quantity: 1 }] } });
  await billEvent;
  let bill = await ok('GET', '/api/guest/bill', { token: guest });
  const food = item(bill, (i) => i.orderId === order.id);
  assert.equal(food.kind, 'room_service');
  assert.equal(food.amountPaise, orderTotal);
  assert.equal(food.taxPaise, tax(orderTotal, 5));
  assert.equal(food.status, 'unpaid');
  const placed = (await ok('GET', '/api/guest/messages', { token: guest })).find((m) => m.body.startsWith(`Order #${order.id} placed`));
  assert.match(placed.body, /5% GST/);
  step('room-service order goes on the bill with 5% GST; the guest is told the tax');

  await ok('POST', `/api/staff/billing/stays/${created.stayId}/charges`, { token: admin, body: { kind: 'restaurant', description: 'Dinner at Saffron', amountPaise: 100_000 } });
  await ok('POST', `/api/staff/billing/stays/${created.stayId}/charges`, { token: admin, body: { kind: 'extra', description: 'Laundry', amountPaise: 20_000 } });
  bill = await ok('POST', `/api/staff/billing/stays/${created.stayId}/charges`, { token: admin, body: { kind: 'discount', description: 'Loyalty discount', amountPaise: 10_000 } });
  const subtotal = orderTotal + 100_000 + 20_000;
  const taxes = tax(orderTotal, 5) + tax(100_000, 5) + tax(20_000, 18);
  assert.equal(bill.subtotalPaise, subtotal);
  assert.equal(bill.discountPaise, -10_000);
  assert.equal(bill.taxPaise, taxes);
  assert.equal(bill.totalPaise, subtotal - 10_000 + taxes);
  assert.deepEqual(bill.taxes.map((t) => t.pct), [5, 18]);
  step('front desk adds a restaurant bill (5% GST), laundry (18% GST) and a discount; totals add up');

  bill = await ok('POST', `/api/staff/billing/stays/${created.stayId}/advance`, { token: admin, body: { amountPaise: 50_000, note: 'Booking advance' } });
  assert.equal(bill.paidPaise, 50_000);
  assert.equal(bill.balancePaise, bill.totalPaise - 50_000);
  step('advance paid before arrival lowers the balance');

  // Guest pays the room-service order with UPI and sends the reference number.
  const utr1 = `4${RUN}01`.padEnd(12, '7').slice(0, 12);
  const submitted = nextEvent(desk, 'payment:submitted', (p) => p.stayId === created.stayId);
  bill = await ok('POST', '/api/guest/payments', { token: guest, body: { utr: utr1, chargeIds: [food.id] } });
  const alert = await submitted;
  assert.equal(alert.amountPaise, food.totalPaise);
  assert.equal(alert.roomNumber, room.number);
  assert.equal(item(bill, (i) => i.id === food.id).status, 'pending');
  assert.equal(bill.pendingPaise, food.totalPaise);
  assert.equal(bill.dueNowPaise, bill.balancePaise - food.totalPaise);
  step('guest pays one item by UPI + UTR -> "pending"; front desk is alerted live');

  await fails(409, 'POST', '/api/guest/payments', { token: guest, body: { utr: '999988887777', chargeIds: [food.id] } }, /already paid|waiting/);
  await fails(409, 'POST', '/api/guest/payments', { token: guest, body: { utr: utr1 } }, /already used/);
  await fails(400, 'POST', '/api/guest/payments', { token: guest, body: { utr: '12' } }, /UPI reference/);
  step('the same item or the same UTR can\'t be paid twice; nonsense UTRs are refused');

  const pending = await ok('GET', '/api/staff/billing/payments/pending', { token: admin });
  const mine = pending.find((p) => p.stayId === created.stayId);
  assert.equal(mine.utr, utr1);
  const guestBillUpdate = nextEvent(phone, 'bill:updated');
  bill = await ok('POST', `/api/staff/billing/payments/${mine.id}/confirm`, { token: admin });
  await guestBillUpdate;
  assert.equal(item(bill, (i) => i.id === food.id).status, 'paid');
  assert.equal(bill.paidPaise, 50_000 + food.totalPaise);
  step('front desk confirms the UTR -> item "paid"; guest bill updates live');

  await fails(409, 'POST', `/api/guest/orders/${order.id}/cancel`, { token: guest }, /already paid/);
  step('a paid order can\'t be cancelled by the guest');

  // Guest pays everything else; the front desk can't find it and rejects it.
  const due = bill.dueNowPaise;
  bill = await ok('POST', '/api/guest/payments', { token: guest, body: { utr: `5${RUN}02`.padEnd(12, '3').slice(0, 12) } });
  assert.equal(bill.pendingPaise, due);
  assert.equal(bill.dueNowPaise, 0);
  const second = (await ok('GET', '/api/staff/billing/payments/pending', { token: admin })).find((p) => p.stayId === created.stayId);
  bill = await ok('POST', `/api/staff/billing/payments/${second.id}/reject`, { token: admin, body: { note: 'Not in bank statement' } });
  assert.equal(bill.pendingPaise, 0);
  assert.equal(bill.dueNowPaise, due);
  assert.ok(bill.items.filter((i) => i.kind !== 'discount' && i.id !== food.id).every((i) => i.status === 'unpaid'));
  const rejected = (await ok('GET', '/api/guest/messages', { token: guest })).at(-1);
  assert.match(rejected.body, /couldn't find your payment/);
  step('"pay everything" covers the rest; a rejected UTR puts the items back to unpaid and tells the guest');

  const laundry = item(bill, (i) => i.description === 'Laundry');
  bill = await ok('POST', `/api/staff/billing/stays/${created.stayId}/payments`, { token: admin, body: { method: 'cash', chargeIds: [laundry.id] } });
  assert.equal(item(bill, (i) => i.id === laundry.id).status, 'paid');
  step('front desk marks a single item paid in cash');

  const extra = await ok('POST', `/api/staff/billing/stays/${created.stayId}/charges`, { token: admin, body: { kind: 'extra', description: 'Mistake', amountPaise: 999 } });
  const mistake = item(extra, (i) => i.description === 'Mistake');
  await ok('DELETE', `/api/staff/billing/charges/${mistake.id}`, { token: admin });
  await fails(409, 'DELETE', `/api/staff/billing/charges/${laundry.id}`, { token: admin }, /payment/);
  await fails(409, 'DELETE', `/api/staff/billing/charges/${food.id}`, { token: admin }, /Cancel the order/);
  step('a wrong extra can be removed; paid items and orders can\'t be removed that way');

  // ---------- Restaurant tables ----------
  section('Restaurant tables');
  const big = await ok('POST', '/api/staff/tables', { token: admin, body: { name: `Big-${RUN}`, seats: 30 } });
  created.tables.push(big.id);
  await fails(409, 'POST', '/api/staff/tables', { token: admin, body: { name: `Big-${RUN}`, seats: 4 } }, /already/);
  let slots = await ok('GET', `/api/guest/tables/slots?date=${tomorrow}&people=30`, { token: guest });
  assert.equal(slots.slots[0].time, '12:00');
  assert.equal(slots.slots.at(-1).time, '22:30');
  assert.ok(slots.slots.every((s) => s.available));
  step('tables set up; tomorrow\'s time slots run 12:00 to 22:30, all free');

  const booked = nextEvent(chef, 'table:booked', (t) => t.stayId === created.stayId);
  const t1 = await ok('POST', '/api/guest/tables/bookings', { token: guest, body: { date: tomorrow, time: '19:00', people: 30, note: 'Birthday' } });
  assert.equal(t1.tableName, `Big-${RUN}`);
  assert.equal(t1.status, 'confirmed');
  await booked;
  step('guest books a table for 30 at 19:00 -> confirmed at once; the kitchen/restaurant is alerted live');

  slots = await ok('GET', `/api/guest/tables/slots?date=${tomorrow}&people=30`, { token: guest });
  const free = Object.fromEntries(slots.slots.map((s) => [s.time, s.available]));
  assert.deepEqual([free['17:30'], free['18:00'], free['19:00'], free['20:00'], free['20:30']], [true, false, false, false, true]);
  await fails(409, 'POST', '/api/guest/tables/bookings', { token: guest, body: { date: tomorrow, time: '19:30', people: 30 } }, /all tables for 30 are booked/);
  await fails(400, 'POST', '/api/guest/tables/bookings', { token: guest, body: { date: tomorrow, time: '23:30', people: 2 } }, /between/);
  await fails(400, 'POST', '/api/guest/tables/bookings', { token: guest, body: { date: addDays(info.today, -1), time: '19:00', people: 2 } }, /future/);
  step('overlapping times show as booked and can\'t be taken; closed hours and past dates are refused');

  const day = await ok('GET', `/api/staff/tables/bookings?date=${tomorrow}`, { token: kitchen });
  assert.ok(day.some((d) => d.id === t1.id && d.roomNumber === room.number && d.note === 'Birthday'));
  const seated = await ok('PATCH', `/api/staff/tables/bookings/${t1.id}`, { token: kitchen, body: { status: 'seated' } });
  assert.equal(seated.status, 'seated');
  await ok('PATCH', `/api/staff/tables/bookings/${t1.id}`, { token: kitchen, body: { status: 'confirmed' } });
  step('restaurant sees the booking with room + note and can mark it seated');

  const cancelled = await ok('POST', `/api/guest/tables/bookings/${t1.id}/cancel`, { token: guest });
  assert.equal(cancelled.status, 'cancelled');
  slots = await ok('GET', `/api/guest/tables/slots?date=${tomorrow}&people=30`, { token: guest });
  assert.ok(slots.slots.find((s) => s.time === '19:00').available);
  step('guest cancels; the time is free again');

  // ---------- Vehicles ----------
  section('Vehicles');
  const car = await ok('POST', '/api/staff/vehicles', {
    token: admin,
    body: { type: 'Car', name: `Dzire ${RUN}`, plateNumber: 'jh 01 ab 1234', seats: 4, driverName: 'Ramesh', driverPhone: '98765 43210', pricePaise: 30_000, priceUnit: 'hour' },
  });
  created.vehicles.push(car.id);
  assert.equal(car.plateNumber, 'JH 01 AB 1234');
  const suv = await ok('POST', '/api/staff/vehicles', {
    token: admin, body: { type: 'SUV', name: `Innova ${RUN}`, seats: 7, pricePaise: 200_000, priceUnit: 'day' },
  });
  created.vehicles.push(suv.id);
  let fleet = await ok('GET', `/api/guest/vehicles?date=${tomorrow}`, { token: guest });
  const listed = fleet.find((v) => v.id === car.id);
  assert.deepEqual(listed.booked, []);
  assert.equal(listed.driverPhone, undefined);
  step('front desk adds vehicles with driver details; guests see them (without the driver\'s number)');

  const vBooked = nextEvent(desk, 'vehicle:booked', (v) => v.stayId === created.stayId);
  const ride = await ok('POST', '/api/guest/vehicles/bookings', { token: guest, body: { vehicleId: car.id, date: tomorrow, time: '10:00', hours: 3, note: 'Airport' } });
  await vBooked;
  assert.equal(ride.pricePaise, 90_000);
  assert.equal(ride.vehicle.driverPhone, '98765 43210');
  bill = await ok('GET', '/api/guest/bill', { token: guest });
  const rideCharge = item(bill, (i) => i.vehicleBookingId === ride.id);
  assert.equal(rideCharge.amountPaise, 90_000);
  assert.equal(rideCharge.taxPaise, tax(90_000, 12));
  const told = (await ok('GET', '/api/guest/messages', { token: guest })).at(-1);
  assert.match(told.body, /Vehicle booked: .*Ramesh, 98765 43210.*added to your room bill/);
  step('guest books 3 hours at ₹300/hour -> ₹900 + 12% GST on the bill; guest gets the driver\'s contact; desk alerted');

  await fails(409, 'POST', '/api/guest/vehicles/bookings', { token: guest, body: { vehicleId: car.id, date: tomorrow, time: '12:00', hours: 2 } }, /already booked from/);
  fleet = await ok('GET', `/api/guest/vehicles?date=${tomorrow}`, { token: guest });
  assert.deepEqual(fleet.find((v) => v.id === car.id).booked.map((x) => [x.startLocal.slice(11), x.endLocal.slice(11)]), [['10:00', '13:00']]);
  const back2back = await ok('POST', '/api/guest/vehicles/bookings', { token: guest, body: { vehicleId: car.id, date: tomorrow, time: '13:00', hours: 1 } });
  step('an overlapping time is refused and shown as booked 10:00-13:00; the next free slot (13:00) can be booked');

  const trip = await ok('POST', '/api/guest/vehicles/bookings', { token: guest, body: { vehicleId: suv.id, date: tomorrow, time: '08:00', hours: 30 } });
  assert.equal(trip.pricePaise, 400_000);
  step('a per-day vehicle for 30 hours is charged 2 days');

  await ok('POST', `/api/guest/vehicles/bookings/${back2back.id}/cancel`, { token: guest });
  bill = await ok('GET', '/api/guest/bill', { token: guest });
  assert.equal(item(bill, (i) => i.vehicleBookingId === back2back.id), undefined);
  await fails(409, 'DELETE', `/api/staff/vehicles/${car.id}`, { token: admin }, /upcoming bookings/);
  const staffDay = await ok('GET', `/api/staff/vehicles/bookings?date=${tomorrow}`, { token: admin });
  assert.ok(staffDay.some((v) => v.id === ride.id && v.roomNumber === room.number));
  await ok('PATCH', `/api/staff/vehicles/bookings/${ride.id}`, { token: admin, body: { status: 'cancelled' } });
  await ok('PATCH', `/api/staff/vehicles/bookings/${trip.id}`, { token: admin, body: { status: 'cancelled' } });
  await fails(403, 'GET', '/api/staff/vehicles', { token: kitchen });
  step('cancelling removes it from the bill; vehicles with upcoming bookings can\'t be removed; kitchen can\'t manage vehicles');

  // ---------- Settle and check out ----------
  section('Check-out');
  bill = await ok('POST', `/api/staff/billing/stays/${created.stayId}/payments`, { token: admin, body: { method: 'card' } });
  assert.equal(bill.balancePaise, 0);
  assert.ok(bill.items.filter((i) => i.kind !== 'discount').every((i) => i.status === 'paid'));
  await fails(409, 'POST', `/api/staff/billing/stays/${created.stayId}/payments`, { token: admin, body: { method: 'cash' } }, /Nothing is due/);
  await ok('POST', `/api/staff/stays/${created.stayId}/checkout`, { token: admin });
  const after = await ok('GET', `/api/staff/billing/stays/${created.stayId}`, { token: admin });
  assert.equal(after.stay.active, false);
  assert.equal(after.balancePaise, 0);
  const list = await ok('GET', '/api/staff/billing/bills', { token: admin });
  assert.ok(list.some((s) => s.stayId === created.stayId && !s.active && s.balancePaise === 0));
  created.stayId = null;
  step('front desk settles the rest by card -> balance ₹0, everything paid; the final bill is still there after check-out');

  console.log('\nAll booking & billing checks passed.');
} finally {
  for (const s of sockets) s.close();
  if (created.stayId) await call('POST', `/api/staff/stays/${created.stayId}/checkout`, { token: admin });
  for (const v of created.vehicles) {
    await pool.query("UPDATE vehicle_bookings SET status = 'cancelled' WHERE vehicle_id = $1 AND status = 'confirmed'", [v]);
    await call('DELETE', `/api/staff/vehicles/${v}`, { token: admin });
  }
  for (const t of created.tables) {
    await pool.query("UPDATE table_bookings SET status = 'cancelled' WHERE table_id = $1 AND status IN ('confirmed', 'seated')", [t]);
    await call('DELETE', `/api/staff/tables/${t}`, { token: admin });
  }
  for (const staffId of created.staffIds) await pool.query('DELETE FROM staff WHERE id = $1', [staffId]);
  if (created.menuSeeded) await pool.query("DELETE FROM menu_items WHERE hotel_id = (SELECT hotel_id FROM staff WHERE email = $1)", [ADMIN.email]);
  await call('PUT', '/api/staff/settings', { token: admin, body: originalSettings });
  await pool.end();
}
