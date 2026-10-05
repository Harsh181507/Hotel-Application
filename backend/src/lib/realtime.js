// Small wrapper around Socket.IO so routes can push live updates.
// Socket.IO "rooms" used:
//   stay:<id>          -> the guest's devices for one stay
//   hotel:<id>:staff   -> every logged-in front-desk screen of a hotel
let io = null;

export const setIo = (server) => { io = server; };

export const stayChannel = (stayId) => `stay:${stayId}`;
export const staffChannel = (hotelId) => `hotel:${hotelId}:staff`;

// Sends an event to both the guest and the hotel's staff.
export function emitToConversation(hotelId, stayId, event, data) {
  io?.to(stayChannel(stayId)).to(staffChannel(hotelId)).emit(event, data);
}

export function emitToStaff(hotelId, event, data) {
  io?.to(staffChannel(hotelId)).emit(event, data);
}

// Kicks the guest's open connections (after checkout or a code change).
export function endGuestSessions(stayId, reason) {
  if (!io) return;
  io.to(stayChannel(stayId)).emit('session:ended', { reason });
  io.in(stayChannel(stayId)).disconnectSockets(true);
}
