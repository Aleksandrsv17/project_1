import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (isNaN(parsed)) throw new Error(`Environment variable ${key} must be a number`);
  return parsed;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: optionalNumber('PORT', 3000),
  apiBaseUrl: optional('API_BASE_URL', 'http://localhost:3000'),

  db: {
    url: optional('DATABASE_URL', ''),
    host: optional('DB_HOST', 'localhost'),
    port: optionalNumber('DB_PORT', 5432),
    name: optional('DB_NAME', 'vip_mobility'),
    user: optional('DB_USER', 'postgres'),
    password: optional('DB_PASSWORD', 'password'),
    poolMin: optionalNumber('DB_POOL_MIN', 2),
    poolMax: optionalNumber('DB_POOL_MAX', 10),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    host: optional('REDIS_HOST', 'localhost'),
    port: optionalNumber('REDIS_PORT', 6379),
    password: optional('REDIS_PASSWORD', ''),
  },

  jwt: {
    accessSecret: optional('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-production-32chars'),
    refreshSecret: optional('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production-32chars'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY', ''),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
    publishableKey: optional('STRIPE_PUBLISHABLE_KEY', ''),
  },

  app: {
    platformCommissionRate: optionalNumber('PLATFORM_COMMISSION_RATE', 0.20),
    insuranceFeePerDay: optionalNumber('INSURANCE_FEE_PER_DAY', 25.00),
    mileageOverageRate: optionalNumber('MILEAGE_OVERAGE_RATE', 2.00),
    surgeDemandRatio: optionalNumber('SURGE_DEMAND_RATIO', 1.5),
    surgeMultiplier: optionalNumber('SURGE_MULTIPLIER', 1.2),
    bcryptRounds: optionalNumber('BCRYPT_ROUNDS', 12),
  },

  cors: {
    origin: optional('CORS_ORIGIN', 'http://localhost:3001'),
  },
} as const;

export type Config = typeof config;
