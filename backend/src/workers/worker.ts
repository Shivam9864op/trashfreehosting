import { logger } from '../config/logger.js';

async function runJobs() {
  logger.info('Background worker booted');
  setInterval(() => {
    logger.info({ queue: 'missions' }, 'Polling async job queue');
  }, 5000);
}

void runJobs();
