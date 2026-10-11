// End-to-end test of the autopilot, department tasks, escalation, in-room
// dining and the housekeeping board. Start the app first (npm run dev), then:
//   npm run test:features
// It creates temporary staff accounts and a test guest, and cleans up after.
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@anemos.local', password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!' };
const RUN = Date.now().toString(36);

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}
async function ok(method, path, opts) {
  const r = await call(method, path, opts);
  assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const nextEvent = (socket, event, match = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { socket.off(event, on); reject(new Error(`timed out waiting for ${event}`)); }, ms);
  function on(d) { if (!match(d)) return; clearTimeout(t); socket.off(event, on); resolve(d); }
  socket.on(event, on);
});
const noEvent = (socket, event, match = () => true, ms = 1500) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { socket.off(event, on); resolve(); }, ms);
  function on(d) { if (!match(d)) return; clearTimeout(t); socket.off(event, on); reject(new Error(`unexpected ${event}: ${JSON.stringify(d).slice(0, 200)}`)); }
  socket.on(event, on);
});
const step = (name) => console.log(`  ok  ${name}`);
const section = (name) => console.log(`\n${name}`);

const admin = (await ok('POST', '/api/auth/staff/login', { body: ADMIN })).token;
const originalSettings = await ok('GET', '/api/staff/settings', { token: admin });
const created = { staff: [], stayId: null, menuSeeded: false };
const sockets = [];

try {
  await ok('PUT', '/api/staff/settings', {
    token: admin, body: { ...originalSettings, autopilot_mode: 'always', escalate_after_minutes: 1, require_inspection: false },
  });

  // ---------- Staff in every role ----------
  section('Staff roles');
  const makeStaff = async (role, floors = '') => {
    const login = `${role}.${RUN}`;
    const user = await ok('POST', '/api/staff/users', { token: admin, body: { name: `Test ${role}`, login, password: 'Test-pass-123', role, floors } });
    created.staff.push(user.id);
    return { ...user, token: (await ok('POST', '/api/auth/staff/login', { body: { email: login, password: 'Test-pass-123' } })).token };
  };
  const hk = await makeStaff('housekeeping', '1');
  const kitchen = await makeStaff('kitchen');
  const maint = await makeStaff('maintenance');
  step('created housekeeping, kitchen and maintenance logins (username, no email)');

  assert.equal((await call('GET', '/api/staff/conversations', { token: hk.token })).status, 403);
  assert.equal((await call('GET', '/api/staff/rooms', { token: kitchen.token })).status, 403);
  assert.equal((await call('GET', '/api/staff/housekeeping/rooms', { token: kitchen.token })).status, 403);
  assert.equal((await call('GET', '/api/staff/dining/orders', { token: hk.token })).status, 403);
  assert.equal((await call('POST', '/api/staff/users', { token: hk.token, body: {} })).status, 403);
  step('department staff cannot see guest chats, rooms, other departments or staff accounts');

  // ---------- Guest ----------
  const rooms = await ok('GET', '/api/staff/rooms', { token: admin });
  const room = rooms.find((r) => !r.stay && /^1\d\d$/.test(r.number));
  assert.ok(room, 'need a free room on floor 1');
  const checkin = await ok('POST', `/api/staff/rooms/${room.id}/checkin`, { token: admin, body: { guestName: 'Feature Test', guestLogin: `ft${RUN}` } });
  created.stayId = checkin.stay.id;
  const qr = new URL(checkin.link).searchParams.get('room');
  const guest = (await ok('POST', '/api/auth/guest/login', { body: { room: qr, guestId: `ft${RUN}`, code: checkin.code } })).token;

  const [deskS, guestS, hkS, kitchenS, maintS] = await Promise.all([admin, guest, hk.token, kitchen.token, maint.token].map(connect));
  sockets.push(deskS, guestS, hkS, kitchenS, maintS);
  const say = (body) => ok('POST', '/api/guest/messages', { token: guest, body: { body } });

  // ---------- 1. Autopilot ----------
  section(`1. Night-desk autopilot (room ${room.number})`);
  let bot = nextEvent(guestS, 'message:new', (m) => m.sender === 'bot');
  await say('wifi ka password kya hai?');
  assert.match((await bot).body, /Password/i);
  step('answers "wifi ka password kya hai?" with the Wi-Fi answer');

  bot = nextEvent(guestS, 'message:new', (m) => m.sender === 'bot');
  let maintTask = nextEvent(maintS, 'request:new');
  const hkQuiet = noEvent(hkS, 'request:new', (q) => q.type === 'maintenance');
  await say('AC kharab hai, please fix');
  assert.match((await bot).body, /maintenance/i);
  const acRequest = await maintTask;
  assert.equal(acRequest.department, 'maintenance');
  assert.equal(acRequest.room_number, room.number);
  await hkQuiet;
  step('"AC kharab hai" becomes a maintenance task: maintenance is alerted, housekeeping is not');

  const maintList = await ok('GET', '/api/staff/requests', { token: maint.token });
  assert.ok(maintList.length && maintList.every((q) => q.department === 'maintenance'));
  const guestUpdate = nextEvent(guestS, 'message:new', (m) => m.sender === 'system' && /in progress/.test(m.body));
  const accepted = await ok('PATCH', `/api/staff/requests/${acRequest.id}`, { token: maint.token, body: { status: 'in_progress' } });
  assert.equal(accepted.assigned_to, maint.id);
  assert.equal(accepted.assigned_name, 'Test maintenance');
  await guestUpdate;
  await ok('PATCH', `/api/staff/requests/${acRequest.id}`, { token: maint.token, body: { status: 'done' } });
  const kitchenCannot = await call('PATCH', `/api/staff/requests/${acRequest.id}`, { token: kitchen.token, body: { status: 'open' } });
  assert.equal(kitchenCannot.status, 404);
  step('maintenance sees only its tasks, accepts (task becomes theirs, guest told) and finishes it');

  bot = nextEvent(guestS, 'message:new', (m) => m.sender === 'bot');
  await say('can I get a discount on my bill');
  assert.match((await bot).body, /front desk team/i);
  await noEvent(guestS, 'message:new', (m) => m.sender === 'bot', 1200).then(() => say('one more unknown question about my invoice'))
    .then(() => noEvent(guestS, 'message:new', (m) => m.sender === 'bot', 1500));
  step('unknown questions get one polite "passed to our team" reply (not repeated)');

  await ok('POST', `/api/staff/stays/${created.stayId}/messages`, { token: admin, body: { body: 'Hi! Reception here.' } });
  const quiet = noEvent(guestS, 'message:new', (m) => m.sender === 'bot', 1500);
  await say('wifi password');
  await quiet;
  step('stays quiet while a receptionist is chatting with the guest');

  // ---------- Escalation ----------
  section('Escalation');
  const towels = await ok('POST', '/api/guest/requests', { token: guest, body: { type: 'amenities', details: '2 towels' } });
  await pool.query("UPDATE requests SET created_at = now() - interval '5 minutes' WHERE id = $1", [towels.id]);
  const late = await nextEvent(deskS, 'request:escalated', (q) => q.id === towels.id, 25_000);
  assert.equal(late.room_number, room.number);
  step(`request not accepted in time is flagged late and the front desk is alerted (${late.department})`);
  await ok('PATCH', `/api/staff/requests/${towels.id}`, { token: hk.token, body: { status: 'done' } });

  // ---------- 2. In-room dining ----------
  section('2. In-room dining');
  let items = await ok('GET', '/api/staff/dining/items', { token: admin });
  if (!items.length) {
    items = await ok('POST', '/api/staff/dining/items/sample', { token: admin });
    created.menuSeeded = true;
  }
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const img = await ok('POST', '/api/staff/dining/images', { token: admin, body: { dataUrl: png } });
  const imgRes = await fetch(API + img.url);
  assert.equal(imgRes.headers.get('content-type'), 'image/png');
  step('menu photo upload is stored and served');

  const menu = await ok('GET', '/api/guest/menu', { token: guest });
  const [a, b] = menu.filter((i) => i.available);
  const kitchenNew = nextEvent(kitchenS, 'order:new');
  const order = await ok('POST', '/api/guest/orders', {
    token: guest, body: { items: [{ id: a.id, quantity: 2 }, { id: b.id, quantity: 1 }, { id: a.id, quantity: 1 }], note: 'Less spicy' },
  });
  assert.equal(order.total_paise, a.price_paise * 3 + b.price_paise);
  assert.equal(order.items.find((i) => i.name === a.name).quantity, 3);
  assert.equal((await kitchenNew).id, order.id);
  step(`guest orders; price comes from the menu (₹${order.total_paise / 100}); kitchen screen alerted`);

  await ok('PATCH', `/api/staff/dining/items/${b.id}`, { token: kitchen.token, body: { available: false } });
  const soldOut = await call('POST', '/api/guest/orders', { token: guest, body: { items: [{ id: b.id, quantity: 1 }] } });
  assert.equal(soldOut.status, 409);
  await ok('PATCH', `/api/staff/dining/items/${b.id}`, { token: kitchen.token, body: { available: true } });
  assert.equal((await call('POST', '/api/staff/dining/items', { token: kitchen.token, body: {} })).status, 403);
  step('kitchen can mark an item sold out (guest can\'t order it) but cannot edit the menu');

  const prep = nextEvent(guestS, 'order:updated', (o) => o.id === order.id && o.status === 'preparing');
  await ok('PATCH', `/api/staff/dining/orders/${order.id}`, { token: kitchen.token, body: { status: 'preparing' } });
  await prep;
  assert.equal((await call('POST', `/api/guest/orders/${order.id}/cancel`, { token: guest })).status, 409);
  await ok('PATCH', `/api/staff/dining/orders/${order.id}`, { token: kitchen.token, body: { status: 'on_the_way' } });
  assert.equal((await call('PATCH', `/api/staff/dining/orders/${order.id}`, { token: kitchen.token, body: { status: 'preparing' } })).status, 409);
  await ok('PATCH', `/api/staff/dining/orders/${order.id}`, { token: kitchen.token, body: { status: 'delivered' } });
  step('preparing -> on the way -> delivered, guest updated live; no cancelling once cooking, no going backwards');

  const second = await ok('POST', '/api/guest/orders', { token: guest, body: { items: [{ id: b.id, quantity: 1 }] } });
  await ok('POST', `/api/guest/orders/${second.id}/cancel`, { token: guest });
  const bill = await ok('GET', `/api/staff/stays/${created.stayId}/bill`, { token: admin });
  assert.equal(bill.total_paise, order.total_paise);
  step(`guest can cancel before cooking starts; running bill excludes cancelled orders (₹${bill.total_paise / 100})`);

  // ---------- 3. Housekeeping ----------
  section('3. Housekeeping board');
  const roomUpdate = nextEvent(hkS, 'room:updated', (r) => r.id === room.id && r.hk_status === 'dirty');
  const clean = await ok('POST', '/api/guest/requests', { token: guest, body: { type: 'housekeeping', details: 'Clean now please' } });
  let hkRoom = await roomUpdate;
  assert.equal(hkRoom.hk_priority, true);
  assert.equal(hkRoom.hk_assigned_to, hk.id);
  step(`"Clean my room" puts room ${room.number} on top of the board, assigned to the floor-1 housekeeper`);

  hkRoom = await ok('POST', `/api/staff/housekeeping/rooms/${room.id}/status`, { token: hk.token, body: { status: 'cleaning' } });
  assert.equal(hkRoom.hk_status, 'cleaning');
  const done = nextEvent(guestS, 'request:updated', (q) => q.id === clean.id && q.status === 'done');
  hkRoom = await ok('POST', `/api/staff/housekeeping/rooms/${room.id}/status`, { token: hk.token, body: { status: 'clean' } });
  assert.equal(hkRoom.hk_status, 'ready');
  await done;
  step('housekeeper: cleaning -> clean; room ready and the guest\'s request completes automatically');

  const dnd = nextEvent(hkS, 'room:updated', (r) => r.id === room.id && r.dnd === true);
  await ok('POST', '/api/guest/room/dnd', { token: guest, body: { on: true } });
  await dnd;
  const daily1 = await ok('POST', '/api/staff/housekeeping/daily', { token: admin });
  assert.equal((await ok('GET', '/api/staff/housekeeping/rooms', { token: admin })).find((r) => r.id === room.id).hk_status, 'ready');
  await ok('POST', '/api/guest/room/dnd', { token: guest, body: { on: false } });
  await ok('POST', '/api/staff/housekeeping/daily', { token: admin });
  assert.equal((await ok('GET', '/api/staff/housekeeping/rooms', { token: admin })).find((r) => r.id === room.id).hk_status, 'dirty');
  step(`do-not-disturb shows on the board and is skipped by the daily round (${daily1.marked} other rooms marked)`);

  await ok('PUT', '/api/staff/settings', { token: admin, body: { ...originalSettings, autopilot_mode: 'always', escalate_after_minutes: 1, require_inspection: true } });
  await ok('POST', `/api/staff/housekeeping/rooms/${room.id}/status`, { token: hk.token, body: { status: 'clean' } });
  assert.equal((await ok('GET', '/api/staff/housekeeping/rooms', { token: admin })).find((r) => r.id === room.id).hk_status, 'inspect');
  await ok('POST', `/api/staff/housekeeping/rooms/${room.id}/status`, { token: admin, body: { status: 'ready' } });
  step('with inspection on: cleaned room waits for a check, front desk approves it');

  const checkoutDirty = nextEvent(hkS, 'room:updated', (r) => r.id === room.id && r.hk_status === 'dirty' && r.hk_priority);
  await ok('POST', `/api/staff/stays/${created.stayId}/checkout`, { token: admin });
  created.stayId = null;
  await checkoutDirty;
  await ok('POST', `/api/staff/housekeeping/rooms/${room.id}/status`, { token: admin, body: { status: 'ready' } });
  step('check-out sends the room to housekeeping automatically');

  console.log('\nAll feature checks passed.');
} finally {
  sockets.forEach((s) => s.close());
  if (created.stayId) await call('POST', `/api/staff/stays/${created.stayId}/checkout`, { token: admin });
  for (const staffId of created.staff) await call('PATCH', `/api/staff/users/${staffId}`, { token: admin, body: { active: false } });
  await call('PUT', '/api/staff/settings', { token: admin, body: originalSettings });
  await pool.query("DELETE FROM images WHERE octet_length(data) < 100");
  await pool.end();
}
