// Live updates over WebSockets (Socket.IO).
//
// Sending messages goes through the REST API (POST .../messages) so it gets
// validation, rate limiting and a saved copy. The socket only PUSHES events:
//   message:new, messages:read, request:new, request:updated,
//   stay:updated, session:ended, typing
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { authenticate } from '../lib/tokens.js';
import { setIo, staffChannel, stayChannel } from '../lib/realtime.js';

export async function attachSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.allowedOrigins, credentials: true },
  });

  // With several server instances, Redis relays events between them.
  if (config.redisUrl) {
    const pub = createClient({ url: config.redisUrl });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    console.log('Socket.IO using Redis adapter');
  }

  // Client connects with:  io(URL, { auth: { token } })
  io.use(async (socket, next) => {
    try {
      socket.data.user = await authenticate(socket.handshake.auth?.token);
      next();
    } catch (err) {
      next(new Error(err.message || 'Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    if (user.type === 'guest') {
      socket.join(stayChannel(user.stayId));
      socket.on('typing', () => {
        socket.to(staffChannel(user.hotelId)).emit('typing', { stayId: user.stayId, from: 'guest' });
      });
    } else {
      socket.join(staffChannel(user.hotelId));
      socket.on('typing', async ({ stayId } = {}) => {
        const { rows: [ok] } = await query(
          'SELECT 1 FROM stays WHERE id = $1 AND hotel_id = $2 AND active',
          [Number(stayId) || 0, user.hotelId],
        ).catch(() => ({ rows: [] }));
        if (ok) socket.to(stayChannel(stayId)).emit('typing', { stayId, from: 'staff' });
      });
    }
  });

  setIo(io);
  return io;
}
