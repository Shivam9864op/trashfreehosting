import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export function captchaGate(req: Request, res: Response, next: NextFunction) {
  const requiresToken = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!requiresToken || !env.CAPTCHA_TOKEN) return next();
  const token = req.header('x-captcha-token');
  if (!token || token !== env.CAPTCHA_TOKEN) {
    return res.status(400).json({ message: 'Valid captcha token required for mutating requests.' });
  }
  return next();
}
