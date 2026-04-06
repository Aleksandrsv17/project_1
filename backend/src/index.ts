import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { trackingGateway } from './services/tracking/tracking.gateway';
import { pool, checkConnection } from './db';
import { config } from './config';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  // ── Verify database connection ─────────────────────────────────────────────
  const dbConnected = await checkConnection();
  if (!dbConnected) {
    logger.error('Failed to connect to database. Exiting.');
    process.exit(1);
  }
  logger.info('Database connection established');

  // ── Create Express app ─────────────────────────────────────────────────────
  const app = createApp();

  // ── Create HTTP server ─────────────────────────────────────────────────────
  const server = http.createServer(app);

  // ── Initialize Socket.io tracking gateway ─────────────────────────────────
  trackingGateway.initialize(server);
  logger.info('Real-time tracking gateway initialized');

  // ── Start listening ────────────────────────────────────────────────────────
  server.listen(config.port, () => {
    logger.info(`VIP Mobility API running`, {
      port: config.port,
      env: config.env,
      url: `http://localhost:${config.port}`,
    });
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await pool.end();
        logger.info('Database pool closed');
      } catch (err) {
        logger.error('Error closing database pool', { error: err });
      }

      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force exit after 30s if graceful shutdown fails
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed', { error: err });
  process.exit(1);
});
