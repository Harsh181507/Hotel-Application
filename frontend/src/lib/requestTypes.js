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
  open: { label: 'Received', tone: 'amber' },
  in_progress: { label: 'In progress', tone: 'blue' },
  done: { label: 'Done', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};
