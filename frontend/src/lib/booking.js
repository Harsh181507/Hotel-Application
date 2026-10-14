// Dates and times for bookings. They are always in the hotel's time zone: the server
// sends hotel-local text like "2026-10-14" and "2026-10-14 19:30", so nothing here
// depends on the time zone of the phone or computer.

export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const dayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const shortDayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });

/** "Today", "Tomorrow", "Thu 16" */
export function dayChip(date, today) {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return shortDayFmt.format(new Date(`${date}T00:00:00Z`));
}

/** "Thu, 16 Oct" */
export const dayLong = (date) => dayFmt.format(new Date(`${date}T00:00:00Z`));

/** "19:30" -> "7:30 pm" */
export function time12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Minutes since 1970 for a hotel-local "YYYY-MM-DD HH:MM" (only for comparing). */
export const localMinutes = (local) => Date.parse(`${local.replace(' ', 'T')}:00Z`) / 60_000;

/** "2026-10-14 19:30" + 90 min -> "2026-10-14 21:00" */
export function addMinutesLocal(local, minutes) {
  return new Date((localMinutes(local) + minutes) * 60_000).toISOString().slice(0, 16).replace('T', ' ');
}

/** "7:30 pm" if on `date`, else "Thu, 16 Oct 7:30 pm". */
export function localLabel(local, date = null) {
  const [d, t] = local.split(' ');
  return d === date ? time12(t) : `${dayLong(d)} ${time12(t)}`;
}

/** "10:00 am – 1:00 pm" (with dates when the range crosses days or isn't on `date`). */
export function rangeLabel(startLocal, endLocal, date = null) {
  const sameDay = startLocal.slice(0, 10) === endLocal.slice(0, 10);
  const day = startLocal.slice(0, 10);
  return `${localLabel(startLocal, date)} – ${sameDay ? localLabel(endLocal, day) : localLabel(endLocal, null)}`;
}

/** Every half hour of the day: ["00:00", "00:30", ... "23:30"] */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export const VEHICLE_DURATIONS = [
  { hours: 1, label: '1 hour' }, { hours: 2, label: '2 hours' }, { hours: 3, label: '3 hours' }, { hours: 4, label: '4 hours' },
  { hours: 6, label: '6 hours' }, { hours: 8, label: '8 hours' }, { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' }, { hours: 48, label: '2 days' }, { hours: 72, label: '3 days' },
];

export const PRICE_UNIT = { hour: 'per hour', day: 'per day', trip: 'per trip' };

/** Same rule as the server: hourly, per started day, or one price per trip. */
export function vehiclePrice(vehicle, hours) {
  if (vehicle.priceUnit === 'hour') return vehicle.pricePaise * hours;
  if (vehicle.priceUnit === 'day') return vehicle.pricePaise * Math.ceil(hours / 24);
  return vehicle.pricePaise;
}

export const TABLE_STATUS = {
  confirmed: { label: 'Confirmed', tone: 'green' },
  seated: { label: 'Seated', tone: 'blue' },
  completed: { label: 'Completed', tone: 'grey' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
  no_show: { label: 'No-show', tone: 'red' },
};

export const VEHICLE_STATUS = {
  confirmed: { label: 'Confirmed', tone: 'green' },
  completed: { label: 'Completed', tone: 'grey' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const PAY_STATUS = {
  paid: { label: 'Paid', tone: 'green' },
  pending: { label: 'Checking', tone: 'amber' },
  unpaid: { label: 'Unpaid', tone: 'red' },
};

export const CHARGE_KIND = {
  room_service: 'Room service',
  restaurant: 'Restaurant',
  vehicle: 'Vehicle',
  extra: 'Extra',
  discount: 'Discount',
};

export const PAYMENT_METHOD = { upi: 'UPI', cash: 'Cash', card: 'Card', advance: 'Advance', other: 'Other' };

/** upi://pay link: opens the guest's UPI app with the amount filled in (phones only). */
export function upiLink({ upiId, payeeName }, amountPaise, note) {
  const params = new URLSearchParams({ pa: upiId, pn: payeeName, am: (amountPaise / 100).toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${params}`;
}
