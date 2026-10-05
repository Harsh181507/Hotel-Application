# Anemos Concierge — Backend

Node.js API + live chat for the hotel guest app.

- **Express** – REST API (`/api/...`)
- **Socket.IO** – pushes new messages/updates to screens instantly
- **PostgreSQL** – stores everything
- **Redis** (optional) – only needed when you run more than one server copy

## Run it on your PC

Easiest: in the main project folder (one level up) run `npm run setup` once, then `npm run dev`.
That starts the database, this API and the website together. See the main README.

To run only the backend, inside this folder (needs Node.js 20+ and Docker Desktop running):

```bash
npm install            # 1. download libraries (once)
docker compose up -d   # 2. start the local database (port 5433)
npm run db:migrate     # 3. create tables
npm run db:seed        # 4. demo hotel, admin login, rooms 101-110, sample FAQs
npm run dev            # 5. start the API on http://localhost:4000 (auto-restarts on edit)
```

Check it: open http://localhost:4000/health → `{"ok":true}`.
Full test (with `npm run dev` running, in a second terminal): `npm run smoke`.

Settings live in `.env` (copy from `.env.example`). Never commit `.env`.

## Folder layout

```
src/
  server.js            starts HTTP + Socket.IO
  app.js               Express setup, mounts the routes
  config.js            reads .env
  db/schema.sql        all tables  (edit, then npm run db:migrate)
  db/seed.js           starter data
  routes/auth.js       staff login, guest login (QR + Guest ID + code)
  routes/guest.js      FAQs, chat, service requests (guest side)
  routes/staff.js      rooms, check-in/out, chat inbox, requests, FAQs, staff users
  socket/index.js      live connection + Redis scaling
  lib/                 helpers (tokens, chat, realtime, codes, request types)
  middleware/          login checks, rate limits, error responses
scripts/smoke-test.js  end-to-end test
```

## How login works

1. **Staff** log in with email + password → token.
2. Staff **check a guest in** to a room → API returns a 6-digit code **once** (only its hash is stored).
3. Each room has a QR link that never changes: `GUEST_APP_URL/guest/?room=<random token>`.
4. **Guest** scans it, types Guest ID + code → token valid until checkout.
5. **New code** or **checkout** logs the guest out on every device instantly.
6. 5 wrong codes in a row lock that room's login for 15 minutes.

Send the token on every request: `Authorization: Bearer <token>`.

## API

| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/api/auth/staff/login` | public | `{ email, password }` |
| GET | `/api/auth/room/:qrToken` | public | room number + hotel name for the login screen |
| POST | `/api/auth/guest/login` | public | `{ room: qrToken, guestId, code }` |
| GET | `/api/guest/me` | guest | |
| GET | `/api/guest/faqs` | guest | full list — load once, search in the browser |
| GET | `/api/guest/messages?before=&limit=` | guest | oldest→newest; `before` = message id for older pages |
| POST | `/api/guest/messages` | guest | `{ body }` |
| POST | `/api/guest/messages/read` | guest | |
| GET | `/api/guest/requests` | guest | |
| POST | `/api/guest/requests` | guest | `{ type: housekeeping\|food\|maintenance\|amenities\|other, details }` |
| GET | `/api/staff/me` | staff | |
| POST | `/api/staff/me/password` | staff | `{ currentPassword, newPassword }` |
| GET | `/api/staff/rooms` | staff | rooms + QR link + current guest |
| POST | `/api/staff/rooms` | admin | `{ number }` |
| DELETE | `/api/staff/rooms/:id` | admin | |
| POST | `/api/staff/rooms/:id/checkin` | staff | `{ guestName, guestLogin }` → `{ code, guestId, link }` |
| PATCH | `/api/staff/stays/:id` | staff | `{ guestName?, guestLogin? }` |
| POST | `/api/staff/stays/:id/new-code` | staff | → `{ code }` |
| POST | `/api/staff/stays/:id/checkout` | staff | |
| GET | `/api/staff/conversations` | staff | inbox: last message + unread count |
| GET | `/api/staff/stays/:id/messages` | staff | same paging as guest |
| POST | `/api/staff/stays/:id/messages` | staff | `{ body }` |
| POST | `/api/staff/stays/:id/read` | staff | |
| GET | `/api/staff/requests?status=open` | staff | |
| PATCH | `/api/staff/requests/:id` | staff | `{ status: open\|in_progress\|done\|cancelled }` (guest gets an auto message) |
| GET/POST | `/api/staff/faqs` | staff | `{ category, question, answer, sortOrder }` |
| PUT/DELETE | `/api/staff/faqs/:id` | staff | |
| GET/POST | `/api/staff/users` | admin | `{ name, email, password, role }` |
| PATCH | `/api/staff/users/:id` | admin | `{ active?, role?, password? }` |

Errors always look like `{ "error": "message" }`.

## Live events (Socket.IO)

Connect: `io(API_URL, { auth: { token } })`. Messages are **sent** with the REST API; the socket only **receives**:

| Event | Who receives | Data |
|---|---|---|
| `message:new` | guest + staff | message row |
| `messages:read` | guest + staff | `{ stayId, by }` |
| `request:new` | staff | request + `room_number` |
| `request:updated` | guest + staff | request |
| `stay:updated` | staff | check-in / edit / checkout |
| `session:ended` | guest | `{ reason: checked_out \| code_changed }` → show login screen |
| `typing` | other side | emit `typing` (guest) or `typing {stayId}` (staff) |

## Going live (production)

EdgeOne Pages is fine for the **frontend**, but this backend needs a host that runs Node.js with WebSockets:
**Render**, **Railway**, **Fly.io**, or any VPS.

1. Create a hosted Postgres (Neon, Supabase, or your host's) → copy its URL into `DATABASE_URL`.
2. On the host set the env vars from `.env.example`: `NODE_ENV=production`, a new random `JWT_SECRET`,
   `CORS_ORIGINS=https://anemos-concierge.edgeone.dev`, `GUEST_APP_URL=https://anemos-concierge.edgeone.dev`.
3. Build command `npm install`, start command `npm start`. Run `npm run db:migrate` and `npm run db:seed` once.
4. Log in and **change the admin password** right away.
5. To handle more traffic: run 2+ instances and set `REDIS_URL` (Upstash / Redis Cloud) so chat reaches everyone.
