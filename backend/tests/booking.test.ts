import { BookingService } from '../src/services/booking/booking.service';
import { query, withTransaction } from '../src/db';
import { ConflictError, NotFoundError, AppError } from '../src/middleware/errorHandler';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  pool: { end: jest.fn() },
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_mock',
        client_secret: 'pi_mock_secret',
        status: 'requires_payment_method',
        latest_charge: null,
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_mock',
        status: 'succeeded',
        latest_charge: 'ch_mock',
      }),
    },
    refunds: {
      create: jest.fn().mockResolvedValue({ id: 're_mock' }),
    },
  }));
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const customerId = 'customer-uuid-1';
const vehicleId = 'vehicle-uuid-1';
const bookingId = 'booking-uuid-1';

const mockVehicle = {
  id: vehicleId,
  owner_id: 'owner-uuid-1',
  make: 'Bentley',
  model: 'Continental',
  year: 2023,
  license_plate: 'LUX999',
  color: 'Black',
  category: 'coupe',
  daily_rate: '2000.00',
  hourly_rate: '250.00',
  chauffeur_available: true,
  chauffeur_daily_rate: '500.00',
  deposit_amount: '5000.00',
  max_daily_km: 300,
  status: 'active',
  location_city: 'Miami',
  location_lat: 25.7617,
  location_lng: -80.1918,
};

const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
const endDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

const mockBooking = {
  id: bookingId,
  customer_id: customerId,
  vehicle_id: vehicleId,
  chauffeur_id: null,
  type: 'daily_rental',
  mode: 'self_drive',
  status: 'pending',
  start_time: futureDate,
  end_time: endDate,
  actual_end_time: null,
  pickup_address: '123 Main St, Miami',
  pickup_lat: 25.7617,
  pickup_lng: -80.1918,
  dropoff_address: null,
  dropoff_lat: null,
  dropoff_lng: null,
  base_amount: '6000.00',
  chauffeur_fee: '0',
  insurance_fee: '75.00',
  mileage_overage: '0',
  platform_commission: '1200.00',
  total_amount: '7275.00',
  deposit_amount: '5000.00',
  notes: null,
  cancellation_reason: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BookingService', () => {
  let bookingService: BookingService;

  beforeEach(() => {
    bookingService = new BookingService();
    jest.clearAllMocks();
  });

  // ── create ────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a booking with pricing and return client secret', async () => {
      // Mock vehicle fetch
      mockQuery
        .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 } as any) // vehicle
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // no overlapping bookings
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 } as any) // active bookings (surge)
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 } as any) // available vehicles
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // payment insert
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // deposit insert

      mockWithTransaction.mockImplementationOnce(async (callback) => {
        const fakeClient = {
          query: jest.fn().mockResolvedValue({ rows: [mockBooking], rowCount: 1 }),
        };
        return callback(fakeClient as any);
      });

      const result = await bookingService.create(customerId, {
        vehicle_id: vehicleId,
        type: 'daily_rental',
        mode: 'self_drive',
        start_time: futureDate,
        end_time: endDate,
        pickup_address: '123 Main St, Miami',
        pickup_lat: 25.7617,
        pickup_lng: -80.1918,
      });

      expect(result.booking).toBeDefined();
      expect(result.booking.id).toBe(bookingId);
      expect(result.clientSecret).toBe('pi_mock_secret');
    });

    it('should throw NotFoundError when vehicle does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(
        bookingService.create(customerId, {
          vehicle_id: 'nonexistent',
          type: 'daily_rental',
          mode: 'self_drive',
          start_time: futureDate,
          end_time: endDate,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when vehicle has overlapping booking', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 } as any) // vehicle
        .mockResolvedValueOnce({ rows: [{ id: 'existing-booking' }], rowCount: 1 } as any); // overlap

      await expect(
        bookingService.create(customerId, {
          vehicle_id: vehicleId,
          type: 'daily_rental',
          mode: 'self_drive',
          start_time: futureDate,
          end_time: endDate,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw AppError when requesting chauffeur on non-chauffeur vehicle', async () => {
      const nonChauffeurVehicle = { ...mockVehicle, chauffeur_available: false };
      mockQuery
        .mockResolvedValueOnce({ rows: [nonChauffeurVehicle], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // no overlapping

      await expect(
        bookingService.create(customerId, {
          vehicle_id: vehicleId,
          type: 'daily_rental',
          mode: 'chauffeur',
          start_time: futureDate,
          end_time: endDate,
        })
      ).rejects.toThrow(AppError);
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel a pending booking by customer', async () => {
      const cancelledBooking = { ...mockBooking, status: 'cancelled', cancellation_reason: 'Plans changed' };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockBooking], rowCount: 1 } as any) // find booking
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)            // update status
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)            // check payments
        .mockResolvedValueOnce({ rows: [cancelledBooking], rowCount: 1 } as any); // return updated

      const result = await bookingService.cancel(bookingId, customerId, 'customer', 'Plans changed');

      expect(result.status).toBe('cancelled');
    });

    it('should throw NotFoundError for non-existent booking', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(
        bookingService.cancel('nonexistent', customerId, 'customer', 'reason')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError when non-customer tries to cancel', async () => {
      const bookingForOtherCustomer = { ...mockBooking, customer_id: 'other-customer' };

      mockQuery.mockResolvedValueOnce({ rows: [bookingForOtherCustomer], rowCount: 1 } as any);

      const { ForbiddenError } = require('../src/middleware/errorHandler');
      await expect(
        bookingService.cancel(bookingId, customerId, 'customer', 'reason')
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // ── findByCustomer ─────────────────────────────────────────────────────────────

  describe('findByCustomer', () => {
    it('should return paginated bookings with vehicle and customer details', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [mockBooking], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ make: 'Bentley', model: 'Continental', year: 2023, license_plate: 'LUX999', color: 'Black', category: 'coupe' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ first_name: 'John', last_name: 'Doe', email: 'john@example.com', phone: null }], rowCount: 1 } as any);

      const result = await bookingService.findByCustomer(customerId);

      expect(result.total).toBe(1);
      expect(result.bookings).toHaveLength(1);
      expect(result.bookings[0].vehicle?.make).toBe('Bentley');
    });
  });
});
