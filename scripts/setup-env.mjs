// Creates backend/.env from backend/.env.example (with a fresh random secret)
// if it doesn't exist yet. Run automatically by "npm run setup".
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const target = new URL('../backend/.env', import.meta.url);
const example = new URL('../backend/.env.example', import.meta.url);

if (existsSync(target)) {
  console.log('backend/.env already exists, keeping it.');
} else {
  const secret = randomBytes(48).toString('hex');
  writeFileSync(target, readFileSync(example, 'utf8').replace('change-me-to-a-long-random-string', secret));
  console.log('Created backend/.env with a new random secret.');
}
