import { Request, Response, NextFunction } from 'express';
import { bookingService } from './booking.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  createBookingSchema,
  cancelBookingSchema,
  confirmPaymentSchema,
  completeBookingSchema,
  bookingQuerySchema,
  validate,
} from '../../utils/validators';
import { ValidationError } from '../../middleware/errorHandler';

export class BookingController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(createBookingSchema, req.body);
      if (error) throw new ValidationError(error);

      const result = await bookingService.create(authReq.user.sub, value);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const booking = await bookingService.findById(
        req.params.id,
        authReq.user.sub,
        authReq.user.role
      );

      res.status(200).json({ success: true, data: { booking } });
    } catch (err) {
      next(err);
    }
  }

  async myBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(bookingQuerySchema, req.query);
      if (error) throw new ValidationError(error);

      const { bookings, total } = await bookingService.findByCustomer(
        authReq.user.sub,
        value.status,
        value.page,
        value.limit
      );

      res.status(200).json({
        success: true,
        data: {
          bookings,
          pagination: {
            total,
            page: value.page,
            limit: value.limit,
            pages: Math.ceil(total / value.limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async ownerBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(bookingQuerySchema, req.query);
      if (error) throw new ValidationError(error);

      const { bookings, total } = await bookingService.findByOwner(
        authReq.user.sub,
        value.status,
        value.page,
        value.limit
      );

      res.status(200).json({
        success: true,
        data: {
          bookings,
          pagination: {
            total,
            page: value.page,
            limit: value.limit,
            pages: Math.ceil(total / value.limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(confirmPaymentSchema, req.body);
      if (error) throw new ValidationError(error);

      const booking = await bookingService.confirm(
        value.booking_id,
        value.payment_intent_id,
        authReq.user.sub
      );

      res.status(200).json({ success: true, data: { booking } });
    } catch (err) {
      next(err);
    }
  }

  async startRide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const booking = await bookingService.startRide(req.params.id, authReq.user.sub);
      res.status(200).json({ success: true, data: { booking } });
    } catch (err) {
      next(err);
    }
  }

  async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(completeBookingSchema, req.body ?? {});
      if (error) throw new ValidationError(error);
      const booking = await bookingService.complete(req.params.id, authReq.user.sub, value.extra_km);
      res.status(200).json({ success: true, data: { booking } });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(cancelBookingSchema, req.body);
      if (error) throw new ValidationError(error);

      const booking = await bookingService.cancel(
        req.params.id,
        authReq.user.sub,
        authReq.user.role,
        value.cancellation_reason
      );

      res.status(200).json({ success: true, data: { booking } });
    } catch (err) {
      next(err);
    }
  }
  async earningsSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const summary = await bookingService.getEarningsSummary(authReq.user.sub);
      res.status(200).json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }

  async rate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { rating, review } = req.body as { rating?: number; review?: string };
      if (!rating) throw new ValidationError('rating is required (1-5)');

      const booking = await bookingService.rateBooking(req.params.id, authReq.user.sub, rating, review);
      res.status(200).json({ success: true, data: { booking } });
    } catch (err) {
      next(err);
    }
  }
}

export const bookingController = new BookingController();
