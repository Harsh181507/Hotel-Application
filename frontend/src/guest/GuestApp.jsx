import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, MessagesSquare, LogOut, QrCode } from 'lucide-react';
import { createClient } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { useSocket, useSocketEvents } from '../lib/useSocket.js';
import GuestLogin from './GuestLogin.jsx';
import Answers from './Answers.jsx';
import GuestChat from './GuestChat.jsx';

const ENDED = {
  checked_out: 'You have been checked out. Thank you for staying with us!',
  code_changed: 'Your access code was changed by the front desk. Please log in again.',
};

export default function GuestApp() {
  const room = new URLSearchParams(useLocation().search).get('room');
  const { session, login, logout, notice } = useSession(room ? `anemos.guest.${room}` : 'anemos.guest');

  if (!room) {
    return (
      <div className="center-screen">
        <div className="card auth-card">
          <div className="brand brand-lg">Anemos</div>
          <div className="landing-row"><QrCode size={22} /><p>Please scan the QR code placed in your room to open the concierge.</p></div>
        </div>
      </div>
    );
  }

  if (!session) return <GuestLogin room={room} onLogin={login} notice={notice} />;
  return <GuestHome key={session.token} session={session} room={room} logout={logout} />;
}

function GuestHome({ session, room, logout }) {
  const [tab, setTab] = useState('answers');
  const [unread, setUnread] = useState(0);
  const expire = useCallback((msg) => logout(msg || 'Your session has ended. Please log in again.'), [logout]);
  const call = useMemo(() => createClient(session.token, expire), [session.token, expire]);
  const { socket, connected } = useSocket(session.token, expire);

  useSocketEvents(socket, {
    'session:ended': ({ reason }) => logout(ENDED[reason] || 'Your session has ended.'),
    'message:new': (m) => { if (m.sender !== 'guest' && tab !== 'chat') setUnread((n) => n + 1); },
  }, [tab, logout]);

  const openTab = (t) => {
    setTab(t);
    if (t === 'chat') setUnread(0);
  };

  const { guest } = session;

  return (
    <div className="guest-shell">
      <header className="guest-header">
        <div>
          <div className="brand">{guest.hotelName || 'Anemos'}</div>
          <div className="guest-sub">Room {guest.roomNumber} · Welcome, {guest.name.split(' ')[0]}</div>
        </div>
        <button className="icon-btn" onClick={() => logout('')} aria-label="Log out" title="Log out">
          <LogOut size={20} />
        </button>
      </header>

      <main className="guest-main">
        <section hidden={tab !== 'answers'} className="guest-panel">
          <Answers call={call} room={room} active={tab === 'answers'} onAskDesk={() => openTab('chat')} />
        </section>
        <section hidden={tab !== 'chat'} className="guest-panel">
          <GuestChat call={call} socket={socket} connected={connected} active={tab === 'chat'} />
        </section>
      </main>

      <nav className="tabbar">
        <button className={tab === 'answers' ? 'active' : ''} onClick={() => openTab('answers')}>
          <BookOpen size={22} /><span>Answers</span>
        </button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => openTab('chat')}>
          <span className="tab-icon">
            <MessagesSquare size={22} />
            {unread > 0 && <b className="badge">{unread}</b>}
          </span>
          <span>Front desk</span>
        </button>
      </nav>
    </div>
  );
}
