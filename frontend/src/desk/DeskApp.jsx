import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  Inbox as InboxIcon, BedDouble, ClipboardList, BookOpen, LogOut, LogIn, ChefHat, Sparkles, UtensilsCrossed,
  Users, Settings as SettingsIcon, BellRing, Receipt, Armchair, Car,
} from 'lucide-react';
import { api, createClient } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { useSocket, useSocketEvents } from '../lib/useSocket.js';
import { alertsBlocked, enableAlerts, staffAlert } from '../lib/alerts.js';
import { DEPARTMENTS, isDeskRole, requestType, ROLES } from '../lib/requestTypes.js';
import Field from '../components/Field.jsx';
import Inbox from './Inbox.jsx';
import Rooms from './Rooms.jsx';
import Tasks from './Tasks.jsx';
import FaqEditor from './FaqEditor.jsx';
import KitchenOrders from './KitchenOrders.jsx';
import MenuEditor from './MenuEditor.jsx';
import Housekeeping from './Housekeeping.jsx';
import Team from './Team.jsx';
import Settings from './Settings.jsx';
import Bills from './Bills.jsx';
import TableBookings, { alertTableBooked } from './TableBookings.jsx';
import Vehicles from './Vehicles.jsx';
import { rupees } from '../lib/money.js';
import { rangeLabel } from '../lib/booking.js';

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
        <p className="eyebrow">Staff login</p>
        {notice && <p className="alert alert-info">{notice}</p>}
        <Field label="Email or username">
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
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

// Which screens each role gets, in menu order. The first one is their home.
const PAGES = {
  inbox: { label: 'Inbox', Icon: InboxIcon, roles: ['admin', 'reception'] },
  tasks: { label: 'Tasks', Icon: ClipboardList, roles: ['admin', 'reception', 'housekeeping', 'kitchen', 'maintenance'] },
  orders: { label: 'Orders', Icon: ChefHat, roles: ['admin', 'reception', 'kitchen'] },
  housekeeping: { label: 'Housekeeping', Icon: Sparkles, roles: ['admin', 'reception', 'housekeeping'] },
  rooms: { label: 'Rooms', Icon: BedDouble, roles: ['admin', 'reception'] },
  bills: { label: 'Bills', Icon: Receipt, roles: ['admin', 'reception'] },
  tables: { label: 'Tables', Icon: Armchair, roles: ['admin', 'reception', 'kitchen'] },
  vehicles: { label: 'Vehicles', Icon: Car, roles: ['admin', 'reception'] },
  menu: { label: 'Menu', Icon: UtensilsCrossed, roles: ['admin', 'reception', 'kitchen'] },
  answers: { label: 'Answers', Icon: BookOpen, roles: ['admin', 'reception'] },
  team: { label: 'Team', Icon: Users, roles: ['admin'] },
  settings: { label: 'Settings', Icon: SettingsIcon, roles: ['admin'] },
};
const HOME = { admin: 'inbox', reception: 'inbox', housekeeping: 'housekeeping', kitchen: 'orders', maintenance: 'tasks' };
const ORDER_FOR_ROLE = { housekeeping: ['housekeeping', 'tasks'], kitchen: ['orders', 'tasks', 'tables', 'menu'] };

function DeskShell({ session, logout }) {
  const { staff } = session;
  const role = staff.role;
  const desk = isDeskRole(role);
  const expire = useCallback((msg) => logout(msg || 'Please log in again.'), [logout]);
  const call = useMemo(() => createClient(session.token, expire), [session.token, expire]);
  const { socket, connected } = useSocket(session.token, expire);
  const [conversations, setConversations] = useState([]);
  const [counts, setCounts] = useState({ tasks: 0, orders: 0, rooms: 0, payments: 0 });
  const [alertsOn, setAlertsOn] = useState(!alertsBlocked());
  const timer = useRef();
  const pendingChatAlerts = useRef(new Map());
  const can = (page) => PAGES[page].roles.includes(role);

  const reload = useCallback(() => {
    if (desk) call('/api/staff/conversations').then(setConversations).catch(() => {});
    if (desk) call('/api/staff/billing/payments/pending').then((p) => setCounts((c) => ({ ...c, payments: p.length }))).catch(() => {});
    call('/api/staff/requests?status=open').then((r) => setCounts((c) => ({ ...c, tasks: r.length }))).catch(() => {});
    if (can('orders')) {
      call('/api/staff/dining/orders').then((o) => setCounts((c) => ({ ...c, orders: o.filter((x) => x.status === 'placed').length }))).catch(() => {});
    }
    if (can('housekeeping')) {
      call('/api/staff/housekeeping/rooms').then((rooms) => setCounts((c) => ({
        ...c,
        rooms: rooms.filter((r) => r.hk_status === 'dirty' && (desk || r.hk_assigned_to === staff.id)).length,
      }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, desk, role, staff.id]);

  // Many events can arrive together; reload at most every 300 ms.
  const scheduleReload = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, 300);
  }, [reload]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Ask for notification permission once after logging in.
  useEffect(() => {
    let active = true;
    enableAlerts().then((ok) => { if (active) setAlertsOn(ok); });
    return () => { active = false; };
  }, []);

  useSocketEvents(socket, {
    'message:new': (m) => {
      scheduleReload();
      // Requests have their own alert (request:new), so their chat copy stays quiet.
      // Other guest messages wait 2 s: if the autopilot answers, nobody is disturbed.
      if (m.sender === 'guest' && desk && !m.request_id) {
        clearTimeout(pendingChatAlerts.current.get(m.stay_id));
        pendingChatAlerts.current.set(m.stay_id, setTimeout(() => {
          pendingChatAlerts.current.delete(m.stay_id);
          staffAlert('New guest message', m.body.slice(0, 120));
        }, 2000));
      }
    },
    'autopilot:handled': ({ stayId, action }) => {
      // answered / turned into a task (which alerts on its own) / small talk
      if (['answer', 'request', 'menu', 'greeting', 'thanks'].includes(action)) {
        clearTimeout(pendingChatAlerts.current.get(stayId));
        pendingChatAlerts.current.delete(stayId);
      }
    },
    'messages:read': scheduleReload,
    'stay:updated': scheduleReload,
    'request:new': (q) => {
      scheduleReload();
      staffAlert(`${requestType(q.type).label} · Room ${q.room_number}`, q.details || `New ${DEPARTMENTS[q.department]} task`);
    },
    'request:updated': scheduleReload,
    'request:escalated': (q) => {
      scheduleReload();
      staffAlert(`Late: Room ${q.room_number}`, `${requestType(q.type).label} not accepted yet`);
    },
    'order:new': (o) => {
      scheduleReload();
      staffAlert(`New order · Room ${o.room_number}`, o.items.map((i) => `${i.quantity}× ${i.name}`).join(', '));
    },
    'order:updated': scheduleReload,
    'order:escalated': (o) => {
      scheduleReload();
      staffAlert(`Late order · Room ${o.room_number}`, `Order #${o.id} not started yet`);
    },
    'payment:submitted': (p) => {
      scheduleReload();
      if (desk) staffAlert(`UPI payment · Room ${p.roomNumber}`, `${rupees(p.amountPaise)}, ref ${p.utr}. Please check and confirm in Bills.`);
    },
    'bill:updated': scheduleReload,
    'table:booked': (t) => { if (can('tables')) alertTableBooked(t); },
    'vehicle:booked': (v) => {
      if (desk) staffAlert(`Vehicle booked · Room ${v.roomNumber}`, `${v.vehicle.name || v.vehicle.type}, ${rangeLabel(v.startLocal, v.endLocal)}`);
    },
    'room:updated': (r) => {
      scheduleReload();
      if (role === 'housekeeping' && r.hk_assigned_to === staff.id && r.hk_status === 'dirty' && r.hk_priority) {
        staffAlert(`Clean room ${r.number}`, r.hk_note || 'Priority cleaning');
      }
    },
    connect: scheduleReload,
  }, [scheduleReload, desk, role, staff.id]);

  const unread = conversations.reduce((n, c) => n + c.unread, 0);
  useEffect(() => {
    const total = unread + counts.tasks + counts.orders + counts.payments;
    document.title = total ? `(${total}) Staff · Anemos` : 'Staff · Anemos';
  }, [unread, counts]);

  const badge = { inbox: unread, tasks: counts.tasks, orders: counts.orders, housekeeping: counts.rooms, bills: counts.payments };
  const pageOrder = ORDER_FOR_ROLE[role] ?? Object.keys(PAGES);
  const nav = pageOrder.filter(can).map((key) => ({ key, ...PAGES[key], badge: badge[key] }));
  const home = HOME[role] ?? 'tasks';

  return (
    <div className="desk">
      <aside className="desk-nav">
        <div className="desk-brand">
          <div className="brand">Anemos</div>
          <span className={`presence ${connected ? 'on' : ''}`}>{connected ? 'Live' : 'Reconnecting…'}</span>
        </div>
        <nav>
          {nav.map(({ key, label, Icon, badge: n }) => (
            <NavLink key={key} to={`/desk/${key}`} className={({ isActive }) => `desk-link ${isActive ? 'active' : ''}`}>
              <Icon size={20} />
              <span>{label}</span>
              {n > 0 && <b className="badge">{n}</b>}
            </NavLink>
          ))}
          <button className="desk-link desk-logout" onClick={() => logout('')}>
            <LogOut size={20} /><span>Log out</span>
          </button>
        </nav>
        {!alertsOn && (
          <button className="alerts-off" onClick={() => enableAlerts().then(setAlertsOn)}>
            <BellRing size={16} /> Turn on alerts
          </button>
        )}
        <div className="desk-user">
          <div>
            <strong>{staff.name}</strong>
            <small>{ROLES[role] ?? role}</small>
          </div>
          <button className="icon-btn" onClick={() => logout('')} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
        </div>
      </aside>

      <main className="desk-main">
        <Routes>
          {can('inbox') && <Route path="inbox" element={<Inbox call={call} socket={socket} conversations={conversations} />} />}
          <Route path="tasks" element={<Tasks call={call} socket={socket} role={role} staffId={staff.id} />} />
          {can('orders') && <Route path="orders" element={<KitchenOrders call={call} socket={socket} role={role} />} />}
          {can('housekeeping') && <Route path="housekeeping" element={<Housekeeping call={call} socket={socket} role={role} staffId={staff.id} />} />}
          {can('rooms') && <Route path="rooms" element={<Rooms call={call} socket={socket} isAdmin={role === 'admin'} />} />}
          {can('bills') && <Route path="bills/*" element={<Bills call={call} socket={socket} />} />}
          {can('tables') && <Route path="tables" element={<TableBookings call={call} socket={socket} canManage={desk} />} />}
          {can('vehicles') && <Route path="vehicles" element={<Vehicles call={call} socket={socket} />} />}
          {can('menu') && <Route path="menu" element={<MenuEditor call={call} role={role} />} />}
          {can('answers') && <Route path="answers" element={<FaqEditor call={call} />} />}
          {can('team') && <Route path="team" element={<Team call={call} staffId={staff.id} />} />}
          {can('settings') && <Route path="settings" element={<Settings call={call} />} />}
          <Route path="*" element={<Navigate to={`/desk/${home}`} replace />} />
        </Routes>
      </main>
    </div>
  );
}
