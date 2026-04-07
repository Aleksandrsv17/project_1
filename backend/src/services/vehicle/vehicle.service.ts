import { query } from '../../db';
import {
  Vehicle,
  VehicleWithMedia,
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleQuery,
} from './vehicle.model';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

export class VehicleService {
  async create(ownerId: string, dto: CreateVehicleDto): Promise<Vehicle> {
    // Check for duplicate license plate
    const existing = await query<Vehicle>(
      'SELECT id FROM vehicles WHERE license_plate = $1',
      [dto.license_plate.toUpperCase()]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictError('A vehicle with this license plate already exists');
    }

    const result = await query<Vehicle>(
      `INSERT INTO vehicles
        (owner_id, make, model, year, license_plate, color, category,
         daily_rate, hourly_rate, chauffeur_available, chauffeur_daily_rate,
         deposit_amount, max_daily_km, location_city, location_lat, location_lng, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        ownerId,
        dto.make,
        dto.model,
        dto.year,
        dto.license_plate.toUpperCase(),
        dto.color ?? null,
        dto.category,
        dto.daily_rate,
        dto.hourly_rate ?? null,
        dto.chauffeur_available ?? false,
        dto.chauffeur_daily_rate ?? null,
        dto.deposit_amount ?? 500,
        dto.max_daily_km ?? 300,
        dto.location_city ?? null,
        dto.location_lat ?? null,
        dto.location_lng ?? null,
        dto.description ?? null,
      ]
    );

    logger.info('Vehicle created', { vehicleId: result.rows[0].id, ownerId });

    return result.rows[0];
  }

  async findAll(queryParams: VehicleQuery): Promise<{ vehicles: VehicleWithMedia[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (queryParams.status === 'all') {
      // No status filter — show everything (admin use)
    } else if (queryParams.status) {
      conditions.push(`v.status = $${paramIdx++}`);
      values.push(queryParams.status);
    } else {
      conditions.push("v.status = 'active'");
    }

    if (queryParams.city) {
      conditions.push(`v.location_city ILIKE $${paramIdx++}`);
      values.push(`%${queryParams.city}%`);
    }

    if (queryParams.category) {
      conditions.push(`v.category = $${paramIdx++}`);
      values.push(queryParams.category);
    }

    if (queryParams.min_rate !== undefined) {
      conditions.push(`v.daily_rate >= $${paramIdx++}`);
      values.push(queryParams.min_rate);
    }

    if (queryParams.max_rate !== undefined) {
      conditions.push(`v.daily_rate <= $${paramIdx++}`);
      values.push(queryParams.max_rate);
    }

    if (queryParams.chauffeur === true) {
      conditions.push('v.chauffeur_available = true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortMap: Record<string, string> = {
      daily_rate_asc: 'v.daily_rate ASC',
      daily_rate_desc: 'v.daily_rate DESC',
      newest: 'v.created_at DESC',
    };
    const orderBy = sortMap[queryParams.sort] ?? 'v.created_at DESC';

    const offset = (queryParams.page - 1) * queryParams.limit;

    // Count query
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM vehicles v ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Data query with media
    const dataValues = [...values, queryParams.limit, offset];
    const result = await query<Vehicle>(
      `SELECT v.* FROM vehicles v
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      dataValues
    );

    const vehicles = await this.attachMedia(result.rows);

    return { vehicles, total };
  }

  async findById(vehicleId: string): Promise<VehicleWithMedia> {
    const result = await query<Vehicle>(
      'SELECT * FROM vehicles WHERE id = $1',
      [vehicleId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError('Vehicle');
    }

    const [vehicle] = await this.attachMedia([result.rows[0]]);
    return vehicle;
  }

  async findByOwner(ownerId: string): Promise<VehicleWithMedia[]> {
    const result = await query<Vehicle>(
      'SELECT * FROM vehicles WHERE owner_id = $1 ORDER BY created_at DESC',
      [ownerId]
    );

    return this.attachMedia(result.rows);
  }

  async update(vehicleId: string, ownerId: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await query<Vehicle>(
      'SELECT id, owner_id FROM vehicles WHERE id = $1',
      [vehicleId]
    );

    if (!vehicle.rows[0]) {
      throw new NotFoundError('Vehicle');
    }

    if (vehicle.rows[0].owner_id !== ownerId) {
      throw new ForbiddenError('You do not own this vehicle');
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    const updatable: (keyof UpdateVehicleDto)[] = [
      'make', 'model', 'year', 'color', 'daily_rate', 'hourly_rate',
      'chauffeur_available', 'chauffeur_daily_rate', 'deposit_amount',
      'max_daily_km', 'status', 'location_city', 'location_lat',
      'location_lng', 'description',
    ];

    for (const key of updatable) {
      if (dto[key] !== undefined) {
        fields.push(`${key} = $${paramIdx++}`);
        values.push(dto[key]);
      }
    }

    if (fields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    fields.push('updated_at = NOW()');
    values.push(vehicleId);

    const result = await query<Vehicle>(
      `UPDATE vehicles SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    logger.info('Vehicle updated', { vehicleId, ownerId });

    return result.rows[0];
  }

  async delete(vehicleId: string, ownerId: string): Promise<void> {
    const vehicle = await query<Vehicle>(
      'SELECT id, owner_id FROM vehicles WHERE id = $1',
      [vehicleId]
    );

    if (!vehicle.rows[0]) {
      throw new NotFoundError('Vehicle');
    }

    if (vehicle.rows[0].owner_id !== ownerId) {
      throw new ForbiddenError('You do not own this vehicle');
    }

    // Check for active bookings
    const activeBookings = await query(
      `SELECT id FROM bookings
       WHERE vehicle_id = $1
       AND status IN ('pending', 'confirmed', 'active')`,
      [vehicleId]
    );

    if (activeBookings.rowCount && activeBookings.rowCount > 0) {
      throw new AppError('Cannot delete vehicle with active bookings', 409);
    }

    await query(
      "UPDATE vehicles SET status = 'inactive', updated_at = NOW() WHERE id = $1",
      [vehicleId]
    );

    logger.info('Vehicle deactivated', { vehicleId, ownerId });
  }

  /**
   * Admin-only: update vehicle status (approve/reject)
   */
  async adminUpdateStatus(vehicleId: string, status: string): Promise<Vehicle> {
    const vehicle = await query<Vehicle>(
      'SELECT id FROM vehicles WHERE id = $1',
      [vehicleId]
    );

    if (!vehicle.rows[0]) {
      throw new NotFoundError('Vehicle');
    }

    const allowed = ['active', 'inactive', 'pending', 'maintenance'];
    if (!allowed.includes(status)) {
      throw new AppError(`Invalid status. Must be one of: ${allowed.join(', ')}`, 400);
    }

    const result = await query<Vehicle>(
      `UPDATE vehicles SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, vehicleId]
    );

    logger.info('Vehicle status updated by admin', { vehicleId, status });

    return result.rows[0];
  }

  async addMedia(vehicleId: string, ownerId: string, url: string, isPrimary = false): Promise<void> {
    const vehicle = await query<Vehicle>(
      'SELECT id, owner_id FROM vehicles WHERE id = $1',
      [vehicleId]
    );

    if (!vehicle.rows[0]) throw new NotFoundError('Vehicle');
    if (vehicle.rows[0].owner_id !== ownerId) throw new ForbiddenError('You do not own this vehicle');

    if (isPrimary) {
      await query(
        'UPDATE vehicle_media SET is_primary = false WHERE vehicle_id = $1',
        [vehicleId]
      );
    }

    await query(
      'INSERT INTO vehicle_media (vehicle_id, url, is_primary) VALUES ($1, $2, $3)',
      [vehicleId, url, isPrimary]
    );
  }

  private async attachMedia(vehicles: Vehicle[]): Promise<VehicleWithMedia[]> {
    if (vehicles.length === 0) return [];

    const ids = vehicles.map((v) => v.id);
    const mediaResult = await query(
      'SELECT * FROM vehicle_media WHERE vehicle_id = ANY($1::uuid[]) ORDER BY is_primary DESC, created_at ASC',
      [ids]
    );

    const mediaMap = new Map<string, typeof mediaResult.rows>();
    for (const row of mediaResult.rows) {
      if (!mediaMap.has(row.vehicle_id)) {
        mediaMap.set(row.vehicle_id, []);
      }
      mediaMap.get(row.vehicle_id)!.push(row);
    }

    return vehicles.map((v) => ({
      ...v,
      media: mediaMap.get(v.id) ?? [],
    }));
  }
}

export const vehicleService = new VehicleService();
