// Small wrapper around Socket.IO so routes can push live updates.
// Socket.IO "rooms" used:
//   stay:<id>               -> the guest's devices for one stay
//   hotel:<id>:staff        -> front-desk screens (admin/reception) of a hotel
//   hotel:<id>:dept:<name>  -> department screens (housekeeping/kitchen/maintenance)
let io = null;

export const setIo = (server) => { io = server; };

export const stayChannel = (stayId) => `stay:${stayId}`;
export const staffChannel = (hotelId) => `hotel:${hotelId}:staff`;
export const deptChannel = (hotelId, dept) => `hotel:${hotelId}:dept:${dept}`;

// Sends an event to both the guest and the hotel's front desk.
export function emitToConversation(hotelId, stayId, event, data) {
  io?.to(stayChannel(stayId)).to(staffChannel(hotelId)).emit(event, data);
}

export function emitToStaff(hotelId, event, data) {
  io?.to(staffChannel(hotelId)).emit(event, data);
}

// Front desk + one department (+ optionally the guest). Socket.IO sends each
// connected screen the event once even if it is in several of these rooms.
export function emitOps(hotelId, dept, event, data, stayId = null) {
  if (!io) return;
  let target = io.to(staffChannel(hotelId));
  if (dept && dept !== 'reception') target = target.to(deptChannel(hotelId, dept));
  if (stayId) target = target.to(stayChannel(stayId));
  target.emit(event, data);
}

export function emitToStay(stayId, event, data) {
  io?.to(stayChannel(stayId)).emit(event, data);
}

// Kicks the guest's open connections (after checkout or a code change).
export function endGuestSessions(stayId, reason) {
  if (!io) return;
  io.to(stayChannel(stayId)).emit('session:ended', { reason });
  io.in(stayChannel(stayId)).disconnectSockets(true);
}
