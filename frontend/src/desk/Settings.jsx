import { useEffect, useState } from 'react';
import { Bot, Moon, PowerOff } from 'lucide-react';
import { toast } from '../lib/toast.js';
import Field from '../components/Field.jsx';

const MODES = [
  { key: 'always', label: 'Always on', Icon: Bot, help: 'Replies to guests instantly, day and night. Goes quiet while a receptionist is chatting with that guest.' },
  { key: 'night', label: 'Night only', Icon: Moon, help: 'Replies only during night hours. During the day your team answers.' },
  { key: 'off', label: 'Off', Icon: PowerOff, help: 'Only people reply.' },
];

// Hotel settings (admin).
export default function Settings({ call }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('/api/staff/settings').then(setS).catch(() => {}); }, [call]);
  if (!s) return <div className="page"><div className="chat-empty"><span className="spinner" /></div></div>;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setS(await call('/api/staff/settings', { method: 'PUT', body: { ...s, escalate_after_minutes: Number(s.escalate_after_minutes) } }));
      toast('Settings saved', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
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
