// Kinds of service request a guest can raise. To add one, add it here AND
// to the CHECK constraint on requests.type in src/db/schema.sql.
export const REQUEST_LABELS = {
  housekeeping: 'Room cleaning',
  food: 'Food order',
  maintenance: 'Maintenance',
  amenities: 'Extra amenities',
  other: 'Other',
};
export const REQUEST_TYPES = Object.keys(REQUEST_LABELS);

export const STATUS_LABELS = {
  open: 'received',
  in_progress: 'in progress',
  done: 'done',
  cancelled: 'cancelled',
};
