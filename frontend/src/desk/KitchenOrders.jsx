import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, ChefHat, Bike, CheckCircle2, XCircle, StickyNote } from 'lucide-react';
import { useSocketEvents } from '../lib/useSocket.js';
import { rupees } from '../lib/money.js';
import { ago } from '../lib/format.js';
import { toast } from '../lib/toast.js';

const COLUMNS = [
  { status: 'placed', title: 'New', next: 'preparing', action: 'Start preparing', Icon: ChefHat },
  { status: 'preparing', title: 'Preparing', next: 'on_the_way', action: 'Send to room', Icon: Bike },
  { status: 'on_the_way', title: 'On the way', next: 'delivered', action: 'Delivered', Icon: CheckCircle2 },
];

// The kitchen screen: tickets move left to right. Works well on a tablet.
export default function KitchenOrders({ call, socket }) {
  const [orders, setOrders] = useState(null);

  const load = useCallback(() => {
    call('/api/staff/dining/orders?active=true').then(setOrders).catch(() => setOrders([]));
  }, [call]);

  useEffect(() => { load(); }, [load]);
  // Refresh the "x min ago" labels every 30 seconds.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useSocketEvents(socket, { 'order:new': load, 'order:updated': load, 'order:escalated': load, connect: load }, [load]);

  const move = async (order, status) => {
    if (status === 'cancelled' && !window.confirm(`Cancel order #${order.id} for room ${order.room_number}?`)) return;
    try {
      await call(`/api/staff/dining/orders/${order.id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      toast(err.message, 'error');
      load();
    }
  };

  if (orders === null) return <div className="page"><div className="chat-empty"><span className="spinner" /></div></div>;
  const delivered = orders.filter((o) => o.status === 'delivered');

  return (
    <div className="page page-wide">
      <h1 className="page-title">Orders</h1>
      <div className="kitchen-board">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status).sort((a, b) => a.id - b.id);
          return (
            <section key={col.status} className="kitchen-col">
              <h2>{col.title} <span className="count">{list.length}</span></h2>
              {list.length === 0 && <p className="muted small pad">Nothing here</p>}
              {list.map((o) => (
                <article key={o.id} className={`ticket ${o.escalated_at && o.status === 'placed' ? 'late' : ''}`}>
                  <header>
                    <span className="ticket-room">Room {o.room_number}</span>
                    <span className="ticket-meta">
                      {o.escalated_at && o.status === 'placed' && <span className="status status-red"><AlarmClock size={12} /> Late</span>}
                      #{o.id} · {ago(o.created_at)}
                    </span>
                  </header>
                  <ul>
                    {o.items.map((i, idx) => <li key={idx}><b>{i.quantity}×</b> {i.name}</li>)}
                  </ul>
                  {o.note && <p className="ticket-note"><StickyNote size={14} /> {o.note}</p>}
                  <footer>
                    <span className="muted small">{o.guest_name} · {rupees(o.total_paise)}</span>
                    <div className="ticket-actions">
                      <button className="icon-btn danger" title="Cancel order" aria-label="Cancel order" onClick={() => move(o, 'cancelled')}><XCircle size={18} /></button>
                      <button className="btn btn-primary btn-sm" onClick={() => move(o, col.next)}><col.Icon size={14} /> {col.action}</button>
                    </div>
                  </footer>
                </article>
              ))}
            </section>
          );
        })}
      </div>
      {delivered.length > 0 && (
        <details className="delivered-list">
          <summary>Delivered in the last 2 hours ({delivered.length})</summary>
          {delivered.map((o) => (
            <div key={o.id} className="delivered-row">
              <span>#{o.id} · Room {o.room_number}</span>
              <span className="muted">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</span>
              <span>{rupees(o.total_paise)}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
