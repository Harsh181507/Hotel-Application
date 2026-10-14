// Everything a logged-in guest can do. All routes need a guest token.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireGuest, userLimiter } from '../middleware/auth.js';
import { broadcastMessage, listMessages, markRead, saveMessage } from '../lib/chat.js';
import { REQUEST_TYPES } from '../lib/requestTypes.js';
import { createRequest } from '../lib/requests.js';
import { handleGuestMessage } from '../lib/autopilot.js';
import { placeOrder, setOrderStatus, stayBill } from '../lib/orders.js';
import { broadcastRoom } from '../lib/housekeeping.js';
import { emitToStaff } from '../lib/realtime.js';
import { getBill, guestPayment, paymentInfo } from '../lib/billing.js';
import { bookTable, listTableBookings, setTableBookingStatus, tableSlots } from '../lib/tables.js';
import { bookVehicle, listVehicleBookings, setVehicleBookingStatus, vehiclesForDay } from '../lib/vehicles.js';
import { hhmm, hotelNow, isoDate } from '../lib/hoteltime.js';

const router = Router();
router.use(requireGuest, userLimiter);

const id = z.coerce.number().int().positive();
const pageSchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });

// GET /api/guest/me
router.get('/me', (req, res) => {
  res.json({ name: req.user.name, roomNumber: req.user.roomNumber });
});

// GET /api/guest/faqs  -> the whole "local answers" list. Load it once and
// search it in the browser; no server call is needed per question.
router.get('/faqs', async (req, res) => {
  const { rows } = await query(
    'SELECT id, category, question, answer FROM faqs WHERE hotel_id = $1 ORDER BY sort_order, id',
    [req.user.hotelId],
  );
  res.set('Cache-Control', 'no-cache');
  res.json(rows);
});

// ---------- Chat ----------

// GET /api/guest/messages?before=<id>&limit=50
router.get('/messages', async (req, res) => {
  res.json(await listMessages(req.user.stayId, pageSchema.parse(req.query)));
});

// POST /api/guest/messages  { body }
// After saving, the autopilot may answer or create a request by itself.
router.post('/messages', async (req, res) => {
  const { body } = messageSchema.parse(req.body);
  const { hotelId, stayId, roomNumber } = req.user;
  const message = await saveMessage({ stayId, sender: 'guest', body });
  broadcastMessage(hotelId, message);
  res.status(201).json(message);
  // Tell staff screens what the autopilot did, so they only alert a person
  // when a person is actually needed.
  const { action } = await handleGuestMessage({ hotelId, stayId, roomNumber, message });
  emitToStaff(hotelId, 'autopilot:handled', { stayId, messageId: message.id, action });
});

// POST /api/guest/messages/read  -> guest has seen the front desk's replies
router.post('/messages/read', async (req, res) => {
  const count = await markRead({ hotelId: req.user.hotelId, stayId: req.user.stayId, readerType: 'guest' });
  res.json({ marked: count });
});

// ---------- Service requests ----------

// GET /api/guest/requests
router.get('/requests', async (req, res) => {
  const { rows } = await query(
    'SELECT id, type, details, status, created_at, updated_at FROM requests WHERE stay_id = $1 ORDER BY id DESC',
    [req.user.stayId],
  );
  res.json(rows);
});

// POST /api/guest/requests  { type: "housekeeping", details: "Please clean at 3 PM" }
router.post('/requests', async (req, res) => {
  const { type, details } = z.object({
    type: z.enum(REQUEST_TYPES),
    details: z.string().trim().max(1000).default(''),
  }).parse(req.body);
  const request = await createRequest({ hotelId: req.user.hotelId, stayId: req.user.stayId, type, details });
  res.status(201).json(request);
});

// ---------- Room: do-not-disturb ----------

// GET /api/guest/room  -> { dnd, hk_status }
router.get('/room', async (req, res) => {
  const { rows: [room] } = await query('SELECT dnd, hk_status FROM rooms WHERE id = $1', [req.user.roomId]);
  res.json(room);
});

// POST /api/guest/room/dnd  { on: true }
router.post('/room/dnd', async (req, res) => {
  const { on } = z.object({ on: z.boolean() }).parse(req.body);
  const { hotelId, stayId, roomId } = req.user;
  const { rows: [room] } = await query('UPDATE rooms SET dnd = $2, hk_updated_at = now() WHERE id = $1 RETURNING dnd, hk_status', [roomId, on]);
  const message = await saveMessage({
    stayId, sender: 'system', body: on ? 'Do not disturb is on. Housekeeping will not enter your room.' : 'Do not disturb is off.',
  });
  broadcastMessage(hotelId, message);
  await broadcastRoom(hotelId, roomId);
  res.json(room);
});

// ---------- In-room dining ----------

// GET /api/guest/menu  -> items grouped by the app; unavailable items are shown as "sold out"
router.get('/menu', async (req, res) => {
  const { rows } = await query(
    `SELECT id, category, name, description, price_paise, image_id, veg, popular, available
       FROM menu_items WHERE hotel_id = $1 ORDER BY sort_order, category, name`,
    [req.user.hotelId],
  );
  res.set('Cache-Control', 'no-cache');
  res.json(rows);
});

// GET /api/guest/orders  -> my orders + running bill total
router.get('/orders', async (req, res) => {
  res.json(await stayBill(req.user.hotelId, req.user.stayId));
});

// POST /api/guest/orders  { items: [{ id, quantity }], note }
router.post('/orders', async (req, res) => {
  const { items, note } = z.object({
    items: z.array(z.object({ id, quantity: z.number().int().min(1).max(50) })).min(1).max(40),
    note: z.string().trim().max(300).default(''),
  }).parse(req.body);
  const order = await placeOrder({ hotelId: req.user.hotelId, stayId: req.user.stayId, lines: items, note });
  res.status(201).json(order);
});

// POST /api/guest/orders/:id/cancel  (only before the kitchen starts it)
router.post('/orders/:id/cancel', async (req, res) => {
  const order = await setOrderStatus(req.user.hotelId, id.parse(req.params.id), 'cancelled', { byGuestStayId: req.user.stayId });
  res.json(order);
});

// ---------- Hotel info: taxes, how to pay, restaurant hours ----------

// GET /api/guest/info
router.get('/info', async (req, res) => {
  const { hotelId } = req.user;
  const { rows: [h] } = await query(
    `SELECT name, tax_food_pct, tax_vehicle_pct, tax_other_pct, restaurant_open, restaurant_close, table_booking_minutes,
            (SELECT count(*)::int FROM dining_tables t WHERE t.hotel_id = hotels.id AND t.active) AS tables,
            (SELECT count(*)::int FROM vehicles v WHERE v.hotel_id = hotels.id AND NOT v.archived AND v.available) AS vehicles
       FROM hotels WHERE id = $1`,
    [hotelId],
  );
  const clock = await hotelNow({ query }, hotelId);
  res.json({
    hotelName: h.name,
    today: clock.today,
    time: clock.time,
    taxes: { foodPct: Number(h.tax_food_pct), vehiclePct: Number(h.tax_vehicle_pct), otherPct: Number(h.tax_other_pct) },
    payment: await paymentInfo(hotelId),
    restaurant: { open: h.restaurant_open, close: h.restaurant_close, minutes: h.table_booking_minutes, tables: h.tables },
    vehicles: h.vehicles,
  });
});

// ---------- Room bill and payments ----------

// GET /api/guest/bill  -> everything on the room bill, paid / pending / unpaid
router.get('/bill', async (req, res) => {
  res.json(await getBill(req.user.hotelId, req.user.stayId));
});

// POST /api/guest/payments  { utr, chargeIds? }  -> "I paid with the hotel's UPI QR"
// Without chargeIds it covers everything that is due.
router.post('/payments', async (req, res) => {
  const { utr, chargeIds } = z.object({
    utr: z.string().trim().min(1).max(60),
    chargeIds: z.array(id).max(200).default([]),
  }).parse(req.body);
  const { hotelId, stayId, roomNumber, name } = req.user;
  await guestPayment({ hotelId, stayId, roomNumber, guestName: name, utr, chargeIds });
  res.status(201).json(await getBill(hotelId, stayId));
});

// ---------- Restaurant tables ----------

const today = async (req) => (await hotelNow({ query }, req.user.hotelId)).today;

// GET /api/guest/tables/slots?date=2026-10-14&people=4
router.get('/tables/slots', async (req, res) => {
  const { date, people } = z.object({ date: isoDate.optional(), people: z.coerce.number().int().min(1).max(30).default(2) }).parse(req.query);
  res.json(await tableSlots(req.user.hotelId, date ?? await today(req), people));
});

// GET /api/guest/tables/bookings  -> my table bookings
router.get('/tables/bookings', async (req, res) => {
  res.json(await listTableBookings(req.user.hotelId, { stayId: req.user.stayId }));
});

// POST /api/guest/tables/bookings  { date, time, people, note }
router.post('/tables/bookings', async (req, res) => {
  const b = z.object({
    date: isoDate, time: hhmm, people: z.number().int().min(1).max(30), note: z.string().trim().max(300).default(''),
  }).parse(req.body);
  res.status(201).json(await bookTable({ hotelId: req.user.hotelId, stayId: req.user.stayId, ...b }));
});

// POST /api/guest/tables/bookings/:id/cancel
router.post('/tables/bookings/:id/cancel', async (req, res) => {
  res.json(await setTableBookingStatus(req.user.hotelId, id.parse(req.params.id), 'cancelled', { byGuestStayId: req.user.stayId }));
});

// ---------- Vehicles ----------

// GET /api/guest/vehicles?date=2026-10-14  -> bookable vehicles and the times already taken that day
router.get('/vehicles', async (req, res) => {
  const { date } = z.object({ date: isoDate.optional() }).parse(req.query);
  res.json(await vehiclesForDay(req.user.hotelId, date ?? await today(req)));
});

// GET /api/guest/vehicles/bookings  -> my vehicle bookings
router.get('/vehicles/bookings', async (req, res) => {
  res.json(await listVehicleBookings(req.user.hotelId, { stayId: req.user.stayId }));
});

// POST /api/guest/vehicles/bookings  { vehicleId, date, time, hours, note }
router.post('/vehicles/bookings', async (req, res) => {
  const b = z.object({
    vehicleId: z.number().int().positive(), date: isoDate, time: hhmm,
    hours: z.number().int().min(1).max(240), note: z.string().trim().max(300).default(''),
  }).parse(req.body);
  res.status(201).json(await bookVehicle({ hotelId: req.user.hotelId, stayId: req.user.stayId, ...b }));
});

// POST /api/guest/vehicles/bookings/:id/cancel
router.post('/vehicles/bookings/:id/cancel', async (req, res) => {
  res.json(await setVehicleBookingStatus(req.user.hotelId, id.parse(req.params.id), 'cancelled', { byGuestStayId: req.user.stayId }));
});

export default router;
