// End-to-end check of the whole backend. Start the server first (npm run dev),
// then in a second terminal:  npm run smoke
// It checks in a test guest, chats both ways live, then checks them out.
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@anemos.local', password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!' };

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'] });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const nextEvent = (socket, event) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 3000);
  socket.once(event, (d) => { clearTimeout(t); resolve(d); });
});
const step = (name) => console.log(`  ok  ${name}`);

// --- Staff login
let r = await call('POST', '/api/auth/staff/login', { body: ADMIN });
assert.equal(r.status, 200, JSON.stringify(r.data));
const staffToken = r.data.token;
step('staff login');

r = await call('POST', '/api/auth/staff/login', { body: { ...ADMIN, password: 'wrong' } });
assert.equal(r.status, 401);
step('wrong staff password rejected');

// --- Pick a free room and check a guest in
r = await call('GET', '/api/staff/rooms', { token: staffToken });
const room = r.data.find((x) => !x.stay);
assert.ok(room, 'need a free room');
const roomToken = new URL(room.link).searchParams.get('room');

r = await call('POST', `/api/staff/rooms/${room.id}/checkin`, { token: staffToken, body: { guestName: 'Test Guest', guestLogin: 'Ranchi' } });
assert.equal(r.status, 201, JSON.stringify(r.data));
const { code, stay } = r.data;
assert.match(code, /^\d{6}$/);
step(`check-in room ${room.number} -> code issued once`);

r = await call('POST', `/api/staff/rooms/${room.id}/checkin`, { token: staffToken, body: { guestName: 'X', guestLogin: 'abc' } });
assert.equal(r.status, 409);
step('double check-in blocked');

// --- Guest login via the QR token
r = await call('GET', `/api/auth/room/${roomToken}`);
assert.equal(r.data.roomNumber, room.number);
r = await call('POST', '/api/auth/guest/login', { body: { room: roomToken, guestId: 'ranchi', code: code === '000000' ? '111111' : '000000' } });
assert.equal(r.status, 401);
r = await call('POST', '/api/auth/guest/login', { body: { room: roomToken, guestId: 'ranchi', code } });
assert.equal(r.status, 200, JSON.stringify(r.data));
const guestToken = r.data.token;
step('guest login (wrong code rejected, guest ID case-insensitive)');

// --- FAQs
r = await call('GET', '/api/guest/faqs', { token: guestToken });
assert.ok(r.data.length > 0);
r = await call('GET', '/api/staff/faqs', { token: guestToken });
assert.equal(r.status, 403);
step(`guest sees ${r.data ? 'FAQs' : ''} and cannot use staff API`);

// --- Live chat both ways
const staffSock = await connect(staffToken);
const guestSock = await connect(guestToken);

let waiting = nextEvent(staffSock, 'message:new');
await call('POST', '/api/guest/messages', { token: guestToken, body: { body: 'Hi, can I get extra towels?' } });
assert.equal((await waiting).body, 'Hi, can I get extra towels?');
step('guest -> staff message delivered live');

waiting = nextEvent(guestSock, 'message:new');
await call('POST', `/api/staff/stays/${stay.id}/messages`, { token: staffToken, body: { body: 'Sending them now!' } });
assert.equal((await waiting).sender, 'staff');
step('staff -> guest message delivered live');

r = await call('GET', '/api/staff/conversations', { token: staffToken });
assert.equal(r.data.find((c) => c.stay_id === stay.id).unread, 1);
await call('POST', `/api/staff/stays/${stay.id}/read`, { token: staffToken });
r = await call('GET', '/api/staff/conversations', { token: staffToken });
assert.equal(r.data.find((c) => c.stay_id === stay.id).unread, 0);
step('unread count + mark read');

// --- Service request flow
waiting = nextEvent(staffSock, 'request:new');
r = await call('POST', '/api/guest/requests', { token: guestToken, body: { type: 'housekeeping', details: 'Clean at 3 PM' } });
assert.equal(r.status, 201);
const reqId = (await waiting).id;
waiting = nextEvent(guestSock, 'request:updated');
await call('PATCH', `/api/staff/requests/${reqId}`, { token: staffToken, body: { status: 'done' } });
assert.equal((await waiting).status, 'done');
r = await call('GET', '/api/guest/messages', { token: guestToken });
assert.equal(r.data.at(-1).sender, 'system');
step('room-cleaning request -> marked done -> guest notified');

// --- Checkout ends the guest session
waiting = nextEvent(guestSock, 'session:ended');
await call('POST', `/api/staff/stays/${stay.id}/checkout`, { token: staffToken });
assert.equal((await waiting).reason, 'checked_out');
r = await call('GET', '/api/guest/messages', { token: guestToken });
assert.equal(r.status, 401);
step('checkout logs the guest out instantly');

staffSock.close();
guestSock.close();
console.log('\nAll checks passed.');
