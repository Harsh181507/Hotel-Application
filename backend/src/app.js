// Builds the Express app: security headers, CORS, JSON parsing, routes.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { query } from './db/pool.js';
import authRoutes from './routes/auth.js';
import guestRoutes from './routes/guest.js';
import staffRoutes from './routes/staff.js';
import { errorHandler } from './middleware/errorHandler.js';

// The built website (npm run build in /frontend). When it exists, this server
// also serves the website, so everything runs on one address (used on Render).
const websiteDir = fileURLToPath(new URL('../../frontend/dist', import.meta.url));

export function createApp() {
  const app = express();
  const serveWebsite = existsSync(websiteDir);

  // Behind a hosting proxy (Render, Railway, Nginx...) this makes req.ip the
  // real visitor IP, which the login rate limiter relies on.
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        // Google Fonts (stylesheet + font files) used by the website.
        'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        // QR codes are generated as data: images.
        'img-src': ["'self'", 'data:'],
      },
    },
  }));
  app.use(cors({ origin: config.allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '50kb' }));

  // Used by hosting platforms to check the server is alive.
  app.get('/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/guest', guestRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (serveWebsite) {
    // Files with a hash in their name never change, so browsers may cache them for a year.
    app.use('/assets', express.static(`${websiteDir}/assets`, { immutable: true, maxAge: '1y' }));
    app.use(express.static(websiteDir, { index: false }));
    // Any other page (/desk, /guest/?room=...) is handled by the React app.
    app.get('/{*page}', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(`${websiteDir}/index.html`);
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ name: 'Anemos Concierge API', status: 'running', health: '/health' });
    });
  }

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
