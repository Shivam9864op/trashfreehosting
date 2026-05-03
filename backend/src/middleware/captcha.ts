import { NextFunction, Request, Response } from 'express';

export function captchaGate(req: Request, res: Response, next: NextFunction) {
  const token = req.header('x-captcha-token');
  if (!token && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(400).json({ message: 'Captcha token required for mutating requests.' });
  }
  return next();
}
