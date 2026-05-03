import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: [/^https:\/\/.+github\.io$/, 'https://hosting.trashmcpe.com'], credentials: false },
  });

  io.on('connection', (socket) => {
    socket.on('console:subscribe', (serverIdentifier: string) => {
      if (typeof serverIdentifier === 'string') socket.join(`console:${serverIdentifier}`);
    });
  });

  return io;
}

export function emitConsole(serverIdentifier: string, line: string) {
  io?.to(`console:${serverIdentifier}`).emit('console:line', { serverIdentifier, line, ts: Date.now() });
}
