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

/**
 * Rate-limit key: prefer the authenticated USER (decoded from the JWT in the
 * Authorization header) so multiple devices behind one IP (office wifi, QA,
 * demos) don't share a single bucket. Falls back to IP for unauthenticated
 * requests. Decoding here (before the auth middleware runs) is a cheap,
 * signature-less payload read — fine for bucketing, not for authz.
 */
function userOrIpKey(req: Request): string {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const part = auth.slice(7).split('.')[1];
      if (part) {
        const payload = JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
        const id = payload?.sub ?? payload?.id ?? payload?.userId;
        if (id) return `u:${id}`;
      }
    } catch {
      /* malformed token → fall back to IP */
    }
  }
  return `ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
}

const ipKey = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';

/**
 * General API limiter. Generous per-USER allowance — the customer app makes many
 * legitimate maps calls per screen (autocomplete, directions, reverse-geocode,
 * thumbnails) plus polling. 300/min per user is plenty for real use while still
 * blocking abuse. (Was 100 per 15 min per IP — far too strict; it 429'd normal
 * usage and surfaced as "Could not compute route".)
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: userOrIpKey,
});

/**
 * Brute-force guard for credential endpoints (login / register / forgot-password
 * / oauth). Per IP. Raised from 10 → 30 per 15 min so legitimate retries during
 * testing/demos don't lock out, while still throttling password guessing.
 * NOTE: token refresh is intentionally NOT on this limiter (see below).
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: ipKey,
});

/**
 * Token-refresh limiter — generous on purpose. Refresh happens often (proactive
 * refresh before opening sockets, long ride sessions). A 429 here cascades into
 * "invalid/expired token" socket failures, so keep the ceiling high.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: userOrIpKey,
});

/** Webhook limiter: more permissive */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});
