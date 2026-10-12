# Hotel Concierge

Hotel guest app + staff app:

- **Guests** (scan the room QR): local answers (Wi-Fi, nearby places…), in-room dining, live chat with reception.
- **Night-desk autopilot**: answers guests from your Answers list and turns "please send 2 towels" / "AC kharab hai"
  into tasks for the right team, by itself, day and night. Free: no AI service.
- **Departments**: housekeeping, kitchen and maintenance each get only their own tasks, with alerts and
  late warnings (default 10 minutes).
- **In-room dining**: menu with photos, cart, kitchen screen, live order status, running bill.
- **Housekeeping board**: Dirty → Cleaning → Ready, "Do not disturb", automatic assignment by floor.
- **Android app** (native Kotlin) for guests and staff: a built-in QR scanner for guests, and real
  notifications for staff even while the phone is in a pocket.

```
anemos-concierge/
  package.json   <- run everything from here
  backend/       API, database, live chat server   (see backend/README.md)
  frontend/      website for guests and staff      (see frontend/README.md)
  android-app/   Android app in Kotlin             (see android-app/README.md)
  builds/        HotelConcierge.apk, the ready-to-install Android app
```

## First time on a computer

Needs **Node.js 20+** and **Docker Desktop** (open and running).

```bash
npm run setup
```

Installs everything, creates the settings file `backend/.env` (with a new secret key),
starts the database, creates tables and demo data. Takes a few minutes the first time.

## Every day

1. Open **Docker Desktop** and wait until it's running.
2. Open a terminal in this folder and run:
   ```bash
   npm run dev
   ```
   This starts the database, the API (port 4000) and the website (port 5173) together.
3. Open http://localhost:5173/desk and log in (demo: `admin@anemos.local` / `ChangeMe123!`).
4. First steps as admin: **Team** → add housekeepers (with their floors), kitchen and maintenance staff ·
   **Menu** → "Load a sample Indian menu" and edit it · **Settings** → choose when the autopilot replies.

Stop everything: **Ctrl + C** in that window. (The database keeps running in Docker; `npm run db:stop` stops it.)

## Who sees what

| Role | Screens |
|---|---|
| Admin | Everything, plus Team and Settings |
| Front desk | Inbox (chats), Tasks, Orders, Housekeeping, Rooms, Menu, Answers |
| Housekeeping | My rooms (to clean), Tasks (towels, cleaning…) |
| Kitchen | Orders (kitchen screen), Tasks, Menu (sold-out switches only) |
| Maintenance | Tasks (repairs) |

Department staff never see guest chats. Staff can log in with a username (no email needed).

## Android app

`builds/HotelConcierge.apk` is the app for guests **and** staff. Copy it to a phone and open it to install
(allow "install unknown apps" once).

- **Guests** tap *I'm a guest* and scan the room QR with the app's own scanner. (Guests without the app can
  still scan the QR with the phone camera and use the website.)
- **Staff** tap *Hotel staff* and log in. While logged in, a small **"On duty"** notification keeps the app
  connected so new chats, tasks and orders ring the phone even when the app is closed.

It connects to the live server on Render; staff of another hotel tap **Change** on the login screen.
To build it yourself (Android Studio), see **[android-app/README.md](android-app/README.md)**.

## Putting it online

See **[DEPLOY.md](DEPLOY.md)** for step-by-step Render instructions.

## Tests (run while `npm run dev` is running, in a second terminal)

| Command | What it checks |
|---|---|
| `npm test` | Logins, check-in, chat both ways, requests, check-out (11 checks) |
| `npm run test:features` | Autopilot, department tasks and permissions, late alerts, ordering, housekeeping (18 checks) |
| `npm run test:matcher` | The autopilot understands 31 real-style guest messages (English, Hinglish, Hindi, typos) |
| `npm run test:load` | 50 guests chatting at the same time: speed, nothing lost, privacy between guests |

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the website for going live (creates `frontend/dist`) |
| `npm run db` / `npm run db:stop` | Starts / stops only the database |
