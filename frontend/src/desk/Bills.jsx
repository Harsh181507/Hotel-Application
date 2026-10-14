import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Check, Plus, Printer, Receipt, Undo2, X } from 'lucide-react';
import { rupees } from '../lib/money.js';
import { useSocketEvents } from '../lib/useSocket.js';
import { CHARGE_KIND, PAY_STATUS, PAYMENT_METHOD } from '../lib/booking.js';
import { ago, dayLabel, timeLabel } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import { BillTotals } from '../guest/GuestBill.jsx';

const toPaise = (value) => Math.round(Number.parseFloat(value) * 100);
const fullDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fullDateTime = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Room bills and payments (front desk). */
export default function Bills({ call, socket }) {
  return (
    <Routes>
      <Route index element={<BillList call={call} socket={socket} />} />
      <Route path=":stayId" element={<BillDetail call={call} socket={socket} />} />
    </Routes>
  );
}

// ---------- Payments to check (also shown on a bill) ----------

function PendingPayment({ p, call, onDone, showRoom = true }) {
  const [busy, setBusy] = useState(false);
  const decide = async (confirm) => {
    if (!confirm && !window.confirm(`Mark ${rupees(p.amountPaise)} (UPI ref ${p.utr}) as NOT received? The guest will be told to check it.`)) return;
    setBusy(true);
    try {
      await call(`/api/staff/billing/payments/${p.id}/${confirm ? 'confirm' : 'reject'}`, { method: 'POST', body: {} });
      toast(confirm ? `${rupees(p.amountPaise)} confirmed` : 'Payment marked as not received', confirm ? 'success' : 'default');
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };
  return (
    <div className="pending-pay">
      <div>
        <strong>{rupees(p.amountPaise)} by UPI{showRoom ? ` · Room ${p.roomNumber}` : ''}</strong>
        <span className="small">UPI ref <strong>{p.utr}</strong>{showRoom ? ` · ${p.guestName}` : ''} · {ago(p.createdAt)}</span>
        <span className="muted small">Check this reference in your bank / UPI app, then confirm.</span>
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide(true)}><Check size={14} /> Received</button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => decide(false)}><X size={14} /> Not received</button>
    </div>
  );
}

// ---------- List ----------

function BillList({ call, socket }) {
  const navigate = useNavigate();
  const [bills, setBills] = useState(null);
  const [pending, setPending] = useState([]);

  const load = useCallback(() => {
    call('/api/staff/billing/bills').then(setBills).catch(() => setBills([]));
    call('/api/staff/billing/payments/pending').then(setPending).catch(() => {});
  }, [call]);
  useEffect(() => { load(); }, [load]);
  useSocketEvents(socket, { 'payment:submitted': load, 'bill:updated': load, 'stay:updated': load, connect: load }, [load]);

  const current = (bills || []).filter((b) => b.active);
  const past = (bills || []).filter((b) => !b.active);

  const Row = ({ b }) => (
    <div className="list-row clickable" onClick={() => navigate(`/desk/bills/${b.stayId}`)}>
      <span className="list-row-time">{b.roomNumber}</span>
      <div className="list-row-main">
        <strong>{b.guestName}</strong>
        <span className="muted small">
          {b.active ? `In since ${dayLabel(b.checkedInAt)}` : `Left ${dayLabel(b.checkedOutAt)}`} · Total {rupees(b.totalPaise)}
        </span>
      </div>
      <div className="list-row-side">
        {b.pendingPayments > 0 && <span className="status status-amber">UPI to check</span>}
        {b.balancePaise > 0 ? <span className="money-bad">{rupees(b.balancePaise)} due</span>
          : b.totalPaise > 0 ? <span className="money-good">Paid</span> : <span className="muted small">Nothing yet</span>}
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Bills</h1>
          <p className="muted">Room service, restaurant, vehicles and extras for each room, with what is paid.</p>
        </div>
      </div>

      {pending.length > 0 && (
        <>
          <h2 className="section-title">UPI payments to check</h2>
          {pending.map((p) => <PendingPayment key={p.id} p={p} call={call} onDone={load} />)}
        </>
      )}

      <h2 className="section-title">Guests in the hotel</h2>
      {bills === null ? <span className="spinner" /> : !current.length ? (
        <div className="empty-card"><Receipt size={22} /><p>No guests checked in.</p></div>
      ) : (
        <div className="list-card">{current.map((b) => <Row key={b.stayId} b={b} />)}</div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="section-title">Checked out (last 30 days)</h2>
          <div className="list-card">{past.map((b) => <Row key={b.stayId} b={b} />)}</div>
        </>
      )}
    </div>
  );
}

// ---------- One bill ----------

function BillDetail({ call, socket }) {
  const { stayId } = useParams();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'charge' | 'advance' | { pay: chargeIds[] }

  const load = useCallback(() => {
    call(`/api/staff/billing/stays/${stayId}`).then(setBill).catch((err) => setError(err.message));
  }, [call, stayId]);
  useEffect(() => { load(); }, [load]);
  useSocketEvents(socket, {
    'bill:updated': (e) => { if (String(e.stayId) === String(stayId)) load(); },
    'payment:submitted': (p) => { if (String(p.stayId) === String(stayId)) load(); },
    connect: load,
  }, [load, stayId]);

  if (error) return <div className="page"><p className="alert alert-error">{error}</p><Link to="/desk/bills">Back to bills</Link></div>;
  if (!bill) return <div className="page"><span className="spinner" /></div>;

  const { stay } = bill;
  const pending = bill.payments.filter((p) => p.status === 'pending');
  const done = (next) => { setBill(next); setModal(null); };

  const remove = async (item) => {
    if (!window.confirm(`Remove "${item.description}" from the bill?`)) return;
    try {
      await call(`/api/staff/billing/charges/${item.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const undo = async (p) => {
    if (!window.confirm(`Undo the payment of ${rupees(p.amountPaise)} (${PAYMENT_METHOD[p.method]})? Use this only if it was recorded by mistake.`)) return;
    try {
      done(await call(`/api/staff/billing/payments/${p.id}/reject`, { method: 'POST', body: { note: 'Undone by front desk' } }));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <Link className="back-btn" to="/desk/bills"><ArrowLeft size={16} /> All bills</Link>
      <div className="page-head">
        <div>
          <h1 className="page-title">Room {stay.roomNumber} · {stay.guestName}</h1>
          <p className="muted">
            Guest ID {stay.guestLogin} · In {fullDateTime.format(new Date(stay.checkedInAt))}
            {stay.checkedOutAt ? ` · Out ${fullDateTime.format(new Date(stay.checkedOutAt))}` : ' · Checked in now'}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print bill</button>
      </div>

      <div className="bill-detail-actions">
        <button className="btn btn-primary" disabled={bill.dueNowPaise <= 0} onClick={() => setModal({ pay: [] })}>
          <Banknote size={16} /> {bill.dueNowPaise > 0 ? `Take payment · ${rupees(bill.dueNowPaise)}` : 'Nothing due'}
        </button>
        <button className="btn btn-secondary" onClick={() => setModal('charge')}><Plus size={16} /> Add charge / discount</button>
        <button className="btn btn-ghost" onClick={() => setModal('advance')}><Plus size={16} /> Advance paid</button>
      </div>

      {pending.map((p) => <PendingPayment key={p.id} p={p} call={call} onDone={load} showRoom={false} />)}

      <div className="bill-columns">
        <div>
          {!bill.items.length ? (
            <div className="empty-card"><Receipt size={22} /><p>Nothing on this bill yet.</p></div>
          ) : (
            <table className="bill-table">
              <thead>
                <tr><th>Item</th><th className="num">Amount</th><th className="num">GST</th><th className="num">Total</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {bill.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.description}</strong>
                      <div className="muted small">{CHARGE_KIND[i.kind]} · {dayLabel(i.createdAt)} {timeLabel(i.createdAt)}</div>
                    </td>
                    <td className="num">{rupees(i.amountPaise)}</td>
                    <td className="num">{i.taxPaise ? `${rupees(i.taxPaise)} (${i.taxPct}%)` : '—'}</td>
                    <td className="num"><strong>{rupees(i.totalPaise)}</strong></td>
                    <td>{i.status && <span className={`status status-${PAY_STATUS[i.status].tone}`}>{PAY_STATUS[i.status].label}</span>}</td>
                    <td>
                      <div className="row-actions">
                        {i.status === 'unpaid' && <button className="link-btn" onClick={() => setModal({ pay: [i.id] })}>Mark paid</button>}
                        {['restaurant', 'extra', 'discount'].includes(i.kind) && !i.locked && (
                          <button className="link-btn" onClick={() => remove(i)}>Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <BillTotals bill={bill} />
          {bill.payments.length > 0 && (
            <div className="bill-payments">
              <h3>Payments</h3>
              {bill.payments.map((p) => (
                <div key={p.id} className={`bill-line ${p.status === 'rejected' ? 'struck' : ''}`}>
                  <span>
                    {PAYMENT_METHOD[p.method]}{p.utr ? ` · ${p.utr}` : ''} · {dayLabel(p.createdAt)}
                    {p.staffName && p.status !== 'pending' ? ` · ${p.staffName}` : ''}
                    {p.note ? ` · ${p.note}` : ''}
                    {p.status === 'pending' && <span className="status status-amber">To check</span>}
                    {p.status === 'confirmed' && <button className="link-btn" title="Undo" onClick={() => undo(p)}> <Undo2 size={12} /> undo</button>}
                  </span>
                  <span>{rupees(p.amountPaise)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PrintableBill bill={bill} />

      {modal === 'charge' && <ChargeModal call={call} stayId={stayId} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'advance' && <AdvanceModal call={call} stayId={stayId} onClose={() => setModal(null)} onDone={done} />}
      {modal?.pay && <PaymentModal call={call} bill={bill} chargeIds={modal.pay} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

function ChargeModal({ call, stayId, onClose, onDone }) {
  const [kind, setKind] = useState('restaurant');
  const [description, setDescription] = useState('Restaurant bill');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const DEFAULTS = { restaurant: 'Restaurant bill', extra: '', discount: 'Discount' };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await call(`/api/staff/billing/stays/${stayId}/charges`, { method: 'POST', body: { kind, description, amountPaise: toPaise(amount) } }));
      toast(kind === 'discount' ? 'Discount added' : 'Added to the bill', 'success');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title="Add to the bill" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="chips">
          {[['restaurant', 'Restaurant bill'], ['extra', 'Extra (laundry, minibar…)'], ['discount', 'Discount']].map(([k, label]) => (
            <button type="button" key={k} className={`chip ${kind === k ? 'chip-active' : ''}`} onClick={() => { setKind(k); setDescription(DEFAULTS[k]); }}>{label}</button>
          ))}
        </div>
        <Field label="Description">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={200}
            placeholder={kind === 'extra' ? 'e.g. Laundry (3 shirts)' : ''} />
        </Field>
        <Field label={kind === 'discount' ? 'Discount (₹)' : 'Amount before GST (₹)'} hint={kind === 'discount' ? 'Taken off the total.' : 'GST is added using the rates in Settings.'}>
          <input className="input" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy || !(toPaise(amount) > 0)}>{busy ? <span className="spinner spinner-light" /> : 'Add'}</button>
      </form>
    </Modal>
  );
}

function AdvanceModal({ call, stayId, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await call(`/api/staff/billing/stays/${stayId}/advance`, { method: 'POST', body: { amountPaise: toPaise(amount), note } }));
      toast('Advance recorded', 'success');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal title="Advance paid before arrival" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Amount (₹)"><input className="input" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Paid via booking site" /></Field>
        <button className="btn btn-primary btn-block" disabled={busy || !(toPaise(amount) > 0)}>{busy ? <span className="spinner spinner-light" /> : 'Save advance'}</button>
      </form>
    </Modal>
  );
}

function PaymentModal({ call, bill, chargeIds, onClose, onDone }) {
  const [method, setMethod] = useState('cash');
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const items = bill.items.filter((i) => chargeIds.includes(i.id));
  const amount = chargeIds.length ? items.reduce((n, i) => n + i.totalPaise, 0) : bill.dueNowPaise;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await call(`/api/staff/billing/stays/${bill.stay.id}/payments`, {
        method: 'POST', body: { method, chargeIds, note, ...(utr && { utr }) },
      }));
      toast(`${rupees(amount)} received`, 'success');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title={`Take payment · ${rupees(amount)}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">{chargeIds.length ? items.map((i) => i.description).join(', ') : 'Everything still due on this bill.'}</p>
        <div className="chips">
          {['cash', 'upi', 'card', 'other'].map((m) => (
            <button type="button" key={m} className={`chip ${method === m ? 'chip-active' : ''}`} onClick={() => setMethod(m)}>{PAYMENT_METHOD[m]}</button>
          ))}
        </div>
        {method === 'upi' && (
          <Field label="UPI reference (optional)"><input className="input" value={utr} onChange={(e) => setUtr(e.target.value)} maxLength={35} /></Field>
        )}
        <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
        <button className="btn btn-primary btn-block btn-lg" disabled={busy || amount <= 0}>
          {busy ? <span className="spinner spinner-light" /> : `Received ${rupees(amount)}`}
        </button>
      </form>
    </Modal>
  );
}

/** Only visible when printing (Print bill). */
function PrintableBill({ bill }) {
  const { stay, hotel } = bill;
  const paid = bill.items.length > 0 && bill.balancePaise <= 0;
  return (
    <div className="bill-print" aria-hidden="true">
      <div className="print-head">
        <div>
          <h1>{hotel.name}</h1>
          {hotel.gstin && <div>GSTIN: {hotel.gstin}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong>BILL No. {stay.id}</strong>
          <div>Printed {fullDateTime.format(new Date())}</div>
        </div>
      </div>
      <div>
        <strong>{stay.guestName}</strong> · Room {stay.roomNumber}<br />
        Check-in {fullDate.format(new Date(stay.checkedInAt))} · Check-out {stay.checkedOutAt ? fullDate.format(new Date(stay.checkedOutAt)) : '—'}
      </div>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th><th className="num">GST</th><th className="num">Total</th><th>Status</th></tr></thead>
        <tbody>
          {bill.items.map((i) => (
            <tr key={i.id}>
              <td>{fullDate.format(new Date(i.createdAt))}</td>
              <td>{i.description}</td>
              <td className="num">{rupees(i.amountPaise)}</td>
              <td className="num">{i.taxPaise ? `${rupees(i.taxPaise)} (${i.taxPct}%)` : '—'}</td>
              <td className="num">{rupees(i.totalPaise)}</td>
              <td>{i.status ? PAY_STATUS[i.status].label : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="print-totals">
        <div><span>Subtotal</span><span>{rupees(bill.subtotalPaise)}</span></div>
        {bill.discountPaise !== 0 && <div><span>Discount</span><span>−{rupees(-bill.discountPaise)}</span></div>}
        {bill.taxes.map((t) => <div key={t.pct}><span>GST {t.pct}%</span><span>{rupees(t.paise)}</span></div>)}
        <div className="grand"><span>Total</span><span>{rupees(bill.totalPaise)}</span></div>
        {bill.payments.filter((p) => p.status === 'confirmed').map((p) => (
          <div key={p.id}><span>Paid · {PAYMENT_METHOD[p.method]}{p.utr ? ` ${p.utr}` : ''}</span><span>−{rupees(p.amountPaise)}</span></div>
        ))}
        <div className="grand"><span>{bill.balancePaise < 0 ? 'Refund due' : 'Balance due'}</span><span>{rupees(Math.abs(bill.balancePaise))}</span></div>
      </div>
      <div className="stamp">{paid ? 'PAID' : `BALANCE DUE ${rupees(Math.max(0, bill.balancePaise))}`}</div>
    </div>
  );
}
