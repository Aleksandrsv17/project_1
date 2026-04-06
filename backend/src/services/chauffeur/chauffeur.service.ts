import { query } from '../../db';
import { AppError, ConflictError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

export interface Chauffeur {
  id: string;
  user_id: string;
  license_number: string;
  license_expiry: Date;
  rating: number;
  total_trips: number;
  is_available: boolean;
  current_lat: number | null;
  current_lng: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChauffeurWithUser extends Chauffeur {
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
}

export interface CreateChauffeurDto {
  license_number: string;
  license_expiry: Date;
}

export class ChauffeurService {
  async register(userId: string, dto: CreateChauffeurDto): Promise<Chauffeur> {
    // Check if user already has a chauffeur profile
    const existing = await query<Chauffeur>(
      'SELECT id FROM chauffeurs WHERE user_id = $1',
      [userId]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictError('Chauffeur profile already exists for this user');
    }

    // Validate license expiry is in the future
    if (new Date(dto.license_expiry) <= new Date()) {
      throw new AppError('License expiry date must be in the future', 400);
    }

    const result = await query<Chauffeur>(
      `INSERT INTO chauffeurs (user_id, license_number, license_expiry, is_available)
       VALUES ($1, $2, $3, false) RETURNING *`,
      [userId, dto.license_number, dto.license_expiry]
    );

    // Role is NOT updated here — admin must approve via PATCH /chauffeurs/:id/approve
    logger.info('Chauffeur registration submitted (pending admin approval)', { userId, chauffeurId: result.rows[0].id });

    return result.rows[0];
  }

  async approve(chauffeurId: string): Promise<Chauffeur> {
    const result = await query<Chauffeur & { user_id: string }>(
      "UPDATE chauffeurs SET is_available = true, updated_at = NOW() WHERE id = $1 RETURNING *",
      [chauffeurId]
    );

    if (!result.rows[0]) throw new NotFoundError('Chauffeur');

    // Now promote user role to chauffeur
    await query(
      "UPDATE users SET role = 'chauffeur', updated_at = NOW() WHERE id = $1",
      [result.rows[0].user_id]
    );

    logger.info('Chauffeur approved', { chauffeurId });

    return result.rows[0];
  }

  async getById(chauffeurId: string): Promise<ChauffeurWithUser> {
    const result = await query<ChauffeurWithUser>(
      `SELECT c.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM chauffeurs c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
      [chauffeurId]
    );

    if (!result.rows[0]) throw new NotFoundError('Chauffeur');

    return result.rows[0];
  }

  async getMyProfile(userId: string): Promise<Chauffeur> {
    const result = await query<Chauffeur>(
      'SELECT * FROM chauffeurs WHERE user_id = $1',
      [userId]
    );

    if (!result.rows[0]) throw new NotFoundError('Chauffeur profile');

    return result.rows[0];
  }

  async listAvailable(): Promise<ChauffeurWithUser[]> {
    const result = await query<ChauffeurWithUser>(
      `SELECT c.*, u.first_name, u.last_name, u.email, u.avatar_url
       FROM chauffeurs c
       JOIN users u ON u.id = c.user_id
       WHERE c.is_available = true
       ORDER BY c.rating DESC`
    );

    return result.rows;
  }

  async updateAvailability(userId: string, isAvailable: boolean): Promise<Chauffeur> {
    const result = await query<Chauffeur>(
      `UPDATE chauffeurs
       SET is_available = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [isAvailable, userId]
    );

    if (!result.rows[0]) throw new NotFoundError('Chauffeur profile');

    logger.info('Chauffeur availability updated', { userId, isAvailable });

    return result.rows[0];
  }

  async updateLocation(userId: string, lat: number, lng: number): Promise<void> {
    const result = await query(
      `UPDATE chauffeurs
       SET current_lat = $1, current_lng = $2, updated_at = NOW()
       WHERE user_id = $3`,
      [lat, lng, userId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      throw new NotFoundError('Chauffeur profile');
    }
  }

  async submitRating(
    chauffeurId: string,
    score: number,
    bookingId: string
  ): Promise<void> {
    // Recalculate average rating
    const ratingsResult = await query<{ avg_score: string }>(
      `SELECT AVG(r.score)::DECIMAL(3,2) as avg_score
       FROM ratings r
       WHERE r.ratee_id = (SELECT user_id FROM chauffeurs WHERE id = $1)
       AND r.type = 'chauffeur'`,
      [chauffeurId]
    );

    const avgScore = parseFloat(ratingsResult.rows[0]?.avg_score ?? String(score));

    await query(
      `UPDATE chauffeurs
       SET rating = $1, total_trips = total_trips + 1, updated_at = NOW()
       WHERE id = $2`,
      [avgScore, chauffeurId]
    );

    logger.info('Chauffeur rating updated', { chauffeurId, bookingId, avgScore });
  }
}

export const chauffeurService = new ChauffeurService();
