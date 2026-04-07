import Stripe from 'stripe';
import { query, withTransaction, pool } from '../../db';
import { config } from '../../config';
import {
  Booking,
  BookingWithDetails,
  CreateBookingDto,
  BookingStatus,
} from './booking.model';
import { Vehicle } from '../vehicle/vehicle.model';
import { calculatePrice, BookingMode, BookingType } from '../../utils/pricing';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });

export class BookingService {
  async create(
    customerId: string,
    dto: CreateBookingDto
  ): Promise<{ booking: Booking; clientSecret: string | null }> {
    // 1. Fetch vehicle
    const vehicleResult = await query<Vehicle>(
      "SELECT * FROM vehicles WHERE id = $1 AND status = 'active'",
      [dto.vehicle_id]
    );

    const vehicle = vehicleResult.rows[0];
    if (!vehicle) throw new NotFoundError('Vehicle');

    // 2. Calculate end_time if missing
    const startTime = new Date(dto.start_time);
    let endTime: Date;

    if (dto.end_time) {
      endTime = new Date(dto.end_time);
    } else if (dto.duration_hours) {
      endTime = new Date(startTime.getTime() + dto.duration_hours * 60 * 60 * 1000);
    } else if (dto.type === 'instant_ride') {
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    } else {
      throw new AppError('end_time or duration_hours is required for non-instant bookings', 400);
    }

    // 4. If chauffeur mode, validate chauffeur availability
    let chauffeurId: string | null = dto.chauffeur_id ?? null;
    if (dto.mode === 'chauffeur') {
      if (!vehicle.chauffeur_available) {
        throw new AppError('This vehicle does not have a chauffeur available', 400);
      }
      chauffeurId = await this.assignChauffeur(dto.chauffeur_id ?? null);
    }

    // 5. Surge pricing context
    const surgeContext = await this.getSurgeContext(vehicle.location_city);

    // 6. Calculate price
    const pricing = calculatePrice({
      vehicle: {
        dailyRate: Number(vehicle.daily_rate),
        hourlyRate: vehicle.hourly_rate ? Number(vehicle.hourly_rate) : null,
        chauffeurAvailable: vehicle.chauffeur_available,
        chauffeurDailyRate: vehicle.chauffeur_daily_rate ? Number(vehicle.chauffeur_daily_rate) : null,
        depositAmount: Number(vehicle.deposit_amount),
        maxDailyKm: vehicle.max_daily_km,
      },
      mode: dto.mode as BookingMode,
      type: dto.type as BookingType,
      startTime,
      endTime,
      ...surgeContext,
    });

    // 7. Create booking + payment in transaction (availability check is inside to prevent race conditions)
    const booking = await withTransaction(async (client) => {
      // Lock the vehicle row and check availability atomically
      await client.query('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', [dto.vehicle_id]);
      const overlapping = await client.query(
        `SELECT id FROM bookings
         WHERE vehicle_id = $1 AND status NOT IN ('cancelled','completed')
         AND ($2 < end_time AND $3 > start_time)`,
        [dto.vehicle_id, startTime, endTime]
      );
      if (overlapping.rowCount && overlapping.rowCount > 0) {
        throw new ConflictError('Vehicle is not available for the selected time period');
      }

      const bookingResult = await client.query<Booking>(
        `INSERT INTO bookings
          (customer_id, vehicle_id, chauffeur_id, type, mode, status,
           start_time, end_time, pickup_address, pickup_lat, pickup_lng,
           dropoff_address, dropoff_lat, dropoff_lng,
           base_amount, chauffeur_fee, insurance_fee, mileage_overage,
           platform_commission, total_amount, deposit_amount, notes)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [
          customerId,
          dto.vehicle_id,
          chauffeurId,
          dto.type,
          dto.mode,
          startTime,
          endTime,
          dto.pickup_address ?? null,
          dto.pickup_lat ?? null,
          dto.pickup_lng ?? null,
          dto.dropoff_address ?? null,
          dto.dropoff_lat ?? null,
          dto.dropoff_lng ?? null,
          pricing.baseAmount,
          pricing.chauffeurFee,
          pricing.insuranceFee,
          pricing.mileageOverage,
          pricing.platformCommission,
          pricing.totalAmount,
          pricing.depositAmount,
          dto.notes ?? null,
        ]
      );

      return bookingResult.rows[0];
    });

    // 8. Create Stripe PaymentIntent
    let clientSecret: string | null = null;
    if (config.stripe.secretKey && config.stripe.secretKey !== '') {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(pricing.totalAmount * 100), // convert to cents
          currency: 'usd',
          metadata: {
            booking_id: booking.id,
            customer_id: customerId,
            vehicle_id: dto.vehicle_id,
          },
          description: `VIP Mobility booking ${booking.id}`,
        });

        clientSecret = paymentIntent.client_secret;

        // Record payment intent in DB
        await query(
          `INSERT INTO payments
            (booking_id, stripe_payment_intent_id, amount, currency, status, type)
           VALUES ($1, $2, $3, 'USD', 'pending', 'booking')`,
          [booking.id, paymentIntent.id, pricing.totalAmount]
        );

        // Also create deposit payment intent if applicable
        if (pricing.depositAmount > 0) {
          const depositIntent = await stripe.paymentIntents.create({
            amount: Math.round(pricing.depositAmount * 100),
            currency: 'usd',
            capture_method: 'manual', // authorize only, capture later
            metadata: {
              booking_id: booking.id,
              type: 'deposit',
            },
            description: `VIP Mobility deposit for booking ${booking.id}`,
          });

          await query(
            `INSERT INTO payments
              (booking_id, stripe_payment_intent_id, amount, currency, status, type)
             VALUES ($1, $2, $3, 'USD', 'pending', 'deposit')`,
            [booking.id, depositIntent.id, pricing.depositAmount]
          );
        }
      } catch (stripeErr) {
        logger.error('Stripe error during booking creation', {
          bookingId: booking.id,
          error: stripeErr,
        });
        // Don't fail the booking — client can retry payment
      }
    }

    logger.info('Booking created', {
      bookingId: booking.id,
      customerId,
      vehicleId: dto.vehicle_id,
      totalAmount: pricing.totalAmount,
    });

    return { booking, clientSecret };
  }

  async findById(bookingId: string, userId: string, userRole: string): Promise<BookingWithDetails> {
    const result = await query<Booking>(
      'SELECT * FROM bookings WHERE id = $1',
      [bookingId]
    );

    const booking = result.rows[0];
    if (!booking) throw new NotFoundError('Booking');

    // Only customer, owner of the vehicle, or admin can view
    if (userRole !== 'admin' && booking.customer_id !== userId) {
      const vehicleOwner = await query<{ owner_id: string }>(
        'SELECT owner_id FROM vehicles WHERE id = $1',
        [booking.vehicle_id]
      );
      if (vehicleOwner.rows[0]?.owner_id !== userId) {
        throw new ForbiddenError('You do not have access to this booking');
      }
    }

    return this.enrichBooking(booking);
  }

  async findByCustomer(
    customerId: string,
    status?: BookingStatus,
    page = 1,
    limit = 20
  ): Promise<{ bookings: BookingWithDetails[]; total: number }> {
    const conditions = ['b.customer_id = $1'];
    const values: unknown[] = [customerId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`b.status = $${paramIdx++}`);
      values.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const offset = (page - 1) * limit;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM bookings b ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const dataValues = [...values, limit, offset];
    const result = await query<Booking & {
      v_make: string; v_model: string; v_year: number; v_license_plate: string;
      v_color: string | null; v_category: string;
      u_first_name: string; u_last_name: string; u_email: string; u_phone: string | null;
    }>(
      `SELECT b.*,
        v.make AS v_make, v.model AS v_model, v.year AS v_year,
        v.license_plate AS v_license_plate, v.color AS v_color, v.category AS v_category,
        u.first_name AS u_first_name, u.last_name AS u_last_name,
        u.email AS u_email, u.phone AS u_phone
       FROM bookings b
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       LEFT JOIN users u ON u.id = b.customer_id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      dataValues
    );

    const bookings: BookingWithDetails[] = result.rows.map(row => ({
      ...row,
      vehicle: { make: row.v_make, model: row.v_model, year: row.v_year, license_plate: row.v_license_plate, color: row.v_color, category: row.v_category },
      customer: { first_name: row.u_first_name, last_name: row.u_last_name, email: row.u_email, phone: row.u_phone },
    }));

    return { bookings, total };
  }

  async findByOwner(
    ownerId: string,
    status?: BookingStatus,
    page = 1,
    limit = 20
  ): Promise<{ bookings: BookingWithDetails[]; total: number }> {
    const conditions = ['v.owner_id = $1'];
    const values: unknown[] = [ownerId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`b.status = $${paramIdx++}`);
      values.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const offset = (page - 1) * limit;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM bookings b
       JOIN vehicles v ON v.id = b.vehicle_id
       ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const dataValues = [...values, limit, offset];
    const result = await query<Booking & {
      v_make: string; v_model: string; v_year: number; v_license_plate: string;
      v_color: string | null; v_category: string;
      u_first_name: string; u_last_name: string; u_email: string; u_phone: string | null;
    }>(
      `SELECT b.*,
        v.make AS v_make, v.model AS v_model, v.year AS v_year,
        v.license_plate AS v_license_plate, v.color AS v_color, v.category AS v_category,
        u.first_name AS u_first_name, u.last_name AS u_last_name,
        u.email AS u_email, u.phone AS u_phone
       FROM bookings b
       JOIN vehicles v ON v.id = b.vehicle_id
       LEFT JOIN users u ON u.id = b.customer_id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      dataValues
    );

    const bookings: BookingWithDetails[] = result.rows.map(row => ({
      ...row,
      vehicle: { make: row.v_make, model: row.v_model, year: row.v_year, license_plate: row.v_license_plate, color: row.v_color, category: row.v_category },
      customer: { first_name: row.u_first_name, last_name: row.u_last_name, email: row.u_email, phone: row.u_phone },
    }));

    return { bookings, total };
  }

  async confirm(bookingId: string, paymentIntentId: string, userId: string): Promise<Booking> {
    const result = await query<Booking>(
      "SELECT * FROM bookings WHERE id = $1 AND status = 'pending'",
      [bookingId]
    );

    if (!result.rows[0]) throw new NotFoundError('Pending booking');

    if (result.rows[0].customer_id !== userId) {
      throw new ForbiddenError('You do not own this booking');
    }

    // Verify payment intent is succeeded
    if (config.stripe.secretKey && config.stripe.secretKey !== '') {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        throw new AppError('Payment has not been completed', 400);
      }

      // Update payment record
      await query(
        `UPDATE payments SET status = 'completed', stripe_charge_id = $1, updated_at = NOW()
         WHERE stripe_payment_intent_id = $2`,
        [paymentIntent.latest_charge as string, paymentIntentId]
      );
    }

    const updated = await query<Booking>(
      "UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1 RETURNING *",
      [bookingId]
    );

    logger.info('Booking confirmed', { bookingId });

    return updated.rows[0];
  }

  async startRide(bookingId: string, userId: string): Promise<Booking> {
    const result = await query<Booking>(
      "SELECT * FROM bookings WHERE id = $1 AND status = 'confirmed'",
      [bookingId]
    );

    const booking = result.rows[0];
    if (!booking) throw new NotFoundError('Confirmed booking');

    // Chauffeur or admin can start the ride
    const isAllowed = await this.canManageBooking(booking, userId, 'start');
    if (!isAllowed) throw new ForbiddenError('You cannot start this booking');

    const updated = await query<Booking>(
      "UPDATE bookings SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *",
      [bookingId]
    );

    logger.info('Booking started', { bookingId });

    return updated.rows[0];
  }

  async complete(bookingId: string, userId: string, extraKm = 0): Promise<Booking> {
    const result = await query<Booking>(
      "SELECT * FROM bookings WHERE id = $1 AND status = 'active'",
      [bookingId]
    );

    const booking = result.rows[0];
    if (!booking) throw new NotFoundError('Active booking');

    const isAllowed = await this.canManageBooking(booking, userId, 'complete');
    if (!isAllowed) throw new ForbiddenError('You cannot complete this booking');

    // Calculate mileage overage if applicable
    let mileageOverage = 0;
    if (extraKm > 0) {
      mileageOverage = extraKm * config.app.mileageOverageRate;
      const newTotal = Number(booking.total_amount) + mileageOverage;

      await query(
        `UPDATE bookings
         SET status = 'completed', actual_end_time = NOW(),
             mileage_overage = $1, total_amount = $2, updated_at = NOW()
         WHERE id = $3`,
        [mileageOverage, newTotal, bookingId]
      );
    } else {
      await query(
        "UPDATE bookings SET status = 'completed', actual_end_time = NOW(), updated_at = NOW() WHERE id = $1",
        [bookingId]
      );
    }

    const updated = await query<Booking>(
      'SELECT * FROM bookings WHERE id = $1',
      [bookingId]
    );

    logger.info('Booking completed', { bookingId, extraKm });

    return updated.rows[0];
  }

  async cancel(
    bookingId: string,
    userId: string,
    userRole: string,
    reason: string
  ): Promise<Booking> {
    const result = await query<Booking>(
      "SELECT * FROM bookings WHERE id = $1 AND status IN ('pending','confirmed')",
      [bookingId]
    );

    const booking = result.rows[0];
    if (!booking) throw new NotFoundError('Cancellable booking');

    const isCustomer = booking.customer_id === userId;
    const isAdmin = userRole === 'admin';

    if (!isCustomer && !isAdmin) {
      throw new ForbiddenError('You cannot cancel this booking');
    }

    await query(
      `UPDATE bookings
       SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason, bookingId]
    );

    // Trigger refund if payment exists
    if (config.stripe.secretKey && config.stripe.secretKey !== '') {
      const payments = await query<{ stripe_payment_intent_id: string; amount: number }>(
        "SELECT stripe_payment_intent_id, amount FROM payments WHERE booking_id = $1 AND type = 'booking' AND status = 'completed'",
        [bookingId]
      );

      // Apply cancellation refund policy
      const hoursUntilStart = (new Date(booking.start_time).getTime() - Date.now()) / (1000 * 3600);

      for (const payment of payments.rows) {
        if (payment.stripe_payment_intent_id) {
          // <24h before start: no refund
          if (hoursUntilStart < 24) {
            logger.info('No refund issued — cancellation within 24h of trip', { bookingId });
            continue;
          }

          try {
            const refundParams: Stripe.RefundCreateParams = {
              payment_intent: payment.stripe_payment_intent_id,
            };
            // 24-48h before start: 50% refund
            if (hoursUntilStart < 48) {
              refundParams.amount = Math.round(payment.amount * 100 * 0.5);
            }
            // 48h+: full refund (no amount = full)
            await stripe.refunds.create(refundParams);

            await query(
              "UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE stripe_payment_intent_id = $1",
              [payment.stripe_payment_intent_id]
            );
          } catch (refundErr) {
            logger.error('Stripe refund failed', { bookingId, error: refundErr });
          }
        }
      }
    }

    const updated = await query<Booking>(
      'SELECT * FROM bookings WHERE id = $1',
      [bookingId]
    );

    logger.info('Booking cancelled', { bookingId, userId, reason });

    return updated.rows[0];
  }

  private async checkAvailability(
    vehicleId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string
  ): Promise<void> {
    const conditions = [
      "vehicle_id = $1",
      "status NOT IN ('cancelled', 'completed')",
      "($2 < end_time AND $3 > start_time)", // overlap check
    ];

    const values: unknown[] = [vehicleId, startTime, endTime];

    if (excludeBookingId) {
      conditions.push(`id != $${values.length + 1}`);
      values.push(excludeBookingId);
    }

    const overlapping = await query(
      `SELECT id FROM bookings WHERE ${conditions.join(' AND ')}`,
      values
    );

    if (overlapping.rowCount && overlapping.rowCount > 0) {
      throw new ConflictError('Vehicle is not available for the selected time period');
    }
  }

  private async assignChauffeur(preferredId: string | null): Promise<string> {
    if (preferredId) {
      const result = await query<{ id: string; is_available: boolean }>(
        'SELECT id, is_available FROM chauffeurs WHERE id = $1',
        [preferredId]
      );

      if (!result.rows[0]) throw new NotFoundError('Chauffeur');
      if (!result.rows[0].is_available) throw new ConflictError('Requested chauffeur is not available');

      return preferredId;
    }

    // Auto-assign available chauffeur
    const result = await query<{ id: string }>(
      'SELECT id FROM chauffeurs WHERE is_available = true ORDER BY rating DESC LIMIT 1'
    );

    if (!result.rows[0]) throw new AppError('No chauffeurs available at this time', 503);

    return result.rows[0].id;
  }

  private async getSurgeContext(
    city: string | null
  ): Promise<{ activeBookingsCount: number; availableVehiclesCount: number }> {
    const activeResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM bookings b
       JOIN vehicles v ON v.id = b.vehicle_id
       WHERE b.status IN ('confirmed', 'active')
       AND ($1::text IS NULL OR v.location_city = $1)`,
      [city]
    );

    const availableResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM vehicles
       WHERE status = 'active'
       AND ($1::text IS NULL OR location_city = $1)`,
      [city]
    );

    return {
      activeBookingsCount: parseInt(activeResult.rows[0]?.count ?? '0', 10),
      availableVehiclesCount: parseInt(availableResult.rows[0]?.count ?? '0', 10),
    };
  }

  private async canManageBooking(
    booking: Booking,
    userId: string,
    action: 'start' | 'complete'
  ): Promise<boolean> {
    // Check if chauffeur associated with booking
    if (booking.chauffeur_id) {
      const chauffeur = await query<{ user_id: string }>(
        'SELECT user_id FROM chauffeurs WHERE id = $1',
        [booking.chauffeur_id]
      );
      if (chauffeur.rows[0]?.user_id === userId) return true;
    }

    // Vehicle owner can manage
    const vehicle = await query<{ owner_id: string }>(
      'SELECT owner_id FROM vehicles WHERE id = $1',
      [booking.vehicle_id]
    );
    if (vehicle.rows[0]?.owner_id === userId) return true;

    return false;
  }

  private async enrichBooking(booking: Booking): Promise<BookingWithDetails> {
    const [vehicleResult, customerResult] = await Promise.all([
      query<{ make: string; model: string; year: number; license_plate: string; color: string | null; category: string }>(
        'SELECT make, model, year, license_plate, color, category FROM vehicles WHERE id = $1',
        [booking.vehicle_id]
      ),
      query<{ first_name: string; last_name: string; email: string; phone: string | null }>(
        'SELECT first_name, last_name, email, phone FROM users WHERE id = $1',
        [booking.customer_id]
      ),
    ]);

    return {
      ...booking,
      vehicle: vehicleResult.rows[0],
      customer: customerResult.rows[0],
    };
  }
  async getEarningsSummary(ownerId: string) {
    const totalResult = await query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(b.total_amount), 0) as total, COUNT(*)::text as count
       FROM bookings b JOIN vehicles v ON b.vehicle_id = v.id
       WHERE v.owner_id = $1 AND b.status = 'completed'`,
      [ownerId]
    );

    const monthResult = await query<{ total: string }>(
      `SELECT COALESCE(SUM(b.total_amount), 0) as total
       FROM bookings b JOIN vehicles v ON b.vehicle_id = v.id
       WHERE v.owner_id = $1 AND b.status = 'completed'
       AND b.updated_at >= date_trunc('month', NOW())`,
      [ownerId]
    );

    const activeResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM bookings b JOIN vehicles v ON b.vehicle_id = v.id
       WHERE v.owner_id = $1 AND b.status = 'active'`,
      [ownerId]
    );

    const pendingResult = await query<{ total: string }>(
      `SELECT COALESCE(SUM(b.total_amount), 0) as total
       FROM bookings b JOIN vehicles v ON b.vehicle_id = v.id
       WHERE v.owner_id = $1 AND b.status = 'completed'
       AND b.updated_at >= NOW() - INTERVAL '7 days'`,
      [ownerId]
    );

    return {
      total_earnings: parseFloat(totalResult.rows[0]?.total ?? '0'),
      this_month_earnings: parseFloat(monthResult.rows[0]?.total ?? '0'),
      total_bookings: parseInt(totalResult.rows[0]?.count ?? '0', 10),
      active_bookings: parseInt(activeResult.rows[0]?.count ?? '0', 10),
      pending_payouts: parseFloat(pendingResult.rows[0]?.total ?? '0'),
    };
  }

  async rateBooking(bookingId: string, userId: string, rating: number, review?: string): Promise<Booking> {
    const result = await query<Booking>(
      "SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 AND status = 'completed'",
      [bookingId, userId]
    );
    const booking = result.rows[0];
    if (!booking) throw new NotFoundError('Completed booking');

    if (rating < 1 || rating > 5) throw new AppError('Rating must be between 1 and 5', 400);

    // Insert or update rating
    await query(
      `INSERT INTO ratings (booking_id, user_id, vehicle_id, rating, review, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (booking_id) DO UPDATE SET rating = $4, review = $5`,
      [bookingId, userId, booking.vehicle_id, rating, review ?? null]
    );

    // Update vehicle average rating
    const avgResult = await query<{ avg: string; count: string }>(
      `SELECT AVG(rating)::text as avg, COUNT(*)::text as count FROM ratings WHERE vehicle_id = $1`,
      [booking.vehicle_id]
    );
    if (avgResult.rows[0]) {
      await query(
        'UPDATE vehicles SET rating = $1, review_count = $2, updated_at = NOW() WHERE id = $3',
        [parseFloat(avgResult.rows[0].avg), parseInt(avgResult.rows[0].count, 10), booking.vehicle_id]
      );
    }

    logger.info('Booking rated', { bookingId, rating });
    return booking;
  }
}

export const bookingService = new BookingService();
