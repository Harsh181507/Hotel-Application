# Anemos Concierge — Frontend (website)

React website for guests and staff. Talks to `../backend`.
The Android app is a separate native app: see `../android-app`.

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
  App.jsx              page routes (/guest, /desk)
  styles.css           base colours, fonts and layout (theme at the top)
  features.css         autopilot, dining, kitchen, housekeeping, team, settings screens
  lib/                 api calls, login storage, live connection, chat logic, alerts (alerts.js)
  components/          ChatView (messages + text box), Modal, Field, Toaster
  guest/               GuestLogin, Answers, GuestMenu (ordering), GuestChat
  desk/                DeskApp (login + role menus), Inbox, Tasks, KitchenOrders, Housekeeping,
                       Rooms, MenuEditor, FaqEditor, Team, Settings
```

Staff alerts on the website: a chime while the tab is open, and a browser notification when it's in the
background (if the browser allows notifications).

## Testing on your phone (same Wi-Fi)

`npm run dev` prints a `Network:` address like `http://192.168.1.5:5173`. Open that on your phone.
The site automatically uses the backend on the same computer (port 4000).
