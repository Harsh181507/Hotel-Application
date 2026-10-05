import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { HttpError, notFound } from '../lib/errors.js';
import { signGuestToken, signStaffToken } from '../lib/tokens.js';
import { guestLoginLimiter, staffLoginLimiter } from '../middleware/auth.js';

const router = Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// POST /api/auth/staff/login  { email, password }
router.post('/staff/login', staffLoginLimiter, async (req, res) => {
  const { email, password } = z.object({
    email: z.string().trim().toLowerCase().max(200),
    password: z.string().max(200),
  }).parse(req.body);

  const { rows: [staff] } = await query('SELECT * FROM staff WHERE email = $1 AND active', [email]);
  if (!staff || !(await bcrypt.compare(password, staff.password_hash))) {
    throw new HttpError(401, 'Wrong email or password');
  }
  res.json({
    token: signStaffToken(staff),
    staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
  });
});

// GET /api/auth/room/:token  -> shown on the guest login screen after scanning the QR
router.get('/room/:token', async (req, res) => {
  const { rows: [room] } = await query(
    `SELECT r.number, h.name AS hotel_name FROM rooms r JOIN hotels h ON h.id = r.hotel_id
      WHERE r.qr_token = $1`,
    [req.params.token],
  );
  if (!room) throw notFound('Room not found. Please scan the QR code in your room again.');
  res.json({ roomNumber: room.number, hotelName: room.hotel_name });
});

// POST /api/auth/guest/login  { room: "<qr token>", guestId: "Ranchi", code: "123456" }
router.post('/guest/login', guestLoginLimiter, async (req, res) => {
  const { room, guestId, code } = z.object({
    room: z.string().max(100),
    guestId: z.string().trim().max(50),
    code: z.string().trim().regex(/^\d{6}$/, 'must be 6 digits'),
  }).parse(req.body);

  const { rows: [row] } = await query(
    `SELECT s.*, r.number AS room_number, h.name AS hotel_name
       FROM rooms r
       JOIN hotels h ON h.id = r.hotel_id
       LEFT JOIN stays s ON s.room_id = r.id AND s.active
      WHERE r.qr_token = $1`,
    [room],
  );
  if (!row) throw notFound('Room not found. Please scan the QR code in your room again.');
  if (!row.id) throw new HttpError(401, 'This room has no active check-in. Please contact the front desk.');

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    throw new HttpError(429, 'Too many wrong attempts. Please wait 15 minutes or contact the front desk.');
  }

  const ok = row.guest_login.toLowerCase() === guestId.toLowerCase()
    && (await bcrypt.compare(code, row.code_hash));

  if (!ok) {
    // Count the failure; after 5 in a row, lock this stay for 15 minutes.
    await query(
      `UPDATE stays SET
         failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
         locked_until    = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
       WHERE id = $1`,
      [row.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
    );
    throw new HttpError(401, 'Guest ID or access code is incorrect');
  }

  if (row.failed_attempts > 0 || row.locked_until) {
    await query('UPDATE stays SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [row.id]);
  }

  res.json({
    token: signGuestToken(row),
    guest: { name: row.guest_name, roomNumber: row.room_number, hotelName: row.hotel_name },
  });
});

export default router;
