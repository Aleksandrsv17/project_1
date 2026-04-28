export type CarType = 'sedan' | 'suv' | 'van';

export const BASE_RATE_PER_KM = 3;
export const WAITING_RATE_PER_MIN = 0.8;

export const CAR_MULTIPLIERS: Record<CarType, number> = {
  sedan: 1.0,
  suv: 1.3,
  van: 1.6,
};

export const CAR_LABELS: Record<CarType, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  van: 'Van',
};

export const CAR_CAPACITY: Record<CarType, string> = {
  sedan: '1-3',
  suv: '1-5',
  van: '1-7',
};

export function legFare(distanceKm: number, carType: CarType): number {
  return distanceKm * BASE_RATE_PER_KM * CAR_MULTIPLIERS[carType];
}

export function waitingFare(waitingMs: number): number {
  const minutes = Math.max(0, waitingMs) / 60000;
  return minutes * WAITING_RATE_PER_MIN;
}

export interface ChauffeurFareInput {
  legDistancesKm: number[];
  waitingMsPerStop: number[];
  carType: CarType;
}

export interface ChauffeurFareBreakdown {
  legs: number;
  waiting: number;
  total: number;
}

export function chauffeurTotalFare(input: ChauffeurFareInput): ChauffeurFareBreakdown {
  const legs = input.legDistancesKm.reduce((sum, km) => sum + legFare(km, input.carType), 0);
  const waiting = input.waitingMsPerStop.reduce((sum, ms) => sum + waitingFare(ms), 0);
  return { legs, waiting, total: legs + waiting };
}

// Haversine straight-line distance in kilometers. Used for mock leg-distance in
// __DEV__ and as a fallback when Google Directions is unavailable.
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
