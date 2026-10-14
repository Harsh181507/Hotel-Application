import { useEffect, useState } from 'react';
import { Bot, ImagePlus, Moon, PowerOff, Trash2 } from 'lucide-react';
import { imageUrl } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import Field from '../components/Field.jsx';
import { shrinkImage } from './MenuEditor.jsx';

const MODES = [
  { key: 'always', label: 'Always on', Icon: Bot, help: 'Replies to guests instantly, day and night. Goes quiet while a receptionist is chatting with that guest.' },
  { key: 'night', label: 'Night only', Icon: Moon, help: 'Replies only during night hours. During the day your team answers.' },
  { key: 'off', label: 'Off', Icon: PowerOff, help: 'Only people reply.' },
];

// Hotel settings (admin).
export default function Settings({ call }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { call('/api/staff/settings').then(setS).catch(() => {}); }, [call]);
  if (!s) return <div className="page"><div className="chat-empty"><span className="spinner" /></div></div>;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setS(await call('/api/staff/settings', {
        method: 'PUT',
        body: {
          ...s,
          escalate_after_minutes: Number(s.escalate_after_minutes),
          table_booking_minutes: Number(s.table_booking_minutes),
          tax_food_pct: Number(s.tax_food_pct || 0),
          tax_vehicle_pct: Number(s.tax_vehicle_pct || 0),
          tax_other_pct: Number(s.tax_other_pct || 0),
        },
      }));
      toast('Settings saved', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadQr = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const img = await call('/api/staff/dining/images', { method: 'POST', body: { dataUrl: await shrinkImage(file, 1000) } });
      set('payment_qr_image_id', img.id);
      toast('QR picture added. Press "Save settings" to use it.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <form className="page settings" onSubmit={save}>
      <h1 className="page-title">Settings</h1>

      <section className="settings-card">
        <h2>Hotel</h2>
        <Field label="Hotel name (shown to guests)">
          <input className="input" value={s.name} onChange={(e) => set('name', e.target.value)} required maxLength={100} />
        </Field>
      </section>

      <section className="settings-card">
        <h2>Autopilot (automatic replies)</h2>
        <p className="muted small">Answers guests from your <strong>Answers</strong> list and sends requests (towels, cleaning, repairs) straight to the right team. Free, no AI service.</p>
        <div className="mode-grid">
          {MODES.map((m) => (
            <label key={m.key} className={`mode ${s.autopilot_mode === m.key ? 'mode-on' : ''}`}>
              <input type="radio" name="mode" checked={s.autopilot_mode === m.key} onChange={() => set('autopilot_mode', m.key)} />
              <m.Icon size={20} />
              <strong>{m.label}</strong>
              <span className="muted small">{m.help}</span>
            </label>
          ))}
        </div>
        {s.autopilot_mode === 'night' && (
          <div className="row-2">
            <Field label="Night starts"><input className="input" type="time" value={s.night_start} onChange={(e) => set('night_start', e.target.value)} required /></Field>
            <Field label="Night ends"><input className="input" type="time" value={s.night_end} onChange={(e) => set('night_end', e.target.value)} required /></Field>
          </div>
        )}
        <Field label="Time zone" hint="Used for night hours. India: Asia/Kolkata">
          <input className="input" value={s.timezone} onChange={(e) => set('timezone', e.target.value)} required />
        </Field>
      </section>

      <section className="settings-card">
        <h2>Late alerts</h2>
        <Field label="Alert the front desk when a request or order waits longer than (minutes)">
          <input className="input" type="number" min="1" max="240" value={s.escalate_after_minutes} onChange={(e) => set('escalate_after_minutes', e.target.value)} required />
        </Field>
      </section>

      <section className="settings-card">
        <h2>Payments</h2>
        <p className="muted small">Guests see your UPI QR on their bill, pay with any UPI app and send you the UPI reference (UTR). You confirm it in <strong>Bills</strong>. Money goes straight to your account; no fees.</p>
        <div className="photo-picker">
          {s.payment_qr_image_id ? <img src={imageUrl(s.payment_qr_image_id)} alt="Your UPI QR code" /> : <div className="menu-row-noimg"><ImagePlus size={22} /></div>}
          <div className="stack">
            <label className="btn btn-secondary btn-sm">
              {uploading ? <span className="spinner" /> : <><ImagePlus size={14} /> {s.payment_qr_image_id ? 'Change UPI QR picture' : 'Upload UPI QR picture'}</>}
              <input type="file" accept="image/*" hidden onChange={(e) => uploadQr(e.target.files?.[0])} />
            </label>
            {s.payment_qr_image_id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('payment_qr_image_id', null)}><Trash2 size={14} /> Remove</button>}
            <span className="muted small">A photo or screenshot of the QR from your bank / GPay / PhonePe business app.</span>
          </div>
        </div>
        <div className="row-2">
          <Field label="UPI ID (optional)" hint="Lets guests open their UPI app with the amount filled in.">
            <input className="input" value={s.upi_id} onChange={(e) => set('upi_id', e.target.value.trim())} placeholder="hotelname@okaxis" maxLength={100} />
          </Field>
          <Field label="Name on the account">
            <input className="input" value={s.payee_name} onChange={(e) => set('payee_name', e.target.value)} placeholder={s.name} maxLength={100} />
          </Field>
        </div>
        <Field label="GSTIN (printed on bills, optional)">
          <input className="input" value={s.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} placeholder="15 letters and digits" />
        </Field>
        <h3 className="booking-label">GST added to the bill (%)</h3>
        <div className="row-2">
          <Field label="Food (room service + restaurant)"><input className="input" type="number" min="0" max="50" step="0.01" value={s.tax_food_pct} onChange={(e) => set('tax_food_pct', e.target.value)} /></Field>
          <Field label="Vehicles"><input className="input" type="number" min="0" max="50" step="0.01" value={s.tax_vehicle_pct} onChange={(e) => set('tax_vehicle_pct', e.target.value)} /></Field>
        </div>
        <Field label="Other charges (laundry, minibar…)" hint="Use 0 if your prices already include GST. New rates apply to new bill items only.">
          <input className="input" type="number" min="0" max="50" step="0.01" value={s.tax_other_pct} onChange={(e) => set('tax_other_pct', e.target.value)} />
        </Field>
      </section>

      <section className="settings-card">
        <h2>Restaurant table booking</h2>
        <div className="row-2">
          <Field label="Opens"><input className="input" type="time" value={s.restaurant_open} onChange={(e) => set('restaurant_open', e.target.value)} required /></Field>
          <Field label="Closes"><input className="input" type="time" value={s.restaurant_close} onChange={(e) => set('restaurant_close', e.target.value)} required /></Field>
        </div>
        <Field label="A booking holds the table for (minutes)" hint="Guests can book every 30 minutes until 30 minutes before closing. Add your tables in Tables.">
          <input className="input" type="number" min="30" max="300" step="15" value={s.table_booking_minutes} onChange={(e) => set('table_booking_minutes', e.target.value)} required />
        </Field>
      </section>

      <section className="settings-card">
        <h2>Housekeeping</h2>
        <label className="check">
          <input type="checkbox" checked={s.require_inspection} onChange={(e) => set('require_inspection', e.target.checked)} />
          Rooms must be checked by the front desk before they are ready
        </label>
      </section>

      <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? <span className="spinner spinner-light" /> : 'Save settings'}</button>
    </form>
  );
}
