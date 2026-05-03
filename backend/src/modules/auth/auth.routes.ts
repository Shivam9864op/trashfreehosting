import { Router } from 'express';
import { discordCallback, discordLoginUrl, logout, me } from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.js';

export const authRouter = Router();
authRouter.get('/discord/url', discordLoginUrl);
authRouter.get('/discord/callback', discordCallback);
authRouter.get('/me', requireAuth, me);
authRouter.post('/logout', requireAuth, logout);
