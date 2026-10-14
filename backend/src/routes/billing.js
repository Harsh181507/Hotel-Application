// Room bills and payments for the front desk: /api/staff/billing/...
import { Router } from 'express';
import { z } from 'zod';
import { requireRoles, requireStaff, userLimiter } from '../middleware/auth.js';
import {
  addStaffCharge, decidePayment, getBill, listBills, PAYMENT_METHODS, pendingPayments, STAFF_CHARGE_KINDS,
  staffAdvance, staffPayment, voidStaffCharge,
} from '../lib/billing.js';

const router = Router();
router.use(requireStaff, userLimiter, requireRoles('admin', 'reception'));
const id = z.coerce.number().int().positive();
const amount = z.number().int().min(1).max(100_000_000);

// GET /api/staff/billing/bills  -> current guests + guests who left in the last 30 days, with totals
router.get('/bills', async (req, res) => {
  res.json(await listBills(req.user.hotelId));
});

// GET /api/staff/billing/payments/pending  -> UPI payments guests sent that need checking
router.get('/payments/pending', async (req, res) => {
  res.json(await pendingPayments(req.user.hotelId));
});

// GET /api/staff/billing/stays/:id  -> the full bill (also after check-out, for printing)
router.get('/stays/:id', async (req, res) => {
  res.json(await getBill(req.user.hotelId, id.parse(req.params.id)));
});

// POST /api/staff/billing/stays/:id/charges  { kind: restaurant|extra|discount, description, amountPaise }
router.post('/stays/:id/charges', async (req, res) => {
  const c = z.object({
    kind: z.enum(STAFF_CHARGE_KINDS),
    description: z.string().trim().min(1).max(200),
    amountPaise: amount,
  }).parse(req.body);
  const stayId = id.parse(req.params.id);
  await addStaffCharge({ hotelId: req.user.hotelId, stayId, staffId: req.user.id, ...c });
  res.status(201).json(await getBill(req.user.hotelId, stayId));
});

// DELETE /api/staff/billing/charges/:id  -> remove a restaurant bill / extra / discount added by mistake
router.delete('/charges/:id', async (req, res) => {
  await voidStaffCharge(req.user.hotelId, id.parse(req.params.id));
  res.status(204).end();
});

// POST /api/staff/billing/stays/:id/payments  { method, chargeIds?, note?, utr? }
// Money received for the chosen items, or (no chargeIds) for everything due.
router.post('/stays/:id/payments', async (req, res) => {
  const p = z.object({
    method: z.enum(PAYMENT_METHODS),
    chargeIds: z.array(id).max(200).default([]),
    note: z.string().trim().max(200).default(''),
    utr: z.string().trim().max(60).optional(),
  }).parse(req.body);
  const stayId = id.parse(req.params.id);
  await staffPayment({ hotelId: req.user.hotelId, stayId, staffId: req.user.id, ...p });
  res.status(201).json(await getBill(req.user.hotelId, stayId));
});

// POST /api/staff/billing/stays/:id/advance  { amountPaise, note }  -> paid before arriving
router.post('/stays/:id/advance', async (req, res) => {
  const p = z.object({ amountPaise: amount, note: z.string().trim().max(200).default('') }).parse(req.body);
  const stayId = id.parse(req.params.id);
  await staffAdvance({ hotelId: req.user.hotelId, stayId, staffId: req.user.id, ...p });
  res.status(201).json(await getBill(req.user.hotelId, stayId));
});

// POST /api/staff/billing/payments/:id/confirm  -> the money arrived
// POST /api/staff/billing/payments/:id/reject   { note }  -> not received (or undo a payment)
for (const action of ['confirm', 'reject']) {
  router.post(`/payments/:id/${action}`, async (req, res) => {
    const { note } = z.object({ note: z.string().trim().max(200).default('') }).parse(req.body ?? {});
    const payment = await decidePayment({
      hotelId: req.user.hotelId, paymentId: id.parse(req.params.id), staffId: req.user.id, confirm: action === 'confirm', note,
    });
    res.json(await getBill(req.user.hotelId, payment.stay_id));
  });
}

export default router;
