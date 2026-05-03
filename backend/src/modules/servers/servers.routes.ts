import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { createServer, deleteServer, getServer, listServers, powerServer, resources, sendCommand } from './servers.service.js';

const createSchema = z.object({ name: z.string().min(1).max(32), ramMb: z.number().int().min(1024).max(12288), diskMb: z.number().int().min(1024).max(20480).optional(), cpu: z.number().int().min(10).max(400).optional() });
const commandSchema = z.object({ command: z.string().min(1).max(180) });
const limiter = rateLimit({ windowMs: 60_000, max: 40 });

export const serversRouter = Router();
serversRouter.use(limiter);

serversRouter.get('/servers', async (_req, res) => res.json(await listServers()));
serversRouter.get('/server/:id', async (req, res) => res.json(await getServer(req.params.id)));
serversRouter.get('/server/:id/resources', async (req, res) => res.json(await resources(req.params.id)));
serversRouter.post('/create-server', async (req, res) => { const body = createSchema.parse(req.body ?? {}); res.status(201).json(await createServer(body)); });
serversRouter.post('/start-server/:id', async (req, res) => res.json(await powerServer(req.params.id, 'start')));
serversRouter.post('/stop-server/:id', async (req, res) => res.json(await powerServer(req.params.id, 'stop')));
serversRouter.delete('/delete-server/:id', async (req, res) => res.json(await deleteServer(req.params.id)));
serversRouter.post('/console/:id', async (req, res) => { const { command } = commandSchema.parse(req.body ?? {}); res.json(await sendCommand(req.params.id, command)); });
