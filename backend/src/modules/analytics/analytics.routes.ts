import { Router } from 'express';

export const analyticsRouter = Router();
analyticsRouter.get('/', (_req, res) => res.json({ module: 'analytics', status: 'ok' }));
