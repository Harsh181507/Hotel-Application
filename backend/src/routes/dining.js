// In-room dining for staff: /api/staff/dining/...
//   items  - the menu (front desk edits it; the kitchen can mark items sold out)
//   images - menu photos (stored in the database; no paid storage)
//   orders - the kitchen screen
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRoles, requireStaff, userLimiter } from '../middleware/auth.js';
import { HttpError, notFound } from '../lib/errors.js';
import { listOrders, ORDER_STATUSES, setOrderStatus } from '../lib/orders.js';

const router = Router();
router.use(requireStaff, userLimiter, requireRoles('admin', 'reception', 'kitchen'));
const desk = requireRoles('admin', 'reception');
const id = z.coerce.number().int().positive();

const ITEM_COLUMNS = 'id, category, name, description, price_paise, image_id, veg, popular, available, sort_order';
const itemSchema = z.object({
  category: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).default(''),
  price_paise: z.number().int().min(0).max(10_000_000),
  image_id: z.number().int().positive().nullable().default(null),
  veg: z.boolean().default(true),
  popular: z.boolean().default(false),
  available: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

async function checkImage(hotelId, imageId) {
  if (!imageId) return;
  const { rows: [img] } = await query('SELECT 1 FROM images WHERE id = $1 AND hotel_id = $2', [imageId, hotelId]);
  if (!img) throw new HttpError(400, 'Photo not found. Please upload it again.');
}

// ---------- Menu ----------

router.get('/items', async (req, res) => {
  const { rows } = await query(`SELECT ${ITEM_COLUMNS} FROM menu_items WHERE hotel_id = $1 ORDER BY sort_order, category, name`, [req.user.hotelId]);
  res.json(rows);
});

router.post('/items', desk, async (req, res) => {
  const i = itemSchema.parse(req.body);
  await checkImage(req.user.hotelId, i.image_id);
  const { rows: [item] } = await query(
    `INSERT INTO menu_items (hotel_id, category, name, description, price_paise, image_id, veg, popular, available, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${ITEM_COLUMNS}`,
    [req.user.hotelId, i.category, i.name, i.description, i.price_paise, i.image_id, i.veg, i.popular, i.available, i.sort_order],
  );
  res.status(201).json(item);
});

router.put('/items/:id', desk, async (req, res) => {
  const i = itemSchema.parse(req.body);
  await checkImage(req.user.hotelId, i.image_id);
  const { rows: [item] } = await query(
    `UPDATE menu_items SET category=$3, name=$4, description=$5, price_paise=$6, image_id=$7, veg=$8, popular=$9,
       available=$10, sort_order=$11 WHERE id = $1 AND hotel_id = $2 RETURNING ${ITEM_COLUMNS}`,
    [id.parse(req.params.id), req.user.hotelId, i.category, i.name, i.description, i.price_paise, i.image_id, i.veg,
      i.popular, i.available, i.sort_order],
  );
  if (!item) throw notFound('Menu item not found');
  res.json(item);
});

// POST /api/staff/dining/items/sample  -> fills an EMPTY menu with typical dishes to edit
const SAMPLE_MENU = [
  ['Beverages', 'Masala Chai', 'Kadak tea with ginger and cardamom', 60, true, true],
  ['Beverages', 'Filter Coffee', 'South Indian style', 80, true, false],
  ['Beverages', 'Fresh Lime Soda', 'Sweet or salted', 90, true, false],
  ['Beverages', 'Mineral Water (1 L)', '', 40, true, false],
  ['Breakfast', 'Aloo Paratha (2 pcs)', 'With curd, pickle and butter', 180, true, true],
  ['Breakfast', 'Poha', 'With peanuts and sev', 120, true, false],
  ['Breakfast', 'Masala Omelette', 'Two eggs, onion, chilli, toast', 150, false, false],
  ['Snacks', 'Veg Club Sandwich', 'Grilled, with fries', 220, true, false],
  ['Snacks', 'French Fries', '', 160, true, false],
  ['Snacks', 'Veg Pakora', 'Mixed vegetable fritters with chutney', 140, true, false],
  ['Main Course', 'Paneer Butter Masala', 'Cottage cheese in creamy tomato gravy', 320, true, true],
  ['Main Course', 'Dal Tadka', 'Yellow lentils tempered with ghee', 220, true, false],
  ['Main Course', 'Veg Biryani', 'With raita', 280, true, false],
  ['Main Course', 'Chicken Biryani', 'With raita', 360, false, true],
  ['Main Course', 'Butter Naan', '', 60, true, false],
  ['Desserts', 'Gulab Jamun (2 pcs)', '', 100, true, false],
];

router.post('/items/sample', desk, async (req, res) => {
  const { rows: [{ count }] } = await query('SELECT count(*)::int AS count FROM menu_items WHERE hotel_id = $1', [req.user.hotelId]);
  if (count > 0) throw new HttpError(409, 'The menu already has items');
  for (const [i, [category, name, description, rupees, veg, popular]] of SAMPLE_MENU.entries()) {
    await query(
      `INSERT INTO menu_items (hotel_id, category, name, description, price_paise, veg, popular, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.hotelId, category, name, description, rupees * 100, veg, popular, i],
    );
  }
  const { rows } = await query(`SELECT ${ITEM_COLUMNS} FROM menu_items WHERE hotel_id = $1 ORDER BY sort_order`, [req.user.hotelId]);
  res.status(201).json(rows);
});

// PATCH /api/staff/dining/items/:id  { available }  (kitchen: "sold out" / "back on")
router.patch('/items/:id', async (req, res) => {
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  const { rows: [item] } = await query(
    `UPDATE menu_items SET available = $3 WHERE id = $1 AND hotel_id = $2 RETURNING ${ITEM_COLUMNS}`,
    [id.parse(req.params.id), req.user.hotelId, available],
  );
  if (!item) throw notFound('Menu item not found');
  res.json(item);
});

router.delete('/items/:id', desk, async (req, res) => {
  const { rowCount } = await query('DELETE FROM menu_items WHERE id = $1 AND hotel_id = $2', [id.parse(req.params.id), req.user.hotelId]);
  if (!rowCount) throw notFound('Menu item not found');
  res.status(204).end();
});

// ---------- Photos ----------

// POST /api/staff/dining/images  { dataUrl: "data:image/jpeg;base64,..." }
// The app shrinks photos before uploading (about 50-150 KB each).
router.post('/images', desk, async (req, res) => {
  const { dataUrl } = z.object({ dataUrl: z.string().max(700_000) }).parse(req.body);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new HttpError(400, 'Please upload a JPG, PNG or WebP picture');
  const data = Buffer.from(match[2], 'base64');
  if (data.length > 500_000) throw new HttpError(413, 'Picture is too large (max 500 KB)');
  const { rows: [img] } = await query(
    'INSERT INTO images (hotel_id, mime, data) VALUES ($1, $2, $3) RETURNING id', [req.user.hotelId, match[1], data],
  );
  res.status(201).json({ id: img.id, url: `/api/images/${img.id}` });
});

// ---------- Orders (kitchen screen) ----------

// GET /api/staff/dining/orders?active=true
router.get('/orders', async (req, res) => {
  const { active } = z.object({ active: z.enum(['true', 'false']).default('true') }).parse(req.query);
  res.json(await listOrders(req.user.hotelId, { active: active === 'true' }));
});

// PATCH /api/staff/dining/orders/:id  { status }
router.patch('/orders/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(ORDER_STATUSES) }).parse(req.body);
  res.json(await setOrderStatus(req.user.hotelId, id.parse(req.params.id), status));
});

export default router;
