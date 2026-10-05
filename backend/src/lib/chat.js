import { query } from '../db/pool.js';
import { emitToConversation } from './realtime.js';

const MESSAGE_COLUMNS = 'id, stay_id, sender, staff_id, body, request_id, read_at, created_at';

// Saves a message. Pass `db` to run it inside a transaction.
// Call broadcastMessage() afterwards to push it live.
export async function saveMessage({ stayId, sender, staffId = null, body, requestId = null, db = { query } }) {
  const { rows: [message] } = await db.query(
    `INSERT INTO messages (stay_id, sender, staff_id, body, request_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${MESSAGE_COLUMNS}`,
    [stayId, sender, staffId, body, requestId],
  );
  return message;
}

export function broadcastMessage(hotelId, message) {
  emitToConversation(hotelId, message.stay_id, 'message:new', message);
}

// Cursor pagination: newest first from the DB, returned oldest-first for display.
// Pass ?before=<message id> to load older messages.
export async function listMessages(stayId, { before, limit }) {
  const { rows } = await query(
    `SELECT ${MESSAGE_COLUMNS} FROM messages
      WHERE stay_id = $1 AND ($2::bigint IS NULL OR id < $2)
      ORDER BY id DESC LIMIT $3`,
    [stayId, before ?? null, limit],
  );
  return rows.reverse();
}

// Marks messages from the other side as read and notifies both sides.
export async function markRead({ hotelId, stayId, readerType }) {
  const otherSide = readerType === 'guest' ? ['staff', 'system'] : ['guest'];
  const { rowCount } = await query(
    `UPDATE messages SET read_at = now()
      WHERE stay_id = $1 AND sender = ANY($2) AND read_at IS NULL`,
    [stayId, otherSide],
  );
  if (rowCount) emitToConversation(hotelId, stayId, 'messages:read', { stayId, by: readerType });
  return rowCount;
}
