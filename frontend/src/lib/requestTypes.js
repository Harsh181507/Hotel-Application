import { Sparkles, UtensilsCrossed, Wrench, Gift, MessageCircleMore } from 'lucide-react';

// Must match REQUEST_LABELS in the backend (src/lib/requestTypes.js).
export const REQUEST_TYPES = [
  { type: 'housekeeping', label: 'Room cleaning', Icon: Sparkles, hint: 'e.g. Please clean the room at 3 PM' },
  { type: 'food', label: 'Food order', Icon: UtensilsCrossed, hint: 'e.g. 2 masala chai and a club sandwich' },
  { type: 'maintenance', label: 'Maintenance', Icon: Wrench, hint: 'e.g. The AC is not cooling' },
  { type: 'amenities', label: 'Extra amenities', Icon: Gift, hint: 'e.g. 2 extra towels and a pillow' },
  { type: 'other', label: 'Something else', Icon: MessageCircleMore, hint: 'Tell us what you need' },
];

export const requestType = (type) => REQUEST_TYPES.find((r) => r.type === type) || REQUEST_TYPES.at(-1);

export const STATUS = {
  open: { label: 'New', tone: 'amber' },
  in_progress: { label: 'Accepted', tone: 'blue' },
  done: { label: 'Done', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const DEPARTMENTS = {
  reception: 'Front desk',
  housekeeping: 'Housekeeping',
  kitchen: 'Kitchen',
  maintenance: 'Maintenance',
};

export const ROLES = {
  admin: 'Admin',
  reception: 'Front desk',
  housekeeping: 'Housekeeping',
  kitchen: 'Kitchen',
  maintenance: 'Maintenance',
};

export const isDeskRole = (role) => role === 'admin' || role === 'reception';

export const ORDER_STATUS = {
  placed: { label: 'Order placed', short: 'New', tone: 'amber' },
  preparing: { label: 'Being prepared', short: 'Preparing', tone: 'blue' },
  on_the_way: { label: 'On the way', short: 'On the way', tone: 'blue' },
  delivered: { label: 'Delivered', short: 'Delivered', tone: 'green' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', tone: 'grey' },
};
export const ORDER_STEPS = ['placed', 'preparing', 'on_the_way', 'delivered'];

export const HK_STATUS = {
  dirty: { label: 'Needs cleaning', short: 'Dirty', tone: 'red' },
  cleaning: { label: 'Being cleaned', short: 'Cleaning', tone: 'blue' },
  inspect: { label: 'Waiting for check', short: 'Inspect', tone: 'amber' },
  ready: { label: 'Ready', short: 'Ready', tone: 'green' },
};
