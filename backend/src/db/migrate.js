// Creates/updates all database tables.  Run: npm run db:migrate
import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';

const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Database schema is up to date.');
await pool.end();
