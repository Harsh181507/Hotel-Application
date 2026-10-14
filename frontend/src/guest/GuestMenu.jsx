import { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, ShoppingBag, Flame, ChevronRight, Receipt } from 'lucide-react';
import { imageUrl } from '../lib/api.js';
import { rupees } from '../lib/money.js';
import { storage } from '../lib/session.js';
import { useSocketEvents } from '../lib/useSocket.js';
import { ORDER_STEPS, ORDER_STATUS } from '../lib/requestTypes.js';
import { timeAgo } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';

// Veg / non-veg mark, as on Indian menus (green or red dot in a square).
export const VegMark = ({ veg }) => (
  <span className={`veg-mark ${veg ? 'veg' : 'nonveg'}`} title={veg ? 'Vegetarian' : 'Non-vegetarian'}><i /></span>
);

export default function GuestMenu({ call, socket, room, info, active, onOpenBill }) {
  const cartKey = `anemos.cart.${room}`;
  const [items, setItems] = useState(null);
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState(() => storage.read(cartKey) || {});
  const [orders, setOrders] = useState({ orders: [], total_paise: 0 });
  const [checkout, setCheckout] = useState(false);

  const loadMenu = useCallback(() => call('/api/guest/menu').then(setItems).catch(() => setItems((v) => v ?? [])), [call]);
  const loadOrders = useCallback(() => call('/api/guest/orders').then(setOrders).catch(() => {}), [call]);

  useEffect(() => {
    if (!active) return;
    loadMenu();
    loadOrders();
  }, [active, loadMenu, loadOrders]);

  useSocketEvents(socket, { 'order:updated': loadOrders, 'order:new': loadOrders }, [loadOrders]);

  useEffect(() => { storage.write(cartKey, Object.keys(cart).length ? cart : null); }, [cart, cartKey]);

  const byId = useMemo(() => new Map((items || []).map((i) => [i.id, i])), [items]);
  const categories = useMemo(() => ['All', ...new Set((items || []).map((i) => i.category))], [items]);
  const visible = (items || []).filter((i) => category === 'All' || i.category === category);

  // Drop cart lines for items that disappeared or sold out.
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: byId.get(Number(id)), qty }))
    .filter((l) => l.item && l.item.available && l.qty > 0);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((n, l) => n + l.qty * l.item.price_paise, 0);

  const setQty = (id, qty) => setCart((c) => {
    const next = { ...c };
    if (qty <= 0) delete next[id];
    else next[id] = Math.min(20, qty);
    return next;
  });

  const activeOrders = orders.orders.filter((o) => ['placed', 'preparing', 'on_the_way'].includes(o.status));

  if (items === null) return <div className="chat-empty"><span className="spinner" /></div>;

  if (!items.length) {
    return (
      <div className="chat-empty fill">
        <div className="chat-empty-icon"><ShoppingBag size={26} /></div>
        <p>In-room dining isn't available yet. Please message the front desk to order.</p>
      </div>
    );
  }

  return (
    <div className="menu-screen">
      <div className="menu-scroll">
        <div className="menu-hero">
          <h1>In-room dining</h1>
          {orders.total_paise > 0 && (
            <button className="bill-link" onClick={onOpenBill}>
              <Receipt size={16} /> Your room bill <ChevronRight size={16} />
            </button>
          )}
        </div>

        {activeOrders.map((o) => <OrderTracker key={o.id} order={o} call={call} onChange={loadOrders} onPay={onOpenBill} />)}

        <div className="chips menu-chips">
          {categories.map((c) => (
            <button key={c} className={`chip ${c === category ? 'chip-active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>

        <div className="menu-list">
          {visible.map((item) => {
            const qty = cart[item.id] || 0;
            return (
              <div key={item.id} className={`menu-item ${item.available ? '' : 'sold-out'}`}>
                <div className="menu-item-info">
                  <div className="menu-item-top">
                    <VegMark veg={item.veg} />
                    {item.popular && <span className="tag-popular"><Flame size={12} /> Popular</span>}
                  </div>
                  <strong>{item.name}</strong>
                  <span className="menu-price">{rupees(item.price_paise)}</span>
                  {item.description && <p>{item.description}</p>}
                </div>
                <div className="menu-item-side">
                  {item.image_id && <img src={imageUrl(item.image_id)} alt="" loading="lazy" />}
                  {!item.available ? (
                    <span className="sold-out-label">Sold out</span>
                  ) : qty ? (
                    <div className="stepper">
                      <button onClick={() => setQty(item.id, qty - 1)} aria-label="Remove one"><Minus size={16} /></button>
                      <span>{qty}</span>
                      <button onClick={() => setQty(item.id, qty + 1)} aria-label="Add one"><Plus size={16} /></button>
                    </div>
                  ) : (
                    <button className="add-btn" onClick={() => setQty(item.id, 1)}>ADD</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {count > 0 && (
        <button className="cart-bar" onClick={() => setCheckout(true)}>
          <span><ShoppingBag size={18} /> {count} item{count > 1 ? 's' : ''} · {rupees(total)}</span>
          <span>View order <ChevronRight size={18} /></span>
        </button>
      )}

      {checkout && (
        <CheckoutSheet
          lines={lines}
          total={total}
          taxPct={info?.taxes.foodPct ?? 0}
          setQty={setQty}
          call={call}
          onClose={() => setCheckout(false)}
          onPlaced={() => {
            setCart({});
            setCheckout(false);
            loadOrders();
            toast('Order sent to the kitchen', 'success');
          }}
          onMenuChanged={loadMenu}
        />
      )}

    </div>
  );
}

function OrderTracker({ order, call, onChange, onPay }) {
  const step = ORDER_STEPS.indexOf(order.status);
  const cancel = async () => {
    if (!window.confirm(`Cancel order #${order.id}?`)) return;
    try {
      await call(`/api/guest/orders/${order.id}/cancel`, { method: 'POST' });
      onChange();
    } catch (err) {
      toast(err.message, 'error');
      onChange();
    }
  };
  return (
    <div className="order-tracker">
      <div className="order-tracker-top">
        <strong>Order #{order.id}</strong>
        <span className="muted small">{timeAgo(order.created_at)} · {rupees(order.total_paise)}</span>
      </div>
      <div className="order-items-line">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</div>
      <div className="steps">
        {ORDER_STEPS.map((s, i) => (
          <div key={s} className={`step ${i <= step ? 'done' : ''} ${i === step ? 'current' : ''}`}>
            <i />
            <span>{ORDER_STATUS[s].short}</span>
          </div>
        ))}
      </div>
      <div className="order-tracker-actions">
        <button className="link-btn" onClick={onPay}>Pay now</button>
        {order.status === 'placed' && <button className="link-btn" onClick={cancel}>Cancel order</button>}
      </div>
    </div>
  );
}

function CheckoutSheet({ lines, total, taxPct, setQty, call, onClose, onPlaced, onMenuChanged }) {
  const tax = Math.round((total * taxPct) / 100);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const place = async () => {
    setBusy(true);
    setError('');
    try {
      await call('/api/guest/orders', { method: 'POST', body: { items: lines.map((l) => ({ id: l.item.id, quantity: l.qty })), note } });
      onPlaced();
    } catch (err) {
      setError(err.message);
      setBusy(false);
      onMenuChanged();
    }
  };

  return (
    <Modal title="Your order" onClose={onClose}>
      <div className="checkout-lines">
        {lines.map(({ item, qty }) => (
          <div key={item.id} className="checkout-line">
            <VegMark veg={item.veg} />
            <span className="checkout-name">{item.name}</span>
            <div className="stepper stepper-sm">
              <button onClick={() => setQty(item.id, qty - 1)} aria-label="Remove one"><Minus size={14} /></button>
              <span>{qty}</span>
              <button onClick={() => setQty(item.id, qty + 1)} aria-label="Add one"><Plus size={14} /></button>
            </div>
            <span className="checkout-price">{rupees(item.price_paise * qty)}</span>
          </div>
        ))}
      </div>
      <textarea
        className="input"
        rows={2}
        maxLength={300}
        placeholder="Any instructions? e.g. less spicy, no onion"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {tax > 0 && <div className="bill-line"><span>GST {taxPct}%</span><span>{rupees(tax)}</span></div>}
      <div className="checkout-total"><span>Total (added to your room bill)</span><strong>{rupees(total + tax)}</strong></div>
      {error && <p className="alert alert-error">{error}</p>}
      <button className="btn btn-primary btn-block btn-lg" disabled={busy || !lines.length} onClick={place}>
        {busy ? <span className="spinner spinner-light" /> : `Place order · ${rupees(total + tax)}`}
      </button>
    </Modal>
  );
}
