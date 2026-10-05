// Talks to the backend. Every function returns parsed JSON or throws ApiError.
// Development: the API runs on port 4000 of the same computer.
// Production: the backend serves this website, so the API is on the same address.
const defaultApi = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : window.location.origin;

export const API_URL = (import.meta.env.VITE_API_URL || defaultApi).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong');
  return data;
}

// Returns a call(path, options) function bound to a login token.
// If the server says the login is no longer valid (401), onExpired runs.
export function createClient(token, onExpired) {
  return async (path, options = {}) => {
    try {
      return await api(path, { ...options, token });
    } catch (err) {
      if (err.status === 401) onExpired?.(err.message);
      throw err;
    }
  };
}
