import { Router } from 'express';
import { paymentController } from './payment.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { webhookRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

// Stripe webhook — raw body required, no auth
router.post(
  '/webhook',
  webhookRateLimiter,
  paymentController.webhook.bind(paymentController)
);

// Protected payment routes
router.post(
  '/intent',
  authenticate,
  paymentController.createPaymentIntent.bind(paymentController)
);

router.get(
  '/booking/:bookingId',
  authenticate,
  paymentController.getByBooking.bind(paymentController)
);

router.post(
  '/refund',
  authenticate,
  requireRole('admin'),
  paymentController.refund.bind(paymentController)
);

export default router;
