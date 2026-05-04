import { Router } from 'express';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { eventsRouter } from '../modules/events/events.routes.js';
import { serversRouter } from '../modules/servers/servers.routes.js';

export const v1Router = Router();
v1Router.use('/', serversRouter);
v1Router.use('/', eventsRouter);
v1Router.use('/', adminRouter);
