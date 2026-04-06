/**
 * Jest global setup — runs before ANY test module is imported.
 * Sets all required env vars so config/index.ts doesn't throw.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-jest-tests-32chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest-tests-32chars!';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.DATABASE_URL = 'postgresql://vip_user:VipSecure2026@localhost:5432/vip_mobility';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.CORS_ORIGIN = 'http://localhost:3001';
process.env.PLATFORM_COMMISSION_RATE = '0.20';
process.env.INSURANCE_FEE_PER_DAY = '25.00';
process.env.MILEAGE_OVERAGE_RATE = '2.00';
process.env.SURGE_DEMAND_RATIO = '1.5';
process.env.SURGE_MULTIPLIER = '1.2';
