import { useCallback, useEffect, useMemo, useState } from 'react';
import { Armchair, CalendarCheck, Car, Minus, Phone, Plus, Users } from 'lucide-react';
import { rupees } from '../lib/money.js';
import { useSocketEvents } from '../lib/useSocket.js';
import {
  addDays, addMinutesLocal, dayChip, dayLong, HALF_HOURS, localMinutes, PRICE_UNIT, rangeLabel, TABLE_STATUS, time12,
  VEHICLE_DURATIONS, VEHICLE_STATUS, vehiclePrice,
} from '../lib/booking.js';
import { toast } from '../lib/toast.js';

const DAYS_SHOWN = 7;

/** Guests book a restaurant table or one of the hotel's vehicles. */
export default function GuestBook({ call, socket, info, active }) {
  const [kind, setKind] = useState('table');
  if (!info) return <div className="chat-empty"><span className="spinner" /></div>;
  return (
    <div className="menu-screen">
      <div className="menu-scroll">
        <div className="menu-hero">
          <h1>Book</h1>
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={kind === 'table'} className={kind === 'table' ? 'on' : ''} onClick={() => setKind('table')}>
              <Armchair size={16} /> Restaurant table
            </button>
            <button role="tab" aria-selected={kind === 'vehicle'} className={kind === 'vehicle' ? 'on' : ''} onClick={() => setKind('vehicle')}>
              <Car size={16} /> Vehicle
            </button>
          </div>
        </div>
        {kind === 'table'
          ? <TableBooking call={call} socket={socket} info={info} active={active} />
          : <VehicleBooking call={call} socket={socket} info={info} active={active} />}
      </div>
    </div>
  );
}

function DayChips({ today, value, onChange }) {
  return (
    <div className="chips">
      {Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i)).map((d) => (
        <button key={d} className={`chip ${d === value ? 'chip-active' : ''}`} onClick={() => onChange(d)}>{dayChip(d, today)}</button>
      ))}
    </div>
  );
}

// ---------- Restaurant table ----------

function TableBooking({ call, socket, info, active }) {
  const today = info.today;
  const [date, setDate] = useState(today);
  const [people, setPeople] = useState(2);
  const [day, setDay] = useState(null);
  const [time, setTime] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);

  const loadSlots = useCallback(() => {
    call(`/api/guest/tables/slots?date=${date}&people=${people}`).then(setDay).catch(() => setDay(null));
  }, [call, date, people]);
  const loadMine = useCallback(() => call('/api/guest/tables/bookings').then(setMine).catch(() => {}), [call]);

  useEffect(() => { if (active) { loadSlots(); loadMine(); } }, [active, loadSlots, loadMine]);
  useEffect(() => { setTime(null); }, [date, people]);
  useSocketEvents(socket, { 'table:updated': () => { loadSlots(); loadMine(); } }, [loadSlots, loadMine]);

  if (!info.restaurant.tables) {
    return <div className="empty-card"><Armchair size={22} /><p>Table booking isn't set up yet. Please message the front desk to reserve a table.</p></div>;
  }

  const book = async () => {
    setBusy(true);
    try {
      await call('/api/guest/tables/bookings', { method: 'POST', body: { date, time, people, note } });
      toast(`Table booked for ${people} at ${time12(time)}`, 'success');
      setTime(null);
      setNote('');
      loadMine();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
      loadSlots();
    }
  };

  const cancel = async (b) => {
    if (!window.confirm(`Cancel your table for ${b.partySize} on ${dayLong(b.startLocal.slice(0, 10))} at ${time12(b.startLocal.slice(11))}?`)) return;
    try {
      await call(`/api/guest/tables/bookings/${b.id}/cancel`, { method: 'POST' });
      loadMine();
      loadSlots();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const maxPeople = Math.max(1, day?.maxSeats || 12);
  const upcoming = mine.filter((b) => b.status === 'confirmed' || b.status === 'seated');

  return (
    <div className="booking">
      <p className="muted small">Restaurant open {time12(info.restaurant.open)} – {time12(info.restaurant.close)}. Your table is kept for {info.restaurant.minutes} minutes.</p>

      <h3 className="booking-label">Day</h3>
      <DayChips today={today} value={date} onChange={setDate} />

      <h3 className="booking-label">Guests</h3>
      <div className="stepper stepper-wide">
        <button onClick={() => setPeople((n) => Math.max(1, n - 1))} aria-label="Fewer people"><Minus size={16} /></button>
        <span><Users size={16} /> {people} {people === 1 ? 'person' : 'people'}</span>
        <button onClick={() => setPeople((n) => Math.min(maxPeople, n + 1))} aria-label="More people"><Plus size={16} /></button>
      </div>

      <h3 className="booking-label">Time</h3>
      {!day ? <span className="spinner" /> : day.slots.every((s) => !s.available) ? (
        <p className="alert alert-info">{people > (day.maxSeats || 0) ? `Our biggest table seats ${day.maxSeats}. Please message the front desk for a bigger group.` : 'No free tables on this day. Please try another day.'}</p>
      ) : (
        <div className="slot-grid">
          {day.slots.map((s) => (
            <button
              key={s.time}
              className={`slot ${time === s.time ? 'on' : ''}`}
              disabled={!s.available}
              title={s.available ? '' : 'Full or past'}
              onClick={() => setTime(s.time)}
            >
              {time12(s.time)}
            </button>
          ))}
        </div>
      )}
      <p className="muted small">Greyed-out times are fully booked (or already past).</p>

      {time && (
        <>
          <textarea className="input" rows={2} maxLength={300} placeholder="Anything we should know? e.g. birthday, high chair, window seat"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={book}>
            {busy ? <span className="spinner spinner-light" /> : `Book table for ${people} · ${dayChip(date, today)} ${time12(time)}`}
          </button>
        </>
      )}

      {upcoming.length > 0 && (
        <div className="my-bookings">
          <h3>Your table bookings</h3>
          {upcoming.map((b) => (
            <div key={b.id} className="booking-card">
              <CalendarCheck size={20} />
              <div>
                <strong>{dayLong(b.startLocal.slice(0, 10))}, {time12(b.startLocal.slice(11))}</strong>
                <span className="muted small">{b.partySize} {b.partySize === 1 ? 'person' : 'people'} · table {b.tableName}{b.note ? ` · ${b.note}` : ''}</span>
              </div>
              <span className={`status status-${TABLE_STATUS[b.status].tone}`}>{TABLE_STATUS[b.status].label}</span>
              {b.status === 'confirmed' && <button className="link-btn" onClick={() => cancel(b)}>Cancel</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Vehicle ----------

function nextHalfHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const mins = h * 60 + m + 30;
  return mins >= 1440 ? null : HALF_HOURS[Math.ceil(mins / 30)] ?? null;
}

function VehicleBooking({ call, socket, info, active }) {
  const today = info.today;
  const [date, setDate] = useState(today);
  const firstToday = nextHalfHour(info.time);
  const times = useMemo(() => (date === today ? HALF_HOURS.filter((t) => firstToday && t >= firstToday) : HALF_HOURS), [date, today, firstToday]);
  const [time, setTime] = useState(firstToday && firstToday > '09:00' ? firstToday : '10:00');
  const [hours, setHours] = useState(2);
  const [vehicles, setVehicles] = useState(null);
  const [mine, setMine] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => call(`/api/guest/vehicles?date=${date}`).then(setVehicles).catch(() => setVehicles([])), [call, date]);
  const loadMine = useCallback(() => call('/api/guest/vehicles/bookings').then(setMine).catch(() => {}), [call]);
  useEffect(() => { if (active) { load(); loadMine(); } }, [active, load, loadMine]);
  useEffect(() => { if (!times.includes(time)) setTime(times[0] ?? '10:00'); }, [times, time]);
  useSocketEvents(socket, { 'vehicle:updated': () => { load(); loadMine(); } }, [load, loadMine]);

  const start = `${date} ${time}`;
  const end = addMinutesLocal(start, hours * 60);
  const clashOf = (v) => v.booked.find((b) => localMinutes(b.startLocal) < localMinutes(end) && localMinutes(b.endLocal) > localMinutes(start));

  const book = async (v) => {
    const price = vehiclePrice(v, hours);
    const gst = info.taxes.vehiclePct ? ` + ${info.taxes.vehiclePct}% GST` : '';
    if (!window.confirm(`Book ${v.name || v.type} on ${rangeLabel(start, end)} for ${rupees(price)}${gst}? It will be added to your room bill.`)) return;
    setBusyId(v.id);
    try {
      await call('/api/guest/vehicles/bookings', { method: 'POST', body: { vehicleId: v.id, date, time, hours } });
      toast('Vehicle booked. The driver\'s details are in your bookings below.', 'success');
      loadMine();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusyId(null);
      load();
    }
  };

  const cancel = async (b) => {
    if (!window.confirm(`Cancel ${b.vehicle.name || b.vehicle.type} on ${rangeLabel(b.startLocal, b.endLocal)}?`)) return;
    try {
      await call(`/api/guest/vehicles/bookings/${b.id}/cancel`, { method: 'POST' });
      loadMine();
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const upcoming = mine.filter((b) => b.status === 'confirmed');

  return (
    <div className="booking">
      <h3 className="booking-label">Day</h3>
      <DayChips today={today} value={date} onChange={setDate} />

      <div className="row-2">
        <label className="field">
          <span className="field-label">From</span>
          <select className="input" value={time} onChange={(e) => setTime(e.target.value)}>
            {times.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">For</span>
          <select className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {VEHICLE_DURATIONS.map((d) => <option key={d.hours} value={d.hours}>{d.label}</option>)}
          </select>
        </label>
      </div>
      {!times.length && <p className="alert alert-info">It's too late to book for today. Please pick another day.</p>}

      {vehicles === null ? <span className="spinner" /> : !vehicles.length ? (
        <div className="empty-card"><Car size={22} /><p>No vehicles are available right now. Please message the front desk.</p></div>
      ) : (
        <div className="vehicle-list">
          {vehicles.map((v) => {
            const clash = clashOf(v);
            const price = vehiclePrice(v, hours);
            return (
              <div key={v.id} className={`vehicle-card ${clash ? 'taken' : ''}`}>
                <div className="vehicle-top">
                  <div className="vehicle-icon"><Car size={22} /></div>
                  <div className="vehicle-info">
                    <strong>{v.name || v.type}</strong>
                    <span className="muted small">{[v.type, `${v.seats} seats`, v.plateNumber].filter(Boolean).join(' · ')}</span>
                    {v.note && <span className="muted small">{v.note}</span>}
                  </div>
                  <div className="vehicle-price">
                    <strong>{rupees(v.pricePaise)}</strong>
                    <span className="muted small">{PRICE_UNIT[v.priceUnit]}</span>
                  </div>
                </div>
                {v.booked.length > 0 && (
                  <div className="vehicle-booked">
                    <span className="muted small">{v.busyNow ? 'Out now. ' : ''}Booked on {dayChip(date, today).toLowerCase()}:</span>
                    {v.booked.map((b) => <span key={b.startLocal} className="status status-grey">{rangeLabel(b.startLocal, b.endLocal, date)}</span>)}
                  </div>
                )}
                {clash ? (
                  <p className="vehicle-clash">Already booked at this time ({rangeLabel(clash.startLocal, clash.endLocal, date)}). Try another time.</p>
                ) : (
                  <button className="btn btn-primary btn-block" disabled={busyId === v.id || !times.length} onClick={() => book(v)}>
                    {busyId === v.id ? <span className="spinner spinner-light" /> : `Book · ${rupees(price)}${info.taxes.vehiclePct ? ' + GST' : ''}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="my-bookings">
          <h3>Your vehicle bookings</h3>
          {upcoming.map((b) => (
            <div key={b.id} className="booking-card">
              <Car size={20} />
              <div>
                <strong>{b.vehicle.name || b.vehicle.type}{b.vehicle.plateNumber ? ` · ${b.vehicle.plateNumber}` : ''}</strong>
                <span className="muted small">{rangeLabel(b.startLocal, b.endLocal)} · {rupees(b.pricePaise)}</span>
                {(b.vehicle.driverName || b.vehicle.driverPhone) && (
                  <span className="small">
                    Driver: {b.vehicle.driverName}
                    {b.vehicle.driverPhone && <> · <a href={`tel:${b.vehicle.driverPhone.replace(/[^0-9+]/g, '')}`}><Phone size={12} /> {b.vehicle.driverPhone}</a></>}
                  </span>
                )}
              </div>
              <span className={`status status-${VEHICLE_STATUS[b.status].tone}`}>{VEHICLE_STATUS[b.status].label}</span>
              {new Date(b.startsAt) > new Date() && <button className="link-btn" onClick={() => cancel(b)}>Cancel</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
