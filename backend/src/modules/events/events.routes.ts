import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { recordAuthEvent } from './events.service.js';

const authEventSchema = z.object({
  type: z.enum(['login', 'register']),
  username: z.string().min(3).max(20),
});

const limiter = rateLimit({ windowMs: 60_000, max: 60 });
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

export const eventsRouter = Router();
eventsRouter.use(limiter);

eventsRouter.post('/events/auth', asyncHandler(async (req, res) => {
  const body = authEventSchema.parse(req.body ?? {});
  await recordAuthEvent({
    type: body.type,
    username: body.username,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? 'unknown',
  });
  res.status(201).json({ ok: true });
}));
