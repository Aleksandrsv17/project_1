/**
 * QA Agent 2 — API Contract Tester
 * Tests every endpoint for correct status codes, response shapes, and validation.
 * Reports findings to QA Orchestrator via AgentResult[].
 */
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import {
  TOKENS, mockUser, mockVehicle, mockBooking,
  mockQueryResult, VEHICLE_ID, BOOKING_ID, PAYMENT_INTENT_ID, USERS,
} from './fixtures';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  pool: { end: jest.fn() },
}));

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: PAYMENT_INTENT_ID, client_secret: 'pi_secret', status: 'requires_payment_method', latest_charge: null }),
      retrieve: jest.fn().mockResolvedValue({ id: PAYMENT_INTENT_ID, status: 'succeeded', latest_charge: 'ch_mock' }),
    },
    refunds: { create: jest.fn().mockResolvedValue({ id: 're_mock' }) },
  }))
);

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));

import { query, withTransaction } from '../../src/db';
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const app = createApp();

// Helper: mock a successful auth flow (register/login returns user + tokens)
function setupAuthMocks() {
  mockQuery
    .mockResolvedValueOnce(mockQueryResult([]))        // check duplicate email → none
    .mockResolvedValueOnce(mockQueryResult([mockUser()])) // insert user
    .mockResolvedValueOnce(mockQueryResult([]))        // insert refresh token
    .mockResolvedValueOnce(mockQueryResult([]));       // cleanup expired tokens
}

// Helper: mock profile lookup
function setupProfileMock() {
  mockQuery.mockResolvedValueOnce(mockQueryResult([mockUser()]));
}

// ── Auth Routes ───────────────────────────────────────────────────────────────

describe('Agent-2 | API Contract — Auth Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  // POST /v1/auth/register
  describe('POST /v1/auth/register', () => {
    it('201 + {success, data.user, data.tokens} for valid input', async () => {
      setupAuthMocks();
      const res = await request(app).post('/v1/auth/register').send({
        email: 'new@example.com', password: 'Password1!',
        first_name: 'Jane', last_name: 'Doe', phone: '+1234567890',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('new@example.com');
      expect(res.body.data.tokens.access_token).toBeDefined();
      expect(res.body.data.tokens.refresh_token).toBeDefined();
    });

    it('400 when email is missing', async () => {
      const res = await request(app).post('/v1/auth/register').send({
        password: 'Password1!', first_name: 'Jane', last_name: 'Doe',
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('400 when password too short (<8 chars)', async () => {
      const res = await request(app).post('/v1/auth/register').send({
        email: 'x@x.com', password: 'short', first_name: 'A', last_name: 'B',
      });
      expect(res.status).toBe(400);
    });

    it('409 for duplicate email', async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([mockUser()])); // existing user found
      const res = await request(app).post('/v1/auth/register').send({
        email: 'existing@example.com', password: 'Password1!',
        first_name: 'Jane', last_name: 'Doe',
      });
      expect(res.status).toBe(409);
    });
  });

  // POST /v1/auth/login
  describe('POST /v1/auth/login', () => {
    it('200 + tokens for correct credentials', async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([mockUser()]));
      (mockBcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>)
        .mockResolvedValue(true as never);
      mockQuery
        .mockResolvedValueOnce(mockQueryResult([]))
        .mockResolvedValueOnce(mockQueryResult([]));

      const res = await request(app).post('/v1/auth/login').send({
        email: 'customer@test.com', password: 'Password1!',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.tokens.access_token).toBeDefined();
    });

    it('401 for wrong password', async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([mockUser()]));
      (mockBcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>)
        .mockResolvedValue(false as never);

      const res = await request(app).post('/v1/auth/login').send({
        email: 'customer@test.com', password: 'WrongPass!',
      });
      expect(res.status).toBe(401);
    });

    it('401 for non-existent email', async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));
      const res = await request(app).post('/v1/auth/login').send({
        email: 'ghost@example.com', password: 'Password1!',
      });
      expect(res.status).toBe(401);
    });

    it('400 for missing email', async () => {
      const res = await request(app).post('/v1/auth/login').send({ password: 'Password1!' });
      expect(res.status).toBe(400);
    });
  });

  // GET /v1/auth/profile
  describe('GET /v1/auth/profile', () => {
    it('200 with user object when authenticated', async () => {
      setupProfileMock();
      const res = await request(app).get('/v1/auth/profile')
        .set('Authorization', `Bearer ${TOKENS.customer}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBeDefined();
    });

    it('401 with no token', async () => {
      const res = await request(app).get('/v1/auth/profile');
      expect(res.status).toBe(401);
    });

    it('401 with expired token', async () => {
      const res = await request(app).get('/v1/auth/profile')
        .set('Authorization', `Bearer ${TOKENS.expired}`);
      expect(res.status).toBe(401);
    });
  });

  // GET /v1/auth/ (admin list users)
  describe('GET /v1/auth/ (admin: list all users)', () => {
    it('200 for admin role', async () => {
      mockQuery
        .mockResolvedValueOnce(mockQueryResult([{ count: '5' }]))
        .mockResolvedValueOnce(mockQueryResult([mockUser()]));
      const res = await request(app).get('/v1/auth/')
        .set('Authorization', `Bearer ${TOKENS.admin}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('403 for customer role (BUG-005 regression)', async () => {
      const res = await request(app).get('/v1/auth/')
        .set('Authorization', `Bearer ${TOKENS.customer}`);
      expect(res.status).toBe(403);
    });
  });

  // PATCH /v1/auth/:id/kyc (admin only)
  describe('PATCH /v1/auth/:id/kyc', () => {
    it('200 when admin approves KYC', async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([mockUser({ kyc_status: 'approved' })]));
      const res = await request(app).patch(`/v1/auth/${USERS.customer.id}/kyc`)
        .set('Authorization', `Bearer ${TOKENS.admin}`)
        .send({ kyc_status: 'approved' });
      expect(res.status).toBe(200);
    });

    it('403 when customer tries to approve KYC (BUG-005 regression)', async () => {
      const res = await request(app).patch(`/v1/auth/${USERS.customer.id}/kyc`)
        .set('Authorization', `Bearer ${TOKENS.customer}`)
        .send({ kyc_status: 'approved' });
      expect(res.status).toBe(403);
    });
  });
});

// ── Vehicle Routes ────────────────────────────────────────────────────────────

describe('Agent-2 | API Contract — Vehicle Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /v1/vehicles', () => {
    it('200 with paginated array (no auth required)', async () => {
      mockQuery
        .mockResolvedValueOnce(mockQueryResult([{ count: '4' }]))
        .mockResolvedValueOnce(mockQueryResult([mockVehicle()]));
      const res = await request(app).get('/v1/vehicles');
      expect(res.status).toBe(200);
      expect(res.body.data.vehicles).toBeInstanceOf(Array);
      expect(res.body.data.pagination.total).toBe(4);
    });
  });

  describe('GET /v1/vehicles/:id', () => {
    it('200 with vehicle object', async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([mockVehicle()]));
      const res = await request(app).get(`/v1/vehicles/${VEHICLE_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.data.vehicle.make).toBe('Range Rover');
    });

    it('404 for non-existent vehicle', async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));
      const res = await request(app).get('/v1/vehicles/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/vehicles', () => {
    const validVehicle = {
      make: 'BMW', model: 'X7', year: 2024, license_plate: 'TST-001',
      category: 'suv', daily_rate: 300,
    };

    it('403 when customer tries to create a vehicle', async () => {
      const res = await request(app).post('/v1/vehicles')
        .set('Authorization', `Bearer ${TOKENS.customer}`)
        .send(validVehicle);
      expect(res.status).toBe(403);
    });

    it('201 when owner creates a vehicle', async () => {
      mockQuery.mockResolvedValueOnce(mockQueryResult([mockVehicle()]));
      const res = await request(app).post('/v1/vehicles')
        .set('Authorization', `Bearer ${TOKENS.owner}`)
        .send(validVehicle);
      expect(res.status).toBe(201);
    });

    it('401 with no auth token', async () => {
      const res = await request(app).post('/v1/vehicles').send(validVehicle);
      expect(res.status).toBe(401);
    });
  });
});

// ── Booking Routes ────────────────────────────────────────────────────────────

describe('Agent-2 | API Contract — Booking Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /v1/bookings', () => {
    const validBooking = {
      vehicle_id: VEHICLE_ID,
      type: 'daily_rental',
      mode: 'self_drive',
      start_time: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      duration_hours: 48,
      pickup_address: '123 Main St',
    };

    it('400 for missing vehicle_id', async () => {
      const res = await request(app).post('/v1/bookings')
        .set('Authorization', `Bearer ${TOKENS.customer}`)
        .send({ ...validBooking, vehicle_id: undefined });
      expect(res.status).toBe(400);
    });

    it('400 for missing start_time', async () => {
      const res = await request(app).post('/v1/bookings')
        .set('Authorization', `Bearer ${TOKENS.customer}`)
        .send({ ...validBooking, start_time: undefined });
      expect(res.status).toBe(400);
    });

    it('401 with no auth', async () => {
      const res = await request(app).post('/v1/bookings').send(validBooking);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/bookings/my', () => {
    it('200 with paginated list', async () => {
      mockQuery
        .mockResolvedValueOnce(mockQueryResult([{ count: '1' }]))
        .mockResolvedValueOnce(mockQueryResult([{
          ...mockBooking(),
          v_make: 'Range Rover', v_model: 'Autobiography', v_year: 2024,
          v_license_plate: 'VIP-001', v_color: 'Black', v_category: 'suv',
          u_first_name: 'John', u_last_name: 'Doe', u_email: 'customer@test.com', u_phone: null,
        }]));
      const res = await request(app).get('/v1/bookings/my')
        .set('Authorization', `Bearer ${TOKENS.customer}`);
      expect(res.status).toBe(200);
      expect(res.body.data.bookings).toBeInstanceOf(Array);
    });
  });

  describe('PATCH /v1/bookings/:id/complete — BUG-006', () => {
    it('400 for string extra_km (prevents NaN corruption)', async () => {
      const res = await request(app).patch(`/v1/bookings/${BOOKING_ID}/complete`)
        .set('Authorization', `Bearer ${TOKENS.chauffeur}`)
        .send({ extra_km: 'abc' });
      expect(res.status).toBe(400);
    });

    it('400 for negative extra_km', async () => {
      const res = await request(app).patch(`/v1/bookings/${BOOKING_ID}/complete`)
        .set('Authorization', `Bearer ${TOKENS.chauffeur}`)
        .send({ extra_km: -5 });
      expect(res.status).toBe(400);
    });

    it('400 for extra_km exceeding max (10000)', async () => {
      const res = await request(app).patch(`/v1/bookings/${BOOKING_ID}/complete`)
        .set('Authorization', `Bearer ${TOKENS.chauffeur}`)
        .send({ extra_km: 99999 });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /v1/bookings/:id/cancel', () => {
    it('400 when cancellation_reason is missing', async () => {
      const res = await request(app).patch(`/v1/bookings/${BOOKING_ID}/cancel`)
        .set('Authorization', `Bearer ${TOKENS.customer}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});

// ── Chauffeur Routes ──────────────────────────────────────────────────────────

describe('Agent-2 | API Contract — Chauffeur Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('PATCH /v1/chauffeurs/:id/approve — BUG-007', () => {
    it('403 when chauffeur (non-admin) tries to approve', async () => {
      const res = await request(app).patch('/v1/chauffeurs/some-id/approve')
        .set('Authorization', `Bearer ${TOKENS.chauffeur}`);
      expect(res.status).toBe(403);
    });

    it('403 when customer tries to approve', async () => {
      const res = await request(app).patch('/v1/chauffeurs/some-id/approve')
        .set('Authorization', `Bearer ${TOKENS.customer}`);
      expect(res.status).toBe(403);
    });

    it('401 with no auth', async () => {
      const res = await request(app).patch('/v1/chauffeurs/some-id/approve');
      expect(res.status).toBe(401);
    });
  });
});
