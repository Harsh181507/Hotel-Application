// Everything a logged-in guest can do. All routes need a guest token.
import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/pool.js';
import { requireGuest, userLimiter } from '../middleware/auth.js';
import { broadcastMessage, listMessages, markRead, saveMessage } from '../lib/chat.js';
import { emitToStaff } from '../lib/realtime.js';
import { REQUEST_TYPES, REQUEST_LABELS } from '../lib/requestTypes.js';

const router = Router();
router.use(requireGuest, userLimiter);

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

// GET /api/guest/messages?before=<id>&limit=50
router.get('/messages', async (req, res) => {
  res.json(await listMessages(req.user.stayId, pageSchema.parse(req.query)));
});

// POST /api/guest/messages  { body }
router.post('/messages', async (req, res) => {
  const { body } = messageSchema.parse(req.body);
  const message = await saveMessage({ stayId: req.user.stayId, sender: 'guest', body });
  broadcastMessage(req.user.hotelId, message);
  res.status(201).json(message);
});

// POST /api/guest/messages/read  -> guest has seen the front desk's replies
router.post('/messages/read', async (req, res) => {
  const count = await markRead({ hotelId: req.user.hotelId, stayId: req.user.stayId, readerType: 'guest' });
  res.json({ marked: count });
});

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
  const { stayId, hotelId } = req.user;

  const { request, message } = await transaction(async (db) => {
    const { rows: [request] } = await db.query(
      `INSERT INTO requests (hotel_id, stay_id, type, details) VALUES ($1, $2, $3, $4)
       RETURNING id, stay_id, type, details, status, created_at, updated_at`,
      [hotelId, stayId, type, details],
    );
    const body = details ? `${REQUEST_LABELS[type]} request: ${details}` : `${REQUEST_LABELS[type]} request`;
    const message = await saveMessage({ db, stayId, sender: 'guest', body, requestId: request.id });
    return { request, message };
  });

  broadcastMessage(hotelId, message);
  emitToStaff(hotelId, 'request:new', { ...request, room_number: req.user.roomNumber });
  res.status(201).json(request);
});

export default router;
