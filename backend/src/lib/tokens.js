import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from './errors.js';

export const signStaffToken = (staff) =>
  jwt.sign({ typ: 'staff', sid: staff.id, hid: staff.hotel_id, role: staff.role }, config.jwtSecret, { expiresIn: '12h' });

// The guest token carries the stay's token_version: changing the code or
// checking out bumps the version, which logs the old guest out everywhere.
export const signGuestToken = (stay) =>
  jwt.sign({ typ: 'guest', stay: stay.id, hid: stay.hotel_id, v: stay.token_version }, config.jwtSecret, { expiresIn: '30d' });

// Verifies a token and confirms the account is still valid in the database.
// Returns a "principal" object describing who is calling.
export async function authenticate(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired session');
  }

  if (payload.typ === 'staff') {
    const { rows: [staff] } = await query(
      'SELECT id, hotel_id, name, role FROM staff WHERE id = $1 AND active',
      [payload.sid],
    );
    if (!staff) throw new HttpError(401, 'Account disabled');
    return { type: 'staff', id: staff.id, hotelId: staff.hotel_id, name: staff.name, role: staff.role };
  }

  if (payload.typ === 'guest') {
    const { rows: [stay] } = await query(
      `SELECT s.id, s.hotel_id, s.guest_name, s.token_version, r.number AS room_number
         FROM stays s JOIN rooms r ON r.id = s.room_id
        WHERE s.id = $1 AND s.active`,
      [payload.stay],
    );
    if (!stay || stay.token_version !== payload.v) throw new HttpError(401, 'Your session has ended');
    return { type: 'guest', id: stay.id, stayId: stay.id, hotelId: stay.hotel_id, name: stay.guest_name, roomNumber: stay.room_number };
  }

  throw new HttpError(401, 'Invalid session');
}
