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

export default router;
