import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
let io = null;
export function initSocketServer(httpServer) {
    io = new Server(httpServer, {
        path: '/socket.io',
        cors: { origin: env.corsOrigins, credentials: true },
    });
    io.on('connection', (socket) => {
        logger.info({ id: socket.id }, 'Socket connected');
        socket.on('console:subscribe', (serverIdentifier) => {
            if (typeof serverIdentifier === 'string' && serverIdentifier.trim()) {
                socket.join(`console:${serverIdentifier}`);
                logger.info({ socketId: socket.id, room: `console:${serverIdentifier}` }, 'Socket joined console room');
            }
        });
        socket.on('disconnect', (reason) => {
            logger.warn({ socketId: socket.id, reason }, 'Socket disconnected');
        });
    });
    return io;
}
export function emitConsole(serverIdentifier, line) {
    io?.to(`console:${serverIdentifier}`).emit('console:line', { serverIdentifier, line, ts: Date.now() });
}
