import { query } from '../../db';
import { logger } from '../../utils/logger';

export interface DriverLocation {
  lat: number;
  lng: number;
}

export interface DriverVehicleInfo {
  make: string;
  model: string;
  year: number;
  plate: string;
  category: string;
}

export interface OnlineDriver {
  userId: string;
  socketId: string;
  vehicleId: string;
  location: DriverLocation;
  vehicleInfo: DriverVehicleInfo;
}

export interface NearbyDriver extends OnlineDriver {
  distanceKm: number;
}

export type ActiveRideStatus = 'matched' | 'arriving' | 'in_progress';

/**
 * A non-terminal ride that has been accepted by a driver. Kept in memory so it
 * survives socket disconnects / app restarts (it is NOT removed on disconnect —
 * only on explicit complete or cancel). rideId === the bookings table id.
 */
export interface ActiveRideRecord {
  rideId: string;
  status: ActiveRideStatus;
  customerId: string;
  driverId: string;
  customerSocketId: string | null;
  driverSocketId: string | null;
  driverName: string;
  driverRating: number | null;
  driverTrips: number;
  vehicleId: string;
  vehicleInfo: DriverVehicleInfo;
  driverLocation: DriverLocation;
  pickup: { lat: number; lng: number; address: string };
  dest: { lat: number; lng: number; address: string };
  fare: number;
}

class RideService {
  private onlineDrivers: Map<string, OnlineDriver> = new Map();
  // rideId -> active ride. Survives disconnects; cleared only on complete/cancel.
  private activeRides: Map<string, ActiveRideRecord> = new Map();

  async driverGoOnline(
    userId: string,
    socketId: string,
    vehicleId: string,
    location: DriverLocation,
    providedInfo?: { make?: string; model?: string; year?: number; plate?: string; category?: string }
  ): Promise<OnlineDriver | null> {
    try {
      // Check if vehicleId is a UUID; if not, use providedInfo (for local Bersenev driver vehicles)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vehicleId);
      let vehicleInfo = providedInfo;
      if (isUuid) {
        const result = await query<{
          make: string; model: string; year: number; license_plate: string; category: string;
        }>(
          'SELECT make, model, year, license_plate, category FROM vehicles WHERE id = $1',
          [vehicleId]
        );
        const v = result.rows[0];
        if (v) {
          vehicleInfo = { make: v.make, model: v.model, year: v.year, plate: v.license_plate, category: v.category };
        }
      }
      if (!vehicleInfo || !vehicleInfo.make) {
        logger.warn('Driver tried to go online without valid vehicle info', { userId, vehicleId });
        return null;
      }

      const driver: OnlineDriver = {
        userId,
        socketId,
        vehicleId,
        location,
        vehicleInfo: {
          make: vehicleInfo.make || 'Mercedes',
          model: vehicleInfo.model || '',
          year: vehicleInfo.year || new Date().getFullYear(),
          plate: vehicleInfo.plate || '',
          category: vehicleInfo.category || 'luxury',
        },
      };

      this.onlineDrivers.set(userId, driver);
      logger.info('Driver online', { userId, vehicleId, location });
      return driver;
    } catch (err) {
      logger.error('Error setting driver online', { userId, error: err });
      return null;
    }
  }

  driverGoOffline(userId: string): void {
    this.onlineDrivers.delete(userId);
    logger.info('Driver offline', { userId });
  }

  updateDriverLocation(userId: string, lat: number, lng: number): void {
    const driver = this.onlineDrivers.get(userId);
    if (driver) {
      driver.location = { lat, lng };
    }
  }

  findNearbyDrivers(
    lat: number,
    lng: number,
    radiusKm: number,
    category?: string
  ): NearbyDriver[] {
    const nearby: NearbyDriver[] = [];

    for (const driver of this.onlineDrivers.values()) {
      // Filter by category if specified
      if (category && driver.vehicleInfo.category !== category) {
        continue;
      }

      const distanceKm =
        Math.sqrt(
          (lat - driver.location.lat) ** 2 + (lng - driver.location.lng) ** 2
        ) * 111;

      if (distanceKm <= radiusKm) {
        nearby.push({ ...driver, distanceKm });
      }
    }

    // Sort by distance (closest first)
    nearby.sort((a, b) => a.distanceKm - b.distanceKm);

    return nearby;
  }

  getDriver(userId: string): OnlineDriver | undefined {
    return this.onlineDrivers.get(userId);
  }

  getOnlineDriverCount(): number {
    return this.onlineDrivers.size;
  }

  /** Remove driver by socketId (used on disconnect) */
  removeBySocketId(socketId: string): string | null {
    for (const [userId, driver] of this.onlineDrivers.entries()) {
      if (driver.socketId === socketId) {
        this.onlineDrivers.delete(userId);
        logger.info('Driver removed on disconnect', { userId, socketId });
        return userId;
      }
    }
    return null;
  }

  // ── Active ride persistence (survives disconnects) ──────────────────────────

  /** Record a newly accepted ride so it can be resumed after a reconnect/restart. */
  startActiveRide(record: ActiveRideRecord): void {
    this.activeRides.set(record.rideId, record);
    logger.info('Active ride started', { rideId: record.rideId, customerId: record.customerId, driverId: record.driverId });
  }

  getActiveRideById(rideId: string): ActiveRideRecord | undefined {
    return this.activeRides.get(rideId);
  }

  /** The caller's current non-terminal ride (as customer OR driver), if any. */
  getActiveRideForUser(userId: string): ActiveRideRecord | undefined {
    for (const ride of this.activeRides.values()) {
      if (ride.customerId === userId || ride.driverId === userId) return ride;
    }
    return undefined;
  }

  updateActiveRideStatus(rideId: string, status: ActiveRideStatus): void {
    const ride = this.activeRides.get(rideId);
    if (ride) ride.status = status;
  }

  /** Update the driver's latest location on any active ride they're driving. */
  updateActiveRideDriverLocation(driverId: string, lat: number, lng: number): void {
    for (const ride of this.activeRides.values()) {
      if (ride.driverId === driverId) ride.driverLocation = { lat, lng };
    }
  }

  setActiveRideSocketId(rideId: string, party: 'customer' | 'driver', socketId: string): void {
    const ride = this.activeRides.get(rideId);
    if (!ride) return;
    if (party === 'customer') ride.customerSocketId = socketId;
    else ride.driverSocketId = socketId;
  }

  /** End a ride (explicit complete or cancel only). */
  endActiveRide(rideId: string): ActiveRideRecord | undefined {
    const ride = this.activeRides.get(rideId);
    if (ride) {
      this.activeRides.delete(rideId);
      logger.info('Active ride ended', { rideId });
    }
    return ride;
  }
}

export const rideService = new RideService();
