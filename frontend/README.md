# Anemos Concierge — Frontend

React website for guests and the front desk. Talks to `../backend`.

## Run it

Easiest: in the main project folder (one level up) run `npm run dev`. That starts the
database, backend and this website together. See the main README.

To run only the website (backend already running):

```bash
npm run dev     # website on http://localhost:5173
```

| Address | Who | What |
|---|---|---|
| http://localhost:5173/desk | Front desk | Inbox (chat), Requests, Rooms (check-in, codes, QR), Answers editor |
| http://localhost:5173/guest/?room=… | Guest | Opened from the room QR. Login → **Answers** tab + **Front desk** chat tab |

Get a guest link: front desk → **Rooms** → **QR** on any room.

## Folder layout

```
src/
  App.jsx              page routes (/guest, /desk)
  styles.css           all colors, fonts and layout (theme at the top)
  lib/                 api calls, login storage, live connection, chat logic
  components/          ChatView (messages + text box), Modal, Field, Toaster
  guest/               GuestLogin, Answers, GuestChat
  desk/                DeskApp (login + menu), Inbox, Requests, Rooms, FaqEditor
```

To change the colors, edit the variables at the top of `src/styles.css`.

## Testing on your phone (same Wi-Fi)

`npm run dev` prints a `Network:` address like `http://192.168.1.5:5173`. Open that on your phone.
The site automatically uses the backend on the same computer (port 4000).

## Going live

```bash
npm run build   # creates the "dist" folder
```

Upload `dist` to EdgeOne Pages (or Netlify/Vercel). Before building, create `.env` with
`VITE_API_URL=https://<your-backend-address>`. Configure the host to serve `index.html`
for all paths (SPA fallback) so `/desk` and `/guest/?room=…` open directly.
