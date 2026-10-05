// Creates the hotel, the first admin login, and (only for a brand-new hotel)
// sample rooms 101-110 and sample answers. Safe to run on every start:
// it never overwrites or re-adds anything you changed or deleted.
// Run: npm run db:seed
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { newRoomToken } from '../lib/codes.js';

const isProd = process.env.NODE_ENV === 'production';
const email = (process.env.SEED_ADMIN_EMAIL || 'admin@anemos.local').trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || (isProd ? '' : 'ChangeMe123!');

// The admin password is only needed when there is no admin yet. A new web
// service connected to an existing database (e.g. after renaming the service
// on Render) starts fine without it.
const { rows: [{ admins }] } = await pool.query(`SELECT count(*)::int AS admins FROM staff WHERE role = 'admin' AND active`);
if (admins === 0 && password.length < 8) {
  console.error('SEED_ADMIN_PASSWORD must be set (8+ characters) to create the first admin login.');
  process.exit(1);
}

let { rows: [hotel] } = await pool.query('SELECT id FROM hotels ORDER BY id LIMIT 1');
const newHotel = !hotel;
if (newHotel) {
  ({ rows: [hotel] } = await pool.query(`INSERT INTO hotels (name) VALUES ('Anemos') RETURNING id`));
}

let adminCreated = 0;
if (password.length >= 8) {
  ({ rowCount: adminCreated } = await pool.query(
    `INSERT INTO staff (hotel_id, name, email, password_hash, role)
     VALUES ($1, 'Admin', $2, $3, 'admin') ON CONFLICT (email) DO NOTHING`,
    [hotel.id, email, await bcrypt.hash(password, 10)],
  ));
}

if (newHotel) {
  for (let n = 101; n <= 110; n++) {
    await pool.query(
      'INSERT INTO rooms (hotel_id, number, qr_token) VALUES ($1, $2, $3) ON CONFLICT (hotel_id, number) DO NOTHING',
      [hotel.id, String(n), newRoomToken()],
    );
  }
  const faqs = [
    ['Wi-Fi', 'What is the Wi-Fi password?', 'Network: Anemos-Guest\nPassword: welcome2026'],
    ['Dining', 'What are the breakfast timings?', 'Breakfast is served 7:00 to 10:30 AM in the ground-floor restaurant.'],
    ['Stay', 'What is the check-out time?', 'Check-out is at 11:00 AM. Ask the front desk for a late check-out.'],
    ['Nearby', 'Is there a pharmacy nearby?', 'Apollo Pharmacy, 300 m left of the main gate, open 24 hours.'],
    ['Nearby', 'Places to visit nearby?', 'Rock Garden (2 km), Tagore Hill (3 km), Hundru Falls (40 km).'],
  ];
  for (const [i, [category, question, answer]] of faqs.entries()) {
    await pool.query(
      'INSERT INTO faqs (hotel_id, category, question, answer, sort_order) VALUES ($1,$2,$3,$4,$5)',
      [hotel.id, category, question, answer, i],
    );
  }
}

if (newHotel) console.log('Created hotel with sample rooms 101-110 and sample answers.');
if (adminCreated) {
  console.log(isProd ? `Created admin login: ${email}` : `Created admin login: ${email} / ${password}  (change this password!)`);
} else {
  console.log('Seed done. Existing admin login(s) kept unchanged.');
}
await pool.end();
