import { query, withTransaction } from '../../db';
import { AppError, ValidationError, NotFoundError } from '../../middleware/errorHandler';

export interface PersonalVehicleRow {
  id: string;
  user_id: string;
  category: string;
  make: string;
  model: string;
  year: number | null;
  license_plate: string;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listForUser(userId: string): Promise<PersonalVehicleRow[]> {
  const res = await query<PersonalVehicleRow>(
    `SELECT * FROM driver_personal_vehicles WHERE user_id = $1
       ORDER BY is_active DESC, created_at DESC`,
    [userId],
  );
  return res.rows;
}

export async function createForUser(
  userId: string,
  payload: { category: string; make: string; model: string; year?: number;
             license_plate: string; color?: string; set_active?: boolean },
): Promise<PersonalVehicleRow> {
  if (!payload.category || !payload.make || !payload.model || !payload.license_plate) {
    throw new ValidationError('category, make, model, license_plate are required');
  }
  // If the user has no existing vehicle, auto-activate this one so the home
  // card / Go Online flow has something to point at without a follow-up tap.
  const existing = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM driver_personal_vehicles WHERE user_id = $1', [userId]
  );
  const isFirst = parseInt(existing.rows[0]?.count ?? '0', 10) === 0;
  const setActive = payload.set_active ?? isFirst;

  return withTransaction(async (client) => {
    if (setActive) {
      await client.query(
        'UPDATE driver_personal_vehicles SET is_active = false WHERE user_id = $1 AND is_active = true',
        [userId]
      );
    }
    const res = await client.query<PersonalVehicleRow>(
      `INSERT INTO driver_personal_vehicles
         (user_id, category, make, model, year, license_plate, color, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        userId, payload.category, payload.make, payload.model,
        payload.year ?? null,
        payload.license_plate.trim().toUpperCase(),
        payload.color ?? null,
        setActive,
      ],
    );
    return res.rows[0];
  });
}

export async function deleteForUser(userId: string, vehicleId: string): Promise<void> {
  const res = await query<{ is_active: boolean }>(
    'DELETE FROM driver_personal_vehicles WHERE id = $1 AND user_id = $2 RETURNING is_active',
    [vehicleId, userId]
  );
  if (!res.rows[0]) throw new NotFoundError('Vehicle');
  // If the deleted one was active, promote the next-most-recent to active so
  // the driver doesn't end up in a "no vehicle" state with one still in the
  // garage.
  if (res.rows[0].is_active) {
    await query(
      `UPDATE driver_personal_vehicles SET is_active = true
         WHERE id = (
           SELECT id FROM driver_personal_vehicles
            WHERE user_id = $1 AND is_active = false
            ORDER BY created_at DESC LIMIT 1
         )`,
      [userId]
    );
  }
}

export async function setActiveForUser(userId: string, vehicleId: string): Promise<void> {
  await withTransaction(async (client) => {
    const exists = await client.query<{ id: string }>(
      'SELECT id FROM driver_personal_vehicles WHERE id = $1 AND user_id = $2',
      [vehicleId, userId]
    );
    if (!exists.rows[0]) throw new NotFoundError('Vehicle');
    await client.query(
      'UPDATE driver_personal_vehicles SET is_active = false WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    await client.query(
      'UPDATE driver_personal_vehicles SET is_active = true, updated_at = NOW() WHERE id = $1',
      [vehicleId]
    );
  });
}
