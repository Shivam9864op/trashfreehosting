import { Router } from 'express';
import { login, logout, refresh, register } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from './auth.schemas.js';

export const authRouter = Router();
authRouter.post('/register', validate(registerSchema), register);
authRouter.post('/login', validate(loginSchema), login);
authRouter.post('/refresh', validate(refreshSchema), refresh);
authRouter.post('/logout', validate(logoutSchema), logout);
