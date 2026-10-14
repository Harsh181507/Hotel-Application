import { useCallback, useEffect, useState } from 'react';
import { Car, ChevronLeft, ChevronRight, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { rupees } from '../lib/money.js';
import { useSocketEvents } from '../lib/useSocket.js';
import { addDays, dayChip, dayLong, PRICE_UNIT, rangeLabel, time12, VEHICLE_STATUS } from '../lib/booking.js';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';

const localToday = () => new Date().toLocaleDateString('en-CA');
const TYPES = ['Car', 'SUV', 'Sedan', 'Hatchback', 'Tempo Traveller', 'Bus', 'Bike', 'Scooter', 'Auto'];

/** Vehicle bookings for a day, and the hotel's vehicles (front desk). */
export default function Vehicles({ call, socket }) {
  const today = localToday();
  const [date, setDate] = useState(today);
  const [bookings, setBookings] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [editing, setEditing] = useState(null); // vehicle or {} for new

  const loadBookings = useCallback(() => {
    call(`/api/staff/vehicles/bookings?date=${date}`).then(setBookings).catch(() => setBookings([]));
  }, [call, date]);
  const loadVehicles = useCallback(() => call('/api/staff/vehicles').then(setVehicles).catch(() => setVehicles([])), [call]);
  useEffect(() => { loadBookings(); }, [loadBookings]);
  useEffect(() => { loadVehicles(); }, [loadVehicles]);
  useSocketEvents(socket, { 'vehicle:booked': loadBookings, 'vehicle:updated': loadBookings, connect: loadBookings }, [loadBookings]);

  const setStatus = async (b, status) => {
    if (status === 'cancelled' && !window.confirm(`Cancel ${b.vehicle.name || b.vehicle.type} for Room ${b.roomNumber}? It will be removed from their bill.`)) return;
    try {
      await call(`/api/staff/vehicles/bookings/${b.id}`, { method: 'PATCH', body: { status } });
      loadBookings();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const save = async (v, id) => {
    await call(id ? `/api/staff/vehicles/${id}` : '/api/staff/vehicles', { method: id ? 'PUT' : 'POST', body: v });
    setEditing(null);
    loadVehicles();
  };

  const toggle = (v) => save({ ...v, available: !v.available }, v.id).catch((err) => toast(err.message, 'error'));
  const remove = async (v) => {
    if (!window.confirm(`Remove ${v.name || v.type} (${v.plateNumber || 'no number'}) from the list?`)) return;
    try {
      await call(`/api/staff/vehicles/${v.id}`, { method: 'DELETE' });
      loadVehicles();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vehicles</h1>
          <p className="muted">{dayLong(date)} · {(() => { const n = (bookings || []).filter((b) => b.status !== 'cancelled').length; return `${n} booking${n === 1 ? '' : 's'}`; })()}</p>
        </div>
        <div className="day-nav">
          <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={20} /></button>
          <strong>{dayChip(date, today)}</strong>
          <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={20} /></button>
          {date !== today && <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)}>Today</button>}
        </div>
      </div>

      {bookings === null ? <span className="spinner" /> : !bookings.length ? (
        <div className="empty-card"><Car size={22} /><p>No vehicle bookings on this day.</p></div>
      ) : (
        <div className="list-card">
          {bookings.map((b) => (
            <div key={b.id} className={`list-row ${b.status === 'confirmed' ? '' : 'dim'}`}>
              <span className="list-row-time">{b.startLocal.slice(0, 10) === date ? time12(b.startLocal.slice(11)) : 'Earlier'}</span>
              <div className="list-row-main">
                <strong>{b.vehicle.name || b.vehicle.type}{b.vehicle.plateNumber ? ` · ${b.vehicle.plateNumber}` : ''}</strong>
                <span className="muted small">{rangeLabel(b.startLocal, b.endLocal, date)} · Room {b.roomNumber} · {b.guestName} · {rupees(b.pricePaise)}</span>
                {b.vehicle.driverName && <span className="small">Driver {b.vehicle.driverName}{b.vehicle.driverPhone ? ` · ${b.vehicle.driverPhone}` : ''}</span>}
                {b.note && <span className="small">“{b.note}”</span>}
              </div>
              <div className="list-row-side">
                <span className={`status status-${VEHICLE_STATUS[b.status].tone}`}>{VEHICLE_STATUS[b.status].label}</span>
                {b.status === 'confirmed' && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => setStatus(b, 'completed')}>Done</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setStatus(b, 'cancelled')}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="page-head" style={{ marginTop: 28 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Our vehicles</h2>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add vehicle</button>
      </div>
      {vehicles === null ? <span className="spinner" /> : !vehicles.length ? (
        <div className="empty-card"><Car size={22} /><p>No vehicles yet. Add the cars, bikes or tempo travellers guests can book.</p></div>
      ) : (
        <div className="list-card">
          {vehicles.map((v) => (
            <div key={v.id} className={`list-row fleet-row ${v.available ? '' : 'dim'}`}>
              <div className="vehicle-icon"><Car size={20} /></div>
              <div className="list-row-main">
                <strong>{v.name || v.type} {v.plateNumber && <span className="muted">· {v.plateNumber}</span>}</strong>
                <span className="muted small">{v.type} · {v.seats} seats · {rupees(v.pricePaise)} {PRICE_UNIT[v.priceUnit]}</span>
                {(v.driverName || v.driverPhone) && <span className="small"><Phone size={12} /> {[v.driverName, v.driverPhone].filter(Boolean).join(' · ')}</span>}
              </div>
              <div className="list-row-side">
                <label className="switch" title="Guests can book it">
                  <input type="checkbox" checked={v.available} onChange={() => toggle(v)} />
                  <span /> {v.available ? 'Available' : 'Not available'}
                </label>
                <button className="icon-btn" aria-label="Edit" onClick={() => setEditing(v)}><Pencil size={16} /></button>
                <button className="icon-btn" aria-label="Remove" onClick={() => remove(v)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <VehicleModal vehicle={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function VehicleModal({ vehicle, onClose, onSave }) {
  const [v, setV] = useState({
    type: 'Car', name: '', plateNumber: '', seats: 4, driverName: '', driverPhone: '', priceUnit: 'hour', available: true, note: '',
    ...vehicle,
    price: vehicle.pricePaise != null ? String(vehicle.pricePaise / 100) : '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, value) => setV((x) => ({ ...x, [k]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { price, id, ...rest } = v;
      await onSave({ ...rest, seats: Number(v.seats), pricePaise: Math.round(Number.parseFloat(price || '0') * 100) }, vehicle.id);
      toast('Vehicle saved', 'success');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title={vehicle.id ? 'Edit vehicle' : 'Add a vehicle'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="row-2">
          <Field label="Type">
            <input className="input" list="vehicle-types" value={v.type} onChange={(e) => set('type', e.target.value)} required maxLength={40} />
            <datalist id="vehicle-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Model / name (optional)"><input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="e.g. Swift Dzire (AC)" /></Field>
        </div>
        <div className="row-2">
          <Field label="Vehicle number"><input className="input" value={v.plateNumber} onChange={(e) => set('plateNumber', e.target.value.toUpperCase())} maxLength={20} placeholder="JH 01 AB 1234" /></Field>
          <Field label="Seats"><input className="input" type="number" min="1" max="60" value={v.seats} onChange={(e) => set('seats', e.target.value)} required /></Field>
        </div>
        <div className="row-2">
          <Field label="Owner / driver name"><input className="input" value={v.driverName} onChange={(e) => set('driverName', e.target.value)} maxLength={80} /></Field>
          <Field label="Owner / driver phone" hint="Guests see it after booking."><input className="input" type="tel" value={v.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} maxLength={20} /></Field>
        </div>
        <div className="row-2">
          <Field label="Price (₹, before GST)"><input className="input" type="number" min="0" step="0.01" value={v.price} onChange={(e) => set('price', e.target.value)} required /></Field>
          <Field label="Charged">
            <select className="input" value={v.priceUnit} onChange={(e) => set('priceUnit', e.target.value)}>
              <option value="hour">per hour</option><option value="day">per day</option><option value="trip">per trip</option>
            </select>
          </Field>
        </div>
        <Field label="Note for guests (optional)"><input className="input" value={v.note} onChange={(e) => set('note', e.target.value)} maxLength={200} placeholder="e.g. Fuel included, max 80 km per day" /></Field>
        <label className="check"><input type="checkbox" checked={v.available} onChange={(e) => set('available', e.target.checked)} /> Guests can book it</label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <span className="spinner spinner-light" /> : 'Save vehicle'}</button>
      </form>
    </Modal>
  );
}
