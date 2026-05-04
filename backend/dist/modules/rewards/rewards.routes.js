import { Router } from 'express';
export const rewardsRouter = Router();
rewardsRouter.get('/', (_req, res) => res.json({ module: 'rewards', status: 'ok' }));
