import { calculatePrice, PricingInput, VehicleRates } from '../src/utils/pricing';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseVehicle: VehicleRates = {
  dailyRate: 1000,
  hourlyRate: 150,
  chauffeurAvailable: true,
  chauffeurDailyRate: 300,
  depositAmount: 5000,
  maxDailyKm: 300,
};

const selfDriveVehicle: VehicleRates = {
  ...baseVehicle,
  chauffeurAvailable: false,
  chauffeurDailyRate: null,
};

function makeInput(overrides: Partial<PricingInput> = {}): PricingInput {
  const now = new Date('2026-04-10T10:00:00Z');
  return {
    vehicle: baseVehicle,
    mode: 'self_drive',
    type: 'daily_rental',
    startTime: now,
    endTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Pricing Engine - calculatePrice', () => {
  // ── Daily rental ───────────────────────────────────────────────────────────

  describe('daily rental (self_drive)', () => {
    it('should calculate 2-day rental correctly', () => {
      const result = calculatePrice(makeInput());

      expect(result.durationDays).toBeCloseTo(2, 0);
      expect(result.baseAmount).toBe(2000); // 2 days * $1000
      expect(result.chauffeurFee).toBe(0);
      expect(result.insuranceFee).toBe(50); // $25 * 2 days
      expect(result.mileageOverage).toBe(0);
      expect(result.platformCommission).toBe(400); // 20% of $2000
      expect(result.totalAmount).toBe(2450); // 2000 + 0 + 50 + 0 + 400
      expect(result.depositAmount).toBe(5000);
    });

    it('should ceil partial days (e.g., 1.5 days => 2 days billing)', () => {
      const now = new Date('2026-04-10T10:00:00Z');
      const result = calculatePrice(makeInput({
        startTime: now,
        endTime: new Date(now.getTime() + 1.5 * 24 * 60 * 60 * 1000),
      }));

      // 1.5 days = 2 billable days
      expect(result.baseAmount).toBe(2000);
    });

    it('should return correct breakdown labels', () => {
      const result = calculatePrice(makeInput());

      expect(result.breakdown.durationLabel).toContain('day');
      expect(result.breakdown.insuranceFeeLabel).toBeDefined();
      expect(result.breakdown.commissionLabel).toContain('20%');
    });
  });

  // ── Chauffeur mode ─────────────────────────────────────────────────────────

  describe('daily rental with chauffeur', () => {
    it('should add chauffeur fee for chauffeur mode', () => {
      const result = calculatePrice(makeInput({ mode: 'chauffeur' }));

      expect(result.chauffeurFee).toBe(600); // 2 days * $300
      // Commission is 20% of (base + chauffeur) = 20% of (2000 + 600) = 520
      expect(result.platformCommission).toBe(520);
      expect(result.totalAmount).toBe(
        result.baseAmount + result.chauffeurFee + result.insuranceFee + result.platformCommission
      );
    });

    it('should not add chauffeur fee when vehicle has no chauffeur', () => {
      const result = calculatePrice(makeInput({
        vehicle: selfDriveVehicle,
        mode: 'chauffeur',
      }));

      expect(result.chauffeurFee).toBe(0);
    });
  });

  // ── Hourly rental ──────────────────────────────────────────────────────────

  describe('hourly rental', () => {
    it('should calculate 3-hour rental using hourly rate', () => {
      const now = new Date('2026-04-10T10:00:00Z');
      const result = calculatePrice(makeInput({
        type: 'hourly_rental',
        startTime: now,
        endTime: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours
      }));

      expect(result.durationHours).toBeCloseTo(3, 1);
      expect(result.baseAmount).toBe(450); // 3h * $150
    });

    it('should fallback to prorated daily rate when no hourly rate set', () => {
      const vehicleNoHourly: VehicleRates = { ...baseVehicle, hourlyRate: null };
      const now = new Date('2026-04-10T10:00:00Z');

      const result = calculatePrice(makeInput({
        vehicle: vehicleNoHourly,
        type: 'hourly_rental',
        startTime: now,
        endTime: new Date(now.getTime() + 4 * 60 * 60 * 1000), // 4 hours
      }));

      // 4 hours at $1000/24 = $41.67/h => $166.67
      const expectedBase = Math.round((1000 / 24) * 4 * 100) / 100;
      expect(result.baseAmount).toBeCloseTo(expectedBase, 1);
    });
  });

  // ── Instant ride ───────────────────────────────────────────────────────────

  describe('instant_ride', () => {
    it('should calculate 1-hour instant ride', () => {
      const now = new Date('2026-04-10T10:00:00Z');
      const result = calculatePrice(makeInput({
        type: 'instant_ride',
        startTime: now,
        endTime: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour
      }));

      expect(result.durationHours).toBeCloseTo(1, 1);
      expect(result.baseAmount).toBe(150); // 1h * $150
    });
  });

  // ── Mileage overage ────────────────────────────────────────────────────────

  describe('mileage overage', () => {
    it('should add $2/km for each km over the limit', () => {
      const result = calculatePrice(makeInput({ extraKm: 50 }));

      expect(result.mileageOverage).toBe(100); // 50km * $2
      expect(result.totalAmount).toBeGreaterThan(2000);
    });

    it('should not charge mileage overage when extraKm is 0', () => {
      const result = calculatePrice(makeInput({ extraKm: 0 }));
      expect(result.mileageOverage).toBe(0);
    });
  });

  // ── Surge pricing ──────────────────────────────────────────────────────────

  describe('surge pricing', () => {
    it('should apply 1.2x multiplier when demand/supply ratio > 1.5', () => {
      const surgeInput = makeInput({
        activeBookingsCount: 15, // 15 active bookings
        availableVehiclesCount: 8, // 8 available = ratio 1.875 > 1.5
      });

      const result = calculatePrice(surgeInput);

      expect(result.surgeApplied).toBe(true);
      expect(result.surgeMultiplier).toBe(1.2);
      expect(result.baseAmount).toBe(2400); // 2 days * $1000 * 1.2
    });

    it('should NOT apply surge when ratio is below threshold', () => {
      const noSurgeInput = makeInput({
        activeBookingsCount: 5,
        availableVehiclesCount: 20, // ratio 0.25 < 1.5
      });

      const result = calculatePrice(noSurgeInput);

      expect(result.surgeApplied).toBe(false);
      expect(result.surgeMultiplier).toBe(1);
      expect(result.baseAmount).toBe(2000);
    });

    it('should NOT apply surge when counts are undefined', () => {
      const result = calculatePrice(makeInput({}));

      expect(result.surgeApplied).toBe(false);
      expect(result.surgeMultiplier).toBe(1);
    });
  });

  // ── Insurance ──────────────────────────────────────────────────────────────

  describe('insurance fee', () => {
    it('should charge $25 per day of rental', () => {
      const now = new Date('2026-04-10T10:00:00Z');

      const result3Days = calculatePrice(makeInput({
        startTime: now,
        endTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      }));
      expect(result3Days.insuranceFee).toBe(75); // 3 * $25

      const result1Day = calculatePrice(makeInput({
        startTime: now,
        endTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      }));
      expect(result1Day.insuranceFee).toBe(25);
    });
  });

  // ── Platform commission ────────────────────────────────────────────────────

  describe('platform commission', () => {
    it('should charge 20% of (base + chauffeur fee)', () => {
      const result = calculatePrice(makeInput({ mode: 'chauffeur' }));

      const expectedCommission = Math.round((result.baseAmount + result.chauffeurFee) * 0.2 * 100) / 100;
      expect(result.platformCommission).toBe(expectedCommission);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should throw if endTime is before startTime', () => {
      const now = new Date();
      expect(() =>
        calculatePrice(makeInput({
          startTime: now,
          endTime: new Date(now.getTime() - 1000),
        }))
      ).toThrow('end_time must be after start_time');
    });

    it('should throw if endTime equals startTime', () => {
      const now = new Date();
      expect(() =>
        calculatePrice(makeInput({
          startTime: now,
          endTime: now,
        }))
      ).toThrow('end_time must be after start_time');
    });

    it('total should be sum of all components', () => {
      const result = calculatePrice(makeInput({ mode: 'chauffeur', extraKm: 20 }));

      const expected =
        result.baseAmount +
        result.chauffeurFee +
        result.insuranceFee +
        result.mileageOverage +
        result.platformCommission;

      expect(result.totalAmount).toBeCloseTo(expected, 2);
    });
  });
});
