import Stripe from 'stripe';
import { config } from '../../config';
import { query } from '../../db';
import { AppError, NotFoundError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });

export interface Payment {
  id: string;
  booking_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  type: 'booking' | 'deposit' | 'refund' | 'settlement';
  created_at: Date;
  updated_at: Date;
}

export class PaymentService {
  async getByBooking(bookingId: string, userId: string, userRole: string): Promise<Payment[]> {
    // Verify user has access to this booking
    const booking = await query<{ customer_id: string; vehicle_id: string }>(
      'SELECT customer_id, vehicle_id FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (!booking.rows[0]) throw new NotFoundError('Booking');

    if (userRole !== 'admin' && booking.rows[0].customer_id !== userId) {
      const vehicle = await query<{ owner_id: string }>(
        'SELECT owner_id FROM vehicles WHERE id = $1',
        [booking.rows[0].vehicle_id]
      );
      if (vehicle.rows[0]?.owner_id !== userId) {
        throw new AppError('Forbidden: You do not have access to these payments', 403);
      }
    }

    const result = await query<Payment>(
      'SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC',
      [bookingId]
    );

    return result.rows;
  }

  async createPaymentIntent(bookingId: string, customerId: string): Promise<{ clientSecret: string }> {
    const booking = await query<{ customer_id: string; total_amount: number; status: string }>(
      'SELECT customer_id, total_amount, status FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (!booking.rows[0]) throw new NotFoundError('Booking');
    if (booking.rows[0].customer_id !== customerId) {
      throw new AppError('Forbidden', 403);
    }
    if (booking.rows[0].status !== 'pending') {
      throw new AppError('Booking is not in pending state', 400);
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(booking.rows[0].total_amount) * 100),
      currency: 'usd',
      metadata: { booking_id: bookingId, customer_id: customerId },
    });

    await query(
      `INSERT INTO payments (booking_id, stripe_payment_intent_id, amount, currency, status, type)
       VALUES ($1, $2, $3, 'USD', 'pending', 'booking')
       ON CONFLICT (stripe_payment_intent_id) DO NOTHING`,
      [bookingId, paymentIntent.id, booking.rows[0].total_amount]
    );

    if (!paymentIntent.client_secret) {
      throw new AppError('Failed to create payment intent', 500);
    }

    return { clientSecret: paymentIntent.client_secret };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripe.webhookSecret
      );
    } catch (err) {
      logger.error('Stripe webhook signature verification failed', { error: err });
      throw new AppError('Invalid webhook signature', 400);
    }

    logger.info('Processing Stripe webhook', { type: event.type, id: event.id });

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.handlePaymentSuccess(paymentIntent);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.handlePaymentFailed(paymentIntent);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await this.handleRefund(charge);
        break;
      }

      default:
        logger.debug('Unhandled webhook event type', { type: event.type });
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const bookingId = paymentIntent.metadata?.booking_id;
    if (!bookingId) return;

    await query(
      `UPDATE payments
       SET status = 'completed', stripe_charge_id = $1, updated_at = NOW()
       WHERE stripe_payment_intent_id = $2`,
      [paymentIntent.latest_charge as string, paymentIntent.id]
    );

    await query(
      "UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1 AND status = 'pending'",
      [bookingId]
    );

    logger.info('Payment succeeded', { paymentIntentId: paymentIntent.id, bookingId });
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const bookingId = paymentIntent.metadata?.booking_id;
    if (!bookingId) return;

    await query(
      `UPDATE payments SET status = 'failed', updated_at = NOW()
       WHERE stripe_payment_intent_id = $1`,
      [paymentIntent.id]
    );

    logger.warn('Payment failed', { paymentIntentId: paymentIntent.id, bookingId });
  }

  private async handleRefund(charge: Stripe.Charge): Promise<void> {
    if (!charge.payment_intent) return;

    await query(
      `UPDATE payments SET status = 'refunded', updated_at = NOW()
       WHERE stripe_charge_id = $1`,
      [charge.id]
    );

    logger.info('Charge refunded', { chargeId: charge.id });
  }

  async refund(bookingId: string, adminId: string, amount?: number): Promise<Payment> {
    const payments = await query<Payment>(
      `SELECT * FROM payments
       WHERE booking_id = $1 AND type = 'booking' AND status = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId]
    );

    const payment = payments.rows[0];
    if (!payment) throw new NotFoundError('Completed payment for this booking');
    if (!payment.stripe_payment_intent_id) throw new AppError('No Stripe payment intent found', 400);

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: payment.stripe_payment_intent_id,
    };

    if (amount) {
      refundParams.amount = Math.round(amount * 100);
    }

    const refund = await stripe.refunds.create(refundParams);

    await query(
      `UPDATE payments SET status = 'refunded', updated_at = NOW()
       WHERE id = $1`,
      [payment.id]
    );

    // Create refund record
    const refundRecord = await query<Payment>(
      `INSERT INTO payments
        (booking_id, stripe_payment_intent_id, amount, currency, status, type)
       VALUES ($1, $2, $3, $4, 'completed', 'refund')
       RETURNING *`,
      [
        bookingId,
        refund.id,
        amount ?? payment.amount,
        payment.currency,
      ]
    );

    logger.info('Manual refund processed', { bookingId, adminId, refundId: refund.id });

    return refundRecord.rows[0];
  }
}

export const paymentService = new PaymentService();
