// Bookings are made in the hotel's own time zone (Settings → time zone), whatever the
// guest's phone says. Postgres does the time-zone maths; dates are "YYYY-MM-DD" and
// times "HH:MM" in hotel time.
import { z } from 'zod';
import { HttpError } from './errors.js';

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM, e.g. 19:30');
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
  .refine((d) => new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d, 'not a real date');

export const minutesOf = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
export const hhmmOf = (minutes) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const MAX_DAYS_AHEAD = 60;

/** The hotel's time zone, today's date and the time now, in hotel time. */
export async function hotelNow(db, hotelId) {
  const { rows: [h] } = await db.query(
    `SELECT timezone,
            to_char(now() AT TIME ZONE timezone, 'YYYY-MM-DD') AS today,
            to_char(now() AT TIME ZONE timezone, 'HH24:MI') AS time
       FROM hotels WHERE id = $1`,
    [hotelId],
  );
  return h;
}

/** "2026-10-14" + "19:30" in the hotel's time zone -> the real moment (a Date). */
export async function hotelMoment(db, timezone, date, time) {
  const { rows: [r] } = await db.query('SELECT (($1::date + $2::time) AT TIME ZONE $3) AS at', [date, time, timezone]);
  return r.at;
}

/** Throws a friendly error for times in the past or too far ahead. */
export function checkBookable(at, { leadMinutes = 0 } = {}) {
  if (at.getTime() < Date.now() + leadMinutes * 60_000 - 60_000) throw new HttpError(400, 'Please pick a time in the future.');
  if (at.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) {
    throw new HttpError(400, `Bookings can be made up to ${MAX_DAYS_AHEAD} days ahead.`);
  }
}

/** For guest messages: "Tue, 14 Oct, 7:30 pm". */
export function formatMoment(date, timezone) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

/** "7:30 pm" (adds the date when it's not the same day as `sameDayAs`). */
export function formatTime(date, timezone, sameDayAs = null) {
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
  if (sameDayAs && day(date) !== day(sameDayAs)) return formatMoment(date, timezone);
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(date);
}

/** SQL that turns a timestamptz column into hotel-local "YYYY-MM-DD HH:MM" text. */
export const localSql = (column, tz) => `to_char(${column} AT TIME ZONE ${tz}, 'YYYY-MM-DD HH24:MI')`;
