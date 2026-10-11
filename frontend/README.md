# Anemos Concierge — Frontend + Android app

React website for guests and staff, also packaged as the Android staff app (Capacitor).
Talks to `../backend`.

## Run it

Easiest: in the main project folder (one level up) run `npm run dev`. That starts the
database, backend and this website together. See the main README.

To run only the website (backend already running):

```bash
npm run dev     # website on http://localhost:5173
```

| Address | Who | What |
|---|---|---|
| http://localhost:5173/desk | Staff | Screens depend on the role (see main README) |
| http://localhost:5173/guest/?room=… | Guest | Opened from the room QR: **Answers**, **Order** (in-room dining), **Front desk** (chat) |

Get a guest link: front desk → **Rooms** → **QR** on any room.

## Folder layout

```
src/
  App.jsx              page routes (/guest, /desk); the Android app opens /desk
  styles.css           base colours, fonts and layout (theme at the top)
  features.css         autopilot, dining, kitchen, housekeeping, team, settings screens
  lib/                 api calls, login storage, live connection, chat logic, alerts (native.js)
  components/          ChatView (messages + text box), Modal, Field, Toaster
  guest/               GuestLogin, Answers, GuestMenu (ordering), GuestChat
  desk/                DeskApp (login + role menus), Inbox, Tasks, KitchenOrders, Housekeeping,
                       Rooms, MenuEditor, FaqEditor, Team, Settings
android/               the Android project (Capacitor). Our own code:
  app/src/main/java/com/anemos/concierge/staff/OnDutyService.java   keeps the app alive while logged in
  app/src/main/java/com/anemos/concierge/staff/OnDutyPlugin.java    notifications for new work
assets/                app icon and splash screen sources
scripts/build-apk.mjs  one-step Android build
```

## Android app

```bash
npm run android:apk            # ../builds/AnemosStaff.apk  (uses the server in .env.android)
npm run android:apk -- --dev   # ../builds/AnemosStaff-dev.apk (test build for the emulator, talks to this PC)
npm run android:open           # open the project in Android Studio
```

Needs Android Studio (Java 21 + Android SDK). The first build downloads Gradle and takes a few minutes.

- **Server address:** set in `.env.android`. Staff can change it on the login screen (one app for every hotel).
- **Alerts:** new tasks, orders and late warnings show as Android notifications with sound and vibration.
  While logged in, a small "On duty" notification keeps the app running in the background. Without it,
  Android freezes the app within seconds and alerts stop.
- **Never give out the `-dev` APK:** it allows unencrypted connections, for testing only.
- **Play Store:** the APK is a debug build, fine for installing on hotel phones directly. For the Play Store,
  create a release keystore in Android Studio (Build → Generate Signed App Bundle) and keep it safe.

## Testing on your phone (same Wi-Fi)

`npm run dev` prints a `Network:` address like `http://192.168.1.5:5173`. Open that on your phone.
The site automatically uses the backend on the same computer (port 4000).
