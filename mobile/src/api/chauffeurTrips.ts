import apiClient from './client';
import { useChauffeurStore, ChauffeurPickup, ChauffeurDriver } from '../store/chauffeurStore';
import { CarType } from '../utils/chauffeurPricing';

// ── Types (mirror of what the backend will eventually return) ────────────────

export interface RequestChauffeurTripInput {
  carType: CarType;
  pickup: ChauffeurPickup;
  scheduledAt?: number;
}

export interface RequestChauffeurTripResult {
  tripId: string;
}

export interface AddStopInput {
  address: string;
  latitude: number;
  longitude: number;
}

// ── ID / mock helpers ────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

// Cancellable timer registry so pending mock events don't fire after reset / cancel.
const pendingTimers: Array<ReturnType<typeof setTimeout>> = [];

function schedule(delayMs: number, fn: () => void): void {
  const id = setTimeout(() => {
    const idx = pendingTimers.indexOf(id);
    if (idx >= 0) pendingTimers.splice(idx, 1);
    fn();
  }, delayMs);
  pendingTimers.push(id);
}

function clearAllPending(): void {
  while (pendingTimers.length) {
    const id = pendingTimers.pop();
    if (id) clearTimeout(id);
  }
}

// Deterministic-ish fake drivers for the dev mock. Picks one per request.
const MOCK_DRIVERS: ChauffeurDriver[] = [
  { driverId: 'drv_001', name: 'Alex Müller',    vehicleMake: 'Mercedes-Benz', vehicleModel: 'S-Class',  vehiclePlate: 'D AB 1234' },
  { driverId: 'drv_002', name: 'Karim Hassan',   vehicleMake: 'Mercedes-Benz', vehicleModel: 'Maybach',  vehiclePlate: 'D CD 5678' },
  { driverId: 'drv_003', name: 'Yuki Tanaka',    vehicleMake: 'Mercedes-Benz', vehicleModel: 'V-Class',  vehiclePlate: 'D EF 9012' },
  { driverId: 'drv_004', name: 'Mariana Costa',  vehicleMake: 'Mercedes-Benz', vehicleModel: 'S-Class',  vehiclePlate: 'D GH 3456' },
];

function pickMockDriver(carType: CarType, pickup: ChauffeurPickup): ChauffeurDriver {
  const matches = MOCK_DRIVERS.filter(d => {
    if (carType === 'sclass') return d.vehicleModel === 'S-Class';
    if (carType === 'maybach') return d.vehicleModel === 'Maybach';
    return d.vehicleModel === 'V-Class';
  });
  const pool = matches.length > 0 ? matches : MOCK_DRIVERS;
  const driver = pool[Math.floor(Math.random() * pool.length)];
  // Start the driver ~1km away from the pickup so the "arriving" phase feels real.
  const offset = 0.008;
  return {
    ...driver,
    location: {
      latitude: pickup.latitude + offset * (Math.random() - 0.5),
      longitude: pickup.longitude + offset * (Math.random() - 0.5),
    },
  };
}

// ── API surface ──────────────────────────────────────────────────────────────

export async function requestChauffeurTrip(
  input: RequestChauffeurTripInput,
): Promise<RequestChauffeurTripResult> {
  const tripId = generateId('ctrip');
  const store = useChauffeurStore.getState();

  if (__DEV__) {
    clearAllPending();
    store.createRequest({ tripId, carType: input.carType, pickup: input.pickup, scheduledAt: input.scheduledAt });

    // If scheduled in the future, don't start the mock driver flow now.
    if (input.scheduledAt && input.scheduledAt > Date.now() + 60_000) {
      return { tripId };
    }

    // Mock driver lifecycle: assigned → arriving → arrived at pickup.
    schedule(1800, () => {
      const driver = pickMockDriver(input.carType, input.pickup);
      useChauffeurStore.getState().assignDriver(driver);
      useChauffeurStore.getState().markDriverArriving();
      // Animate driver toward pickup over several ticks.
      const steps = 8;
      const start = driver.location!;
      for (let i = 1; i <= steps; i++) {
        schedule(400 * i, () => {
          const t = useChauffeurStore.getState().trip;
          if (!t || t.status === 'cancelled' || t.status === 'finished') return;
          const p = t.pickup;
          const lat = start.latitude + ((p.latitude - start.latitude) * i) / steps;
          const lng = start.longitude + ((p.longitude - start.longitude) * i) / steps;
          useChauffeurStore.getState().updateDriverLocation({ latitude: lat, longitude: lng });
        });
      }
      schedule(400 * steps + 200, () => {
        const t = useChauffeurStore.getState().trip;
        if (!t || t.status === 'cancelled' || t.status === 'finished') return;
        useChauffeurStore.getState().markDriverArrived();
      });
    });

    return { tripId };
  }

  // Prod path — endpoint to be implemented on the shared backend. Payload uses
  // the agreed driver-app contract: tripType discriminator.
  const response = await apiClient.post('/chauffeurs/trip/request', {
    tripType: 'chauffeur',
    carType: input.carType,
    pickup: input.pickup,
    scheduledAt: input.scheduledAt,
  }, { timeout: 4000 });
  return response.data;
}

export async function startChauffeurTrip(tripId: string): Promise<void> {
  if (__DEV__) {
    useChauffeurStore.getState().startTrip();
    return;
  }
  await apiClient.patch(`/chauffeurs/trip/${tripId}/start`, {}, { timeout: 4000 });
}

export async function addChauffeurStop(tripId: string, input: AddStopInput): Promise<void> {
  const store = useChauffeurStore.getState();

  if (__DEV__) {
    const stopId = generateId('cstop');
    store.addStop({ id: stopId, address: input.address, latitude: input.latitude, longitude: input.longitude });
    const stopIndex = useChauffeurStore.getState().trip!.stops.length - 1;

    // Mock driving leg: 4-6 seconds, then mark arrived.
    const delay = 4000 + Math.floor(Math.random() * 2000);
    schedule(delay, () => {
      const t = useChauffeurStore.getState().trip;
      if (!t || t.status !== 'in_progress') return;
      if (t.currentStopIndex !== stopIndex) return; // customer moved on or cancelled
      useChauffeurStore.getState().updateDriverLocation({ latitude: input.latitude, longitude: input.longitude });
      useChauffeurStore.getState().markStopArrived(stopIndex);
    });
    return;
  }

  await apiClient.post(`/chauffeurs/trip/${tripId}/stops`, input, { timeout: 4000 });
}

export async function departChauffeurStop(tripId: string, stopIndex: number): Promise<void> {
  if (__DEV__) {
    useChauffeurStore.getState().departStop(stopIndex);
    return;
  }
  await apiClient.patch(`/chauffeurs/trip/${tripId}/stops/${stopIndex}/depart`, {}, { timeout: 4000 });
}

export async function finishChauffeurTrip(tripId: string): Promise<void> {
  if (__DEV__) {
    clearAllPending();
    useChauffeurStore.getState().finish();
    return;
  }
  await apiClient.patch(`/chauffeurs/trip/${tripId}/finish`, {}, { timeout: 4000 });
}

export async function cancelChauffeurTrip(tripId: string): Promise<void> {
  if (__DEV__) {
    clearAllPending();
    useChauffeurStore.getState().cancel();
    return;
  }
  await apiClient.patch(`/chauffeurs/trip/${tripId}/cancel`, {}, { timeout: 4000 });
}

export interface RateChauffeurInput {
  rating: number; // 1-5, 0 = skipped
  tipAmount: number; // currency amount, 0 = no tip
}

export async function rateChauffeurTrip(tripId: string, input: RateChauffeurInput): Promise<void> {
  if (__DEV__) {
    // No-op in dev — backend not wired. Log so it's visible while iterating.
    console.log('[chauffeur] rating submitted', { tripId, ...input });
    return;
  }
  await apiClient.post(`/chauffeurs/trip/${tripId}/rate`, input, { timeout: 4000 });
}
