# Hotel Concierge

Hotel guest app: local answers (Wi-Fi, nearby places…) + live chat with reception.

```
anemos-concierge/
  package.json   <- run everything from here
  backend/       API, database, live chat server   (see backend/README.md)
  frontend/      website for guests and front desk (see frontend/README.md)
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
   Logs from both appear in this one window: `[api]` in green, `[web]` in purple.
3. Open http://localhost:5173/desk and log in (demo: `admin@anemos.local` / `ChangeMe123!`).

Stop everything: **Ctrl + C** in that window. (The database keeps running in Docker; `npm run db:stop` stops it.)

## Putting it online

See **[DEPLOY.md](DEPLOY.md)** for step-by-step Render instructions.

## Other commands (run in this folder)

| Command | What it does |
|---|---|
| `npm test` | Full automatic check of the backend (run while `npm run dev` is running, in a second terminal) |
| `npm run test:load` | 50 guests chatting at the same time; checks speed, nothing lost, and privacy between guests |
| `npm run build` | Builds the website for going live (creates `frontend/dist`) |
| `npm run db` | Starts only the database |
| `npm run db:stop` | Stops the database |
