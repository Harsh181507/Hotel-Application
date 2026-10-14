import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, Receipt, Smartphone, Wallet } from 'lucide-react';
import { imageUrl } from '../lib/api.js';
import { rupees } from '../lib/money.js';
import { useSocketEvents } from '../lib/useSocket.js';
import { CHARGE_KIND, PAY_STATUS, PAYMENT_METHOD, upiLink } from '../lib/booking.js';
import { dayLabel, timeLabel } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';

/** The guest's room bill: every item with Paid / Checking / Unpaid, and paying by UPI. */
export default function GuestBill({ call, socket, info, active, roomNumber }) {
  const [bill, setBill] = useState(null);
  const [paying, setPaying] = useState(null); // { amount, chargeIds }

  const load = useCallback(() => call('/api/guest/bill').then(setBill).catch(() => {}), [call]);
  useEffect(() => { if (active) load(); }, [active, load]);
  useSocketEvents(socket, { 'bill:updated': load, connect: load }, [load]);

  if (!bill) return <div className="chat-empty"><span className="spinner" /></div>;

  const payment = info?.payment;
  const canPay = payment?.ready;
  const settled = bill.items.length > 0 && bill.balancePaise <= 0;

  return (
    <div className="menu-screen">
      <div className="menu-scroll">
        <div className="menu-hero">
          <h1>Your bill</h1>
          <div className={`bill-balance ${settled ? 'settled' : ''}`}>
            {settled ? (
              <><CheckCircle2 size={22} /><div><strong>All paid</strong><span>Thank you!</span></div></>
            ) : (
              <><Wallet size={22} /><div><strong>{rupees(Math.max(0, bill.balancePaise))}</strong><span>to pay</span></div></>
            )}
            {bill.dueNowPaise > 0 && canPay && (
              <button className="btn btn-primary" onClick={() => setPaying({ amount: bill.dueNowPaise, chargeIds: [] })}>Pay {rupees(bill.dueNowPaise)}</button>
            )}
          </div>
          {bill.pendingPaise > 0 && <p className="alert alert-info">{rupees(bill.pendingPaise)} sent. The front desk will confirm it shortly.</p>}
          {bill.dueNowPaise > 0 && !canPay && <p className="muted small">Please pay at the front desk before you check out.</p>}
        </div>

        {!bill.items.length ? (
          <div className="empty-card"><Receipt size={22} /><p>Nothing on your bill yet. Room service, restaurant bills and vehicle bookings will show here.</p></div>
        ) : (
          <div className="bill-items">
            {bill.items.map((i) => (
              <div key={i.id} className={`bill-item ${i.kind === 'discount' ? 'discount' : ''}`}>
                <div className="bill-item-main">
                  <span className="bill-item-kind">{CHARGE_KIND[i.kind]} · {dayLabel(i.createdAt)}</span>
                  <strong>{i.description}</strong>
                  {i.taxPaise !== 0 && <span className="muted small">{rupees(i.amountPaise)} + {i.taxPct}% GST {rupees(i.taxPaise)}</span>}
                </div>
                <div className="bill-item-side">
                  <strong>{rupees(i.totalPaise)}</strong>
                  {i.status && <span className={`status status-${PAY_STATUS[i.status].tone}`}>{PAY_STATUS[i.status].label}</span>}
                  {i.status === 'unpaid' && canPay && bill.dueNowPaise > 0 && (
                    <button className="link-btn" onClick={() => setPaying({ amount: i.totalPaise, chargeIds: [i.id] })}>Pay</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {bill.items.length > 0 && <BillTotals bill={bill} />}

        {bill.payments.length > 0 && (
          <div className="bill-payments">
            <h3>Payments</h3>
            {bill.payments.map((p) => (
              <div key={p.id} className={`bill-line ${p.status === 'rejected' ? 'struck' : ''}`}>
                <span>
                  {PAYMENT_METHOD[p.method]}{p.utr ? ` · ref ${p.utr}` : ''} · {dayLabel(p.createdAt)} {timeLabel(p.createdAt)}
                  {p.status === 'pending' && <span className="status status-amber">Checking</span>}
                  {p.status === 'rejected' && <span className="status status-red">Not received</span>}
                </span>
                <span>{rupees(p.amountPaise)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {paying && (
        <PaySheet
          call={call}
          payment={payment}
          amount={paying.amount}
          chargeIds={paying.chargeIds}
          roomNumber={roomNumber}
          onClose={() => setPaying(null)}
          onSent={(next) => { setBill(next); setPaying(null); toast('Sent! The front desk will confirm your payment.', 'success'); }}
        />
      )}
    </div>
  );
}

/** Subtotal, discount, GST per rate, total, paid and balance. Shared with the staff bill. */
export function BillTotals({ bill }) {
  return (
    <div className="bill-totals">
      <div className="bill-line"><span>Subtotal</span><span>{rupees(bill.subtotalPaise)}</span></div>
      {bill.discountPaise !== 0 && <div className="bill-line"><span>Discount</span><span>−{rupees(-bill.discountPaise)}</span></div>}
      {bill.taxes.map((t) => (
        <div key={t.pct} className="bill-line"><span>GST {t.pct}%</span><span>{rupees(t.paise)}</span></div>
      ))}
      <div className="bill-line bill-total"><span>Total</span><span>{rupees(bill.totalPaise)}</span></div>
      {bill.paidPaise > 0 && <div className="bill-line"><span>Paid</span><span>−{rupees(bill.paidPaise)}</span></div>}
      <div className="bill-line bill-total">
        <span>{bill.balancePaise < 0 ? 'Refund due' : 'Balance'}</span>
        <span>{rupees(Math.abs(bill.balancePaise))}</span>
      </div>
    </div>
  );
}

function PaySheet({ call, payment, amount, chargeIds, roomNumber, onClose, onSent }) {
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSent(await call('/api/guest/payments', { method: 'POST', body: { utr, chargeIds } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const copyUpi = async () => {
    try { await navigator.clipboard.writeText(payment.upiId); toast('UPI ID copied', 'success'); } catch { /* clipboard blocked */ }
  };

  return (
    <Modal title={`Pay ${rupees(amount)}`} onClose={onClose}>
      <form className="pay-sheet" onSubmit={send}>
        <ol className="pay-steps">
          <li>Scan this QR with any UPI app (GPay, PhonePe, Paytm…) and pay <strong>{rupees(amount)}</strong>.</li>
          <li>Copy the <strong>UPI reference number</strong> (UTR, usually 12 digits) from the payment receipt.</li>
          <li>Enter it below. The front desk checks it and marks your bill paid.</li>
        </ol>
        {payment.qrImageId && (
          <div className="pay-qr">
            <img src={imageUrl(payment.qrImageId)} alt={`UPI QR code of ${payment.payeeName}`} />
            <a className="btn btn-ghost btn-sm" href={imageUrl(payment.qrImageId)} download={`pay-${payment.payeeName}.jpg`}>
              <Download size={14} /> Save QR (to pay from this phone)
            </a>
          </div>
        )}
        {payment.upiId && (
          <div className="pay-upi">
            <span>UPI ID: <strong>{payment.upiId}</strong></span>
            <button type="button" className="icon-btn" onClick={copyUpi} aria-label="Copy UPI ID"><Copy size={16} /></button>
          </div>
        )}
        {payment.upiId && onPhone && (
          <a className="btn btn-secondary btn-block" href={upiLink(payment, amount, `Room ${roomNumber} bill`)}>
            <Smartphone size={16} /> Open UPI app
          </a>
        )}
        <label className="field">
          <span className="field-label">UPI reference number (UTR)</span>
          <input
            className="input input-code"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 412345678901"
            value={utr}
            onChange={(e) => setUtr(e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 35))}
            required
            minLength={6}
          />
        </label>
        {error && <p className="alert alert-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy || utr.length < 6}>
          {busy ? <span className="spinner spinner-light" /> : 'I have paid · send reference'}
        </button>
      </form>
    </Modal>
  );
}
