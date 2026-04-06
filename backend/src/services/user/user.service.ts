import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../db';
import { config } from '../../config';
import {
  User,
  PublicUser,
  CreateUserDto,
  UpdateUserDto,
  LoginDto,
  AuthTokens,
  toPublicUser,
} from './user.model';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateJti,
  hashToken,
  getRefreshTokenExpiresAt,
} from '../../utils/jwt';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

export class UserService {
  async register(dto: CreateUserDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    // Check for existing user
    const existing = await query<User>(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [dto.email.toLowerCase()]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictError('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, config.app.bcryptRounds);

    const result = await query<User>(
      `INSERT INTO users
        (email, phone, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        dto.email.toLowerCase(),
        dto.phone ?? null,
        passwordHash,
        dto.role ?? 'customer',
        dto.first_name,
        dto.last_name,
      ]
    );

    const user = result.rows[0];
    const tokens = await this.generateAndStoreTokens(user.id, user.email, user.role);

    logger.info('User registered', { userId: user.id, email: user.email });

    return { user: toPublicUser(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const result = await query<User>(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [dto.email.toLowerCase()]
    );

    if (!result.rows[0]) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(dto.password, user.password_hash);

    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokens = await this.generateAndStoreTokens(user.id, user.email, user.role);

    logger.info('User logged in', { userId: user.id, email: user.email });

    return { user: toPublicUser(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; jti: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const tokenHash = hashToken(refreshToken);

    const result = await query<{ id: string; user_id: string; expires_at: Date }>(
      `SELECT id, user_id, expires_at FROM refresh_tokens
       WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
      [payload.sub, tokenHash]
    );

    if (!result.rows[0]) {
      throw new UnauthorizedError('Refresh token not found or expired');
    }

    // Rotate: delete old token
    await query('DELETE FROM refresh_tokens WHERE id = $1', [result.rows[0].id]);

    // Fetch user info
    const userResult = await query<User>(
      'SELECT id, email, role FROM users WHERE id = $1 AND deleted_at IS NULL',
      [payload.sub]
    );

    if (!userResult.rows[0]) {
      throw new UnauthorizedError('User not found');
    }

    const user = userResult.rows[0];
    const tokens = await this.generateAndStoreTokens(user.id, user.email, user.role);

    logger.info('Tokens refreshed', { userId: user.id });

    return tokens;
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query(
        'DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2',
        [userId, tokenHash]
      );
    } else {
      // Invalidate all refresh tokens for user (logout all devices)
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    }

    logger.info('User logged out', { userId });
  }

  async getById(userId: string): Promise<PublicUser> {
    const result = await query<User>(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError('User');
    }

    return toPublicUser(result.rows[0]);
  }

  async update(userId: string, dto: UpdateUserDto): Promise<PublicUser> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (dto.phone !== undefined) {
      fields.push(`phone = $${paramIdx++}`);
      values.push(dto.phone);
    }
    if (dto.first_name !== undefined) {
      fields.push(`first_name = $${paramIdx++}`);
      values.push(dto.first_name);
    }
    if (dto.last_name !== undefined) {
      fields.push(`last_name = $${paramIdx++}`);
      values.push(dto.last_name);
    }
    if (dto.avatar_url !== undefined) {
      fields.push(`avatar_url = $${paramIdx++}`);
      values.push(dto.avatar_url);
    }

    if (fields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await query<User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundError('User');
    }

    logger.info('User updated', { userId });

    return toPublicUser(result.rows[0]);
  }

  async delete(userId: string): Promise<void> {
    const result = await query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      throw new NotFoundError('User');
    }

    // Revoke all refresh tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    logger.info('User soft-deleted', { userId });
  }

  private async generateAndStoreTokens(
    userId: string,
    email: string,
    role: string
  ): Promise<AuthTokens> {
    const jti = generateJti();
    const accessToken = signAccessToken({ sub: userId, email, role });
    const refreshToken = signRefreshToken(userId, jti);
    const tokenHash = hashToken(refreshToken);
    const expiresAt = getRefreshTokenExpiresAt();

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    );

    // Clean up expired tokens for this user
    await query(
      'DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at <= NOW()',
      [userId]
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 15 * 60, // 15 minutes in seconds
    };
  }
}

export const userService = new UserService();
