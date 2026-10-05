import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';
import Field from '../components/Field.jsx';

export default function GuestLogin({ room, onLogin, notice }) {
  const [info, setInfo] = useState(null);
  const [roomError, setRoomError] = useState('');
  const [guestId, setGuestId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/auth/room/${encodeURIComponent(room)}`).then(setInfo).catch((e) => setRoomError(e.message));
  }, [room]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api('/api/auth/guest/login', { method: 'POST', body: { room, guestId, code } });
      onLogin(res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="center-screen guest-login">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand brand-lg">{info?.hotelName || 'Anemos'}</div>
        <p className="eyebrow">Boutique living &amp; spa</p>

        {roomError ? (
          <p className="alert alert-error">{roomError}</p>
        ) : (
          <>
            <div className="room-pill">{info ? `Room ${info.roomNumber}` : '…'}</div>
            <h1 className="auth-title">Welcome to your stay</h1>
            <p className="muted">Enter the Guest ID and access code from your welcome card.</p>

            {notice && <p className="alert alert-info">{notice}</p>}

            <Field label="Guest ID">
              <input
                className="input"
                value={guestId}
                onChange={(e) => setGuestId(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                placeholder="e.g. Ranchi"
                required
              />
            </Field>
            <Field label="Access code">
              <input
                className="input input-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                required
              />
            </Field>

            {error && <p className="alert alert-error">{error}</p>}

            <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== 6 || !guestId.trim()}>
              {busy ? <span className="spinner spinner-light" /> : <><KeyRound size={18} /> Enter</>}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
