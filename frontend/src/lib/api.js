import { Capacitor } from '@capacitor/core';

// Talks to the backend. Every function returns parsed JSON or throws ApiError.
// Development: the API runs on port 4000 of the same computer.
// Production website: the backend serves this website, so the API is on the same address.
// Android app: the hotel's server address (set when building, changeable on the login screen).
const defaultApi = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : window.location.origin;

const BUILT_IN_API = (import.meta.env.VITE_API_URL || defaultApi).replace(/\/$/, '');
const SERVER_KEY = 'anemos.server';
const appCanChangeServer = Capacitor.isNativePlatform();

export function apiUrl() {
  if (appCanChangeServer) {
    try {
      const saved = localStorage.getItem(SERVER_KEY);
      if (saved) return saved;
    } catch { /* storage unavailable */ }
  }
  return BUILT_IN_API;
}

export const serverIsChangeable = () => appCanChangeServer;

// Checks the address really is an Anemos server before saving it.
export async function changeServer(address) {
  let url = address.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let ok = false;
  try {
    const res = await fetch(`${url}/health`);
    ok = res.ok && (await res.json()).ok === true;
  } catch { /* unreachable */ }
  if (!ok) throw new Error(`No hotel server found at ${url}`);
  localStorage.setItem(SERVER_KEY, url);
  return url;
}

// Address of an uploaded picture (menu photos).
export const imageUrl = (imageId) => (imageId ? `${apiUrl()}/api/images/${imageId}` : null);

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(apiUrl() + path, {
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
