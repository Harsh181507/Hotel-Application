// Housekeeping board: /api/staff/housekeeping/...
// Front desk sees and manages every room; housekeepers update the rooms they clean.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRoles, requireStaff, userLimiter } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';
import {
  broadcastRoom, completeRoomCleaning, getHkRoom, listHkRooms, markDailyCleaning, markRoomDirty, startCleaning,
} from '../lib/housekeeping.js';

const router = Router();
router.use(requireStaff, userLimiter, requireRoles('admin', 'reception', 'housekeeping'));
const desk = requireRoles('admin', 'reception');
const id = z.coerce.number().int().positive();

async function roomOr404(req) {
  const room = await getHkRoom(req.user.hotelId, id.parse(req.params.id));
  if (!room) throw notFound('Room not found');
  return room;
}

// GET /api/staff/housekeeping/rooms
router.get('/rooms', async (req, res) => {
  res.json(await listHkRooms(req.user.hotelId));
});

// GET /api/staff/housekeeping/staff  -> housekeepers and how many rooms each has
router.get('/staff', desk, async (req, res) => {
  const { rows } = await query(
    `SELECT st.id, st.name, st.floors,
            (SELECT count(*) FROM rooms x WHERE x.hk_assigned_to = st.id AND x.hk_status <> 'ready')::int AS open_rooms
       FROM staff st WHERE st.hotel_id = $1 AND st.role = 'housekeeping' AND st.active ORDER BY st.name`,
    [req.user.hotelId],
  );
  res.json(rows);
});

// POST /api/staff/housekeeping/rooms/:id/status  { status: dirty | cleaning | clean | ready }
//   clean = "I finished cleaning" (goes to inspection if the hotel requires it)
//   ready = inspected / approved (front desk)
router.post('/rooms/:id/status', async (req, res) => {
  const { status } = z.object({ status: z.enum(['dirty', 'cleaning', 'clean', 'ready']) }).parse(req.body);
  const room = await roomOr404(req);
  const { hotelId } = req.user;
  const isDesk = ['admin', 'reception'].includes(req.user.role);
  let updated;
  if (status === 'dirty') updated = await markRoomDirty(hotelId, room.id);
  else if (status === 'cleaning') updated = await startCleaning(hotelId, room.id, req.user.role === 'housekeeping' ? req.user.id : null);
  else if (status === 'clean') updated = await completeRoomCleaning(hotelId, room.id);
  else updated = await completeRoomCleaning(hotelId, room.id, { inspected: isDesk || room.hk_status === 'inspect' });
  res.json(updated);
});

// PATCH /api/staff/housekeeping/rooms/:id  { assignedTo?, priority?, note? }   (front desk)
router.patch('/rooms/:id', desk, async (req, res) => {
  const b = z.object({
    assignedTo: z.number().int().positive().nullable().optional(),
    priority: z.boolean().optional(),
    note: z.string().trim().max(200).optional(),
  }).parse(req.body);
  const room = await roomOr404(req);
  if (b.assignedTo) {
    const { rows: [hk] } = await query(
      `SELECT 1 FROM staff WHERE id = $1 AND hotel_id = $2 AND role = 'housekeeping' AND active`, [b.assignedTo, req.user.hotelId],
    );
    if (!hk) throw notFound('Housekeeper not found');
  }
  await query(
    `UPDATE rooms SET
       hk_assigned_to = CASE WHEN $3 THEN $4::int ELSE hk_assigned_to END,
       hk_priority = COALESCE($5, hk_priority),
       hk_note = COALESCE($6, hk_note),
       hk_updated_at = now()
     WHERE id = $1 AND hotel_id = $2`,
    [room.id, req.user.hotelId, b.assignedTo !== undefined, b.assignedTo ?? null, b.priority ?? null, b.note ?? null],
  );
  res.json(await broadcastRoom(req.user.hotelId, room.id));
});

// POST /api/staff/housekeeping/daily  -> occupied rooms need their daily cleaning
router.post('/daily', desk, async (req, res) => {
  res.json({ marked: await markDailyCleaning(req.user.hotelId) });
});

export default router;
