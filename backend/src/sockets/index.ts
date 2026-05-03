import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { SOCKET_NAMESPACES } from '../config/constants.js';

export function initSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN } });

  io.of(SOCKET_NAMESPACES.queue).on('connection', (socket) => {
    socket.on('queue:subscribe', (queueId) => socket.join(`queue:${queueId}`));
  });

  io.of(SOCKET_NAMESPACES.serverStatus).on('connection', (socket) => {
    socket.on('server:watch', (serverId) => socket.join(`server:${serverId}`));
  });

  io.of(SOCKET_NAMESPACES.rewards).on('connection', (socket) => {
    socket.on('rewards:subscribe', (userId) => socket.join(`rewards:${userId}`));
  });

  io.of(SOCKET_NAMESPACES.notifications).on('connection', (socket) => {
    socket.on('notifications:subscribe', (userId) => socket.join(`notifications:${userId}`));
  });

  return io;
}
