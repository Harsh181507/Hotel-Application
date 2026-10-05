import crypto from 'node:crypto';

// 6-digit guest access code, e.g. "042317". Uses a secure random generator.
export const newAccessCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// Random, unguessable token printed in the room QR link (never changes).
export const newRoomToken = () => crypto.randomBytes(12).toString('base64url');
