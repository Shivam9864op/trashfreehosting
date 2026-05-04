import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let warnedMissingToken = false;

export function captchaGate(req: Request, res: Response, next: NextFunction) {
  const requiresToken = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!requiresToken) return next();
  if (!env.CAPTCHA_TOKEN) {
    if (!warnedMissingToken) {
      warnedMissingToken = true;
      logger.warn('CAPTCHA_TOKEN not configured; mutating requests are not protected.');
    }
    return next();
  }
  const token = req.header('x-captcha-token');
  if (!token || token !== env.CAPTCHA_TOKEN) {
    return res.status(400).json({ message: 'Valid captcha token required for mutating requests.' });
  }
  return next();
}
