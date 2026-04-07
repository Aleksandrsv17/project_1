import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiRateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { config } from './config';

// Route imports
import userRoutes from './services/user/user.routes';
import vehicleRoutes from './services/vehicle/vehicle.routes';
import bookingRoutes from './services/booking/booking.routes';
import paymentRoutes from './services/payment/payment.routes';
import chauffeurRoutes from './services/chauffeur/chauffeur.routes';
import mapsRoutes from './services/maps/maps.routes';

export function createApp(): Application {
  const app = express();

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
    })
  );

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.cors.origin.split(',').map(s => s.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
    })
  );

  // ── Raw body for Stripe webhooks (must come before json parser) ────────────
  app.use(
    '/v1/payments/webhook',
    express.raw({ type: 'application/json' })
  );

  // ── Body parsers ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Global rate limiter ─────────────────────────────────────────────────────
  app.use('/v1', apiRateLimiter);

  // ── Health check ────────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      env: config.env,
    });
  });

  // ── API Routes ──────────────────────────────────────────────────────────────
  app.use('/v1/auth', userRoutes);
  app.use('/v1/vehicles', vehicleRoutes);
  app.use('/v1/bookings', bookingRoutes);
  app.use('/v1/payments', paymentRoutes);
  app.use('/v1/chauffeurs', chauffeurRoutes);
  app.use('/v1/maps', mapsRoutes);

  // ── 404 catch-all ───────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ── Error handler (must be last) ────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
