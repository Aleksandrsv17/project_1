import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export interface JwtAccessPayload {
  sub: string;       // user id
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string;       // user id
  jti: string;       // unique token id for revocation
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtAccessPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as any,
    algorithm: 'HS256',
  });
}

export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, jti }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  return jwt.verify(token, config.jwt.accessSecret, {
    algorithms: ['HS256'],
  }) as JwtAccessPayload;
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  return jwt.verify(token, config.jwt.refreshSecret, {
    algorithms: ['HS256'],
  }) as JwtRefreshPayload;
}

export function generateJti(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getRefreshTokenExpiresAt(): Date {
  const expiresAt = new Date();
  const str = config.jwt.refreshExpiresIn; // e.g. "7d", "14d"
  const match = str.match(/^(\d+)d$/);
  const days = match ? parseInt(match[1], 10) : 7;
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}
