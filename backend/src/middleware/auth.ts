import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthClaims {
  sub: string;
  username: string;
  discordId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthClaims;
    req.user = claims;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const admins = env.ADMIN_DISCORD_IDS.split(',').map((s) => s.trim()).filter(Boolean);
  if (!req.user || !admins.includes(req.user.discordId)) return res.status(403).json({ error: 'Forbidden' });
  next();
}
