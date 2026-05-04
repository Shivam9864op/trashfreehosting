import { Router } from 'express';
import { serversRouter } from '../modules/servers/servers.routes.js';
export const v1Router = Router();
v1Router.use('/', serversRouter);
