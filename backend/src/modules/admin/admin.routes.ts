import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdminBasic } from '../../middleware/adminAuth.js';
import { buildAdminMetrics } from './admin.service.js';

const limiter = rateLimit({ windowMs: 60_000, max: 30 });
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

export const adminRouter = Router();
adminRouter.use(limiter);
adminRouter.use(requireAdminBasic);

adminRouter.get('/admin/metrics', asyncHandler(async (_req, res) => {
  res.json(await buildAdminMetrics());
}));
