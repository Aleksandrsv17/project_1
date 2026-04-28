import { create } from 'zustand';
import { CarType, chauffeurTotalFare, ChauffeurFareBreakdown, haversineKm } from '../utils/chauffeurPricing';

export type ChauffeurStopStatus = 'en_route' | 'arrived' | 'completed';

export interface ChauffeurStop {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  status: ChauffeurStopStatus;
  arrivedAt?: number;
  departedAt?: number;
  legDistanceKm: number;
}

export type ChauffeurTripStatus =
  | 'idle'
  | 'requested'
  | 'driver_assigned'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'in_progress'
  | 'finished'
  | 'cancelled';

export interface ChauffeurDriver {
  driverId: string;
  name: string;
  vehicleMake: string;
  vehicleModel: string;
  vehiclePlate: string;
  location?: { latitude: number; longitude: number };
}

export interface ChauffeurPickup {
  address: string;
  latitude: number;
  longitude: number;
}

export interface ChauffeurTrip {
  id: string;
  status: ChauffeurTripStatus;
  carType: CarType;
  pickup: ChauffeurPickup;
  scheduledAt?: number;
  stops: ChauffeurStop[];
  currentStopIndex: number;
  driver: ChauffeurDriver | null;
  startedAt?: number;
  finishedAt?: number;
  fare: ChauffeurFareBreakdown;
  // Current live "tick" time — updated by tick() so fare re-renders while waiting.
  now: number;
}

interface ChauffeurStoreState {
  trip: ChauffeurTrip | null;

  createRequest: (input: {
    tripId: string;
    carType: CarType;
    pickup: ChauffeurPickup;
    scheduledAt?: number;
  }) => void;
  assignDriver: (driver: ChauffeurDriver) => void;
  markDriverArriving: () => void;
  markDriverArrived: () => void;
  startTrip: () => void;
  addStop: (stop: { id: string; address: string; latitude: number; longitude: number }) => void;
  markStopArrived: (stopIndex: number) => void;
  departStop: (stopIndex: number) => void;
  finish: () => void;
  cancel: () => void;
  tick: () => void;
  updateDriverLocation: (loc: { latitude: number; longitude: number }) => void;
  reset: () => void;
}

function recomputeFare(trip: ChauffeurTrip, now: number): ChauffeurFareBreakdown {
  const legDistancesKm = trip.stops.map(s => s.legDistanceKm);
  const waitingMsPerStop = trip.stops.map(s => {
    if (!s.arrivedAt) return 0;
    const end = s.departedAt ?? now;
    return Math.max(0, end - s.arrivedAt);
  });
  return chauffeurTotalFare({ legDistancesKm, waitingMsPerStop, carType: trip.carType });
}

export const useChauffeurStore = create<ChauffeurStoreState>((set, get) => ({
  trip: null,

  createRequest: ({ tripId, carType, pickup, scheduledAt }) => {
    const now = Date.now();
    set({
      trip: {
        id: tripId,
        status: 'requested',
        carType,
        pickup,
        scheduledAt,
        stops: [],
        currentStopIndex: -1,
        driver: null,
        fare: { legs: 0, waiting: 0, total: 0 },
        now,
      },
    });
  },

  assignDriver: (driver) => {
    const t = get().trip;
    if (!t) return;
    set({ trip: { ...t, driver, status: 'driver_assigned' } });
  },

  markDriverArriving: () => {
    const t = get().trip;
    if (!t) return;
    set({ trip: { ...t, status: 'driver_arriving' } });
  },

  markDriverArrived: () => {
    const t = get().trip;
    if (!t) return;
    set({ trip: { ...t, status: 'driver_arrived' } });
  },

  startTrip: () => {
    const t = get().trip;
    if (!t) return;
    set({ trip: { ...t, status: 'in_progress', startedAt: Date.now() } });
  },

  addStop: ({ id, address, latitude, longitude }) => {
    const t = get().trip;
    if (!t) return;
    // Leg distance is from last known location (pickup or previous stop) to new stop.
    const origin = t.stops.length > 0 ? t.stops[t.stops.length - 1] : t.pickup;
    const legDistanceKm = haversineKm(
      { latitude: origin.latitude, longitude: origin.longitude },
      { latitude, longitude },
    );
    const newStop: ChauffeurStop = {
      id, address, latitude, longitude,
      status: 'en_route',
      legDistanceKm,
    };
    const stops = [...t.stops, newStop];
    const currentStopIndex = stops.length - 1;
    const updated: ChauffeurTrip = { ...t, stops, currentStopIndex };
    set({ trip: { ...updated, fare: recomputeFare(updated, Date.now()) } });
  },

  markStopArrived: (stopIndex) => {
    const t = get().trip;
    if (!t || !t.stops[stopIndex]) return;
    const now = Date.now();
    const stops = t.stops.map((s, i) =>
      i === stopIndex ? { ...s, status: 'arrived' as ChauffeurStopStatus, arrivedAt: now } : s,
    );
    const updated: ChauffeurTrip = { ...t, stops, now };
    set({ trip: { ...updated, fare: recomputeFare(updated, now) } });
  },

  departStop: (stopIndex) => {
    const t = get().trip;
    if (!t || !t.stops[stopIndex]) return;
    const now = Date.now();
    const stops = t.stops.map((s, i) =>
      i === stopIndex ? { ...s, status: 'completed' as ChauffeurStopStatus, departedAt: now } : s,
    );
    const updated: ChauffeurTrip = { ...t, stops, now };
    set({ trip: { ...updated, fare: recomputeFare(updated, now) } });
  },

  finish: () => {
    const t = get().trip;
    if (!t) return;
    const now = Date.now();
    // Close out any still-arrived stop so waiting stops accruing.
    const stops = t.stops.map(s =>
      s.status === 'arrived' && !s.departedAt
        ? { ...s, status: 'completed' as ChauffeurStopStatus, departedAt: now }
        : s,
    );
    const updated: ChauffeurTrip = { ...t, stops, status: 'finished', finishedAt: now, now };
    set({ trip: { ...updated, fare: recomputeFare(updated, now) } });
  },

  cancel: () => {
    const t = get().trip;
    if (!t) return;
    const now = Date.now();
    const updated: ChauffeurTrip = { ...t, status: 'cancelled', finishedAt: now, now };
    set({ trip: { ...updated, fare: recomputeFare(updated, now) } });
  },

  tick: () => {
    const t = get().trip;
    if (!t) return;
    const hasActiveWait = t.stops.some(s => s.status === 'arrived');
    if (!hasActiveWait && t.status !== 'in_progress') return;
    const now = Date.now();
    set({ trip: { ...t, now, fare: recomputeFare(t, now) } });
  },

  updateDriverLocation: (loc) => {
    const t = get().trip;
    if (!t || !t.driver) return;
    set({ trip: { ...t, driver: { ...t.driver, location: loc } } });
  },

  reset: () => set({ trip: null }),
}));
