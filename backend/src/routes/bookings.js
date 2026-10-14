// Restaurant tables and vehicles for staff:
//   /api/staff/tables/...    front desk sets up tables; front desk + kitchen handle bookings
//   /api/staff/vehicles/...  front desk manages the vehicles and their bookings
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRoles, requireStaff, userLimiter } from '../middleware/auth.js';
import {
  addSampleTables, addTable, deleteTable, listTableBookings, listTables, setTableBookingStatus, TABLE_BOOKING_STATUSES, updateTable,
} from '../lib/tables.js';
import {
  archiveVehicle, listVehicleBookings, listVehicles, PRICE_UNITS, saveVehicle, setVehicleBookingStatus,
} from '../lib/vehicles.js';
import { hotelNow, isoDate } from '../lib/hoteltime.js';

const id = z.coerce.number().int().positive();
const desk = requireRoles('admin', 'reception');
const dateQuery = z.object({ date: isoDate.optional() });
const dayOf = async (req) => dateQuery.parse(req.query).date ?? (await hotelNow({ query }, req.user.hotelId)).today;

// ---------- Restaurant tables ----------

export const tablesRouter = Router();
tablesRouter.use(requireStaff, userLimiter, requireRoles('admin', 'reception', 'kitchen'));

// GET /api/staff/tables/bookings?date=2026-10-14  (default: today, hotel time)
tablesRouter.get('/bookings', async (req, res) => {
  res.json(await listTableBookings(req.user.hotelId, { date: await dayOf(req) }));
});

// PATCH /api/staff/tables/bookings/:id  { status: seated|completed|cancelled|no_show|confirmed }
tablesRouter.patch('/bookings/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(TABLE_BOOKING_STATUSES) }).parse(req.body);
  res.json(await setTableBookingStatus(req.user.hotelId, id.parse(req.params.id), status));
});

// GET /api/staff/tables
tablesRouter.get('/', async (req, res) => {
  res.json(await listTables(req.user.hotelId));
});

const tableSchema = z.object({ name: z.string().trim().min(1).max(30), seats: z.number().int().min(1).max(30) });

// POST /api/staff/tables  { name, seats }
tablesRouter.post('/', desk, async (req, res) => {
  res.status(201).json(await addTable(req.user.hotelId, tableSchema.parse(req.body)));
});

// POST /api/staff/tables/sample  -> 10 starter tables (only when there are none)
tablesRouter.post('/sample', desk, async (req, res) => {
  res.status(201).json(await addSampleTables(req.user.hotelId));
});

// PATCH /api/staff/tables/:id  { name?, seats?, active? }
tablesRouter.patch('/:id', desk, async (req, res) => {
  const t = tableSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
  res.json(await updateTable(req.user.hotelId, id.parse(req.params.id), t));
});

// DELETE /api/staff/tables/:id
tablesRouter.delete('/:id', desk, async (req, res) => {
  await deleteTable(req.user.hotelId, id.parse(req.params.id));
  res.status(204).end();
});

// ---------- Vehicles ----------

export const vehiclesRouter = Router();
vehiclesRouter.use(requireStaff, userLimiter, desk);

// GET /api/staff/vehicles/bookings?date=2026-10-14  (default: today, hotel time)
vehiclesRouter.get('/bookings', async (req, res) => {
  res.json(await listVehicleBookings(req.user.hotelId, { date: await dayOf(req) }));
});

// PATCH /api/staff/vehicles/bookings/:id  { status: completed|cancelled }
vehiclesRouter.patch('/bookings/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['completed', 'cancelled']) }).parse(req.body);
  res.json(await setVehicleBookingStatus(req.user.hotelId, id.parse(req.params.id), status));
});

// GET /api/staff/vehicles
vehiclesRouter.get('/', async (req, res) => {
  res.json(await listVehicles(req.user.hotelId));
});

const vehicleSchema = z.object({
  type: z.string().trim().min(1).max(40),
  name: z.string().trim().max(80).default(''),
  plateNumber: z.string().trim().toUpperCase().max(20).default(''),
  seats: z.number().int().min(1).max(60).default(4),
  driverName: z.string().trim().max(80).default(''),
  driverPhone: z.string().trim().regex(/^[0-9+\-\s()]{0,20}$/, 'phone number: digits only').default(''),
  pricePaise: z.number().int().min(0).max(100_000_000),
  priceUnit: z.enum(PRICE_UNITS),
  available: z.boolean().default(true),
  note: z.string().trim().max(200).default(''),
});

// POST /api/staff/vehicles  { type, name, plateNumber, seats, driverName, driverPhone, pricePaise, priceUnit, available, note }
vehiclesRouter.post('/', async (req, res) => {
  res.status(201).json(await saveVehicle(req.user.hotelId, vehicleSchema.parse(req.body)));
});

// PUT /api/staff/vehicles/:id  (same fields)
vehiclesRouter.put('/:id', async (req, res) => {
  res.json(await saveVehicle(req.user.hotelId, vehicleSchema.parse(req.body), id.parse(req.params.id)));
});

// DELETE /api/staff/vehicles/:id  -> removed from the list (kept for old bills)
vehiclesRouter.delete('/:id', async (req, res) => {
  await archiveVehicle(req.user.hotelId, id.parse(req.params.id));
  res.status(204).end();
});
