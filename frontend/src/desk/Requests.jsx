import { useCallback, useEffect, useState } from 'react';
import { Play, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { useSocketEvents } from '../lib/useSocket.js';
import { requestType, STATUS } from '../lib/requestTypes.js';
import { ago } from '../lib/format.js';
import { toast } from '../lib/toast.js';

const FILTERS = [
  { key: 'open', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: '', label: 'All' },
];

export default function Requests({ call, socket }) {
  const [filter, setFilter] = useState('open');
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    call(`/api/staff/requests${filter ? `?status=${filter}` : ''}`).then(setItems).catch(() => setItems([]));
  }, [call, filter]);

  useEffect(() => { load(); }, [load]);
  useSocketEvents(socket, { 'request:new': load, 'request:updated': load }, [load]);

  const setStatus = async (r, status) => {
    try {
      await call(`/api/staff/requests/${r.id}`, { method: 'PATCH', body: { status } });
      toast(`Room ${r.room_number}: marked ${STATUS[status].label.toLowerCase()}`, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Service requests</h1>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'chip-active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {items === null && <div className="chat-empty"><span className="spinner" /></div>}
      {items?.length === 0 && <p className="muted pad">Nothing here right now.</p>}

      <div className="request-grid">
        {items?.map((r) => {
          const t = requestType(r.type);
          return (
            <div key={r.id} className="request-card">
              <div className="request-top">
                <div className="request-type"><t.Icon size={18} /> {t.label}</div>
                <span className={`status status-${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
              </div>
              <div className="request-who">Room <strong>{r.room_number}</strong> · {r.guest_name} · {ago(r.created_at)}</div>
              {r.details && <p className="request-details">{r.details}</p>}
              <div className="request-actions">
                {r.status === 'open' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setStatus(r, 'in_progress')}><Play size={14} /> Start</button>
                )}
                {(r.status === 'open' || r.status === 'in_progress') && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => setStatus(r, 'done')}><CheckCircle2 size={14} /> Done</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setStatus(r, 'cancelled')}><XCircle size={14} /> Cancel</button>
                  </>
                )}
                {(r.status === 'done' || r.status === 'cancelled') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(r, 'open')}><RotateCcw size={14} /> Reopen</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
