/**
 * Shared fixtures for all QA agent test suites.
 * Provides consistent mock data, token factories, and result types.
 */
import jwt from 'jsonwebtoken';

// ── Token factories ────────────────────────────────────────────────────────────

export const TEST_ACCESS_SECRET = 'test-access-secret-for-jest-tests-32chars!!';
export const TEST_REFRESH_SECRET = 'test-refresh-secret-for-jest-tests-32chars!';
export const OLD_DEFAULT_SECRET = 'dev-access-secret-change-in-production-32chars';

export function makeToken(payload: object, secret = TEST_ACCESS_SECRET, opts: jwt.SignOptions = { expiresIn: '15m' }): string {
  return jwt.sign(payload, secret, { algorithm: 'HS256', ...opts });
}

export const USERS = {
  customer:  { id: 'cust-uuid-0001', email: 'customer@test.com', role: 'customer' },
  customer2: { id: 'cust-uuid-0002', email: 'customer2@test.com', role: 'customer' },
  owner:     { id: 'owner-uuid-001', email: 'owner@test.com', role: 'owner' },
  chauffeur: { id: 'chauff-uuid-01', email: 'chauffeur@test.com', role: 'chauffeur' },
  admin:     { id: 'admin-uuid-001', email: 'admin@test.com', role: 'admin' },
};

export const TOKENS = {
  customer:  makeToken(USERS.customer),
  customer2: makeToken(USERS.customer2),
  owner:     makeToken(USERS.owner),
  chauffeur: makeToken(USERS.chauffeur),
  admin:     makeToken(USERS.admin),
  // Forged with old default secret — must be rejected (BUG-001)
  forged:    makeToken({ sub: 'hacker-000', email: 'hacker@evil.com', role: 'admin' }, OLD_DEFAULT_SECRET),
  // alg:none — must be rejected
  algNone:   (() => {
    const [h, p] = makeToken(USERS.customer).split('.');
    const fakeHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    return `${fakeHeader}.${p}.`;
  })(),
  expired:   makeToken(USERS.customer, TEST_ACCESS_SECRET, { expiresIn: '-1s' }),
};

// ── Mock DB rows ───────────────────────────────────────────────────────────────

export const VEHICLE_ID = 'vehicle-uuid-001';
export const BOOKING_ID = 'booking-uuid-001';
export const OTHER_BOOKING_ID = 'booking-uuid-002';
export const PAYMENT_INTENT_ID = 'pi_mock_001';

export const mockUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: USERS.customer.id,
  email: USERS.customer.email,
  phone: null,
  password_hash: '$2b$12$mock_hash',
  role: 'customer',
  first_name: 'John',
  last_name: 'Doe',
  avatar_url: null,
  is_verified: false,
  kyc_status: 'pending',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
  ...overrides,
});

export const mockVehicle = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: VEHICLE_ID,
  owner_id: USERS.owner.id,
  make: 'Range Rover',
  model: 'Autobiography',
  year: 2024,
  license_plate: 'VIP-001',
  color: 'Black',
  category: 'suv',
  status: 'active',
  daily_rate: '450.00',
  hourly_rate: '65.00',
  chauffeur_available: true,
  chauffeur_daily_rate: '600.00',
  deposit_amount: '2000.00',
  max_daily_km: 300,
  location_city: 'Dubai',
  description: 'Test vehicle',
  ...overrides,
});

export const mockBooking = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: BOOKING_ID,
  customer_id: USERS.customer.id,
  vehicle_id: VEHICLE_ID,
  chauffeur_id: null,
  type: 'daily_rental',
  mode: 'self_drive',
  status: 'pending',
  start_time: new Date(Date.now() + 72 * 3600 * 1000), // 72h from now (full refund zone)
  end_time: new Date(Date.now() + 96 * 3600 * 1000),
  actual_end_time: null,
  pickup_address: '123 Main St, Dubai',
  pickup_lat: 25.2048,
  pickup_lng: 55.2708,
  dropoff_address: '456 Palm St, Dubai',
  dropoff_lat: 25.11,
  dropoff_lng: 55.13,
  base_amount: '450.00',
  chauffeur_fee: '0.00',
  insurance_fee: '75.00',
  mileage_overage: '0.00',
  platform_commission: '90.00',
  total_amount: '615.00',
  deposit_amount: '2000.00',
  notes: null,
  cancellation_reason: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

export const mockQueryResult = <T>(rows: T[], rowCount?: number) => ({
  rows,
  rowCount: rowCount ?? rows.length,
  command: 'SELECT',
  oid: 0,
  fields: [],
});

// ── Agent result types (fed to QA Orchestrator) ────────────────────────────────

export type AgentName = 'api-contract' | 'security' | 'business-logic' | 'realtime';
export type Severity = 'blocker' | 'high' | 'medium' | 'low';

export interface AgentResult {
  agent: AgentName;
  testId: string;
  severity: Severity;
  passed: boolean;
  details: string;
}

// Shared results collector — each agent pushes here, orchestrator reads
export const agentResults: AgentResult[] = [];

export function reportResult(result: AgentResult): void {
  agentResults.push(result);
}
