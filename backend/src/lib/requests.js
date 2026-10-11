// Service requests are shared by the guest's quick buttons, the autopilot
// (which turns "please send 2 towels" into a request by itself), department
// task screens and the housekeeping board.
import { query, transaction } from '../db/pool.js';
import { broadcastMessage, saveMessage } from './chat.js';
import { emitOps } from './realtime.js';
import { DEPARTMENT_FOR_TYPE } from './departments.js';
import { REQUEST_LABELS, STATUS_LABELS } from './requestTypes.js';
import { markRoomDirty } from './housekeeping.js';
import { HttpError } from './errors.js';

export const REQUEST_COLUMNS = `q.id, q.stay_id, q.type, q.department, q.details, q.status, q.assigned_to,
  q.accepted_at, q.escalated_at, q.created_at, q.updated_at`;

const REQUEST_SELECT = `
  SELECT ${REQUEST_COLUMNS}, r.number AS room_number, s.guest_name, a.name AS assigned_name
    FROM requests q
    JOIN stays s ON s.id = q.stay_id
    JOIN rooms r ON r.id = s.room_id
    LEFT JOIN staff a ON a.id = q.assigned_to`;

export async function getRequest(hotelId, requestId) {
  const { rows: [row] } = await query(`${REQUEST_SELECT} WHERE q.id = $1 AND q.hotel_id = $2`, [requestId, hotelId]);
  return row ?? null;
}

export async function listRequests(hotelId, { status = null, department = null } = {}) {
  const { rows } = await query(
    `${REQUEST_SELECT}
      WHERE q.hotel_id = $1 AND ($2::text IS NULL OR q.status = $2) AND ($3::text IS NULL OR q.department = $3)
      ORDER BY (q.escalated_at IS NOT NULL AND q.status = 'open') DESC, q.id DESC LIMIT 200`,
    [hotelId, status, department],
  );
  return rows;
}

// guestMessageId: when the request comes from a chat message the guest already
// sent, link that message instead of posting a second one.
export async function createRequest({ hotelId, stayId, type, details = '', guestMessageId = null }) {
  const department = DEPARTMENT_FOR_TYPE[type];
  const { requestId, message } = await transaction(async (db) => {
    const { rows: [request] } = await db.query(
      'INSERT INTO requests (hotel_id, stay_id, type, department, details) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [hotelId, stayId, type, department, details],
    );
    let message = null;
    if (guestMessageId) {
      await db.query('UPDATE messages SET request_id = $1 WHERE id = $2', [request.id, guestMessageId]);
    } else {
      const body = details ? `${REQUEST_LABELS[type]} request: ${details}` : `${REQUEST_LABELS[type]} request`;
      message = await saveMessage({ db, stayId, sender: 'guest', body, requestId: request.id });
    }
    return { requestId: request.id, message };
  });

  if (message) broadcastMessage(hotelId, message);
  const request = await getRequest(hotelId, requestId);
  emitOps(hotelId, department, 'request:new', request);

  // Room cleaning also puts the room at the top of the housekeeping board.
  if (type === 'housekeeping') {
    const { rows: [stay] } = await query('SELECT room_id FROM stays WHERE id = $1', [stayId]);
    if (stay) await markRoomDirty(hotelId, stay.room_id, { priority: true, note: details || 'Guest asked for cleaning' });
  }
  return request;
}

/**
 * Changes a request's status, tells the guest in their chat, and pushes the
 * update to the front desk and the department. Accepting ("in_progress")
 * assigns the request to the staff member who accepted it.
 */
export async function setRequestStatus(hotelId, requestId, status, { staffId = null } = {}) {
  const { rows: [updated] } = await query(
    `UPDATE requests SET status = $3, updated_at = now(),
       assigned_to = CASE WHEN $3 = 'in_progress' AND $4::int IS NOT NULL THEN $4 ELSE assigned_to END,
       accepted_at = CASE WHEN $3 = 'in_progress' AND accepted_at IS NULL THEN now() ELSE accepted_at END
     WHERE id = $1 AND hotel_id = $2 AND status <> $3
     RETURNING id`,
    [requestId, hotelId, status, staffId],
  );
  const request = await getRequest(hotelId, requestId);
  if (!request) throw new HttpError(404, 'Request not found');
  if (!updated) return request; // already in that status

  const message = await saveMessage({
    stayId: request.stay_id,
    sender: 'system',
    staffId,
    body: `Your ${REQUEST_LABELS[request.type].toLowerCase()} request is ${STATUS_LABELS[status]}.`,
    requestId: request.id,
  });
  broadcastMessage(hotelId, message);
  emitOps(hotelId, request.department, 'request:updated', request, request.stay_id);
  return request;
}

// When housekeeping marks a room clean, the guest's open cleaning requests are done too.
export async function completeCleaningRequests(hotelId, roomId) {
  const { rows } = await query(
    `SELECT q.id FROM requests q JOIN stays s ON s.id = q.stay_id
      WHERE q.hotel_id = $1 AND s.room_id = $2 AND s.active AND q.type = 'housekeeping'
        AND q.status IN ('open', 'in_progress')`,
    [hotelId, roomId],
  );
  for (const { id } of rows) await setRequestStatus(hotelId, id, 'done');
}
