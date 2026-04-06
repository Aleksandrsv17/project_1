import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

const rateLimitResponse = (_req: Request, res: Response): void => {
  res.status(429).json({
    success: false,
    error: {
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
    },
  });
};

/** General API rate limiter: 100 requests per 15 minutes */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: (req: Request) => {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  },
});

/** Strict limiter for auth endpoints: 10 requests per 15 minutes */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: (req: Request) => {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  },
});

/** Webhook limiter: more permissive */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});
