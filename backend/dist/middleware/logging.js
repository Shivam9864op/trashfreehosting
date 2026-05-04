import pinoHttp from 'pino-http';
import { logger } from '../config/logger.js';
export const httpLogger = pinoHttp({
    logger,
    customProps(req) {
        return { requestId: req.requestId };
    },
});
