import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw, Hand, AlarmClock, UserRound } from 'lucide-react';
import { useSocketEvents } from '../lib/useSocket.js';
import { DEPARTMENTS, isDeskRole, requestType, STATUS } from '../lib/requestTypes.js';
import { timeAgo } from '../lib/format.js';
import { toast } from '../lib/toast.js';

const FILTERS = [
  { key: 'open', label: 'New' },
  { key: 'in_progress', label: 'Accepted' },
  { key: 'done', label: 'Done' },
  { key: '', label: 'All' },
];

// Guest requests routed to departments. Department staff only ever get
// their own department's tasks (the server enforces it).
export default function Tasks({ call, socket, role, staffId }) {
  const desk = isDeskRole(role);
  const [filter, setFilter] = useState('open');
  const [dept, setDept] = useState('');
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    if (desk && dept) params.set('department', dept);
    call(`/api/staff/requests?${params}`).then(setItems).catch(() => setItems([]));
  }, [call, filter, dept, desk]);

  useEffect(() => { load(); }, [load]);
  useSocketEvents(socket, {
    'request:new': load, 'request:updated': load, 'request:escalated': load, connect: load,
  }, [load]);

  const setStatus = async (r, status, verb) => {
    try {
      await call(`/api/staff/requests/${r.id}`, { method: 'PATCH', body: { status } });
      toast(`Room ${r.room_number}: ${verb}`, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">{desk ? 'Tasks' : `${DEPARTMENTS[role]} tasks`}</h1>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'chip-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      {desk && (
        <div className="chips chips-sub">
          {[['', 'All departments'], ...Object.entries(DEPARTMENTS)].map(([key, label]) => (
            <button key={key} className={`chip chip-sm ${dept === key ? 'chip-active' : ''}`} onClick={() => setDept(key)}>{label}</button>
          ))}
        </div>
      )}

      {items === null && <div className="chat-empty"><span className="spinner" /></div>}
      {items?.length === 0 && <p className="muted pad">{filter === 'open' ? 'All caught up. No new tasks.' : 'Nothing here.'}</p>}

      <div className="request-grid">
        {items?.map((r) => {
          const t = requestType(r.type);
          const late = r.escalated_at && r.status === 'open';
          const mine = r.assigned_to === staffId;
          return (
            <div key={r.id} className={`request-card ${late ? 'late' : ''}`}>
              <div className="request-top">
                <div className="request-type"><t.Icon size={18} /> {t.label}</div>
                {late ? <span className="status status-red"><AlarmClock size={12} /> Late</span>
                  : <span className={`status status-${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>}
              </div>
              <div className="request-room">Room {r.room_number}</div>
              <div className="request-who">
                {r.guest_name} · {timeAgo(r.created_at)}{desk && ` · ${DEPARTMENTS[r.department]}`}
              </div>
              {r.details && <p className="request-details">{r.details}</p>}
              {r.assigned_name && (
                <div className="request-assigned"><UserRound size={14} /> {mine ? 'You' : r.assigned_name}</div>
              )}
              <div className="request-actions">
                {r.status === 'open' && (
                  <button className="btn btn-primary btn-sm" onClick={() => setStatus(r, 'in_progress', 'accepted')}><Hand size={14} /> Accept</button>
                )}
                {(r.status === 'open' || r.status === 'in_progress') && (
                  <button className={`btn btn-sm ${r.status === 'in_progress' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatus(r, 'done', 'done')}>
                    <CheckCircle2 size={14} /> Done
                  </button>
                )}
                {desk && (r.status === 'open' || r.status === 'in_progress') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(r, 'cancelled', 'cancelled')}><XCircle size={14} /> Cancel</button>
                )}
                {desk && (r.status === 'done' || r.status === 'cancelled') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(r, 'open', 'reopened')}><RotateCcw size={14} /> Reopen</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
