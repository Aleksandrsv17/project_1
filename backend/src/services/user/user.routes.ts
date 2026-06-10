import { Router } from 'express';
import { userController } from './user.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { authRateLimiter, refreshRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

// Public auth routes (rate limited)
router.post('/register', authRateLimiter, userController.register.bind(userController));
router.post('/login', authRateLimiter, userController.login.bind(userController));
router.post('/oauth/taler', authRateLimiter, userController.talerOAuth.bind(userController));
// Taler only accepts WEB redirect_uris (no custom schemes), so the app registers
// this https/http bridge. Taler redirects the browser here with ?code&state; we
// 302 it on to the app's deep link, which the in-app browser hands back to the
// native app (which then POSTs the code to /oauth/taler above).
router.get('/oauth/taler/callback', (req, res) => {
  const qs = new URLSearchParams();
  for (const k of ['code', 'state', 'error', 'error_description'] as const) {
    const v = req.query[k];
    if (typeof v === 'string' && v) qs.set(k, v);
  }
  const target = `talerid://oauth?${qs.toString()}`;
  // Return a tiny HTML page that auto-launches the app deep link, instead of a
  // bare 302. A 302 to a custom scheme inside ASWebAuthenticationSession /
  // Custom Tabs often shows a blank/dark page and doesn't hand back reliably;
  // a visible "Signing you in…" page + JS redirect + tappable fallback is the
  // robust pattern.
  const t = JSON.stringify(target); // safe-escaped for the <script>
  const href = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  res
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bersenev</title><style>html,body{height:100%;margin:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fff;color:#141414;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:24px}p{font-size:16px;color:#6B7280;margin:0}a{background:#141414;color:#fff;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px}</style></head><body><p>Signing you in…</p><a href="${href}">Open Bersenev</a><script>location.replace(${t});setTimeout(function(){location.href=${t};},400);</script></body></html>`);
});
router.post('/refresh', refreshRateLimiter, userController.refresh.bind(userController));

router.post('/forgot-password', authRateLimiter, userController.forgotPassword.bind(userController));

// Protected routes
router.post('/kyc', authenticate, userController.submitKyc.bind(userController));
router.post('/logout', authenticate, userController.logout.bind(userController));
router.get('/profile', authenticate, userController.getProfile.bind(userController));
router.patch('/profile', authenticate, userController.updateProfile.bind(userController));
router.delete('/account', authenticate, userController.deleteAccount.bind(userController));

// Admin routes — accepts JWT auth OR x-admin-key header
router.get(
  '/',
  (req, res, next) => {
    // Admin-key header path: enabled only if ADMIN_API_KEY is set on the server.
    // No insecure default — falls back to authenticated admin JWT.
    const adminKey = req.headers['x-admin-key'];
    if (process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY) {
      return next();
    }
    return authenticate(req, res, () => requireRole('admin')(req, res, next));
  },
  userController.listAll.bind(userController)
);
router.patch('/:id/kyc', authenticate, requireRole('admin'), userController.updateKyc.bind(userController));

export default router;
