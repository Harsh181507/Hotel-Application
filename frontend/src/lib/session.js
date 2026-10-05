import { useCallback, useState } from 'react';

// Login kept in the browser so a page refresh doesn't log you out.
// localStorage can be blocked (private mode), so every access is guarded.
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

export function useSession(key) {
  const [session, setSession] = useState(() => read(key));
  const [notice, setNotice] = useState('');

  const login = useCallback((value) => {
    write(key, value);
    setNotice('');
    setSession(value);
  }, [key]);

  const logout = useCallback((message = '') => {
    write(key, null);
    setNotice(message);
    setSession(null);
  }, [key]);

  return { session, login, logout, notice };
}

export const storage = { read, write };
