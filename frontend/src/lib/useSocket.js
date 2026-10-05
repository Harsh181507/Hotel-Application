import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from './api.js';

// Opens one live connection while logged in. Reconnects automatically.
// onAuthFailed runs if the server rejects the login (e.g. after checkout).
export function useSocket(token, onAuthFailed) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    const s = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      setConnected(false);
      if (/session|invalid|disabled|unauthorized/i.test(err.message)) onAuthFailed?.(err.message);
    });
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
    // onAuthFailed is intentionally not a dependency: reconnecting on every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return { socket, connected };
}

// Subscribes to socket events while the component is on screen.
export function useSocketEvents(socket, handlers, deps) {
  useEffect(() => {
    if (!socket) return undefined;
    const entries = Object.entries(handlers);
    entries.forEach(([event, fn]) => socket.on(event, fn));
    return () => entries.forEach(([event, fn]) => socket.off(event, fn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, ...deps]);
}
