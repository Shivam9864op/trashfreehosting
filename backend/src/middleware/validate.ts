import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';

export const validate = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
  const parsed = schema.safeParse({ body: req.body, params: req.params, query: req.query });
  if (!parsed.success) {
    return res.status(422).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }
  next();
};
