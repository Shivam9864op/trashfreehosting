import { Router } from 'express';
import { z } from 'zod';
import { createServer, deleteServer, freePlanConfig, listServers, startServer, stopServer } from './servers.service.js';

const createSchema = z.object({ ramMb: z.number().int().min(1).max(3072).optional() });
const idSchema = z.object({ id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9-_]+$/) });

export const serversRouter = Router();

serversRouter.post('/create-server', async (req, res) => {
  try {
    const { ramMb } = createSchema.parse(req.body ?? {});
    const server = await createServer(ramMb);
    res.status(201).json({ id: server.id, ip: server.ip, port: server.port, status: server.status, limits: freePlanConfig() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create server' });
  }
});

serversRouter.post('/start-server', async (req, res) => {
  try {
    const { id } = idSchema.parse(req.body ?? {});
    const server = await startServer(id);
    res.json({ id: server.id, status: 'running' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to start server' });
  }
});

serversRouter.post('/stop-server', async (req, res) => {
  try {
    const { id } = idSchema.parse(req.body ?? {});
    await stopServer(id);
    res.json({ id, status: 'stopped' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to stop server' });
  }
});

serversRouter.post('/delete-server', async (req, res) => {
  try {
    const { id } = idSchema.parse(req.body ?? {});
    await deleteServer(id);
    res.json({ id, status: 'deleted' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to delete server' });
  }
});

serversRouter.get('/', async (_req, res) => {
  try {
    const servers = await listServers();
    res.json({ servers, limits: freePlanConfig() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to list servers' });
  }
});
