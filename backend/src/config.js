// Reads settings from environment variables (.env) in one place.
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const list = (value) => (value || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

// Render sets RENDER_EXTERNAL_URL automatically (e.g. https://anemos.onrender.com).
const publicUrl = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

export const config = {
  port: Number(process.env.PORT || 4000),
  isProd: process.env.NODE_ENV === 'production',
  databaseUrl: required('DATABASE_URL'),
  // Set DATABASE_SSL=true when connecting to a hosted database from outside
  // its network (Render's internal connection string doesn't need it).
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: required('JWT_SECRET'),
  // The Android app (Capacitor) runs its screens from https://localhost.
  // Logins use tokens (not cookies), so allowing the app's origin is safe.
  corsOrigins: [
    ...list(process.env.CORS_ORIGINS),
    ...(publicUrl ? [publicUrl] : []),
    ...list(process.env.APP_ORIGINS ?? 'https://localhost,capacitor://localhost'),
  ],
  // Which websites may call the API. In development any address is allowed
  // (so a phone on the same Wi-Fi works); in production only CORS_ORIGINS,
  // the site's own address and the Android app.
  get allowedOrigins() {
    return this.isProd ? this.corsOrigins : true;
  },
  // Base of the room QR links. On Render the website and API share one address.
  guestAppUrl: (process.env.GUEST_APP_URL || publicUrl || 'http://localhost:5173').replace(/\/$/, ''),
  redisUrl: process.env.REDIS_URL || '',
};

if (config.isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
