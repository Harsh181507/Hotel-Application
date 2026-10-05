import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Plus, UserPlus, KeyRound, QrCode, LogOut, Copy, Download } from 'lucide-react';
import { useSocketEvents } from '../lib/useSocket.js';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';

export default function Rooms({ call, socket, isAdmin }) {
  const [rooms, setRooms] = useState(null);
  const [checkinRoom, setCheckinRoom] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [qrRoom, setQrRoom] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    call('/api/staff/rooms').then(setRooms).catch(() => setRooms([]));
  }, [call]);

  useEffect(() => { load(); }, [load]);
  useSocketEvents(socket, { 'stay:updated': load }, [load]);

  const newCode = async (room) => {
    if (!window.confirm(`Create a new code for room ${room.number}? The guest's phones will be logged out.`)) return;
    try {
      const res = await call(`/api/staff/stays/${room.stay.id}/new-code`, { method: 'POST' });
      setCredentials({ ...res, room });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const checkout = async (room) => {
    if (!window.confirm(`Check out ${room.stay.guestName} from room ${room.number}?`)) return;
    try {
      await call(`/api/staff/stays/${room.stay.id}/checkout`, { method: 'POST' });
      toast(`Room ${room.number} checked out`, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const free = rooms?.filter((r) => !r.stay).length ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Rooms</h1>
          {rooms && <p className="muted">{rooms.length - free} occupied · {free} free</p>}
        </div>
        {isAdmin && <button className="btn btn-secondary" onClick={() => setAdding(true)}><Plus size={16} /> Add room</button>}
      </div>

      {rooms === null && <div className="chat-empty"><span className="spinner" /></div>}

      <div className="room-grid">
        {rooms?.map((room) => (
          <div key={room.id} className={`room-card ${room.stay ? 'occupied' : ''}`}>
            <div className="room-card-top">
              <span className="room-number">{room.number}</span>
              <span className={`status ${room.stay ? 'status-green' : 'status-grey'}`}>{room.stay ? 'Occupied' : 'Free'}</span>
            </div>
            {room.stay ? (
              <div className="room-guest">
                <strong>{room.stay.guestName}</strong>
                <small>Guest ID: {room.stay.guestLogin}</small>
              </div>
            ) : (
              <div className="room-guest muted">No guest</div>
            )}
            <div className="room-actions">
              {room.stay ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => newCode(room)}><KeyRound size={14} /> New code</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => checkout(room)}><LogOut size={14} /> Check out</button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setCheckinRoom(room)}><UserPlus size={14} /> Check in</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setQrRoom(room)}><QrCode size={14} /> QR</button>
            </div>
          </div>
        ))}
      </div>

      {checkinRoom && (
        <CheckinModal
          room={checkinRoom}
          call={call}
          onClose={() => setCheckinRoom(null)}
          onDone={(res) => {
            setCheckinRoom(null);
            setCredentials({ ...res, room: checkinRoom });
            load();
          }}
        />
      )}
      {credentials && (
        <CredentialsModal
          credentials={credentials}
          onShowQr={() => { setQrRoom(credentials.room); setCredentials(null); }}
          onClose={() => setCredentials(null)}
        />
      )}
      {qrRoom && <QrModal room={qrRoom} onClose={() => setQrRoom(null)} />}
      {adding && <AddRoomModal call={call} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function CheckinModal({ room, call, onClose, onDone }) {
  const [guestName, setGuestName] = useState('');
  const [guestLogin, setGuestLogin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // "Om Sharma" in room 101 -> "Om101"
  const suggest = (name) => {
    const first = name.trim().split(/\s+/)[0].replace(/[^A-Za-z0-9-]/g, '');
    return first ? `${first}${room.number}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 32) : '';
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await call(`/api/staff/rooms/${room.id}/checkin`, { method: 'POST', body: { guestName, guestLogin } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Check in · Room ${room.number}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Guest name">
          <input
            className="input"
            value={guestName}
            autoFocus
            required
            placeholder="e.g. Om Sharma"
            onChange={(e) => {
              const name = e.target.value;
              // Keep suggesting a Guest ID until staff types their own.
              if (!guestLogin || guestLogin === suggest(guestName)) setGuestLogin(suggest(name));
              setGuestName(name);
            }}
          />
        </Field>
        <Field label="Guest ID (guest types this + code)" hint="At least 3 letters, digits or dashes">
          <input
            className="input"
            value={guestLogin}
            required
            pattern="[A-Za-z0-9\-]{3,32}"
            placeholder={`e.g. Om${room.number}`}
            onChange={(e) => setGuestLogin(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))}
          />
        </Field>
        {error && <p className="alert alert-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? <span className="spinner spinner-light" /> : 'Check in & create code'}
        </button>
      </form>
    </Modal>
  );
}

function CredentialsModal({ credentials, onShowQr, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="credentials">
        <h2>Give these to the guest</h2>
        <p className="muted">Write them on the welcome card now. The code is stored hashed and cannot be shown again.</p>
        <Field label="Guest ID"><div className="input input-readonly">{credentials.guestId}</div></Field>
        <Field label="Access code"><div className="input input-readonly input-code">{credentials.code}</div></Field>
        <p className="muted">Room {credentials.room.number} · they scan the room QR, then enter these two.</p>
      </div>
      <div className="row">
        <button className="btn btn-secondary" onClick={onShowQr}><QrCode size={16} /> QR &amp; link</button>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function QrModal({ room, onClose }) {
  const [image, setImage] = useState('');

  useEffect(() => {
    QRCode.toDataURL(room.link, { width: 640, margin: 1, color: { dark: '#1f1a16', light: '#ffffff' } })
      .then(setImage)
      .catch(() => toast('Could not create the QR image', 'error'));
  }, [room.link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.link);
      toast('Link copied');
    } catch {
      toast('Could not copy');
    }
  };

  return (
    <Modal title={`Room ${room.number} · in-room QR`} onClose={onClose}>
      <div className="qr-box">{image ? <img src={image} alt={`QR code for room ${room.number}`} /> : <span className="spinner" />}</div>
      <Field label="In-room link (stable — never changes)">
        <input className="input input-readonly" readOnly value={room.link} onFocus={(e) => e.target.select()} />
      </Field>
      <div className="row">
        <button className="btn btn-secondary" onClick={copy}><Copy size={16} /> Copy link</button>
        <a className="btn btn-secondary" href={image} download={`room-${room.number}-qr.png`}><Download size={16} /> Download QR</a>
      </div>
      <p className="muted small">
        Print this and place it in the room. The guest scans it, enters their access code, and they're in.
        It stays the same even if you change the guest's name or code later.
      </p>
      <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
    </Modal>
  );
}

function AddRoomModal({ call, onClose, onDone }) {
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await call('/api/staff/rooms', { method: 'POST', body: { number } });
      toast(`Room ${number} added`, 'success');
      onDone();
    } catch (err) {
      setError(err.status === 409 ? 'That room number already exists' : err.message);
    }
  };

  return (
    <Modal title="Add a room" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Room number">
          <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} autoFocus required maxLength={20} />
        </Field>
        {error && <p className="alert alert-error">{error}</p>}
        <button className="btn btn-primary btn-block">Add room</button>
      </form>
    </Modal>
  );
}
