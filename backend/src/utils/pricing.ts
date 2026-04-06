import { config } from '../config';

export type BookingMode = 'self_drive' | 'chauffeur';
export type BookingType = 'instant_ride' | 'scheduled' | 'hourly_rental' | 'daily_rental';

export interface VehicleRates {
  dailyRate: number;
  hourlyRate?: number | null;
  chauffeurAvailable: boolean;
  chauffeurDailyRate?: number | null;
  depositAmount: number;
  maxDailyKm: number;
}

export interface PricingInput {
  vehicle: VehicleRates;
  mode: BookingMode;
  type: BookingType;
  startTime: Date;
  endTime: Date;
  /** km over the daily limit (for final settlement) */
  extraKm?: number;
  /** current active bookings count in the same city/category for surge */
  activeBookingsCount?: number;
  /** available vehicles count for surge */
  availableVehiclesCount?: number;
}

export interface PricingResult {
  baseAmount: number;
  chauffeurFee: number;
  insuranceFee: number;
  mileageOverage: number;
  platformCommission: number;
  totalAmount: number;
  depositAmount: number;
  durationHours: number;
  durationDays: number;
  surgeApplied: boolean;
  surgeMultiplier: number;
  breakdown: PricingBreakdown;
}

export interface PricingBreakdown {
  durationLabel: string;
  baseRate: number;
  baseRateUnit: 'hour' | 'day';
  surgeLabel?: string;
  chauffeurFeeLabel?: string;
  insuranceFeeLabel?: string;
  mileageOverageLabel?: string;
  commissionLabel: string;
}

/**
 * Calculates the full pricing for a booking.
 */
export function calculatePrice(input: PricingInput): PricingResult {
  const { vehicle, mode, type, startTime, endTime, extraKm = 0 } = input;

  const durationMs = endTime.getTime() - startTime.getTime();
  if (durationMs <= 0) {
    throw new Error('end_time must be after start_time');
  }

  const durationHours = durationMs / (1000 * 60 * 60);
  const durationDays = durationHours / 24;

  // ── Surge pricing check ────────────────────────────────────────────────────
  const { surgeApplied, surgeMultiplier } = computeSurge(
    input.activeBookingsCount,
    input.availableVehiclesCount
  );

  // ── Base amount ────────────────────────────────────────────────────────────
  let baseRate: number;
  let baseRateUnit: 'hour' | 'day';

  if (type === 'hourly_rental' || type === 'instant_ride') {
    // Use hourly rate if available, otherwise prorate daily rate
    if (vehicle.hourlyRate) {
      baseRate = vehicle.hourlyRate;
      baseRateUnit = 'hour';
    } else {
      baseRate = vehicle.dailyRate / 24;
      baseRateUnit = 'hour';
    }
    baseRate *= surgeMultiplier;
    const baseAmount = round2(baseRate * durationHours);

    // ── Chauffeur fee ──────────────────────────────────────────────────────
    let chauffeurFee = 0;
    if (mode === 'chauffeur' && vehicle.chauffeurAvailable) {
      const chauffeurHourlyRate = (vehicle.chauffeurDailyRate ?? vehicle.dailyRate * 0.3) / 24;
      chauffeurFee = round2(chauffeurHourlyRate * durationHours);
    }

    // ── Insurance ──────────────────────────────────────────────────────────
    const insuranceFee = round2(config.app.insuranceFeePerDay * Math.ceil(durationDays));

    // ── Mileage overage ────────────────────────────────────────────────────
    const mileageOverage = round2(extraKm * config.app.mileageOverageRate);

    // ── Platform commission ────────────────────────────────────────────────
    const platformCommission = round2(
      (baseAmount + chauffeurFee) * config.app.platformCommissionRate
    );

    const totalAmount = round2(baseAmount + chauffeurFee + insuranceFee + mileageOverage + platformCommission);

    return {
      baseAmount,
      chauffeurFee,
      insuranceFee,
      mileageOverage,
      platformCommission,
      totalAmount,
      depositAmount: vehicle.depositAmount,
      durationHours,
      durationDays,
      surgeApplied,
      surgeMultiplier,
      breakdown: buildBreakdown({
        durationHours,
        baseRate,
        baseRateUnit: 'hour',
        surgeApplied,
        surgeMultiplier,
        chauffeurFee,
        insuranceFee,
        mileageOverage,
        platformCommission,
      }),
    };
  }

  // Daily/scheduled rentals
  baseRate = vehicle.dailyRate;
  baseRateUnit = 'day';
  baseRate *= surgeMultiplier;

  const billableDays = Math.ceil(durationDays);
  const baseAmount = round2(baseRate * billableDays);

  // ── Chauffeur fee ────────────────────────────────────────────────────────
  let chauffeurFee = 0;
  if (mode === 'chauffeur' && vehicle.chauffeurAvailable) {
    const dailyChauffeurRate = vehicle.chauffeurDailyRate ?? vehicle.dailyRate * 0.3;
    chauffeurFee = round2(dailyChauffeurRate * billableDays);
  }

  // ── Insurance ────────────────────────────────────────────────────────────
  const insuranceFee = round2(config.app.insuranceFeePerDay * billableDays);

  // ── Mileage overage ──────────────────────────────────────────────────────
  const mileageOverage = round2(extraKm * config.app.mileageOverageRate);

  // ── Platform commission ──────────────────────────────────────────────────
  const platformCommission = round2(
    (baseAmount + chauffeurFee) * config.app.platformCommissionRate
  );

  const totalAmount = round2(baseAmount + chauffeurFee + insuranceFee + mileageOverage + platformCommission);

  return {
    baseAmount,
    chauffeurFee,
    insuranceFee,
    mileageOverage,
    platformCommission,
    totalAmount,
    depositAmount: vehicle.depositAmount,
    durationHours,
    durationDays,
    surgeApplied,
    surgeMultiplier,
    breakdown: buildBreakdown({
      durationHours,
      baseRate,
      baseRateUnit: 'day',
      surgeApplied,
      surgeMultiplier,
      chauffeurFee,
      insuranceFee,
      mileageOverage,
      platformCommission,
    }),
  };
}

function computeSurge(
  activeBookings?: number,
  availableVehicles?: number
): { surgeApplied: boolean; surgeMultiplier: number } {
  if (
    activeBookings === undefined ||
    availableVehicles === undefined ||
    availableVehicles === 0
  ) {
    return { surgeApplied: false, surgeMultiplier: 1 };
  }

  const ratio = activeBookings / availableVehicles;
  if (ratio > config.app.surgeDemandRatio) {
    return { surgeApplied: true, surgeMultiplier: config.app.surgeMultiplier };
  }

  return { surgeApplied: false, surgeMultiplier: 1 };
}

function buildBreakdown(params: {
  durationHours: number;
  baseRate: number;
  baseRateUnit: 'hour' | 'day';
  surgeApplied: boolean;
  surgeMultiplier: number;
  chauffeurFee: number;
  insuranceFee: number;
  mileageOverage: number;
  platformCommission: number;
}): PricingBreakdown {
  const {
    durationHours,
    baseRate,
    baseRateUnit,
    surgeApplied,
    surgeMultiplier,
    chauffeurFee,
    insuranceFee,
    mileageOverage,
    platformCommission,
  } = params;

  const durationLabel =
    baseRateUnit === 'hour'
      ? `${durationHours.toFixed(1)} hours`
      : `${Math.ceil(durationHours / 24)} days`;

  return {
    durationLabel,
    baseRate,
    baseRateUnit,
    surgeLabel: surgeApplied ? `${surgeMultiplier}x surge applied` : undefined,
    chauffeurFeeLabel: chauffeurFee > 0 ? `Chauffeur: $${chauffeurFee.toFixed(2)}` : undefined,
    insuranceFeeLabel: `Insurance: $${insuranceFee.toFixed(2)}`,
    mileageOverageLabel: mileageOverage > 0 ? `Mileage overage: $${mileageOverage.toFixed(2)}` : undefined,
    commissionLabel: `Platform fee (${(config.app.platformCommissionRate * 100).toFixed(0)}%): $${platformCommission.toFixed(2)}`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
