// Many guests at once. Start the app first (npm run dev), then:
//   npm run test:load            (50 guests x 10 messages)
//   GUESTS=200 npm run test:load (more)
// Creates temporary rooms LT-1..LT-n, checks guests in, everyone chats at the
// same time, then verifies delivery + privacy and deletes the temporary rooms.
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const GUESTS = Number(process.env.GUESTS || 50);
const MESSAGES = Number(process.env.MESSAGES || 10);
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@anemos.local', password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!' };

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const waitUntil = async (check, ms = 15000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
};

const { token: staff } = await call('POST', '/api/auth/staff/login', { body: ADMIN });
console.log(`Setting up ${GUESTS} guests...`);

const guests = [];
const rooms = [];

try {
  // Leftovers from an earlier interrupted run
  for (const r of await call('GET', '/api/staff/rooms', { token: staff })) {
    if (!r.number.startsWith('LT-')) continue;
    if (r.stay) await call('POST', `/api/staff/stays/${r.stay.id}/checkout`, { token: staff });
    await call('DELETE', `/api/staff/rooms/${r.id}`, { token: staff });
  }

  // Temporary rooms + check-ins
  for (let i = 1; i <= GUESTS; i++) {
    const room = await call('POST', '/api/staff/rooms', { token: staff, body: { number: `LT-${i}` } });
    rooms.push(room);
    const checkin = await call('POST', `/api/staff/rooms/${room.id}/checkin`, { token: staff, body: { guestName: `Load ${i}`, guestLogin: `load${i}` } });
    guests.push({ i, room, stayId: checkin.stay.id, qr: new URL(checkin.link).searchParams.get('room'), code: checkin.code, received: [] });
  }
  // Everyone logs in at the same moment
  let t = Date.now();
  await Promise.all(guests.map(async (g) => {
    const { token } = await call('POST', '/api/auth/guest/login', { body: { room: g.qr, guestId: `load${g.i}`, code: g.code } });
    g.token = token;
  }));
  console.log(`  ok  ${GUESTS} simultaneous logins in ${Date.now() - t} ms`);

  const staffSocket = await connect(staff);
  const staffGot = new Set();
  staffSocket.on('message:new', (m) => staffGot.add(String(m.id)));
  await Promise.all(guests.map(async (g) => {
    g.socket = await connect(g.token);
    g.socket.on('message:new', (m) => g.received.push(m));
  }));
  console.log(`  ok  ${GUESTS + 1} live connections open`);

  // All guests chat at the same time; each guest sends their messages one
  // after another, like a real phone (one connection per guest, no waiting).
  t = Date.now();
  const sent = (await Promise.all(guests.map(async (g) => {
    const mine = [];
    for (let n = 0; n < MESSAGES; n++) {
      mine.push(await call('POST', '/api/guest/messages', { token: g.token, body: { body: `guest ${g.i} msg ${n}` } }));
    }
    return mine;
  }))).flat();
  const sendMs = Date.now() - t;
  const total = GUESTS * MESSAGES;
  assert.equal(sent.length, total);
  const allArrived = await waitUntil(() => staffGot.size >= total && guests.every((g) => g.received.length >= MESSAGES));
  console.log(`  ok  ${GUESTS} guests chatting at once: ${total} messages in ${sendMs} ms (~${Math.round(total / (sendMs / 1000))}/sec)`);
  assert.ok(allArrived, `front desk got ${staffGot.size}/${total} live`);
  console.log(`  ok  front desk received all ${total} live`);

  // Privacy: each guest only ever saw their own conversation
  for (const g of guests) {
    assert.ok(g.received.every((m) => m.stay_id === g.stayId), `guest ${g.i} received someone else's message!`);
    assert.equal(g.received.length, MESSAGES);
  }
  console.log(`  ok  privacy: no guest received another guest's messages`);

  // Staff replies to everyone at once; each reply reaches only its guest
  await Promise.all(guests.map((g) => call('POST', `/api/staff/stays/${g.stayId}/messages`, { token: staff, body: { body: `reply to ${g.i}` } })));
  const repliesArrived = await waitUntil(() => guests.every((g) => g.received.some((m) => m.body === `reply to ${g.i}`)));
  assert.ok(repliesArrived, 'some replies did not arrive');
  for (const g of guests) assert.ok(!g.received.some((m) => m.sender === 'staff' && m.body !== `reply to ${g.i}`));
  console.log(`  ok  ${GUESTS} front-desk replies each reached only the right guest`);

  // History is complete in the database
  const histories = await Promise.all(guests.map((g) => call('GET', `/api/staff/stays/${g.stayId}/messages?limit=100`, { token: staff })));
  histories.forEach((h) => assert.equal(h.length, MESSAGES + 1));
  console.log('  ok  every message saved (nothing lost)');

  staffSocket.close();
  guests.forEach((g) => g.socket?.close());
} finally {
  // Clean up temporary rooms (also removes their stays and messages)
  for (const g of guests) await call('POST', `/api/staff/stays/${g.stayId}/checkout`, { token: staff }).catch(() => {});
  for (const r of rooms) await call('DELETE', `/api/staff/rooms/${r.id}`, { token: staff }).catch(() => {});
  console.log('  ..  temporary test rooms removed');
}

console.log('\nLoad test passed.');
process.exit(0);
