// Entry point:  npm run dev   (auto-restarts when you edit files)
import http from 'node:http';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { createApp } from './app.js';
import { attachSocket } from './socket/index.js';

const server = http.createServer(createApp());
const io = await attachSocket(server);

server.listen(config.port, () => {
  console.log(`API ready on http://localhost:${config.port}`);
});

// Finish in-flight work cleanly when the host restarts/stops the server.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  io.close();
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
