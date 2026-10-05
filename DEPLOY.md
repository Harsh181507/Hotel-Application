# Deploying to Render

Render runs **one web service** (API + live chat + website) and **one PostgreSQL database**.
Everything is described in `render.yaml`, so Render sets it all up for you.

## 1. Put the code on GitHub

1. Sign in at https://github.com and click **New repository**.
   - Name: `anemos-concierge`, choose **Private**.
   - Do **not** tick "Add a README" (the project already has one).
2. In a terminal in this folder (`Downloads\anemos-concierge`), run, using **your** GitHub username:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/anemos-concierge.git
   git push -u origin main
   ```
   A browser window asks you to sign in to GitHub the first time. That's normal.

`.env` (your secrets) and `node_modules` are never uploaded; `.gitignore` excludes them.

## 2. Create the app on Render

1. Go to https://dashboard.render.com and sign up / log in **with GitHub**.
2. Click **New → Blueprint**, pick the `anemos-concierge` repository and connect it.
3. Render reads `render.yaml` and shows: web service `anemos-concierge` + database `anemos-db`.
4. It asks for two values:
   - `SEED_ADMIN_EMAIL`: your front-desk login email
   - `SEED_ADMIN_PASSWORD`: a strong password (8+ characters). **Write it down.**
5. Click **Apply**. The first deploy takes about 5 minutes. Watch the **Logs** tab; it's done when you see
   `API ready on http://localhost:10000` and the service shows **Live**.

## 3. Use it

- Your address is shown at the top of the service page, e.g. `https://anemos-concierge.onrender.com`
  (Render adds a few letters if that name is taken).
- Front desk: `https://<your-address>/desk` → log in with the email and password from step 2.
- **Rooms → QR** on each room → **Download QR** → print and place in the room.
- Edit the sample answers (Wi-Fi password etc.) in **Answers**, and add or remove rooms in **Rooms**.

## 4. Updating later

Change code on your PC, test with `npm run dev`, then:

```bash
git add -A
git commit -m "Describe the change"
git push
```

Render rebuilds and redeploys automatically (about 3 minutes). Data in the database is kept.

## Free plan vs. a real hotel

The Blueprint uses Render's **free** plans so you can try it at no cost. They have limits:

| | Free | What to use for a real hotel |
|---|---|---|
| Web service | **Sleeps after 15 minutes** with no visitors; the next visitor waits ~1 minute | `starter` (always on) |
| Database | **Deleted after 30 days**, no backups, 1 GB | `basic-256mb` (kept, backed up) |

To upgrade: change `plan:` in `render.yaml` (`starter` and `basic-256mb`) and push, or change the
instance type in the Render dashboard. Check current prices at https://render.com/pricing.

## Your own domain (do this BEFORE printing QR codes)

The QR codes contain the website address. If you later move to your own domain
(e.g. `concierge.yourhotel.com`), printed QR codes with the old address still point to Render's address.

1. Render → your service → **Settings → Custom Domains** → add your domain and follow the DNS steps.
2. Render → **Environment** → add `GUEST_APP_URL` = `https://concierge.yourhotel.com` → Save (it redeploys).
3. Now download and print the QR codes.

## If something goes wrong

- **Deploy failed**: open the **Logs** tab; the last red lines say why.
  `SEED_ADMIN_PASSWORD must be set` means you need to add it under **Environment**.
- **Forgot the admin password**: add a second admin from another admin account, or ask for help to reset it.
- **Page loads slowly the first time**: free plan waking up (see above).
