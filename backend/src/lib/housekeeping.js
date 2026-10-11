// Room cleaning status: dirty -> cleaning -> (inspect) -> ready.
// Rooms that need cleaning are given to a housekeeper automatically:
// someone who looks after that floor, otherwise whoever has the fewest rooms.
import { query } from '../db/pool.js';
import { emitOps } from './realtime.js';
import { completeCleaningRequests } from './requests.js';

export const HK_STATUSES = ['dirty', 'cleaning', 'inspect', 'ready'];

export const ROOM_HK_COLUMNS = `r.id, r.number, r.floor, r.hk_status, r.hk_priority, r.hk_note, r.hk_assigned_to,
  r.hk_updated_at, r.dnd, hs.name AS hk_assigned_name, (s.id IS NOT NULL) AS occupied`;

const ROOM_HK_FROM = `rooms r
  LEFT JOIN staff hs ON hs.id = r.hk_assigned_to
  LEFT JOIN stays s ON s.room_id = r.id AND s.active`;

// 105 -> "1", 1203 -> "12", "LT-1" -> ""
export const floorOf = (number) => (/^\d{3,}$/.test(number) ? number.slice(0, -2) : '');

export async function getHkRoom(hotelId, roomId) {
  const { rows: [room] } = await query(
    `SELECT ${ROOM_HK_COLUMNS} FROM ${ROOM_HK_FROM} WHERE r.id = $1 AND r.hotel_id = $2`, [roomId, hotelId],
  );
  return room ?? null;
}

export async function listHkRooms(hotelId) {
  const { rows } = await query(
    `SELECT ${ROOM_HK_COLUMNS} FROM ${ROOM_HK_FROM} WHERE r.hotel_id = $1
      ORDER BY r.hk_priority DESC, length(r.number), r.number`,
    [hotelId],
  );
  return rows;
}

export async function broadcastRoom(hotelId, roomId) {
  const room = await getHkRoom(hotelId, roomId);
  if (room) emitOps(hotelId, 'housekeeping', 'room:updated', room);
  return room;
}

// Picks the housekeeper for a room (null if the hotel has none yet).
async function pickHousekeeper(hotelId, floor) {
  const { rows } = await query(
    `SELECT st.id, st.floors,
            (SELECT count(*) FROM rooms x WHERE x.hk_assigned_to = st.id AND x.hk_status <> 'ready')::int AS load
       FROM staff st
      WHERE st.hotel_id = $1 AND st.role = 'housekeeping' AND st.active
      ORDER BY load, st.id`,
    [hotelId],
  );
  if (!rows.length) return null;
  const onFloor = rows.filter((s) => s.floors.split(',').map((f) => f.trim()).filter(Boolean).includes(floor));
  return (onFloor[0] ?? rows[0]).id;
}

/**
 * Marks a room as needing cleaning and assigns a housekeeper if it has none.
 * priority: guest asked for it / check-out (goes to the top of the list).
 */
export async function markRoomDirty(hotelId, roomId, { priority = false, note = '' } = {}) {
  const { rows: [room] } = await query(
    `SELECT r.id, r.floor, r.hk_assigned_to, (st.active AND st.role = 'housekeeping') AS assignee_ok
       FROM rooms r LEFT JOIN staff st ON st.id = r.hk_assigned_to
      WHERE r.id = $1 AND r.hotel_id = $2`,
    [roomId, hotelId],
  );
  if (!room) return null;
  // Keep the current housekeeper unless they left (account disabled).
  const assignee = room.assignee_ok ? room.hk_assigned_to : await pickHousekeeper(hotelId, room.floor ?? '');
  await query(
    `UPDATE rooms SET
       hk_status = CASE WHEN hk_status = 'cleaning' THEN 'cleaning' ELSE 'dirty' END,
       hk_priority = hk_priority OR $3,
       hk_note = CASE WHEN $4 = '' THEN hk_note ELSE $4 END,
       hk_assigned_to = $5,
       hk_updated_at = now()
     WHERE id = $1 AND hotel_id = $2`,
    [roomId, hotelId, priority, note, assignee],
  );
  return broadcastRoom(hotelId, roomId);
}

// When a housekeeper leaves (account disabled / role changed), their unfinished
// rooms go to the other housekeepers straight away.
export async function reassignRoomsOf(hotelId, staffId) {
  const { rows } = await query(
    `UPDATE rooms SET hk_assigned_to = NULL WHERE hotel_id = $1 AND hk_assigned_to = $2 RETURNING id, floor, hk_status`,
    [hotelId, staffId],
  );
  for (const room of rows) {
    if (room.hk_status !== 'ready') {
      const next = await pickHousekeeper(hotelId, room.floor ?? '');
      if (next) await query('UPDATE rooms SET hk_assigned_to = $2 WHERE id = $1', [room.id, next]);
    }
    await broadcastRoom(hotelId, room.id);
  }
  return rows.length;
}

// Housekeeper starts cleaning: the room becomes theirs if nobody had it.
export async function startCleaning(hotelId, roomId, staffId) {
  await query(
    `UPDATE rooms SET hk_status = 'cleaning', hk_assigned_to = COALESCE(hk_assigned_to, $3), hk_updated_at = now()
      WHERE id = $1 AND hotel_id = $2`,
    [roomId, hotelId, staffId],
  );
  return broadcastRoom(hotelId, roomId);
}

/**
 * Cleaning finished. If the hotel wants rooms inspected, the room waits for a
 * check ("inspect"); otherwise (or when inspected) it is ready for guests.
 * The guest's open cleaning requests are completed and they're told in chat.
 */
export async function completeRoomCleaning(hotelId, roomId, { inspected = false } = {}) {
  const { rows: [hotel] } = await query('SELECT require_inspection FROM hotels WHERE id = $1', [hotelId]);
  const next = hotel?.require_inspection && !inspected ? 'inspect' : 'ready';
  await query(
    `UPDATE rooms SET hk_status = $3, hk_priority = false, hk_note = '', hk_updated_at = now()
      WHERE id = $1 AND hotel_id = $2`,
    [roomId, hotelId, next],
  );
  const room = await broadcastRoom(hotelId, roomId);
  await completeCleaningRequests(hotelId, roomId);
  return room;
}

// Morning round: every occupied room (not on do-not-disturb) gets daily cleaning.
export async function markDailyCleaning(hotelId) {
  const { rows } = await query(
    `SELECT r.id FROM rooms r JOIN stays s ON s.room_id = r.id AND s.active
      WHERE r.hotel_id = $1 AND NOT r.dnd AND r.hk_status = 'ready'`,
    [hotelId],
  );
  for (const { id } of rows) await markRoomDirty(hotelId, id);
  return rows.length;
}
