import rateLimit from 'express-rate-limit';
import { authenticate } from '../lib/tokens.js';
import { HttpError } from '../lib/errors.js';

// Reads "Authorization: Bearer <token>" and puts the caller on req.user.
function requireAuth(type) {
  return async (req, _res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Login required');
    const user = await authenticate(token);
    if (user.type !== type) throw new HttpError(403, 'Not allowed');
    req.user = user;
    next();
  };
}

export const requireGuest = requireAuth('guest');
export const requireStaff = requireAuth('staff');

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'Admins only');
  next();
}

// Per-user limit (not per-IP: all guests on hotel Wi-Fi share one public IP).
// Staff screens refresh after every guest message, so on a busy night they
// make far more requests than any single guest; they get a higher limit.
export const userLimiter = rateLimit({
  windowMs: 60_000,
  limit: (req) => (req.user.type === 'staff' ? 2000 : 120),
  keyGenerator: (req) => `${req.user.type}:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down a little.' },
});

// Failed login attempts per IP. Successful logins are not counted, because
// every guest on the hotel Wi-Fi shares one public IP and a busy check-in
// must never lock real guests out. Guessing is also stopped per room:
// each stay locks itself after 5 wrong codes (see routes/auth.js).
const failedLoginLimiter = (limit) => rateLimit({
  windowMs: 15 * 60_000,
  limit,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' },
});

export const guestLoginLimiter = failedLoginLimiter(200);
export const staffLoginLimiter = failedLoginLimiter(20);
