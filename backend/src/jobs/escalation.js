// Every 15 seconds: requests nobody has accepted and orders the kitchen hasn't
// started within the hotel's time limit (default 10 minutes) are flagged as
// late and the front desk is alerted. The UPDATE ... RETURNING claims each
// item exactly once, so this is safe with several server instances.
import { query } from '../db/pool.js';
import { emitOps } from '../lib/realtime.js';

const INTERVAL_MS = Number(process.env.ESCALATION_INTERVAL_MS || 15_000);

export async function escalateLateWork() {
  const { rows: requests } = await query(`
    WITH late AS (
      UPDATE requests q SET escalated_at = now()
        FROM hotels h
       WHERE q.hotel_id = h.id AND q.status = 'open' AND q.escalated_at IS NULL
         AND q.created_at < now() - make_interval(mins => h.escalate_after_minutes)
      RETURNING q.id, q.hotel_id, q.stay_id, q.type, q.department, q.details, q.created_at, q.escalated_at
    )
    SELECT late.*, r.number AS room_number FROM late
      JOIN stays s ON s.id = late.stay_id JOIN rooms r ON r.id = s.room_id`);
  for (const r of requests) emitOps(r.hotel_id, r.department, 'request:escalated', r);

  const { rows: orders } = await query(`
    WITH late AS (
      UPDATE orders o SET escalated_at = now()
        FROM hotels h
       WHERE o.hotel_id = h.id AND o.status = 'placed' AND o.escalated_at IS NULL
         AND o.created_at < now() - make_interval(mins => h.escalate_after_minutes)
      RETURNING o.id, o.hotel_id, o.stay_id, o.total_paise, o.created_at, o.escalated_at
    )
    SELECT late.*, r.number AS room_number FROM late
      JOIN stays s ON s.id = late.stay_id JOIN rooms r ON r.id = s.room_id`);
  for (const o of orders) emitOps(o.hotel_id, 'kitchen', 'order:escalated', o);

  return { requests: requests.length, orders: orders.length };
}

export function startEscalationJob() {
  const timer = setInterval(() => {
    escalateLateWork().catch((err) => console.error('[escalation]', err.message));
  }, INTERVAL_MS);
  timer.unref();
  return timer;
}
