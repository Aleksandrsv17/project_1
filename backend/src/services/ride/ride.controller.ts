import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { rideService } from './ride.service';
import { query } from '../../db';

class RideController {
  /**
   * GET /v1/rides/active
   * Returns the authenticated caller's current non-terminal ride (matched /
   * arriving / in_progress), or null. Works for both the driver assigned to the
   * ride and the customer who booked it.
   */
  async active(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.sub;
    const ride = rideService.getActiveRideForUser(userId);

    if (!ride) {
      res.json({ success: true, data: { ride: null } });
      return;
    }

    res.json({
      success: true,
      data: {
        ride: {
          rideId: ride.rideId,
          status: ride.status,
          driver: {
            userId: ride.driverId,
            name: ride.driverName,
            rating: ride.driverRating,
            trips: ride.driverTrips,
            vehicleMake: ride.vehicleInfo.make,
            vehicleModel: ride.vehicleInfo.model,
            vehiclePlate: ride.vehicleInfo.plate,
            location: { lat: ride.driverLocation.lat, lng: ride.driverLocation.lng },
          },
          pickup: { lat: ride.pickup.lat, lng: ride.pickup.lng, address: ride.pickup.address },
          dest: { lat: ride.dest.lat, lng: ride.dest.lng, address: ride.dest.address },
          fare: ride.fare,
        },
      },
    });
  }

  /**
   * GET /v1/rides?status=&page=&limit=  (auth = customer)
   * The caller's rides, newest first, paginated. status buckets:
   * active (confirmed/active), completed, cancelled; omit = all.
   */
  async history(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const customerId = authReq.user.sub;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const statusParam = req.query.status ? String(req.query.status) : undefined;

    const values: unknown[] = [customerId];
    let statusClause = '';
    if (statusParam === 'active') statusClause = ` AND b.status IN ('confirmed','active')`;
    else if (statusParam === 'completed') statusClause = ` AND b.status = 'completed'`;
    else if (statusParam === 'cancelled') statusClause = ` AND b.status = 'cancelled'`;

    const where = `WHERE b.customer_id = $1 AND b.type = 'instant_ride'${statusClause}`;
    const countRes = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM bookings b ${where}`, values);
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const rows = (await query<any>(
      `SELECT b.id, b.status, b.created_at, b.total_amount, b.rating,
              b.pickup_address, b.pickup_lat, b.pickup_lng,
              b.dropoff_address, b.dropoff_lat, b.dropoff_lng,
              b.chauffeur_user_id, b.route_stops,
              u.first_name AS d_first, u.last_name AS d_last,
              u.rating AS d_rating, u.rating_count AS d_count,
              v.make AS v_make, v.model AS v_model, v.license_plate AS v_plate
       FROM bookings b
       LEFT JOIN users u ON u.id = b.chauffeur_user_id
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT $2 OFFSET $3`,
      [...values, limit, (page - 1) * limit]
    )).rows;

    const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      if (aLat == null || bLat == null) return null;
      const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
      return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
    };

    const rides = rows.map((r: any) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      pickup: { lat: r.pickup_lat, lng: r.pickup_lng, address: r.pickup_address },
      dest: { lat: r.dropoff_lat, lng: r.dropoff_lng, address: r.dropoff_address },
      // Intermediate stops set via customer:update_route during the trip,
      // ordered, [] when the ride had no mid-route changes.
      stops: Array.isArray(r.route_stops) ? r.route_stops : [],
      driver: r.chauffeur_user_id
        ? {
            userId: r.chauffeur_user_id,
            name: `${r.d_first ?? ''} ${r.d_last ?? ''}`.trim() || 'Driver',
            vehicleMake: r.v_make ?? '',
            vehicleModel: r.v_model ?? '',
            vehiclePlate: r.v_plate ?? '',
            location: null,
            rating: r.d_rating != null ? Number(r.d_rating) : null,
            trips: r.d_count ?? 0,
          }
        : null,
      fare: r.total_amount != null ? Number(r.total_amount) : 0,
      distance_km: haversineKm(r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng),
      rating: r.rating ?? null,
    }));

    res.json({ success: true, data: { rides, pagination: { total, page, limit, pages: Math.ceil(total / limit) } } });
  }

  /**
   * POST /v1/rides/:id/rate  (auth = customer)
   * Store the customer's rating/review on the ride (booking), then recompute the
   * driver's aggregate (users.rating = AVG, users.rating_count = COUNT) over all
   * of that driver's rated rides.
   */
  async rate(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const customerId = authReq.user.sub;
    const rideId = req.params.id;
    const rating = Number((req.body || {}).rating);
    const review = (req.body || {}).review ?? null;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(422).json({ success: false, error: { message: 'rating must be an integer 1-5' } });
      return;
    }

    const upd = await query<{ chauffeur_user_id: string | null }>(
      `UPDATE bookings SET rating = $1, review = $2, updated_at = NOW()
       WHERE id = $3 AND customer_id = $4
       RETURNING chauffeur_user_id`,
      [rating, review, rideId, customerId]
    );
    if (upd.rows.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Ride not found' } });
      return;
    }

    const driverId = upd.rows[0].chauffeur_user_id;
    if (driverId) await this.recomputeUserRating(driverId, 'rating');

    res.json({ success: true, data: { rideId, rating } });
  }

  /**
   * POST /v1/rides/:id/rate-customer  (auth = driver)
   * Store the driver's rating of the passenger, then recompute the customer's
   * aggregate the same way.
   */
  async rateCustomer(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const driverId = authReq.user.sub;
    const rideId = req.params.id;
    const rating = Number((req.body || {}).rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(422).json({ success: false, error: { message: 'rating must be an integer 1-5' } });
      return;
    }

    const upd = await query<{ customer_id: string }>(
      `UPDATE bookings SET customer_rating = $1, updated_at = NOW()
       WHERE id = $2 AND chauffeur_user_id = $3
       RETURNING customer_id`,
      [rating, rideId, driverId]
    );
    if (upd.rows.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Ride not found' } });
      return;
    }

    const customerId = upd.rows[0].customer_id;
    if (customerId) await this.recomputeUserRating(customerId, 'customer_rating');

    res.json({ success: true, data: { rideId, rating } });
  }

  /** Recompute and store a user's denormalized rating aggregate. */
  private async recomputeUserRating(userId: string, column: 'rating' | 'customer_rating'): Promise<void> {
    const driverMatch = column === 'rating' ? 'chauffeur_user_id' : 'customer_id';
    await query(
      `UPDATE users u SET rating = sub.avg_rating, rating_count = sub.cnt
       FROM (
         SELECT AVG(${column})::numeric(3,2) AS avg_rating, COUNT(*) AS cnt
         FROM bookings WHERE ${driverMatch} = $1 AND ${column} IS NOT NULL
       ) sub
       WHERE u.id = $1`,
      [userId]
    );
  }
}

export const rideController = new RideController();
