// Everything the front desk can do. All routes need a staff token, and every
// query is limited to the staff member's own hotel (req.user.hotelId).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { query, transaction } from '../db/pool.js';
import { requireAdmin, requireStaff, userLimiter } from '../middleware/auth.js';
import { HttpError, notFound } from '../lib/errors.js';
import { newAccessCode, newRoomToken } from '../lib/codes.js';
import { broadcastMessage, listMessages, markRead, saveMessage } from '../lib/chat.js';
import { emitToConversation, emitToStaff, endGuestSessions } from '../lib/realtime.js';
import { REQUEST_LABELS, STATUS_LABELS } from '../lib/requestTypes.js';

const router = Router();
router.use(requireStaff, userLimiter);

const id = z.coerce.number().int().positive();
const guestLogin = z.string().trim().regex(/^[A-Za-z0-9-]{3,32}$/, 'use 3-32 letters, digits or dashes');
const guestName = z.string().trim().min(1).max(100);
const pageSchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const roomLink = (qrToken) => `${config.guestAppUrl}/guest/?room=${qrToken}`;

// Loads a stay that belongs to this staff member's hotel, or 404s.
async function getStay(req, { activeOnly = true } = {}) {
  const { rows: [stay] } = await query(
    `SELECT s.*, r.number AS room_number FROM stays s JOIN rooms r ON r.id = s.room_id
      WHERE s.id = $1 AND s.hotel_id = $2 ${activeOnly ? 'AND s.active' : ''}`,
    [id.parse(req.params.id), req.user.hotelId],
  );
  if (!stay) throw notFound('Guest stay not found');
  return stay;
}

const publicStay = (s) => ({
  id: s.id, roomId: s.room_id, roomNumber: s.room_number, guestName: s.guest_name,
  guestLogin: s.guest_login, active: s.active, checkedInAt: s.checked_in_at, checkedOutAt: s.checked_out_at,
});

// ---------- Me ----------

router.get('/me', (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, role: req.user.role });
});

// POST /api/staff/me/password  { currentPassword, newPassword }
router.post('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(200),
  }).parse(req.body);
  const { rows: [me] } = await query('SELECT password_hash FROM staff WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, me.password_hash))) throw new HttpError(400, 'Current password is wrong');
  await query('UPDATE staff SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 10), req.user.id]);
  res.json({ ok: true });
});

// ---------- Rooms & check-in ----------

// GET /api/staff/rooms  -> every room, its QR link and current guest (if any)
router.get('/rooms', async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.number, r.qr_token, s.id AS stay_id, s.guest_name, s.guest_login, s.checked_in_at
       FROM rooms r LEFT JOIN stays s ON s.room_id = r.id AND s.active
      WHERE r.hotel_id = $1
      ORDER BY length(r.number), r.number`,
    [req.user.hotelId],
  );
  res.json(rows.map((r) => ({
    id: r.id,
    number: r.number,
    link: roomLink(r.qr_token),
    stay: r.stay_id ? { id: r.stay_id, guestName: r.guest_name, guestLogin: r.guest_login, checkedInAt: r.checked_in_at } : null,
  })));
});

// POST /api/staff/rooms  { number: "111" }   (admin)
router.post('/rooms', requireAdmin, async (req, res) => {
  const { number } = z.object({ number: z.string().trim().min(1).max(20) }).parse(req.body);
  const { rows: [room] } = await query(
    'INSERT INTO rooms (hotel_id, number, qr_token) VALUES ($1, $2, $3) RETURNING id, number, qr_token',
    [req.user.hotelId, number, newRoomToken()],
  );
  res.status(201).json({ id: room.id, number: room.number, link: roomLink(room.qr_token), stay: null });
});

// DELETE /api/staff/rooms/:id   (admin; only when no guest is checked in)
router.delete('/rooms/:id', requireAdmin, async (req, res) => {
  const roomId = id.parse(req.params.id);
  const { rows: [busy] } = await query('SELECT 1 FROM stays WHERE room_id = $1 AND active', [roomId]);
  if (busy) throw new HttpError(409, 'Check the guest out first');
  const { rowCount } = await query('DELETE FROM rooms WHERE id = $1 AND hotel_id = $2', [roomId, req.user.hotelId]);
  if (!rowCount) throw notFound('Room not found');
  res.status(204).end();
});

// POST /api/staff/rooms/:id/checkin  { guestName, guestLogin }
// Returns the 6-digit code ONCE. Only its hash is stored.
router.post('/rooms/:id/checkin', async (req, res) => {
  const body = z.object({ guestName, guestLogin }).parse(req.body);
  const roomId = id.parse(req.params.id);
  const { rows: [room] } = await query('SELECT id, number, qr_token FROM rooms WHERE id = $1 AND hotel_id = $2', [roomId, req.user.hotelId]);
  if (!room) throw notFound('Room not found');

  const code = newAccessCode();
  let stay;
  try {
    ({ rows: [stay] } = await query(
      `INSERT INTO stays (hotel_id, room_id, guest_name, guest_login, code_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.hotelId, room.id, body.guestName, body.guestLogin, await bcrypt.hash(code, 10)],
    ));
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, `Room ${room.number} already has a guest checked in`);
    throw err;
  }
  stay.room_number = room.number;
  emitToStaff(req.user.hotelId, 'stay:updated', publicStay(stay));
  res.status(201).json({ stay: publicStay(stay), guestId: stay.guest_login, code, link: roomLink(room.qr_token) });
});

// PATCH /api/staff/stays/:id  { guestName?, guestLogin? }
router.patch('/stays/:id', async (req, res) => {
  const body = z.object({ guestName: guestName.optional(), guestLogin: guestLogin.optional() }).parse(req.body);
  const stay = await getStay(req);
  const { rows: [updated] } = await query(
    `UPDATE stays SET guest_name = $2, guest_login = $3 WHERE id = $1 RETURNING *`,
    [stay.id, body.guestName ?? stay.guest_name, body.guestLogin ?? stay.guest_login],
  );
  updated.room_number = stay.room_number;
  emitToStaff(req.user.hotelId, 'stay:updated', publicStay(updated));
  res.json(publicStay(updated));
});

// POST /api/staff/stays/:id/new-code  -> new 6-digit code; guest's devices are logged out
router.post('/stays/:id/new-code', async (req, res) => {
  const stay = await getStay(req);
  const code = newAccessCode();
  await query(
    `UPDATE stays SET code_hash = $2, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL
      WHERE id = $1`,
    [stay.id, await bcrypt.hash(code, 10)],
  );
  endGuestSessions(stay.id, 'code_changed');
  res.json({ guestId: stay.guest_login, code });
});

// POST /api/staff/stays/:id/checkout
router.post('/stays/:id/checkout', async (req, res) => {
  const stay = await getStay(req);
  const { rows: [updated] } = await query(
    `UPDATE stays SET active = false, checked_out_at = now(), token_version = token_version + 1
      WHERE id = $1 RETURNING *`,
    [stay.id],
  );
  updated.room_number = stay.room_number;
  endGuestSessions(stay.id, 'checked_out');
  emitToStaff(req.user.hotelId, 'stay:updated', publicStay(updated));
  res.json(publicStay(updated));
});

// ---------- Chat ----------

// GET /api/staff/conversations  -> active guests, newest activity first
router.get('/conversations', async (req, res) => {
  const { rows } = await query(
    `SELECT s.id AS stay_id, s.guest_name, s.guest_login, r.number AS room_number,
            lm.body AS last_body, lm.sender AS last_sender, lm.created_at AS last_at,
            (SELECT count(*)::int FROM messages m
              WHERE m.stay_id = s.id AND m.sender = 'guest' AND m.read_at IS NULL) AS unread
       FROM stays s
       JOIN rooms r ON r.id = s.room_id
       LEFT JOIN LATERAL (
         SELECT body, sender, created_at FROM messages WHERE stay_id = s.id ORDER BY id DESC LIMIT 1
       ) lm ON true
      WHERE s.hotel_id = $1 AND s.active
      ORDER BY lm.created_at DESC NULLS LAST, s.id DESC`,
    [req.user.hotelId],
  );
  res.json(rows);
});

// GET /api/staff/stays/:id/messages?before=<id>&limit=50  (works for past stays too)
router.get('/stays/:id/messages', async (req, res) => {
  const stay = await getStay(req, { activeOnly: false });
  res.json(await listMessages(stay.id, pageSchema.parse(req.query)));
});

// POST /api/staff/stays/:id/messages  { body }
router.post('/stays/:id/messages', async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
  const stay = await getStay(req);
  const message = await saveMessage({ stayId: stay.id, sender: 'staff', staffId: req.user.id, body });
  broadcastMessage(req.user.hotelId, message);
  res.status(201).json(message);
});

// POST /api/staff/stays/:id/read  -> staff has seen the guest's messages
router.post('/stays/:id/read', async (req, res) => {
  const stay = await getStay(req);
  const count = await markRead({ hotelId: req.user.hotelId, stayId: stay.id, readerType: 'staff' });
  res.json({ marked: count });
});

// ---------- Service requests ----------

// GET /api/staff/requests?status=open
router.get('/requests', async (req, res) => {
  const { status } = z.object({ status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional() }).parse(req.query);
  const { rows } = await query(
    `SELECT q.id, q.stay_id, q.type, q.details, q.status, q.created_at, q.updated_at,
            r.number AS room_number, s.guest_name
       FROM requests q JOIN stays s ON s.id = q.stay_id JOIN rooms r ON r.id = s.room_id
      WHERE q.hotel_id = $1 AND ($2::text IS NULL OR q.status = $2)
      ORDER BY q.id DESC LIMIT 200`,
    [req.user.hotelId, status ?? null],
  );
  res.json(rows);
});

// PATCH /api/staff/requests/:id  { status: "in_progress" | "done" | "cancelled" | "open" }
// Also posts an automatic chat message so the guest sees the update.
router.patch('/requests/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['open', 'in_progress', 'done', 'cancelled']) }).parse(req.body);
  const { hotelId } = req.user;

  const { request, message } = await transaction(async (db) => {
    const { rows: [request] } = await db.query(
      `UPDATE requests SET status = $3, updated_at = now()
        WHERE id = $1 AND hotel_id = $2
        RETURNING id, stay_id, type, details, status, created_at, updated_at`,
      [id.parse(req.params.id), hotelId, status],
    );
    if (!request) throw notFound('Request not found');
    const message = await saveMessage({
      db,
      stayId: request.stay_id,
      sender: 'system',
      staffId: req.user.id,
      body: `Your ${REQUEST_LABELS[request.type].toLowerCase()} request is ${STATUS_LABELS[status]}.`,
      requestId: request.id,
    });
    return { request, message };
  });

  broadcastMessage(hotelId, message);
  emitToConversation(hotelId, request.stay_id, 'request:updated', request);
  res.json(request);
});

// ---------- Local answers (FAQs) ----------

const faqSchema = z.object({
  category: z.string().trim().min(1).max(50).default('General'),
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(5000),
  sortOrder: z.number().int().default(0),
});

router.get('/faqs', async (req, res) => {
  const { rows } = await query(
    'SELECT id, category, question, answer, sort_order FROM faqs WHERE hotel_id = $1 ORDER BY sort_order, id',
    [req.user.hotelId],
  );
  res.json(rows);
});

router.post('/faqs', async (req, res) => {
  const f = faqSchema.parse(req.body);
  const { rows: [faq] } = await query(
    `INSERT INTO faqs (hotel_id, category, question, answer, sort_order) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, category, question, answer, sort_order`,
    [req.user.hotelId, f.category, f.question, f.answer, f.sortOrder],
  );
  res.status(201).json(faq);
});

router.put('/faqs/:id', async (req, res) => {
  const f = faqSchema.parse(req.body);
  const { rows: [faq] } = await query(
    `UPDATE faqs SET category = $3, question = $4, answer = $5, sort_order = $6, updated_at = now()
      WHERE id = $1 AND hotel_id = $2 RETURNING id, category, question, answer, sort_order`,
    [id.parse(req.params.id), req.user.hotelId, f.category, f.question, f.answer, f.sortOrder],
  );
  if (!faq) throw notFound('FAQ not found');
  res.json(faq);
});

router.delete('/faqs/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM faqs WHERE id = $1 AND hotel_id = $2', [id.parse(req.params.id), req.user.hotelId]);
  if (!rowCount) throw notFound('FAQ not found');
  res.status(204).end();
});

// ---------- Staff accounts (admin) ----------

router.get('/users', requireAdmin, async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, email, role, active, created_at FROM staff WHERE hotel_id = $1 ORDER BY id',
    [req.user.hotelId],
  );
  res.json(rows);
});

// POST /api/staff/users  { name, email, password, role }
router.post('/users', requireAdmin, async (req, res) => {
  const u = z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(200),
    role: z.enum(['admin', 'reception']).default('reception'),
  }).parse(req.body);
  const { rows: [user] } = await query(
    `INSERT INTO staff (hotel_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, name, email, role, active, created_at`,
    [req.user.hotelId, u.name, u.email, await bcrypt.hash(u.password, 10), u.role],
  );
  res.status(201).json(user);
});

// PATCH /api/staff/users/:id  { active?, role?, password? }
router.patch('/users/:id', requireAdmin, async (req, res) => {
  const u = z.object({
    active: z.boolean().optional(),
    role: z.enum(['admin', 'reception']).optional(),
    password: z.string().min(8).max(200).optional(),
  }).parse(req.body);
  const userId = id.parse(req.params.id);
  if (userId === req.user.id && (u.active === false || u.role === 'reception')) {
    throw new HttpError(400, 'You cannot disable or demote yourself');
  }
  const { rows: [user] } = await query(
    `UPDATE staff SET
       active = COALESCE($3, active),
       role = COALESCE($4, role),
       password_hash = COALESCE($5, password_hash)
     WHERE id = $1 AND hotel_id = $2
     RETURNING id, name, email, role, active, created_at`,
    [userId, req.user.hotelId, u.active ?? null, u.role ?? null, u.password ? await bcrypt.hash(u.password, 10) : null],
  );
  if (!user) throw notFound('Staff member not found');
  res.json(user);
});

export default router;
