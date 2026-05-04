import express from 'express';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { API_PREFIX, DOCS_PATH } from './config/constants.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { httpLogger } from './middleware/logging.js';
import { apiRateLimiter, corsMiddleware, helmetMiddleware } from './middleware/security.js';
import { captchaGate } from './middleware/captcha.js';
import { v1Router } from './routes/v1.js';
import { openApiSpec } from './docs/openapi.js';
import { logger } from './config/logger.js';
export function createApp() {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(httpLogger);
    app.use(helmetMiddleware);
    app.use(corsMiddleware);
    app.use(compression());
    app.use(express.json());
    app.use(apiRateLimiter);
    app.use(captchaGate);
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.use(DOCS_PATH, swaggerUi.serve, swaggerUi.setup(openApiSpec));
    app.use(API_PREFIX, v1Router);
    app.use((err, _req, res, _next) => {
        logger.error({ err }, 'API error');
        res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
    });
    return app;
}
