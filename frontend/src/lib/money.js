// Prices are stored in paise (₹1 = 100 paise) so there are no rounding errors.
const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const rupees = (paise) => `₹${fmt.format((paise ?? 0) / 100)}`;
