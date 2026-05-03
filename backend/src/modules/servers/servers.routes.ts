import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { createServer, deleteServer, freePlanConfig, getProcess, getServer, listServers, startServer, stopServer } from './servers.service.js';

const createSchema = z.object({ name: z.string().min(1).max(32), ramMb: z.number().int().min(512).max(3072), edition: z.string().optional(), type: z.string().optional() });
const idSchema = z.object({ id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9-_]+$/) });

export const serversRouter = Router();
serversRouter.use(requireAuth);

serversRouter.get('/', async (req, res) => res.json({ servers: await listServers(req.user!.sub), limits: freePlanConfig() }));
serversRouter.get('/server/:id', async (req, res) => { const s = await getServer(req.user!.sub, req.params.id); if (!s) return res.status(404).json({ error: 'Not found' }); res.json(s); });
serversRouter.post('/create-server', async (req, res) => { try { const body = createSchema.parse(req.body ?? {}); const s = await createServer(req.user!.sub, body); res.status(201).json(s); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'create failed' }); } });
serversRouter.post('/start-server', async (req, res) => { try { const { id } = idSchema.parse(req.body ?? {}); const s = await startServer(req.user!.sub, id); res.json({ serverId: s.serverId, status: s.status }); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'start failed' }); } });
serversRouter.post('/stop-server', async (req, res) => { try { const { id } = idSchema.parse(req.body ?? {}); await stopServer(req.user!.sub, id); res.json({ serverId: id, status: 'stopped' }); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'stop failed' }); } });
serversRouter.post('/delete-server', async (req, res) => { try { const { id } = idSchema.parse(req.body ?? {}); await deleteServer(req.user!.sub, id); res.json({ serverId: id, status: 'deleted' }); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'delete failed' }); } });
serversRouter.post('/console-command', async (req, res) => { try { const { id, command } = z.object({ id: z.string(), command: z.string().min(1).max(180) }).parse(req.body ?? {}); const p = getProcess(id); if (!p) return res.status(400).json({ error: 'Server offline' }); p.stdin.write(command + '\n'); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'command failed' }); } });
