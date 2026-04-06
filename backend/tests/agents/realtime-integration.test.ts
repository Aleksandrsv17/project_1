/**
 * QA Agent 5 — Real-time & Integration Tester
 * Tests Socket.io room security and concurrent booking race conditions.
 *
 * CRITICAL BUGS COVERED:
 *   BUG-004 — Socket.io room membership check (room spoofing prevention)
 *   BUG-008 — Double-booking race condition (SELECT FOR UPDATE in transaction)
 *
 * Socket.io tests: use socket.io-client against a live HTTP server (in-process).
 * Race condition tests: verify the service layer rejects concurrent conflicting requests.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../../src/app';
import { BookingService } from '../../src/services/booking/booking.service';
import { query, withTransaction } from '../../src/db';
import {
  TOKENS, USERS, VEHICLE_ID, BOOKING_ID,
  mockBooking, mockVehicle, mockQueryResult,
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
      create: jest.fn().mockResolvedValue({ id: 'pi_mock', client_secret: 'secret', status: 'pending', latest_charge: null }),
    },
    refunds: { create: jest.fn() },
  }))
);

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

// ── Socket.io Tests ───────────────────────────────────────────────────────────

describe('Agent-5 | Real-time — Socket.io Auth & Room Security', () => {
  let server: http.Server;
  let port: number;
  let ioClient: typeof import('socket.io-client').io;

  beforeAll(async () => {
    const { io } = await import('socket.io-client');
    ioClient = io;

    // Start Express + Socket.io on a random port
    const app = createApp();
    server = http.createServer(app);

    // Initialize tracking gateway
    const { trackingGateway } = await import('../../src/services/tracking/tracking.gateway');
    trackingGateway.initialize(server);

    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  beforeEach(() => jest.clearAllMocks());

  function connect(token?: string) {
    return ioClient(`http://localhost:${port}`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      timeout: 3000,
    });
  }

  function waitForEvent(socket: ReturnType<typeof ioClient>, event: string, timeoutMs = 1000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
      socket.once(event, (data) => { clearTimeout(t); resolve(data); });
    });
  }

  // BUG-004: connection without token must be rejected
  it('BUG-004: rejects WebSocket connection without auth token', done => {
    const socket = connect(); // no token
    socket.on('connect_error', (err) => {
      expect(err.message).toMatch(/authentication|token/i);
      socket.close();
      done();
    });
    socket.on('connect', () => {
      socket.close();
      done(new Error('Should not have connected without token'));
    });
  });

  // BUG-004: connection with valid token succeeds
  it('connects successfully with valid JWT', done => {
    const socket = connect(TOKENS.customer);
    socket.on('connect', () => {
      socket.close();
      done();
    });
    socket.on('connect_error', (err) => {
      socket.close();
      done(new Error(`Should connect: ${err.message}`));
    });
  });

  // BUG-004: forged token rejected
  it('BUG-004: rejects connection with forged (wrong-secret) token', done => {
    const socket = connect(TOKENS.forged);
    socket.on('connect_error', (err) => {
      expect(err.message).toMatch(/invalid|expired|token/i);
      socket.close();
      done();
    });
    socket.on('connect', () => {
      socket.close();
      done(new Error('Should not connect with forged token'));
    });
  });

  // BUG-004: ride:status emitted without joining room is rejected
  it('BUG-004: ride:status without booking:join returns error event', done => {
    mockQuery.mockResolvedValueOnce(mockQueryResult([
      mockBooking({ customer_id: USERS.customer.id }),
    ]));

    const attacker = connect(TOKENS.customer2);

    attacker.on('connect', () => {
      // Emit without joining — should get an error back
      attacker.emit('ride:status', { bookingId: BOOKING_ID, status: 'completed' });
    });

    attacker.on('error', (err: { message: string }) => {
      expect(err.message).toMatch(/not authorized/i);
      attacker.close();
      done();
    });

    setTimeout(() => {
      attacker.close();
      done(new Error('No error received for unauthorized room emit'));
    }, 1500);
  });

  // BUG-004: chat:message emitted without joining room is rejected
  it('BUG-004: chat:message without booking:join returns error event', done => {
    const attacker = connect(TOKENS.customer2);

    attacker.on('connect', () => {
      attacker.emit('chat:message', { bookingId: BOOKING_ID, message: 'hack' });
    });

    attacker.on('error', (err: { message: string }) => {
      expect(err.message).toMatch(/not authorized/i);
      attacker.close();
      done();
    });

    setTimeout(() => {
      attacker.close();
      done(new Error('No error received for unauthorized chat emit'));
    }, 1500);
  });

  // Room membership: after joining, legitimate user CAN send events
  it('location:update is broadcast to room after joining', done => {
    mockQuery
      // booking:join auth check
      .mockResolvedValueOnce(mockQueryResult([
        mockBooking({ customer_id: USERS.customer.id }),
      ]))
      // location:update — chauffeur DB update (skipped, different role)
      ;

    const customer = connect(TOKENS.customer);
    const chauffeur = connect(TOKENS.chauffeur);

    let customerConnected = false;
    let chauffeurConnected = false;

    const tryJoin = () => {
      if (!customerConnected || !chauffeurConnected) return;

      // Customer joins the booking room
      customer.emit('booking:join', { bookingId: BOOKING_ID });

      customer.once('booking:joined', () => {
        // Chauffeur (in same room conceptually — just testing broadcast)
        chauffeur.emit('booking:join', { bookingId: BOOKING_ID });

        chauffeur.once('booking:joined', () => {
          // Chauffeur sends location update — customer should receive it
          customer.once('location:updated', (data: { bookingId: string }) => {
            expect(data.bookingId).toBe(BOOKING_ID);
            customer.close();
            chauffeur.close();
            done();
          });

          chauffeur.emit('location:update', {
            bookingId: BOOKING_ID, lat: 25.20, lng: 55.27, timestamp: Date.now(),
          });
        });

        // Second join needs another mock
        mockQuery.mockResolvedValueOnce(mockQueryResult([
          mockBooking({ customer_id: USERS.customer.id }),
        ]));
      });
    };

    customer.on('connect', () => { customerConnected = true; tryJoin(); });
    chauffeur.on('connect', () => { chauffeurConnected = true; tryJoin(); });

    // Also set up mock for the second booking:join call
    mockQuery.mockResolvedValueOnce(mockQueryResult([
      mockBooking({ customer_id: USERS.customer.id }),
    ]));

    setTimeout(() => {
      customer.close(); chauffeur.close();
      done(new Error('location:updated not received within timeout'));
    }, 3000);
  });
});

// ── BUG-008: Race Condition (Double-Booking) ───────────────────────────────────

describe('Agent-5 | Real-time — BUG-008: Double-booking Race Condition', () => {
  let bookingService: BookingService;

  beforeEach(() => {
    bookingService = new BookingService();
    jest.clearAllMocks();
  });

  it('BUG-008: concurrent bookings — withTransaction is called for EACH request (not shared)', async () => {
    /**
     * The real race condition protection requires a live DB with SELECT ... FOR UPDATE.
     * Here we verify the structural guarantee: withTransaction is invoked per booking,
     * meaning each request gets its own DB transaction (not shared state).
     *
     * For full end-to-end race condition testing, run against a real DB:
     *   TEST_MODE=integration npm run test:agents
     */
    let transactionCount = 0;

    mockWithTransaction.mockImplementation(async (cb) => {
      transactionCount++;
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce(mockQueryResult([]))  // SELECT FOR UPDATE (lock)
          .mockResolvedValueOnce(mockQueryResult([]))  // overlap check → no conflict
          .mockResolvedValueOnce(mockQueryResult([mockBooking()])), // INSERT
      };
      return cb(client as never);
    });

    mockQuery
      .mockResolvedValueOnce(mockQueryResult([mockVehicle()]))  // vehicle lookup #1
      .mockResolvedValueOnce(mockQueryResult([]))                // surge active bookings #1
      .mockResolvedValueOnce(mockQueryResult([{ count: '2' }])) // surge vehicles #1
      .mockResolvedValueOnce(mockQueryResult([mockVehicle()]))  // vehicle lookup #2
      .mockResolvedValueOnce(mockQueryResult([]))
      .mockResolvedValueOnce(mockQueryResult([{ count: '2' }]));

    const futureStart = new Date(Date.now() + 48 * 3600 * 1000);
    const bookingDto = {
      vehicle_id: VEHICLE_ID,
      type: 'daily_rental' as const,
      mode: 'self_drive' as const,
      start_time: futureStart,
      duration_hours: 24,
    };

    // Fire 2 concurrent booking requests
    const [r1, r2] = await Promise.allSettled([
      bookingService.create(USERS.customer.id, bookingDto),
      bookingService.create(USERS.customer2.id, bookingDto),
    ]);

    // Both got their own transaction
    expect(transactionCount).toBe(2);

    // Both succeeded in this mock (real DB would reject the second via FOR UPDATE + overlap check)
    // The important thing is each went through its own transaction
    const successes = [r1, r2].filter(r => r.status === 'fulfilled').length;
    expect(successes).toBeGreaterThanOrEqual(1);
  });

  it('BUG-008: overlap check inside transaction rejects conflicting booking', async () => {
    /**
     * Simulates what happens when the SELECT FOR UPDATE + overlap check
     * finds an existing booking in the same window.
     */
    mockWithTransaction.mockImplementation(async (cb) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce(mockQueryResult([]))  // SELECT FOR UPDATE (lock vehicle)
          .mockResolvedValueOnce(mockQueryResult([     // overlap check → CONFLICT FOUND
            mockBooking({ status: 'confirmed' }),
          ])),
      };
      return cb(client as never);
    });

    mockQuery
      .mockResolvedValueOnce(mockQueryResult([mockVehicle()]))  // vehicle lookup
      .mockResolvedValueOnce(mockQueryResult([]))
      .mockResolvedValueOnce(mockQueryResult([{ count: '2' }]));

    const futureStart = new Date(Date.now() + 48 * 3600 * 1000);

    await expect(
      bookingService.create(USERS.customer2.id, {
        vehicle_id: VEHICLE_ID,
        type: 'daily_rental',
        mode: 'self_drive',
        start_time: futureStart,
        duration_hours: 24,
      })
    ).rejects.toThrow('not available');
  });
});
