import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Armchair, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useSocketEvents } from '../lib/useSocket.js';
import { addDays, dayChip, dayLong, TABLE_STATUS, time12 } from '../lib/booking.js';
import { staffAlert } from '../lib/alerts.js';
import { toast } from '../lib/toast.js';

const localToday = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD on this computer

// Buttons for each booking status.
const ACTIONS = {
  confirmed: [['seated', 'Seated'], ['no_show', 'No-show'], ['cancelled', 'Cancel']],
  seated: [['completed', 'Done']],
  no_show: [['confirmed', 'Restore']],
  completed: [],
  cancelled: [],
};

/** The restaurant's table bookings for a day, and (front desk) the list of tables. */
export default function TableBookings({ call, socket, canManage }) {
  const today = localToday();
  const [date, setDate] = useState(today);
  const [bookings, setBookings] = useState(null);

  const load = useCallback(() => {
    call(`/api/staff/tables/bookings?date=${date}`).then(setBookings).catch(() => setBookings([]));
  }, [call, date]);
  useEffect(() => { load(); }, [load]);
  useSocketEvents(socket, { 'table:booked': load, 'table:updated': load, connect: load }, [load]);

  const setStatus = async (b, status) => {
    if (status === 'cancelled' && !window.confirm(`Cancel the booking for ${b.partySize} (Room ${b.roomNumber}) at ${time12(b.startLocal.slice(11))}? The guest will be told.`)) return;
    try {
      await call(`/api/staff/tables/bookings/${b.id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const active = (bookings || []).filter((b) => b.status !== 'cancelled');
  const covers = active.filter((b) => b.status !== 'no_show').reduce((n, b) => n + b.partySize, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Table bookings</h1>
          <p className="muted">{dayLong(date)} · {active.length} booking{active.length === 1 ? '' : 's'} · {covers} guests</p>
        </div>
        <div className="day-nav">
          <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={20} /></button>
          <strong>{dayChip(date, today)}</strong>
          <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={20} /></button>
          {date !== today && <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)}>Today</button>}
        </div>
      </div>

      {bookings === null ? <span className="spinner" /> : !bookings.length ? (
        <div className="empty-card"><Armchair size={22} /><p>No table bookings on this day.</p></div>
      ) : (
        <div className="list-card">
          {bookings.map((b) => (
            <div key={b.id} className={`list-row ${['cancelled', 'completed', 'no_show'].includes(b.status) ? 'dim' : ''}`}>
              <span className="list-row-time">{time12(b.startLocal.slice(11))}</span>
              <div className="list-row-main">
                <strong>{b.partySize} {b.partySize === 1 ? 'person' : 'people'} · Table {b.tableName ?? '?'}</strong>
                <span className="muted small">Room {b.roomNumber} · {b.guestName}</span>
                {b.note && <span className="small">“{b.note}”</span>}
              </div>
              <div className="list-row-side">
                <span className={`status status-${TABLE_STATUS[b.status].tone}`}>{TABLE_STATUS[b.status].label}</span>
                {ACTIONS[b.status].map(([status, label]) => (
                  <button key={status} className={`btn btn-sm ${status === 'seated' || status === 'completed' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatus(b, status)}>{label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && <TablesSetup call={call} />}
    </div>
  );
}

function TablesSetup({ call }) {
  const [tables, setTables] = useState(null);
  const [name, setName] = useState('');
  const [seats, setSeats] = useState(4);

  const load = useCallback(() => call('/api/staff/tables').then(setTables).catch(() => setTables([])), [call]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    try { await fn(); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await call('/api/staff/tables', { method: 'POST', body: { name: name.trim(), seats: Number(seats) } });
      setName('');
    });
  };

  return (
    <>
      <h2 className="section-title">Tables</h2>
      <p className="muted small">Guests are given the smallest free table that fits. Opening hours and how long a booking lasts are in <Link to="/desk/settings">Settings</Link>.</p>
      {tables === null ? <span className="spinner" /> : (
        <>
          {!tables.length && (
            <div className="empty-card">
              <p>No tables yet. Add yours below, or start with 10 sample tables (4 for 2, 4 for 4, 2 for 6) and rename them.</p>
              <button className="btn btn-secondary" onClick={() => run(() => call('/api/staff/tables/sample', { method: 'POST' }))}>Add sample tables</button>
            </div>
          )}
          {tables.length > 0 && (
            <div className="list-card">
              {tables.map((t) => (
                <div key={t.id} className={`list-row ${t.active ? '' : 'dim'}`}>
                  <span className="list-row-time">{t.name}</span>
                  <div className="list-row-main"><strong>{t.seats} seats</strong></div>
                  <div className="list-row-side">
                    <label className="switch" title="Guests can book it">
                      <input type="checkbox" checked={t.active} onChange={(e) => run(() => call(`/api/staff/tables/${t.id}`, { method: 'PATCH', body: { active: e.target.checked } }))} />
                      <span /> {t.active ? 'In use' : 'Off'}
                    </label>
                    <button className="icon-btn" aria-label={`Delete table ${t.name}`} onClick={() => window.confirm(`Delete table ${t.name}?`) && run(() => call(`/api/staff/tables/${t.id}`, { method: 'DELETE' }))}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form className="row-inline" onSubmit={add} style={{ marginTop: 12 }}>
            <input className="input" placeholder="Table name, e.g. T11 or Window 2" value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} />
            <select className="input" value={seats} onChange={(e) => setSeats(e.target.value)} aria-label="Seats">
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((n) => <option key={n} value={n}>{n} seats</option>)}
            </select>
            <button className="btn btn-primary"><Plus size={16} /> Add table</button>
          </form>
        </>
      )}
    </>
  );
}

export const alertTableBooked = (t) => staffAlert(`Table booked · Room ${t.roomNumber}`, `${t.partySize} people, ${dayLong(t.startLocal.slice(0, 10))} ${time12(t.startLocal.slice(11))}`);
