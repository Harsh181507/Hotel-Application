import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';

// Turns any thrown error into a JSON response: { error: "message" }.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({ error: `${issue.path.join('.') || 'input'}: ${issue.message}` });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'That already exists' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: 'Something went wrong' });
}
