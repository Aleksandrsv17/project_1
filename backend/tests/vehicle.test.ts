import { VehicleService } from '../src/services/vehicle/vehicle.service';
import { ConflictError, NotFoundError, ForbiddenError } from '../src/middleware/errorHandler';
import { query } from '../src/db';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  pool: { end: jest.fn() },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ownerId = 'owner-uuid-123';
const vehicleId = 'vehicle-uuid-456';

const mockVehicle = {
  id: vehicleId,
  owner_id: ownerId,
  make: 'Rolls-Royce',
  model: 'Ghost',
  year: 2023,
  license_plate: 'VIP001',
  color: 'Midnight Blue',
  category: 'sedan',
  daily_rate: 1500.00,
  hourly_rate: 200.00,
  chauffeur_available: true,
  chauffeur_daily_rate: 400.00,
  deposit_amount: 5000.00,
  max_daily_km: 300,
  status: 'active',
  location_city: 'New York',
  location_lat: 40.7128,
  location_lng: -74.0060,
  description: 'Luxury sedan with full amenities',
  created_at: new Date(),
  updated_at: new Date(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VehicleService', () => {
  let vehicleService: VehicleService;

  beforeEach(() => {
    vehicleService = new VehicleService();
    jest.clearAllMocks();
  });

  // ── create ────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a vehicle and return it', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // no duplicate
        .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 } as any); // insert

      const vehicle = await vehicleService.create(ownerId, {
        make: 'Rolls-Royce',
        model: 'Ghost',
        year: 2023,
        license_plate: 'VIP001',
        category: 'sedan',
        daily_rate: 1500,
      });

      expect(vehicle.id).toBe(vehicleId);
      expect(vehicle.make).toBe('Rolls-Royce');
      expect(vehicle.owner_id).toBe(ownerId);
    });

    it('should throw ConflictError if license plate already exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 } as any);

      await expect(
        vehicleService.create(ownerId, {
          make: 'BMW',
          model: 'M5',
          year: 2022,
          license_plate: 'VIP001',
          category: 'sedan',
          daily_rate: 800,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated vehicles with media', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any) // count
        .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 } as any)   // data
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);              // media

      const result = await vehicleService.findAll({
        page: 1,
        limit: 20,
        sort: 'newest',
      });

      expect(result.total).toBe(1);
      expect(result.vehicles).toHaveLength(1);
      expect(result.vehicles[0].media).toEqual([]);
    });

    it('should filter by city', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await vehicleService.findAll({
        city: 'Miami',
        page: 1,
        limit: 20,
        sort: 'newest',
      });

      expect(result.total).toBe(0);
      expect(result.vehicles).toHaveLength(0);
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return vehicle with media', async () => {
      const media = [
        { id: 'm1', vehicle_id: vehicleId, url: 'https://example.com/img.jpg', type: 'image', is_primary: true },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 } as any) // vehicle
        .mockResolvedValueOnce({ rows: media, rowCount: 1 } as any);         // media

      const vehicle = await vehicleService.findById(vehicleId);

      expect(vehicle.id).toBe(vehicleId);
      expect(vehicle.media).toHaveLength(1);
      expect(vehicle.media[0].url).toBe('https://example.com/img.jpg');
    });

    it('should throw NotFoundError for unknown vehicle', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(vehicleService.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update vehicle fields', async () => {
      const updatedVehicle = { ...mockVehicle, daily_rate: 2000 };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: vehicleId, owner_id: ownerId }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [updatedVehicle], rowCount: 1 } as any);

      const result = await vehicleService.update(vehicleId, ownerId, { daily_rate: 2000 });

      expect(result.daily_rate).toBe(2000);
    });

    it('should throw ForbiddenError if user does not own vehicle', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: vehicleId, owner_id: 'someone-else' }],
        rowCount: 1,
      } as any);

      await expect(
        vehicleService.update(vehicleId, ownerId, { daily_rate: 2000 })
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError for unknown vehicle', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(
        vehicleService.update('nonexistent', ownerId, { daily_rate: 2000 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should deactivate a vehicle with no active bookings', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: vehicleId, owner_id: ownerId }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // no active bookings
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // update status

      await expect(vehicleService.delete(vehicleId, ownerId)).resolves.toBeUndefined();
    });

    it('should throw AppError if vehicle has active bookings', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: vehicleId, owner_id: ownerId }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ id: 'booking-1' }], rowCount: 1 } as any);

      const { AppError } = require('../src/middleware/errorHandler');
      await expect(vehicleService.delete(vehicleId, ownerId)).rejects.toThrow(AppError);
    });
  });
});
