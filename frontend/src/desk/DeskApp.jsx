import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Inbox as InboxIcon, BedDouble, ClipboardList, BookOpen, LogOut, LogIn } from 'lucide-react';
import { api, createClient } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { useSocket, useSocketEvents } from '../lib/useSocket.js';
import Field from '../components/Field.jsx';
import Inbox from './Inbox.jsx';
import Rooms from './Rooms.jsx';
import Requests from './Requests.jsx';
import FaqEditor from './FaqEditor.jsx';

export default function DeskApp() {
  const { session, login, logout, notice } = useSession('anemos.staff');
  if (!session) return <DeskLogin onLogin={login} notice={notice} />;
  return <DeskShell key={session.token} session={session} logout={logout} />;
}

function DeskLogin({ onLogin, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api('/api/auth/staff/login', { method: 'POST', body: { email, password } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand brand-lg">Anemos</div>
        <p className="eyebrow">Front desk</p>
        {notice && <p className="alert alert-info">{notice}</p>}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <p className="alert alert-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? <span className="spinner spinner-light" /> : <><LogIn size={18} /> Log in</>}
        </button>
      </form>
    </div>
  );
}

// Plays a short soft chime (no audio file needed).
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    /* sound not available */
  }
}

function DeskShell({ session, logout }) {
  const expire = useCallback((msg) => logout(msg || 'Please log in again.'), [logout]);
  const call = useMemo(() => createClient(session.token, expire), [session.token, expire]);
  const { socket, connected } = useSocket(session.token, expire);
  const [conversations, setConversations] = useState([]);
  const [openRequests, setOpenRequests] = useState(0);
  const timer = useRef();

  const reload = useCallback(() => {
    call('/api/staff/conversations').then(setConversations).catch(() => {});
    call('/api/staff/requests?status=open').then((r) => setOpenRequests(r.length)).catch(() => {});
  }, [call]);

  // Many events can arrive together; reload at most every 300 ms.
  const scheduleReload = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, 300);
  }, [reload]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useSocketEvents(socket, {
    'message:new': (m) => {
      scheduleReload();
      if (m.sender === 'guest' && document.hidden) chime();
    },
    'messages:read': scheduleReload,
    'stay:updated': scheduleReload,
    'request:new': () => { scheduleReload(); chime(); },
    'request:updated': scheduleReload,
    connect: scheduleReload,
  }, [scheduleReload]);

  const unread = conversations.reduce((n, c) => n + c.unread, 0);
  useEffect(() => {
    document.title = unread ? `(${unread}) Front desk · Anemos` : 'Front desk · Anemos';
  }, [unread]);

  const { staff } = session;
  const nav = [
    { to: 'inbox', label: 'Inbox', Icon: InboxIcon, badge: unread },
    { to: 'requests', label: 'Requests', Icon: ClipboardList, badge: openRequests },
    { to: 'rooms', label: 'Rooms', Icon: BedDouble },
    { to: 'answers', label: 'Answers', Icon: BookOpen },
  ];

  return (
    <div className="desk">
      <aside className="desk-nav">
        <div className="desk-brand">
          <div className="brand">Anemos</div>
          <span className={`presence ${connected ? 'on' : ''}`}>{connected ? 'Live' : 'Reconnecting…'}</span>
        </div>
        <nav>
          {nav.map(({ to, label, Icon, badge }) => (
            <NavLink key={to} to={`/desk/${to}`} className={({ isActive }) => `desk-link ${isActive ? 'active' : ''}`}>
              <Icon size={20} />
              <span>{label}</span>
              {badge > 0 && <b className="badge">{badge}</b>}
            </NavLink>
          ))}
          <button className="desk-link desk-logout" onClick={() => logout('')}>
            <LogOut size={20} /><span>Log out</span>
          </button>
        </nav>
        <div className="desk-user">
          <div>
            <strong>{staff.name}</strong>
            <small>{staff.role === 'admin' ? 'Admin' : 'Reception'}</small>
          </div>
          <button className="icon-btn" onClick={() => logout('')} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
        </div>
      </aside>

      <main className="desk-main">
        <Routes>
          <Route path="inbox" element={<Inbox call={call} socket={socket} conversations={conversations} />} />
          <Route path="requests" element={<Requests call={call} socket={socket} />} />
          <Route path="rooms" element={<Rooms call={call} socket={socket} isAdmin={staff.role === 'admin'} />} />
          <Route path="answers" element={<FaqEditor call={call} />} />
          <Route path="*" element={<Navigate to="/desk/inbox" replace />} />
        </Routes>
      </main>
    </div>
  );
}
