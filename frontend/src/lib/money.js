// Prices are stored in paise (₹1 = 100 paise) so there are no rounding errors.
const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const rupees = (paise) => `${paise < 0 ? '−' : ''}₹${fmt.format(Math.abs(paise ?? 0) / 100)}`;
