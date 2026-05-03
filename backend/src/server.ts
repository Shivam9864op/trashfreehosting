import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { initSocketServer } from './sockets/index.js';

const app = createApp();
const server = http.createServer(app);
initSocketServer(server);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API and Socket.IO server started');
});
