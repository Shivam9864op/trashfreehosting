import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { serversRouter } from '../modules/servers/servers.routes.js';
import { rewardsRouter } from '../modules/rewards/rewards.routes.js';
import { missionsRouter } from '../modules/missions/missions.routes.js';
import { analyticsRouter } from '../modules/analytics/analytics.routes.js';

export const v1Router = Router();
v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/servers', serversRouter);
v1Router.use('/rewards', rewardsRouter);
v1Router.use('/missions', missionsRouter);
v1Router.use('/analytics', analyticsRouter);
