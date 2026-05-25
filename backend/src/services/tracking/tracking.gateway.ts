import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { verifyAccessToken } from '../../utils/jwt';
import { query } from '../../db';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { rideService, NearbyDriver, ActiveRideRecord } from '../ride/ride.service';

interface AuthenticatedSocket extends Socket {
  userId: string;
  userRole: string;
  email: string;
}

export interface LocationUpdate {
  bookingId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface TrackingRoom {
  bookingId: string;
  chauffeurSocketId: string | null;
  customerSocketId: string | null;
}

interface PendingRide {
  rideRequestId: string;
  customerId: string;
  socketId: string;
  pickup: { lat: number; lng: number; text: string };
  dest: { lat: number; lng: number; text: string };
  category?: string;
  driverQueue: NearbyDriver[];
  currentDriverIndex: number;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

class TrackingGateway {
  private io: SocketServer | null = null;
  private trackingRooms = new Map<string, TrackingRoom>();
  private pendingRides = new Map<string, PendingRide>();
  /** Map of driverId -> set of customer socketIds tracking them */
  private driverTrackers = new Map<string, Set<string>>();
  /** Map of bookingId -> customer socketId for direct event delivery */
  private rideCustomerSockets = new Map<string, string>();
  /** rideId -> grace timer: cancels an active ride if the driver doesn't reconnect */
  private abandonTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly ABANDON_GRACE_MS = 120_000;

  /** End an active ride and tell the customer it was cancelled. */
  private cancelActiveRide(rideId: string, message: string): void {
    const ride = rideService.getActiveRideById(rideId);
    if (!ride) return;
    rideService.endActiveRide(rideId);
    const sid = ride.customerSocketId || this.rideCustomerSockets.get(rideId);
    if (sid) this.io?.to(sid).emit('ride:cancelled', { rideId, bookingId: rideId, message });
    this.rideCustomerSockets.delete(rideId);
    const t = this.abandonTimers.get(rideId);
    if (t) { clearTimeout(t); this.abandonTimers.delete(rideId); }
    logger.info('Active ride cancelled', { rideId, message });
  }

  initialize(server: HttpServer): SocketServer {
    this.io = new SocketServer(server, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // JWT authentication middleware for socket connections
    this.io.use(async (socket: Socket, next) => {
      try {
        const token =
          (socket.handshake.auth?.token as string | undefined) ||
          (socket.handshake.headers.authorization?.replace('Bearer ', '') ?? '');

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const payload = verifyAccessToken(token);
        const authSocket = socket as AuthenticatedSocket;
        authSocket.userId = payload.sub;
        authSocket.userRole = payload.role;
        authSocket.email = payload.email;

        next();
      } catch (err) {
        next(new Error('Invalid or expired token'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      const authSocket = socket as AuthenticatedSocket;
      logger.info('Socket connected', {
        socketId: socket.id,
        userId: authSocket.userId,
        role: authSocket.userRole,
      });

      // ── Join booking room ────────────────────────────────────────────────
      socket.on('booking:join', async (data: { bookingId: string }) => {
        try {
          const { bookingId } = data;

          const booking = await query<{
            customer_id: string;
            chauffeur_id: string | null;
            status: string;
          }>(
            'SELECT customer_id, chauffeur_id, status FROM bookings WHERE id = $1',
            [bookingId]
          );

          if (!booking.rows[0]) {
            socket.emit('error', { message: 'Booking not found' });
            return;
          }

          const b = booking.rows[0];

          // Authorize: only customer or chauffeur of this booking can join
          const isCustomer = b.customer_id === authSocket.userId;
          let isChauffeur = false;

          if (b.chauffeur_id) {
            const chauffeur = await query<{ user_id: string }>(
              'SELECT user_id FROM chauffeurs WHERE id = $1',
              [b.chauffeur_id]
            );
            isChauffeur = chauffeur.rows[0]?.user_id === authSocket.userId;
          }

          const isAdmin = authSocket.userRole === 'admin';

          if (!isCustomer && !isChauffeur && !isAdmin) {
            socket.emit('error', { message: 'Not authorized to track this booking' });
            return;
          }

          const roomName = `booking:${bookingId}`;
          await socket.join(roomName);

          // Track who is in this room
          const room = this.trackingRooms.get(bookingId) ?? {
            bookingId,
            chauffeurSocketId: null,
            customerSocketId: null,
          };

          if (isChauffeur) room.chauffeurSocketId = socket.id;
          if (isCustomer) room.customerSocketId = socket.id;
          this.trackingRooms.set(bookingId, room);

          socket.emit('booking:joined', { bookingId, room: roomName });
          logger.info('Socket joined booking room', { socketId: socket.id, bookingId });
        } catch (err) {
          logger.error('Error joining booking room', { error: err });
          socket.emit('error', { message: 'Failed to join room' });
        }
      });

      // ── Chauffeur location update ────────────────────────────────────────
      socket.on('location:update', async (data: LocationUpdate) => {
        try {
          const { bookingId, lat, lng, heading, speed, timestamp } = data;

          // Validate coordinates
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            socket.emit('error', { message: 'Invalid coordinates' });
            return;
          }

          // Update chauffeur location in DB
          if (authSocket.userRole === 'chauffeur') {
            await query(
              `UPDATE chauffeurs
               SET current_lat = $1, current_lng = $2, updated_at = NOW()
               WHERE user_id = $3`,
              [lat, lng, authSocket.userId]
            );
          }

          // Broadcast to all in the booking room (customer sees the update)
          const roomName = `booking:${bookingId}`;
          socket.to(roomName).emit('location:updated', {
            bookingId,
            lat,
            lng,
            heading,
            speed,
            timestamp: timestamp ?? Date.now(),
            updatedBy: authSocket.userId,
          });

          logger.debug('Location broadcast', { bookingId, lat, lng });
        } catch (err) {
          logger.error('Error broadcasting location', { error: err });
          socket.emit('error', { message: 'Failed to update location' });
        }
      });

      // ── Ride status events ───────────────────────────────────────────────
      socket.on('ride:status', (data: { bookingId: string; status: string }) => {
        const roomName = `booking:${data.bookingId}`;
        if (!socket.rooms.has(roomName)) {
          socket.emit('error', { message: 'Not authorized to emit to this booking room' });
          return;
        }
        this.io?.to(roomName).emit('ride:status_updated', {
          bookingId: data.bookingId,
          status: data.status,
          timestamp: Date.now(),
        });
        logger.info('Ride status broadcast', data);
      });

      // ── Chat message (driver ↔ customer) ─────────────────────────────────
      socket.on('chat:message', (data: { bookingId: string; message: string }) => {
        const roomName = `booking:${data.bookingId}`;
        if (!socket.rooms.has(roomName)) {
          socket.emit('error', { message: 'Not authorized to emit to this booking room' });
          return;
        }
        socket.to(roomName).emit('chat:message', {
          from: authSocket.userId,
          message: data.message,
          timestamp: Date.now(),
        });
      });

      // ── ETA update ───────────────────────────────────────────────────────
      socket.on('eta:update', (data: { bookingId: string; etaMinutes: number }) => {
        const roomName = `booking:${data.bookingId}`;
        if (!socket.rooms.has(roomName)) {
          socket.emit('error', { message: 'Not authorized to emit to this booking room' });
          return;
        }
        socket.to(roomName).emit('eta:updated', {
          bookingId: data.bookingId,
          etaMinutes: data.etaMinutes,
          timestamp: Date.now(),
        });
      });

      // ── Leave room ───────────────────────────────────────────────────────
      socket.on('booking:leave', (data: { bookingId: string }) => {
        const roomName = `booking:${data.bookingId}`;
        socket.leave(roomName);

        // Clean up tracking room
        const room = this.trackingRooms.get(data.bookingId);
        if (room) {
          if (room.chauffeurSocketId === socket.id) room.chauffeurSocketId = null;
          if (room.customerSocketId === socket.id) room.customerSocketId = null;
          this.trackingRooms.set(data.bookingId, room);
        }

        logger.info('Socket left booking room', { socketId: socket.id, bookingId: data.bookingId });
      });

      // ════════════════════════════════════════════════════════════════════
      // ══  RIDE MATCHING — Driver Events  ═════════════════════════════════
      // ════════════════════════════════════════════════════════════════════

      socket.on('driver:online', async (data: { vehicleId: string; location: { lat: number; lng: number }; vehicleInfo?: any }) => {
        try {
          const driver = await rideService.driverGoOnline(
            authSocket.userId,
            socket.id,
            data.vehicleId,
            data.location,
            data.vehicleInfo
          );
          if (driver) {
            socket.emit('driver:online:ack', { success: true, driver });
          } else {
            socket.emit('driver:online:ack', { success: false, message: 'Invalid vehicle' });
          }
        } catch (err) {
          logger.error('Error in driver:online', { error: err });
          socket.emit('error', { message: 'Failed to go online' });
        }
      });

      socket.on('driver:offline', () => {
        rideService.driverGoOffline(authSocket.userId);
        // Going offline abandons any active ride — clear it and tell the customer
        // so the customer app stops showing a phantom ride.
        const ride = rideService.getActiveRideForUser(authSocket.userId);
        if (ride && ride.driverId === authSocket.userId) {
          this.cancelActiveRide(ride.rideId, 'Driver went offline');
        }
        socket.emit('driver:offline:ack', { success: true });
      });

      socket.on('driver:location', (data: { lat: number; lng: number }) => {
        try {
          if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) {
            socket.emit('error', { message: 'Invalid coordinates' });
            return;
          }

          rideService.updateDriverLocation(authSocket.userId, data.lat, data.lng);
          // Persist latest location on the active ride so a resume re-emits it.
          rideService.updateActiveRideDriverLocation(authSocket.userId, data.lat, data.lng);

          // Broadcast to any customers tracking this driver
          const trackers = this.driverTrackers.get(authSocket.userId);
          if (trackers && trackers.size > 0) {
            for (const customerSocketId of trackers) {
              this.io?.to(customerSocketId).emit('driver:location:updated', {
                driverId: authSocket.userId,
                lat: data.lat,
                lng: data.lng,
                timestamp: Date.now(),
              });
            }
          }
        } catch (err) {
          logger.error('Error in driver:location', { error: err });
        }
      });

      socket.on('driver:accept_ride', async (data: { rideRequestId: string }) => {
        try {
          const pending = this.pendingRides.get(data.rideRequestId);
          if (!pending) {
            socket.emit('error', { message: 'Ride request not found or expired' });
            return;
          }

          // Clear the timeout
          if (pending.timeoutHandle) {
            clearTimeout(pending.timeoutHandle);
            pending.timeoutHandle = null;
          }

          const driver = rideService.getDriver(authSocket.userId);
          if (!driver) {
            socket.emit('error', { message: 'Driver not found in online pool' });
            return;
          }

          // Create booking in DB
          const now = new Date();
          const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // estimate 2h

          // Check if vehicleId is a valid UUID, otherwise use null (Bersenev driver local vehicle)
          const isUuidVid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driver.vehicleId);
          const vehicleIdForDb = isUuidVid ? driver.vehicleId : null;
          const fareAmount = (pending as any).estimatedPrice ?? 0;

          // chauffeur_user_id links the booking to the driver (users.id) so it
          // shows in the driver's history/earnings even when vehicle_id is null
          // (Bersenev local vehicles). total_amount holds the fare for earnings.
          const bookingResult = await query<{ id: string }>(
            `INSERT INTO bookings
              (customer_id, vehicle_id, chauffeur_user_id, type, mode, status,
               start_time, end_time, pickup_address, pickup_lat, pickup_lng,
               dropoff_address, dropoff_lat, dropoff_lng,
               base_amount, chauffeur_fee, insurance_fee, mileage_overage,
               platform_commission, total_amount, deposit_amount)
             VALUES ($1,$2,$3,'instant_ride','chauffeur','confirmed',$4,$5,$6,$7,$8,$9,$10,$11,
                     $12,0,0,0,0,$12,0)
             RETURNING id`,
            [
              pending.customerId,
              vehicleIdForDb,
              driver.userId,
              now,
              endTime,
              pending.pickup.text,
              pending.pickup.lat,
              pending.pickup.lng,
              pending.dest.text,
              pending.dest.lat,
              pending.dest.lng,
              fareAmount,
            ]
          );

          const bookingId = bookingResult.rows[0].id;

          // Get customer name
          const customerResult = await query<{ first_name: string; last_name: string }>(
            'SELECT first_name, last_name FROM users WHERE id = $1',
            [pending.customerId]
          );
          const customerName = customerResult.rows[0]
            ? `${customerResult.rows[0].first_name} ${customerResult.rows[0].last_name}`
            : 'Customer';

          // Get driver's real name + rating aggregate
          const driverUserResult = await query<{ first_name: string; last_name: string; rating: string | null; rating_count: number | null }>(
            'SELECT first_name, last_name, rating, rating_count FROM users WHERE id = $1',
            [authSocket.userId]
          );
          const driverRow = driverUserResult.rows[0];
          const driverName = driverRow
            ? `${driverRow.first_name} ${driverRow.last_name}`
            : authSocket.email;
          const driverRating = driverRow?.rating != null ? Number(driverRow.rating) : null;
          const driverTrips = driverRow?.rating_count ?? 0;

          // Store customer socket for this booking
          this.rideCustomerSockets.set(bookingId, pending.socketId);
          this.rideCustomerSockets.set(data.rideRequestId, pending.socketId);

          const fare = fareAmount;

          // Persist the active ride so it survives reconnects / app restarts.
          // rideId === bookingId. Cleared only on explicit complete or cancel.
          rideService.startActiveRide({
            rideId: bookingId,
            status: 'matched',
            customerId: pending.customerId,
            driverId: driver.userId,
            customerSocketId: pending.socketId,
            driverSocketId: socket.id,
            driverName,
            driverRating,
            driverTrips,
            vehicleId: driver.vehicleId,
            vehicleInfo: driver.vehicleInfo,
            driverLocation: driver.location,
            pickup: { lat: pending.pickup.lat, lng: pending.pickup.lng, address: pending.pickup.text },
            dest: { lat: pending.dest.lat, lng: pending.dest.lng, address: pending.dest.text },
            fare,
          });

          // Notify customer: ride matched
          this.io?.to(pending.socketId).emit('ride:matched', {
            rideRequestId: data.rideRequestId,
            bookingId,
            rideId: bookingId,
            driverId: driver.userId,
            status: 'matched',
            tripType: (pending as any).tripType || 'ride',
            fare,
            driver: {
              userId: driver.userId,
              name: driverName,
              rating: driverRating,
              trips: driverTrips,
              vehicleInfo: driver.vehicleInfo,
              location: driver.location,
            },
            pickup: { lat: pending.pickup.lat, lng: pending.pickup.lng, address: pending.pickup.text },
            dest: { lat: pending.dest.lat, lng: pending.dest.lng, address: pending.dest.text },
          });

          // Notify driver: confirmed
          socket.emit('ride:confirmed', {
            rideRequestId: data.rideRequestId,
            bookingId,
            rideId: bookingId,
            customerName,
            pickup: pending.pickup,
            dest: pending.dest,
          });

          // Clean up pending ride
          this.pendingRides.delete(data.rideRequestId);

          logger.info('Ride matched', {
            rideRequestId: data.rideRequestId,
            bookingId,
            driverId: authSocket.userId,
            customerId: pending.customerId,
          });
        } catch (err) {
          logger.error('Error in driver:accept_ride', { error: err });
          socket.emit('error', { message: 'Failed to accept ride' });
        }
      });

      socket.on('driver:decline_ride', (data: { rideRequestId: string }) => {
        try {
          const pending = this.pendingRides.get(data.rideRequestId);
          if (!pending) {
            socket.emit('error', { message: 'Ride request not found or expired' });
            return;
          }

          // Clear current timeout
          if (pending.timeoutHandle) {
            clearTimeout(pending.timeoutHandle);
            pending.timeoutHandle = null;
          }

          logger.info('Driver declined ride', {
            rideRequestId: data.rideRequestId,
            driverId: authSocket.userId,
          });

          // Try the next driver
          this.sendToNextDriver(data.rideRequestId);
        } catch (err) {
          logger.error('Error in driver:decline_ride', { error: err });
        }
      });

      socket.on('driver:arrived', (data: { bookingId: string }) => {
        rideService.updateActiveRideStatus(data.bookingId, 'arriving');
        // Notify customer via stored socket
        const arrivedSid = this.rideCustomerSockets.get(data.bookingId);
        if (arrivedSid) {
          this.io?.to(arrivedSid).emit('ride:driver_arrived', { bookingId: data.bookingId });
        }
        // Also try trackers
        const trackers = this.driverTrackers.get(authSocket.userId);
        if (trackers) {
          for (const sid of trackers) {
            this.io?.to(sid).emit('ride:driver_arrived', { bookingId: data.bookingId });
          }
        }
        logger.info('Driver arrived at pickup', { bookingId: data.bookingId, driverId: authSocket.userId });
      });

      socket.on('driver:start_trip', async (data: { bookingId: string }) => {
        try {
          await query(
            "UPDATE bookings SET status = 'active', updated_at = NOW() WHERE id = $1",
            [data.bookingId]
          );
          rideService.updateActiveRideStatus(data.bookingId, 'in_progress');

          // Notify customer
          const booking = await query<{ customer_id: string }>(
            'SELECT customer_id FROM bookings WHERE id = $1',
            [data.bookingId]
          );

          // Emit to customer via stored socket
          const customerSid = this.rideCustomerSockets.get(data.bookingId);
          if (customerSid) {
            this.io?.to(customerSid).emit('ride:trip_started', { bookingId: data.bookingId });
          }
          // Also try trackers
          const trackers = this.driverTrackers.get(authSocket.userId);
          if (trackers) {
            for (const sid of trackers) {
              this.io?.to(sid).emit('ride:trip_started', { bookingId: data.bookingId });
            }
          }

          socket.emit('driver:start_trip:ack', { success: true, bookingId: data.bookingId });
          logger.info('Trip started', { bookingId: data.bookingId, driverId: authSocket.userId });
        } catch (err) {
          logger.error('Error in driver:start_trip', { error: err });
          socket.emit('error', { message: 'Failed to start trip' });
        }
      });

      socket.on('driver:complete_trip', async (data: { bookingId: string }) => {
        try {
          await query(
            "UPDATE bookings SET status = 'completed', actual_end_time = NOW(), updated_at = NOW() WHERE id = $1",
            [data.bookingId]
          );
          // Ride is terminal — clear the persisted active ride.
          rideService.endActiveRide(data.bookingId);

          // Emit to customer via stored socket
          const completedCustomerSid = this.rideCustomerSockets.get(data.bookingId);
          if (completedCustomerSid) {
            this.io?.to(completedCustomerSid).emit('ride:trip_completed', { bookingId: data.bookingId });
          }
          // Also try trackers
          const completedTrackers = this.driverTrackers.get(authSocket.userId);
          if (completedTrackers) {
            for (const sid of completedTrackers) {
              this.io?.to(sid).emit('ride:trip_completed', { bookingId: data.bookingId });
            }
          }
          // Cleanup
          this.rideCustomerSockets.delete(data.bookingId);

          socket.emit('driver:complete_trip:ack', { success: true, bookingId: data.bookingId });
          logger.info('Trip completed', { bookingId: data.bookingId, driverId: authSocket.userId });
        } catch (err) {
          logger.error('Error in driver:complete_trip', { error: err });
          socket.emit('error', { message: 'Failed to complete trip' });
        }
      });

      // ════════════════════════════════════════════════════════════════════
      // ══  RIDE RESUME — re-attach to an active ride after reconnect  ═════
      // ════════════════════════════════════════════════════════════════════

      // Re-emit the full current state of an active ride to the (re)joining socket:
      // ride:matched (driver+pickup+dest+fare+status), latest driver location, and
      // the status event. Shared by both customer and driver resume.
      const reemitActiveRideState = (ride: ActiveRideRecord) => {
        socket.join(`ride:${ride.rideId}`);
        socket.emit('ride:matched', {
          rideRequestId: ride.rideId,
          bookingId: ride.rideId,
          rideId: ride.rideId,
          driverId: ride.driverId,
          status: ride.status,
          fare: ride.fare,
          driver: {
            userId: ride.driverId,
            name: ride.driverName,
            rating: ride.driverRating,
            trips: ride.driverTrips,
            vehicleInfo: ride.vehicleInfo,
            location: ride.driverLocation,
          },
          pickup: ride.pickup,
          dest: ride.dest,
        });
        socket.emit('driver:location:updated', {
          driverId: ride.driverId,
          lat: ride.driverLocation.lat,
          lng: ride.driverLocation.lng,
          timestamp: Date.now(),
        });
        if (ride.status === 'arriving') {
          socket.emit('ride:driver_arrived', { bookingId: ride.rideId });
        } else if (ride.status === 'in_progress') {
          socket.emit('ride:trip_started', { bookingId: ride.rideId });
        }
      };

      socket.on('customer:resume_ride', (data: { rideId: string }) => {
        try {
          const ride = rideService.getActiveRideById(data.rideId);
          if (!ride || ride.customerId !== authSocket.userId) {
            socket.emit('ride:resume_failed', { rideId: data.rideId });
            return;
          }
          // Update the customer's socket so trip events reach the new connection.
          rideService.setActiveRideSocketId(ride.rideId, 'customer', socket.id);
          this.rideCustomerSockets.set(ride.rideId, socket.id);
          reemitActiveRideState(ride);
          logger.info('Customer resumed ride', { rideId: ride.rideId, customerId: authSocket.userId });
        } catch (err) {
          logger.error('Error in customer:resume_ride', { error: err });
        }
      });

      socket.on('driver:resume_ride', (data: { rideId: string }) => {
        try {
          const ride = rideService.getActiveRideById(data.rideId);
          if (!ride || ride.driverId !== authSocket.userId) {
            socket.emit('ride:resume_failed', { rideId: data.rideId });
            return;
          }
          // A real reconnect — cancel any pending abandon grace timer.
          const t = this.abandonTimers.get(ride.rideId);
          if (t) { clearTimeout(t); this.abandonTimers.delete(ride.rideId); }
          rideService.setActiveRideSocketId(ride.rideId, 'driver', socket.id);
          // Re-register the driver in the online pool so their location updates
          // (and getDriver lookups) work again after the reconnect.
          rideService.driverGoOnline(ride.driverId, socket.id, ride.vehicleId, ride.driverLocation, ride.vehicleInfo);
          reemitActiveRideState(ride);
          logger.info('Driver resumed ride', { rideId: ride.rideId, driverId: authSocket.userId });
        } catch (err) {
          logger.error('Error in driver:resume_ride', { error: err });
        }
      });

      // ════════════════════════════════════════════════════════════════════
      // ══  RIDE MATCHING — Customer Events  ═══════════════════════════════
      // ════════════════════════════════════════════════════════════════════

      socket.on('customer:request_ride', async (data: {
        pickupLat: number;
        pickupLng: number;
        destLat: number;
        destLng: number;
        pickupText: string;
        destText: string;
        vehicleCategory?: string;
        tripType?: string;
        preferences?: { temperature?: number; music?: string; notes?: string };
      }) => {
        try {
          const { pickupLat, pickupLng, destLat, destLng, pickupText, destText, vehicleCategory, preferences } = data;
          const tripType = data.tripType || 'ride';

          // Find nearby drivers (no radius limit for testing)
          const nearbyDrivers = rideService.findNearbyDrivers(pickupLat, pickupLng, 10000);

          if (nearbyDrivers.length === 0) {
            socket.emit('ride:no_drivers', {
              message: 'No drivers available nearby. Please try again later.',
            });
            return;
          }

          const rideRequestId = uuidv4();

          // Estimate distance and price
          const distanceKm = Math.sqrt(
            (pickupLat - destLat) ** 2 + (pickupLng - destLng) ** 2
          ) * 111;
          const estimatedDuration = Math.round(distanceKm * 2); // rough ~2min per km
          const estimatedPrice = Math.round(distanceKm * 3.5 * 100) / 100; // $3.50/km rough

          // Store pending ride
          const pending: PendingRide = {
            rideRequestId,
            customerId: authSocket.userId,
            socketId: socket.id,
            pickup: { lat: pickupLat, lng: pickupLng, text: pickupText },
            dest: { lat: destLat, lng: destLng, text: destText },
            category: vehicleCategory,
            driverQueue: nearbyDrivers,
            currentDriverIndex: 0,
            timeoutHandle: null,
          };
          (pending as any).preferences = preferences;
          (pending as any).tripType = tripType;

          this.pendingRides.set(rideRequestId, pending);

          // Acknowledge to customer
          socket.emit('ride:searching', {
            rideRequestId,
            driversFound: nearbyDrivers.length,
            estimatedPrice,
            estimatedDistance: Math.round(distanceKm * 10) / 10,
            estimatedDuration,
          });

          // Get customer name + rating
          const customerResult = await query<{ first_name: string; last_name: string; rating: string | null }>(
            'SELECT first_name, last_name, rating FROM users WHERE id = $1',
            [authSocket.userId]
          );
          const customerName = customerResult.rows[0]
            ? `${customerResult.rows[0].first_name} ${customerResult.rows[0].last_name}`
            : 'Customer';
          const customerRating = customerResult.rows[0]?.rating != null ? Number(customerResult.rows[0].rating) : null;

          // Store customer name on the pending ride for later use
          (pending as any).customerName = customerName;
          (pending as any).customerRating = customerRating;
          (pending as any).estimatedPrice = estimatedPrice;
          (pending as any).estimatedDistance = Math.round(distanceKm * 10) / 10;
          (pending as any).estimatedDuration = estimatedDuration;

          // Send to the first (closest) driver
          this.sendToNextDriver(rideRequestId);

          logger.info('Ride requested', {
            rideRequestId,
            customerId: authSocket.userId,
            pickup: { lat: pickupLat, lng: pickupLng },
            driversAvailable: nearbyDrivers.length,
          });
        } catch (err) {
          logger.error('Error in customer:request_ride', { error: err });
          socket.emit('error', { message: 'Failed to request ride' });
        }
      });

      socket.on('customer:cancel_ride', async (data: { rideId?: string; rideRequestId?: string }) => {
        try {
          const id = data.rideId ?? data.rideRequestId;
          if (!id) { socket.emit('error', { message: 'Missing rideId' }); return; }

          // Case 1: still a pending (pre-accept) request.
          const pending = this.pendingRides.get(id);
          if (pending) {
            if (pending.customerId !== authSocket.userId) {
              socket.emit('error', { message: 'Not authorized to cancel this ride' });
              return;
            }
            if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
            // Notify current driver if one was being asked
            if (pending.currentDriverIndex < pending.driverQueue.length) {
              const currentDriver = pending.driverQueue[pending.currentDriverIndex];
              this.io?.to(currentDriver.socketId).emit('ride:cancelled', {
                rideRequestId: id,
                rideId: id,
                message: 'Customer cancelled the ride request',
              });
            }
            this.pendingRides.delete(id);
            socket.emit('ride:cancelled:ack', { rideRequestId: id, rideId: id });
            logger.info('Pending ride cancelled by customer', { rideRequestId: id, customerId: authSocket.userId });
            return;
          }

          // Case 2: an active (accepted) ride — cancel and notify BOTH parties.
          const ride = rideService.getActiveRideById(id);
          if (!ride) { socket.emit('error', { message: 'Ride not found' }); return; }
          if (ride.customerId !== authSocket.userId) {
            socket.emit('error', { message: 'Not authorized to cancel this ride' });
            return;
          }

          try {
            await query("UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [ride.rideId]);
          } catch (e) {
            logger.error('Failed to mark booking cancelled', { rideId: ride.rideId, error: e });
          }

          const payload = { rideId: ride.rideId, bookingId: ride.rideId, message: 'Customer cancelled the ride' };
          // Notify the driver (current socket) and the customer (this socket).
          if (ride.driverSocketId) this.io?.to(ride.driverSocketId).emit('ride:cancelled', payload);
          if (ride.customerSocketId) this.io?.to(ride.customerSocketId).emit('ride:cancelled', payload);
          socket.emit('ride:cancelled', payload);

          rideService.endActiveRide(ride.rideId);
          this.rideCustomerSockets.delete(ride.rideId);
          socket.emit('ride:cancelled:ack', { rideId: ride.rideId });
          logger.info('Active ride cancelled by customer', { rideId: ride.rideId, customerId: authSocket.userId });
        } catch (err) {
          logger.error('Error in customer:cancel_ride', { error: err });
        }
      });

      socket.on('customer:track_driver', (data: { driverId: string }) => {
        try {
          let trackers = this.driverTrackers.get(data.driverId);
          if (!trackers) {
            trackers = new Set();
            this.driverTrackers.set(data.driverId, trackers);
          }
          trackers.add(socket.id);

          // Send current driver location immediately if available
          const driver = rideService.getDriver(data.driverId);
          if (driver) {
            socket.emit('driver:location:updated', {
              driverId: data.driverId,
              lat: driver.location.lat,
              lng: driver.location.lng,
              timestamp: Date.now(),
            });
          }

          socket.emit('customer:track_driver:ack', { success: true, driverId: data.driverId });
        } catch (err) {
          logger.error('Error in customer:track_driver', { error: err });
        }
      });

      // ════════════════════════════════════════════════════════════════════
      // ══  CHAUFFEUR multi-stop relay (tripType === 'chauffeur')  ═════════
      // ════════════════════════════════════════════════════════════════════

      // Customer adds the next destination → relay it to the driver.
      socket.on('customer:add_stop', (data: { rideId: string; address: string; lat: number; lng: number }) => {
        try {
          const ride = rideService.getActiveRideById(data.rideId);
          if (!ride || ride.customerId !== authSocket.userId) return;
          const r = ride as any;
          r.stops = r.stops || [];
          r.stops.push({ address: data.address, lat: data.lat, lng: data.lng, status: 'en_route' });
          const stopIndex = r.stops.length - 1;
          if (ride.driverSocketId) {
            this.io?.to(ride.driverSocketId).emit('chauffeur:stop_added', {
              rideId: ride.rideId, stopIndex, address: data.address, lat: data.lat, lng: data.lng,
            });
          }
          logger.info('Chauffeur stop added', { rideId: ride.rideId, stopIndex });
        } catch (err) {
          logger.error('Error in customer:add_stop', { error: err });
        }
      });

      // Driver reached the current stop → tell the customer (car pauses there).
      socket.on('driver:stop_arrived', (data: { rideId: string; stopIndex: number }) => {
        try {
          const ride = rideService.getActiveRideById(data.rideId);
          if (!ride || ride.driverId !== authSocket.userId) return;
          const r = ride as any;
          if (r.stops?.[data.stopIndex]) r.stops[data.stopIndex].status = 'arrived';
          if (ride.customerSocketId) {
            this.io?.to(ride.customerSocketId).emit('chauffeur:stop_arrived', {
              rideId: ride.rideId, stopIndex: data.stopIndex,
            });
          }
        } catch (err) {
          logger.error('Error in driver:stop_arrived', { error: err });
        }
      });

      // Customer leaves a stop (heading to the next) → inform the driver.
      socket.on('customer:depart_stop', (data: { rideId: string; stopIndex: number }) => {
        try {
          const ride = rideService.getActiveRideById(data.rideId);
          if (!ride || ride.customerId !== authSocket.userId) return;
          if (ride.driverSocketId) {
            this.io?.to(ride.driverSocketId).emit('chauffeur:stop_departed', {
              rideId: ride.rideId, stopIndex: data.stopIndex,
            });
          }
        } catch (err) {
          logger.error('Error in customer:depart_stop', { error: err });
        }
      });

      // Customer ends the chauffeur trip → complete it (mirrors driver:complete_trip).
      socket.on('customer:finish_chauffeur', async (data: { rideId: string }) => {
        try {
          const ride = rideService.getActiveRideById(data.rideId);
          if (!ride || ride.customerId !== authSocket.userId) return;
          await query(
            "UPDATE bookings SET status = 'completed', actual_end_time = NOW(), updated_at = NOW() WHERE id = $1",
            [ride.rideId]
          );
          if (ride.driverSocketId) {
            this.io?.to(ride.driverSocketId).emit('chauffeur:finish_requested', { rideId: ride.rideId });
            this.io?.to(ride.driverSocketId).emit('ride:trip_completed', { bookingId: ride.rideId, rideId: ride.rideId });
          }
          if (ride.customerSocketId) {
            this.io?.to(ride.customerSocketId).emit('ride:trip_completed', { bookingId: ride.rideId, rideId: ride.rideId });
          }
          rideService.endActiveRide(ride.rideId);
          logger.info('Chauffeur trip finished by customer', { rideId: ride.rideId });
        } catch (err) {
          logger.error('Error in customer:finish_chauffeur', { error: err });
        }
      });

      // ── Disconnect cleanup ───────────────────────────────────────────────
      socket.on('disconnect', (reason) => {
        // Clean up tracking rooms
        for (const [bookingId, room] of this.trackingRooms.entries()) {
          if (room.chauffeurSocketId === socket.id) room.chauffeurSocketId = null;
          if (room.customerSocketId === socket.id) room.customerSocketId = null;
          this.trackingRooms.set(bookingId, room);
        }

        // If a DRIVER with an active ride drops, give them a grace period to
        // reconnect (driver:resume_ride clears this timer). If they don't come
        // back, cancel the ride so the customer stops seeing a phantom ride.
        const ride = rideService.getActiveRideForUser(authSocket.userId);
        if (ride && ride.driverId === authSocket.userId && !this.abandonTimers.has(ride.rideId)) {
          const rideId = ride.rideId;
          const timer = setTimeout(() => {
            this.abandonTimers.delete(rideId);
            if (rideService.getActiveRideById(rideId)) {
              this.cancelActiveRide(rideId, 'Driver disconnected');
            }
          }, this.ABANDON_GRACE_MS);
          this.abandonTimers.set(rideId, timer);
          logger.info('Driver disconnected mid-ride; grace timer started', { rideId, reason });
        }

        // Clean up driver from online pool
        rideService.removeBySocketId(socket.id);

        // Clean up driver tracker subscriptions
        for (const [driverId, trackers] of this.driverTrackers.entries()) {
          trackers.delete(socket.id);
          if (trackers.size === 0) {
            this.driverTrackers.delete(driverId);
          }
        }

        // Clean up any pending rides from this customer
        for (const [rideRequestId, pending] of this.pendingRides.entries()) {
          if (pending.socketId === socket.id) {
            if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
            this.pendingRides.delete(rideRequestId);
            logger.info('Pending ride cleaned up on disconnect', { rideRequestId });
          }
        }

        logger.info('Socket disconnected', {
          socketId: socket.id,
          userId: authSocket.userId,
          reason,
        });
      });
    });

    logger.info('Tracking gateway initialized');

    return this.io;
  }

  /** Send ride request to the next driver in the queue */
  private sendToNextDriver(rideRequestId: string): void {
    const pending = this.pendingRides.get(rideRequestId);
    if (!pending) return;

    // Check if we've exhausted all drivers
    if (pending.currentDriverIndex >= pending.driverQueue.length) {
      // No more drivers to try
      this.io?.to(pending.socketId).emit('ride:no_drivers', {
        rideRequestId,
        message: 'All nearby drivers are unavailable. Please try again.',
      });
      this.pendingRides.delete(rideRequestId);
      return;
    }

    const driver = pending.driverQueue[pending.currentDriverIndex];
    const extra = pending as any;

    // Send ride request to this driver
    this.io?.to(driver.socketId).emit('ride:request', {
      rideRequestId,
      tripType: extra.tripType || 'ride',
      customerName: extra.customerName || 'Customer',
      customerRating: extra.customerRating ?? null,
      pickupText: pending.pickup.text,
      destText: pending.dest.text,
      pickupLat: pending.pickup.lat,
      pickupLng: pending.pickup.lng,
      destLat: pending.dest.lat,
      destLng: pending.dest.lng,
      estimatedPrice: extra.estimatedPrice || 0,
      estimatedDistance: extra.estimatedDistance || 0,
      estimatedDuration: extra.estimatedDuration || 0,
      preferences: extra.preferences || null,
      timeout: 30,
    });

    // Advance index now so next call picks the next driver
    pending.currentDriverIndex++;

    logger.info('Ride request sent to driver', {
      rideRequestId,
      driverId: driver.userId,
      driverIndex: pending.currentDriverIndex - 1,
      totalDrivers: pending.driverQueue.length,
    });

    // Set 30-second timeout — if driver doesn't respond, try next
    pending.timeoutHandle = setTimeout(() => {
      logger.info('Driver timed out on ride request', {
        rideRequestId,
        driverId: driver.userId,
      });

      // Notify the timed-out driver
      this.io?.to(driver.socketId).emit('ride:request_expired', { rideRequestId });

      pending.timeoutHandle = null;
      this.sendToNextDriver(rideRequestId);
    }, 30000);
  }

  /** Emit an event to all clients in a booking room (called from other services) */
  emitToBooking(bookingId: string, event: string, data: unknown): void {
    if (!this.io) return;
    this.io.to(`booking:${bookingId}`).emit(event, data);
  }

  getIO(): SocketServer | null {
    return this.io;
  }
}

export const trackingGateway = new TrackingGateway();
