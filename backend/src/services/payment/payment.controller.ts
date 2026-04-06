import { Request, Response, NextFunction } from 'express';
import { paymentService } from './payment.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { ValidationError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

export class PaymentController {
  async getByBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const payments = await paymentService.getByBooking(
        req.params.bookingId,
        authReq.user.sub,
        authReq.user.role
      );

      res.status(200).json({ success: true, data: { payments } });
    } catch (err) {
      next(err);
    }
  }

  async createPaymentIntent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { booking_id } = req.body as { booking_id?: string };

      if (!booking_id) {
        throw new ValidationError('booking_id is required');
      }

      const result = await paymentService.createPaymentIntent(booking_id, authReq.user.sub);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string;

      if (!signature) {
        res.status(400).json({ success: false, error: { message: 'Missing stripe-signature header' } });
        return;
      }

      await paymentService.handleWebhook(req.body as Buffer, signature);
      res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  }

  async refund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { booking_id, amount } = req.body as { booking_id?: string; amount?: number };

      if (!booking_id) {
        throw new ValidationError('booking_id is required');
      }

      const payment = await paymentService.refund(booking_id, authReq.user.sub, amount);
      res.status(200).json({ success: true, data: { payment } });
    } catch (err) {
      next(err);
    }
  }
}

export const paymentController = new PaymentController();
