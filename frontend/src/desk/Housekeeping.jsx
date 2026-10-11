import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellOff, Flag, User, Play, CheckCircle2, ShieldCheck, Brush, Sunrise, BedDouble } from 'lucide-react';
import { useSocketEvents } from '../lib/useSocket.js';
import { HK_STATUS } from '../lib/requestTypes.js';
import { timeAgo } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';

export default function Housekeeping({ call, socket, role, staffId }) {
  const desk = role === 'admin' || role === 'reception';
  const [rooms, setRooms] = useState(null);
  const [staff, setStaff] = useState([]);
  const [filter, setFilter] = useState('todo');
  const [floor, setFloor] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    call('/api/staff/housekeeping/rooms').then(setRooms).catch(() => setRooms([]));
    if (desk) call('/api/staff/housekeeping/staff').then(setStaff).catch(() => {});
  }, [call, desk]);

  useEffect(() => { load(); }, [load]);
  useSocketEvents(socket, {
    'room:updated': (room) => setRooms((list) => list?.map((r) => (r.id === room.id ? room : r)) ?? list),
    'stay:updated': load,
    connect: load,
  }, [load]);

  const setStatus = async (room, status) => {
    try {
      const updated = await call(`/api/staff/housekeeping/rooms/${room.id}/status`, { method: 'POST', body: { status } });
      setRooms((list) => list.map((r) => (r.id === updated.id ? updated : r)));
      setSelected((s) => (s && s.id === updated.id ? updated : s));
      if (status === 'clean') toast(updated.hk_status === 'inspect' ? `Room ${room.number} sent for inspection` : `Room ${room.number} is ready`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const dailyRound = async () => {
    if (!window.confirm('Mark every occupied room (not on Do-not-disturb) for its daily cleaning?')) return;
    const { marked } = await call('/api/staff/housekeeping/daily', { method: 'POST' });
    toast(`${marked} room${marked === 1 ? '' : 's'} added to today's cleaning`, 'success');
    load();
  };

  const floors = useMemo(() => [...new Set((rooms || []).map((r) => r.floor).filter(Boolean))].sort((a, b) => a - b), [rooms]);
  if (rooms === null) return <div className="page"><div className="chat-empty"><span className="spinner" /></div></div>;

  const count = (s) => rooms.filter((r) => r.hk_status === s).length;

  // ---------- Housekeeper: my rooms ----------
  if (!desk) {
    // My rooms plus rooms nobody has yet (whoever starts cleaning one takes it).
    const mine = rooms.filter((r) => r.hk_status !== 'ready' && (showAll || r.hk_assigned_to === staffId || !r.hk_assigned_to));
    return (
      <div className="page">
        <h1 className="page-title">My rooms</h1>
        <p className="muted">{mine.length ? 'Priority rooms are at the top.' : 'All your rooms are clean. Great work!'}</p>
        <label className="check pad"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show rooms of other housekeepers too</label>
        <div className="hk-list">
          {mine.map((r) => (
            <div key={r.id} className={`hk-card status-border-${HK_STATUS[r.hk_status].tone}`}>
              <div className="hk-card-top">
                <span className="hk-number">{r.number}</span>
                <span className={`status status-${HK_STATUS[r.hk_status].tone}`}>{HK_STATUS[r.hk_status].label}</span>
              </div>
              <div className="hk-flags">
                {r.hk_priority && <span className="flag flag-red"><Flag size={13} /> Priority</span>}
                {r.dnd && <span className="flag"><BellOff size={13} /> Do not disturb</span>}
                <span className="flag"><BedDouble size={13} /> {r.occupied ? 'Guest staying' : 'Empty'}</span>
                {r.hk_assigned_to !== staffId && <span className="flag"><User size={13} /> {r.hk_assigned_name || 'Not assigned yet'}</span>}
              </div>
              {r.hk_note && <p className="hk-note">{r.hk_note}</p>}
              <div className="hk-actions">
                {r.hk_status === 'dirty' && (
                  <button className="btn btn-primary btn-block btn-lg" disabled={r.dnd} onClick={() => setStatus(r, 'cleaning')}>
                    <Play size={18} /> {r.dnd ? 'Guest asked not to disturb' : 'Start cleaning'}
                  </button>
                )}
                {r.hk_status === 'cleaning' && (
                  <button className="btn btn-primary btn-block btn-lg" onClick={() => setStatus(r, 'clean')}><CheckCircle2 size={18} /> Done cleaning</button>
                )}
                {r.hk_status === 'inspect' && <p className="muted small center">Waiting for the front desk to check it.</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Front desk: whole-hotel board ----------
  const visible = rooms.filter((r) => (filter === 'todo' ? r.hk_status !== 'ready' : filter === 'all' || r.hk_status === filter)
    && (!floor || r.floor === floor));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Housekeeping</h1>
          <p className="muted">{count('dirty')} to clean · {count('cleaning')} being cleaned · {count('inspect')} to check · {count('ready')} ready</p>
        </div>
        <button className="btn btn-secondary" onClick={dailyRound}><Sunrise size={16} /> Start daily round</button>
      </div>
      {!staff.length && (
        <p className="alert alert-info">Add housekeepers in <strong>Team</strong> (with their floors) and rooms will be given to them automatically.</p>
      )}
      <div className="chips">
        {[['todo', 'To do'], ['dirty', 'Dirty'], ['cleaning', 'Cleaning'], ['inspect', 'To check'], ['ready', 'Ready'], ['all', 'All']].map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? 'chip-active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      {floors.length > 1 && (
        <div className="chips chips-sub">
          <button className={`chip chip-sm ${!floor ? 'chip-active' : ''}`} onClick={() => setFloor('')}>All floors</button>
          {floors.map((f) => <button key={f} className={`chip chip-sm ${floor === f ? 'chip-active' : ''}`} onClick={() => setFloor(f)}>Floor {f}</button>)}
        </div>
      )}
      {visible.length === 0 && <p className="muted pad">Nothing here. {filter === 'todo' && 'Every room is ready.'}</p>}
      <div className="hk-grid">
        {visible.map((r) => (
          <button key={r.id} className={`hk-tile tone-${HK_STATUS[r.hk_status].tone}`} onClick={() => setSelected(r)}>
            <span className="hk-tile-top">
              <strong>{r.number}</strong>
              <span className="hk-icons">
                {r.hk_priority && <Flag size={14} />}
                {r.dnd && <BellOff size={14} />}
                {r.occupied && <BedDouble size={14} />}
              </span>
            </span>
            <span className="hk-tile-status">{HK_STATUS[r.hk_status].short}</span>
            <span className="hk-tile-who">{r.hk_assigned_name || (r.hk_status === 'ready' ? '' : 'Unassigned')}</span>
          </button>
        ))}
      </div>

      {selected && (
        <RoomSheet room={selected} staff={staff} call={call} onStatus={setStatus} onClose={() => setSelected(null)}
          onChanged={(updated) => { setRooms((list) => list.map((r) => (r.id === updated.id ? updated : r))); setSelected(updated); }} />
      )}
    </div>
  );
}

function RoomSheet({ room, staff, call, onStatus, onClose, onChanged }) {
  const [note, setNote] = useState(room.hk_note);
  const patch = async (body) => {
    try {
      onChanged(await call(`/api/staff/housekeeping/rooms/${room.id}`, { method: 'PATCH', body }));
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const s = HK_STATUS[room.hk_status];

  return (
    <Modal title={`Room ${room.number}`} onClose={onClose}>
      <div className="stack">
        <div className="hk-flags">
          <span className={`status status-${s.tone}`}>{s.label}</span>
          <span className="flag"><BedDouble size={13} /> {room.occupied ? 'Guest staying' : 'Empty'}</span>
          {room.dnd && <span className="flag"><BellOff size={13} /> Do not disturb</span>}
          <span className="muted small">updated {timeAgo(room.hk_updated_at)}</span>
        </div>
        <div className="row-actions">
          {room.hk_status !== 'dirty' && <button className="btn btn-secondary btn-sm" onClick={() => onStatus(room, 'dirty')}><Brush size={14} /> Needs cleaning</button>}
          {room.hk_status === 'dirty' && <button className="btn btn-secondary btn-sm" onClick={() => onStatus(room, 'cleaning')}><Play size={14} /> Cleaning started</button>}
          {room.hk_status !== 'ready' && <button className="btn btn-primary btn-sm" onClick={() => onStatus(room, 'ready')}><ShieldCheck size={14} /> {room.hk_status === 'inspect' ? 'Approve: ready' : 'Mark ready'}</button>}
        </div>
        <Field label="Housekeeper">
          <select className="input" value={room.hk_assigned_to ?? ''} onChange={(e) => patch({ assignedTo: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Nobody yet</option>
            {staff.map((h) => <option key={h.id} value={h.id}>{h.name}{h.floors ? ` (floor ${h.floors})` : ''} · {h.open_rooms} open</option>)}
          </select>
        </Field>
        <label className="check"><input type="checkbox" checked={room.hk_priority} onChange={(e) => patch({ priority: e.target.checked })} /> Priority (clean first)</label>
        <Field label="Note for housekeeping">
          <div className="row-inline">
            <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Extra bed needed" />
            <button className="btn btn-secondary" onClick={() => patch({ note })}>Save</button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
