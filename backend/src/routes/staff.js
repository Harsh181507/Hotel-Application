// Everything staff can do. All routes need a staff token, and every query is
// limited to the staff member's own hotel (req.user.hotelId).
// Front-desk roles (admin, reception) can use everything here; department
// roles (housekeeping, kitchen, maintenance) only their own tasks.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { requireAdmin, requireRoles, requireStaff, userLimiter } from '../middleware/auth.js';
import { HttpError, notFound } from '../lib/errors.js';
import { newAccessCode, newRoomToken } from '../lib/codes.js';
import { broadcastMessage, listMessages, markRead, saveMessage } from '../lib/chat.js';
import { emitToStaff, endGuestSessions } from '../lib/realtime.js';
import { ALL_ROLES, departmentOf, DEPARTMENTS } from '../lib/departments.js';
import { getRequest, listRequests, setRequestStatus } from '../lib/requests.js';
import { invalidateFaqCache } from '../lib/autopilot.js';
import { stayBill } from '../lib/orders.js';
import { completeRoomCleaning, floorOf, markRoomDirty, reassignRoomsOf } from '../lib/housekeeping.js';

const router = Router();
router.use(requireStaff, userLimiter);
const desk = requireRoles('admin', 'reception');

const id = z.coerce.number().int().positive();
const guestLogin = z.string().trim().regex(/^[A-Za-z0-9-]{3,32}$/, 'use 3-32 letters, digits or dashes');
const guestName = z.string().trim().min(1).max(100);
// Staff log in with an email OR a simple username (many housekeepers have no email).
const loginId = z.string().trim().toLowerCase().regex(/^[a-z0-9._@+-]{3,100}$/, 'use 3-100 letters, digits, dots or @');
const floorsList = z.string().trim().max(100).regex(/^[0-9A-Za-z,\s]*$/, 'floors like "1,2"').default('');
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

// ---------- Rooms & check-in (front desk) ----------

// GET /api/staff/rooms  -> every room, its QR link, cleaning status and current guest
router.get('/rooms', desk, async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.number, r.qr_token, r.hk_status, r.dnd, s.id AS stay_id, s.guest_name, s.guest_login, s.checked_in_at
       FROM rooms r LEFT JOIN stays s ON s.room_id = r.id AND s.active
      WHERE r.hotel_id = $1
      ORDER BY length(r.number), r.number`,
    [req.user.hotelId],
  );
  res.json(rows.map((r) => ({
    id: r.id,
    number: r.number,
    link: roomLink(r.qr_token),
    hkStatus: r.hk_status,
    dnd: r.dnd,
    stay: r.stay_id ? { id: r.stay_id, guestName: r.guest_name, guestLogin: r.guest_login, checkedInAt: r.checked_in_at } : null,
  })));
});

// POST /api/staff/rooms  { number: "111" }   (admin)
router.post('/rooms', requireAdmin, async (req, res) => {
  const { number } = z.object({ number: z.string().trim().min(1).max(20) }).parse(req.body);
  const { rows: [room] } = await query(
    'INSERT INTO rooms (hotel_id, number, qr_token, floor) VALUES ($1, $2, $3, $4) RETURNING id, number, qr_token, hk_status, dnd',
    [req.user.hotelId, number, newRoomToken(), floorOf(number)],
  );
  res.status(201).json({ id: room.id, number: room.number, link: roomLink(room.qr_token), hkStatus: room.hk_status, dnd: room.dnd, stay: null });
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
router.post('/rooms/:id/checkin', desk, async (req, res) => {
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
  // A new guest starts with Do-not-disturb off.
  await query('UPDATE rooms SET dnd = false WHERE id = $1', [room.id]);
  stay.room_number = room.number;
  emitToStaff(req.user.hotelId, 'stay:updated', publicStay(stay));
  res.status(201).json({ stay: publicStay(stay), guestId: stay.guest_login, code, link: roomLink(room.qr_token) });
});

// PATCH /api/staff/stays/:id  { guestName?, guestLogin? }
router.patch('/stays/:id', desk, async (req, res) => {
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
router.post('/stays/:id/new-code', desk, async (req, res) => {
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

// GET /api/staff/stays/:id/bill  -> room-service orders + total (shown at check-out)
router.get('/stays/:id/bill', desk, async (req, res) => {
  const stay = await getStay(req, { activeOnly: false });
  res.json(await stayBill(req.user.hotelId, stay.id));
});

// POST /api/staff/stays/:id/checkout  -> the room goes to housekeeping for cleaning
router.post('/stays/:id/checkout', desk, async (req, res) => {
  const stay = await getStay(req);
  const { rows: [updated] } = await query(
    `UPDATE stays SET active = false, checked_out_at = now(), token_version = token_version + 1
      WHERE id = $1 RETURNING *`,
    [stay.id],
  );
  updated.room_number = stay.room_number;
  endGuestSessions(stay.id, 'checked_out');
  await query('UPDATE rooms SET dnd = false WHERE id = $1', [stay.room_id]);
  await markRoomDirty(req.user.hotelId, stay.room_id, { priority: true, note: 'Check-out cleaning' });
  emitToStaff(req.user.hotelId, 'stay:updated', publicStay(updated));
  res.json(publicStay(updated));
});

// ---------- Chat (front desk) ----------

// GET /api/staff/conversations  -> active guests, newest activity first
router.get('/conversations', desk, async (req, res) => {
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
router.get('/stays/:id/messages', desk, async (req, res) => {
  const stay = await getStay(req, { activeOnly: false });
  res.json(await listMessages(stay.id, pageSchema.parse(req.query)));
});

// POST /api/staff/stays/:id/messages  { body }
router.post('/stays/:id/messages', desk, async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
  const stay = await getStay(req);
  const message = await saveMessage({ stayId: stay.id, sender: 'staff', staffId: req.user.id, body });
  broadcastMessage(req.user.hotelId, message);
  res.status(201).json(message);
});

// POST /api/staff/stays/:id/read  -> staff has seen the guest's messages
router.post('/stays/:id/read', desk, async (req, res) => {
  const stay = await getStay(req);
  const count = await markRead({ hotelId: req.user.hotelId, stayId: stay.id, readerType: 'staff' });
  res.json({ marked: count });
});

// ---------- Service requests / department tasks ----------

const statusEnum = z.enum(['open', 'in_progress', 'done', 'cancelled']);

// GET /api/staff/requests?status=open&department=kitchen
// Department staff always get their own department's requests only.
router.get('/requests', async (req, res) => {
  const q = z.object({ status: statusEnum.optional(), department: z.enum(DEPARTMENTS).optional() }).parse(req.query);
  const department = departmentOf(req.user) ?? q.department ?? null;
  res.json(await listRequests(req.user.hotelId, { status: q.status ?? null, department }));
});

// PATCH /api/staff/requests/:id  { status }  ("in_progress" = accept: it becomes yours)
// The guest gets an automatic chat message about every change.
router.patch('/requests/:id', async (req, res) => {
  const { status } = z.object({ status: statusEnum }).parse(req.body);
  const requestId = id.parse(req.params.id);
  const existing = await getRequest(req.user.hotelId, requestId);
  const myDept = departmentOf(req.user);
  if (!existing || (myDept && existing.department !== myDept)) throw notFound('Request not found');

  const request = await setRequestStatus(req.user.hotelId, requestId, status, { staffId: req.user.id });
  // Finishing a cleaning request also marks the room clean on the board.
  if (request.type === 'housekeeping' && status === 'done') {
    const { rows: [stay] } = await query('SELECT room_id FROM stays WHERE id = $1', [request.stay_id]);
    if (stay) await completeRoomCleaning(req.user.hotelId, stay.room_id, { fromRequest: true });
  }
  res.json(request);
});

// ---------- Local answers (FAQs) ----------

const faqSchema = z.object({
  category: z.string().trim().min(1).max(50).default('General'),
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(5000),
  keywords: z.string().trim().max(500).default(''),
  sortOrder: z.number().int().default(0),
});
const FAQ_COLUMNS = 'id, category, question, answer, keywords, sort_order';

router.get('/faqs', desk, async (req, res) => {
  const { rows } = await query(
    `SELECT ${FAQ_COLUMNS} FROM faqs WHERE hotel_id = $1 ORDER BY sort_order, id`,
    [req.user.hotelId],
  );
  res.json(rows);
});

router.post('/faqs', desk, async (req, res) => {
  const f = faqSchema.parse(req.body);
  const { rows: [faq] } = await query(
    `INSERT INTO faqs (hotel_id, category, question, answer, keywords, sort_order) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${FAQ_COLUMNS}`,
    [req.user.hotelId, f.category, f.question, f.answer, f.keywords, f.sortOrder],
  );
  invalidateFaqCache(req.user.hotelId);
  res.status(201).json(faq);
});

router.put('/faqs/:id', desk, async (req, res) => {
  const f = faqSchema.parse(req.body);
  const { rows: [faq] } = await query(
    `UPDATE faqs SET category = $3, question = $4, answer = $5, keywords = $6, sort_order = $7, updated_at = now()
      WHERE id = $1 AND hotel_id = $2 RETURNING ${FAQ_COLUMNS}`,
    [id.parse(req.params.id), req.user.hotelId, f.category, f.question, f.answer, f.keywords, f.sortOrder],
  );
  if (!faq) throw notFound('FAQ not found');
  invalidateFaqCache(req.user.hotelId);
  res.json(faq);
});

router.delete('/faqs/:id', desk, async (req, res) => {
  const { rowCount } = await query('DELETE FROM faqs WHERE id = $1 AND hotel_id = $2', [id.parse(req.params.id), req.user.hotelId]);
  if (!rowCount) throw notFound('FAQ not found');
  invalidateFaqCache(req.user.hotelId);
  res.status(204).end();
});

// ---------- Hotel settings (admin) ----------

const SETTINGS_COLUMNS = `name, autopilot_mode, night_start, night_end, timezone, escalate_after_minutes, require_inspection,
  payment_qr_image_id, upi_id, payee_name, gstin, tax_food_pct::float AS tax_food_pct, tax_vehicle_pct::float AS tax_vehicle_pct,
  tax_other_pct::float AS tax_other_pct, restaurant_open, restaurant_close, table_booking_minutes`;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM, e.g. 22:00');

router.get('/settings', desk, async (req, res) => {
  const { rows: [hotel] } = await query(`SELECT ${SETTINGS_COLUMNS} FROM hotels WHERE id = $1`, [req.user.hotelId]);
  res.json(hotel);
});

// Every field is optional: only the ones sent are changed.
const taxPct = z.number().min(0).max(50);
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  autopilot_mode: z.enum(['always', 'night', 'off']),
  night_start: hhmm,
  night_end: hhmm,
  timezone: z.string().trim().max(60).refine((tz) => {
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
  }, 'unknown time zone'),
  escalate_after_minutes: z.number().int().min(1).max(240),
  require_inspection: z.boolean(),
  // How guests pay: the hotel's UPI QR picture (uploaded like a menu photo) and/or UPI ID.
  payment_qr_image_id: z.number().int().positive().nullable(),
  upi_id: z.string().trim().max(100).regex(/^$|^[\w.-]{2,256}@[a-zA-Z0-9.-]{2,64}$/, 'a UPI ID looks like hotelname@okaxis'),
  payee_name: z.string().trim().max(100),
  gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9A-Z]{15}$/, 'a GSTIN has 15 letters and digits'),
  tax_food_pct: taxPct,
  tax_vehicle_pct: taxPct,
  tax_other_pct: taxPct,
  restaurant_open: hhmm,
  restaurant_close: hhmm,
  table_booking_minutes: z.number().int().min(30).max(300),
}).partial();

router.put('/settings', requireAdmin, async (req, res) => {
  const s = settingsSchema.parse(req.body);
  if (s.payment_qr_image_id) {
    const { rows: [img] } = await query('SELECT 1 FROM images WHERE id = $1 AND hotel_id = $2', [s.payment_qr_image_id, req.user.hotelId]);
    if (!img) throw new HttpError(400, 'QR picture not found. Please upload it again.');
  }
  const fields = Object.keys(s).filter((key) => s[key] !== undefined); // keys were checked by the schema above
  if (fields.length) {
    await query(
      `UPDATE hotels SET ${fields.map((key, i) => `${key} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [req.user.hotelId, ...fields.map((key) => s[key])],
    );
  }
  const { rows: [hotel] } = await query(`SELECT ${SETTINGS_COLUMNS} FROM hotels WHERE id = $1`, [req.user.hotelId]);
  res.json(hotel);
});

// ---------- Staff accounts (admin) ----------

const USER_COLUMNS = 'id, name, email AS login, role, floors, active, created_at';

router.get('/users', requireAdmin, async (req, res) => {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM staff WHERE hotel_id = $1 ORDER BY active DESC, role, name`, [req.user.hotelId]);
  res.json(rows);
});

// POST /api/staff/users  { name, login, password, role, floors }
router.post('/users', requireAdmin, async (req, res) => {
  const u = z.object({
    name: z.string().trim().min(1).max(100),
    login: loginId,
    password: z.string().min(8).max(200),
    role: z.enum(ALL_ROLES).default('reception'),
    floors: floorsList,
  }).parse(req.body);
  try {
    const { rows: [user] } = await query(
      `INSERT INTO staff (hotel_id, name, email, password_hash, role, floors) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING ${USER_COLUMNS}`,
      [req.user.hotelId, u.name, u.login, await bcrypt.hash(u.password, 10), u.role, u.floors.replace(/\s+/g, '')],
    );
    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'That login ID is already taken');
    throw err;
  }
});

// PATCH /api/staff/users/:id  { name?, active?, role?, password?, floors? }
router.patch('/users/:id', requireAdmin, async (req, res) => {
  const u = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    active: z.boolean().optional(),
    role: z.enum(ALL_ROLES).optional(),
    password: z.string().min(8).max(200).optional(),
    floors: floorsList.optional(),
  }).parse(req.body);
  const userId = id.parse(req.params.id);
  if (userId === req.user.id && (u.active === false || (u.role && u.role !== 'admin'))) {
    throw new HttpError(400, 'You cannot disable or demote yourself');
  }
  const { rows: [user] } = await query(
    `UPDATE staff SET
       name = COALESCE($3, name),
       active = COALESCE($4, active),
       role = COALESCE($5, role),
       password_hash = COALESCE($6, password_hash),
       floors = COALESCE($7, floors)
     WHERE id = $1 AND hotel_id = $2
     RETURNING ${USER_COLUMNS}`,
    [userId, req.user.hotelId, u.name ?? null, u.active ?? null, u.role ?? null,
      u.password ? await bcrypt.hash(u.password, 10) : null, u.floors?.replace(/\s+/g, '') ?? null],
  );
  if (!user) throw notFound('Staff member not found');
  // A housekeeper who left (or changed job) hands their unfinished rooms to the others.
  if (!user.active || user.role !== 'housekeeping') await reassignRoomsOf(req.user.hotelId, user.id);
  res.json(user);
});

export default router;
