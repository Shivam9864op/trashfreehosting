import { Router } from 'express';

export const serversRouter = Router();
serversRouter.get('/', (_req, res) => res.json({ module: 'servers', status: 'ok' }));
