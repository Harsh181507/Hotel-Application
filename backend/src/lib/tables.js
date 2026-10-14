// Restaurant table booking for hotel guests. The admin lists the tables (name + seats)
// and the opening hours; guests pick a date, time and number of people and the booking
// is confirmed at once if a big-enough table is free. Each booking holds the smallest
// suitable table for the hotel's booking length (default 90 minutes).
import { query, transaction } from '../db/pool.js';
import { broadcastMessage, saveMessage } from './chat.js';
import { emitOps } from './realtime.js';
import { HttpError, notFound } from './errors.js';
import { checkBookable, formatMoment, hhmmOf, hotelNow, localSql, minutesOf } from './hoteltime.js';

export const SLOT_MINUTES = 30;
const LEAD_MINUTES = 15; // a table can be booked up to 15 minutes before
const MAX_UPCOMING_PER_STAY = 3;
export const TABLE_BOOKING_STATUSES = ['confirmed', 'seated', 'completed', 'cancelled', 'no_show'];
const BLOCKING = ['confirmed', 'seated'];
// Which status changes the restaurant can make.
const NEXT = { confirmed: ['seated', 'cancelled', 'no_show', 'completed'], seated: ['completed', 'confirmed'], no_show: ['confirmed'], cancelled: [], completed: ['seated'] };

// ---------- Tables (front desk) ----------

const toTable = (t) => ({ id: t.id, name: t.name, seats: t.seats, active: t.active });

export async function listTables(hotelId) {
  const { rows } = await query('SELECT id, name, seats, active FROM dining_tables WHERE hotel_id = $1 ORDER BY seats, name', [hotelId]);
  return rows.map(toTable);
}

async function insertTable(db, hotelId, name, seats) {
  try {
    const { rows: [t] } = await db.query(
      'INSERT INTO dining_tables (hotel_id, name, seats) VALUES ($1, $2, $3) RETURNING id, name, seats, active', [hotelId, name, seats],
    );
    return toTable(t);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, `There is already a table called "${name}"`);
    throw err;
  }
}

export const addTable = (hotelId, { name, seats }) => insertTable({ query }, hotelId, name, seats);

export async function updateTable(hotelId, tableId, { name, seats, active }) {
  try {
    const { rows: [t] } = await query(
      `UPDATE dining_tables SET name = COALESCE($3, name), seats = COALESCE($4, seats), active = COALESCE($5, active)
        WHERE id = $1 AND hotel_id = $2 RETURNING id, name, seats, active`,
      [tableId, hotelId, name ?? null, seats ?? null, active ?? null],
    );
    if (!t) throw notFound('Table not found');
    return toTable(t);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, `There is already a table called "${name}"`);
    throw err;
  }
}

export async function deleteTable(hotelId, tableId) {
  const { rows: [busy] } = await query(
    `SELECT 1 FROM table_bookings WHERE table_id = $1 AND status = ANY($2) AND ends_at > now() LIMIT 1`, [tableId, BLOCKING],
  );
  if (busy) throw new HttpError(409, 'This table has upcoming bookings. Switch it off instead, or cancel the bookings first.');
  const { rowCount } = await query('DELETE FROM dining_tables WHERE id = $1 AND hotel_id = $2', [tableId, hotelId]);
  if (!rowCount) throw notFound('Table not found');
}

/** A starting layout for a new restaurant: 4 tables for 2, 4 for 4, 2 for 6. */
export async function addSampleTables(hotelId) {
  return transaction(async (db) => {
    const { rows: [{ count }] } = await db.query('SELECT count(*)::int AS count FROM dining_tables WHERE hotel_id = $1', [hotelId]);
    if (count) throw new HttpError(409, 'You already have tables.');
    const layout = [[2, 4], [4, 4], [6, 2]];
    const made = [];
    let n = 1;
    for (const [seats, how] of layout) {
      for (let i = 0; i < how; i++) made.push(await insertTable(db, hotelId, `T${n++}`, seats));
    }
    return made;
  });
}

// ---------- Time slots ----------

/** The restaurant's bookable start times on a date, as real moments. Closing after midnight works too. */
async function restaurantDay(db, hotelId, date) {
  const { rows: [h] } = await db.query(
    `SELECT timezone, restaurant_open, restaurant_close, table_booking_minutes,
            (($2::date + restaurant_open::time) AT TIME ZONE timezone) AS open_at
       FROM hotels WHERE id = $1`,
    [hotelId, date],
  );
  const open = minutesOf(h.restaurant_open);
  let close = minutesOf(h.restaurant_close);
  if (close <= open) close += 1440;
  const slots = [];
  for (let m = open; m <= close - SLOT_MINUTES; m += SLOT_MINUTES) {
    slots.push({ time: hhmmOf(m), at: new Date(h.open_at.getTime() + (m - open) * 60_000) });
  }
  return { timezone: h.timezone, open: h.restaurant_open, close: h.restaurant_close, minutes: h.table_booking_minutes, slots };
}

const overlaps = (b, start, end) => b.starts_at < end && b.ends_at > start;

/** For guests: each start time that day and whether a table for `people` is free. */
export async function tableSlots(hotelId, date, people) {
  const day = await restaurantDay({ query }, hotelId, date);
  const { rows: tables } = await query(
    'SELECT id, seats FROM dining_tables WHERE hotel_id = $1 AND active ORDER BY seats', [hotelId],
  );
  const fitting = tables.filter((t) => t.seats >= people);
  const first = day.slots[0]?.at;
  const last = day.slots.at(-1)?.at;
  const { rows: bookings } = first ? await query(
    `SELECT table_id, starts_at, ends_at FROM table_bookings
      WHERE hotel_id = $1 AND status = ANY($2) AND starts_at < $4 AND ends_at > $3`,
    [hotelId, BLOCKING, first, new Date(last.getTime() + day.minutes * 60_000)],
  ) : { rows: [] };
  const earliest = Date.now() + LEAD_MINUTES * 60_000;
  return {
    open: day.open,
    close: day.close,
    minutes: day.minutes,
    maxSeats: tables.reduce((max, t) => Math.max(max, t.seats), 0),
    slots: day.slots.map(({ time, at }) => {
      const end = new Date(at.getTime() + day.minutes * 60_000);
      const free = fitting.some((t) => !bookings.some((b) => b.table_id === t.id && overlaps(b, at, end)));
      return { time, available: at.getTime() >= earliest && free };
    }),
  };
}

// ---------- Bookings ----------

const BOOKING_SELECT = `
  SELECT b.id, b.table_id, b.stay_id, b.starts_at, b.ends_at, b.party_size, b.note, b.status, b.created_at,
         t.name AS table_name, t.seats AS table_seats, r.number AS room_number, s.guest_name,
         ${localSql('b.starts_at', 'h.timezone')} AS start_local
    FROM table_bookings b
    LEFT JOIN dining_tables t ON t.id = b.table_id
    JOIN stays s ON s.id = b.stay_id
    JOIN rooms r ON r.id = s.room_id
    JOIN hotels h ON h.id = b.hotel_id`;

const toBooking = (b) => ({
  id: b.id, tableId: b.table_id, tableName: b.table_name, tableSeats: b.table_seats, stayId: b.stay_id,
  roomNumber: b.room_number, guestName: b.guest_name, startsAt: b.starts_at, endsAt: b.ends_at,
  startLocal: b.start_local, partySize: b.party_size, note: b.note, status: b.status, createdAt: b.created_at,
});

async function getBooking(hotelId, bookingId) {
  const { rows: [b] } = await query(`${BOOKING_SELECT} WHERE b.id = $1 AND b.hotel_id = $2`, [bookingId, hotelId]);
  return b ? toBooking(b) : null;
}

/** The restaurant's bookings on a date (hotel time), or all of one guest's bookings. */
export async function listTableBookings(hotelId, { date = null, stayId = null } = {}) {
  const { rows } = await query(
    `${BOOKING_SELECT}
      WHERE b.hotel_id = $1
        AND ($2::int IS NULL OR b.stay_id = $2)
        AND ($3::date IS NULL OR (b.starts_at AT TIME ZONE h.timezone)::date = $3::date)
      ORDER BY ${stayId ? 'b.starts_at DESC' : 'b.starts_at, t.name'}
      LIMIT 300`,
    [hotelId, stayId, date],
  );
  return rows.map(toBooking);
}

async function tellGuest(hotelId, stayId, text) {
  broadcastMessage(hotelId, await saveMessage({ stayId, sender: 'system', body: text }));
}

export async function bookTable({ hotelId, stayId, date, time, people, note = '' }) {
  const day = await restaurantDay({ query }, hotelId, date);
  const slot = day.slots.find((s) => s.time === time);
  if (!slot) throw new HttpError(400, `Please pick a time between ${day.open} and ${day.close}.`);
  checkBookable(slot.at, { leadMinutes: LEAD_MINUTES });
  const end = new Date(slot.at.getTime() + day.minutes * 60_000);

  const bookingId = await transaction(async (db) => {
    // Lock the tables that fit, so two guests can't get the same table at the same time.
    const { rows: tables } = await db.query(
      'SELECT id, name, seats FROM dining_tables WHERE hotel_id = $1 AND active AND seats >= $2 ORDER BY seats, name FOR UPDATE',
      [hotelId, people],
    );
    if (!tables.length) throw new HttpError(409, `We don't have a table for ${people}. Please message the front desk.`);
    const { rows: busy } = await db.query(
      `SELECT DISTINCT table_id FROM table_bookings
        WHERE hotel_id = $1 AND status = ANY($2) AND starts_at < $4 AND ends_at > $3 AND table_id IS NOT NULL`,
      [hotelId, BLOCKING, slot.at, end],
    );
    const taken = new Set(busy.map((b) => b.table_id));
    const table = tables.find((t) => !taken.has(t.id));
    if (!table) throw new HttpError(409, `Sorry, all tables for ${people} are booked at ${time}. Please pick another time.`);

    const { rows: [{ count }] } = await db.query(
      `SELECT count(*)::int AS count FROM table_bookings WHERE stay_id = $1 AND status = 'confirmed' AND ends_at > now()`, [stayId],
    );
    if (count >= MAX_UPCOMING_PER_STAY) throw new HttpError(409, `You already have ${count} upcoming table bookings.`);

    const { rows: [booking] } = await db.query(
      `INSERT INTO table_bookings (hotel_id, table_id, stay_id, starts_at, ends_at, party_size, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [hotelId, table.id, stayId, slot.at, end, people, note],
    );
    return booking.id;
  });

  const booking = await getBooking(hotelId, bookingId);
  await tellGuest(hotelId, stayId,
    `Table booked for ${people} on ${formatMoment(slot.at, day.timezone)} (table ${booking.tableName}). See you at the restaurant!`);
  emitOps(hotelId, 'kitchen', 'table:booked', booking, stayId);
  return booking;
}

/** Guests can cancel their own booking before it starts; the restaurant can change any status. */
export async function setTableBookingStatus(hotelId, bookingId, status, { byGuestStayId = null } = {}) {
  const booking = await getBooking(hotelId, bookingId);
  if (!booking || (byGuestStayId && booking.stayId !== byGuestStayId)) throw notFound('Booking not found');
  if (booking.status === status) return booking;
  if (byGuestStayId) {
    if (status !== 'cancelled' || booking.status !== 'confirmed') throw new HttpError(409, 'This booking can no longer be cancelled here. Please message the front desk.');
  } else if (!NEXT[booking.status]?.includes(status)) {
    throw new HttpError(409, 'That status change is not allowed.');
  }
  if (BLOCKING.includes(status) && !BLOCKING.includes(booking.status)) {
    // Re-opening a booking: make sure its table is still free.
    const { rows: [clash] } = await query(
      `SELECT 1 FROM table_bookings WHERE table_id = $1 AND id <> $2 AND status = ANY($3) AND starts_at < $5 AND ends_at > $4`,
      [booking.tableId, bookingId, BLOCKING, booking.startsAt, booking.endsAt],
    );
    if (clash) throw new HttpError(409, 'That table has been booked by someone else in the meantime.');
  }
  await query('UPDATE table_bookings SET status = $2 WHERE id = $1', [bookingId, status]);
  const updated = await getBooking(hotelId, bookingId);
  if (status === 'cancelled') {
    const { timezone } = await hotelNow({ query }, hotelId);
    await tellGuest(hotelId, booking.stayId, byGuestStayId
      ? `Table booking for ${formatMoment(booking.startsAt, timezone)} cancelled.`
      : `Your table booking for ${formatMoment(booking.startsAt, timezone)} was cancelled by the restaurant. Please message us if you have questions.`);
  }
  emitOps(hotelId, 'kitchen', 'table:updated', updated, booking.stayId);
  return updated;
}
