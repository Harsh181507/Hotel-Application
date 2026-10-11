# Hotel Concierge

Hotel guest app + staff app:

- **Guests** (scan the room QR): local answers (Wi-Fi, nearby places…), in-room dining, live chat with reception.
- **Night-desk autopilot**: answers guests from your Answers list and turns "please send 2 towels" / "AC kharab hai"
  into tasks for the right team, by itself, day and night. Free: no AI service.
- **Departments**: housekeeping, kitchen and maintenance each get only their own tasks, with alerts and
  late warnings (default 10 minutes).
- **In-room dining**: menu with photos, cart, kitchen screen, live order status, running bill.
- **Housekeeping board**: Dirty → Cleaning → Ready, "Do not disturb", automatic assignment by floor.
- **Android staff app** with real notifications, even while the phone is in a pocket.

```
anemos-concierge/
  package.json   <- run everything from here
  backend/       API, database, live chat server   (see backend/README.md)
  frontend/      website + Android app             (see frontend/README.md)
  builds/        the Android app file (AnemosStaff.apk) after "npm run android:apk"
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

## Android staff app

```bash
npm run android:apk
```

Creates `builds/AnemosStaff.apk` (needs Android Studio installed: it provides Java and the Android SDK).
Copy the APK to a phone and open it to install (allow "install unknown apps" once).
The app talks to the server in `frontend/.env.android`; staff can change it on the login screen.
While someone is logged in, the app shows a small **"On duty"** notification. That keeps it running in the
background so new tasks and orders alert the phone.

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
