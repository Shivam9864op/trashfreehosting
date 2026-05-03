import { Router } from 'express';

export const missionsRouter = Router();
missionsRouter.get('/', (_req, res) => res.json({ module: 'missions', status: 'ok' }));
