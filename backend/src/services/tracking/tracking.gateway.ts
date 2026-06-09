import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { verifyAccessToken } from '../../utils/jwt';
import { query } from '../../db';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { rideService, NearbyDriver, ActiveRideRecord, OnlineDriver } from '../ride/ride.service';
import { getDirectionsWithWaypoints } from '../maps/maps.service';
import { writeRideLedger, resolveCompanyForBooking } from '../company/company.service';

// €3/km base × car-type multiplier. Categories from Bersenev driver vehicles
// (sclass/maybach/vclass); anything else (luxury/etc.) gets the base 1.0.
const BASE_RATE_PER_KM = 3;
function fareForCategory(category: string | undefined, distanceMeters: number): number {
  const distanceKm = distanceMeters / 1000;
  const cat = (category ?? '').toLowerCase();
  const mult = cat === 'maybach' ? 1.8 : cat === 'vclass' ? 1.3 : 1.0;
  return Math.round(distanceKm * BASE_RATE_PER_KM * mult);
}

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
  // The set of drivers (userId) we've broadcast this request to. Used to
  // emit driver:request_removed when the ride is claimed / cancelled.
  notifiedDrivers: Set<string>;
  // First driver who tapped Accept wins. All subsequent claims see
  // { ok:false, reason:'taken' }. Single-threaded Node makes this safe.
  claimedBy: string | null;
  // Total seconds the customer has waited on Option C; included in the
  // next ride:class_unavailable so the app can phrase "Still no <class>".
  waitedSec: number;
  // Timer that re-evaluates Option C after the keep-waiting window.
  classOfferTimer: ReturnType<typeof setTimeout> | null;
  // Legacy push-model — no longer used for matching but kept on the type
  // so older code paths compile. Always [] / 0 in the new flow.
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
  /** rideId -> monotonically-increasing seq of customer:update_route attempts.
   *  When a second update arrives while the first's Directions call is still
   *  in flight, the older one discards its result on return. Latest wins. */
  private routeUpdateSeq = new Map<string, number>();

  private readonly ABANDON_GRACE_MS = 900_000;

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
    // Restore in-progress rides persisted before the last restart/crash so
    // customers/drivers can resume them instead of seeing them "finish by itself".
    rideService.loadActiveRides();

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
      // Every socket joins a per-user room so we can address the user
      // regardless of which socket.id is currently live. This is what makes
      // a brief reconnect during the ride-search window survivable: the
      // ride:matched (and every ride:* event) goes to `user:<userId>`, so
      // the reconnected socket receives it even though its socket.id changed.
      socket.join(`user:${authSocket.userId}`);
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
            // Push the initial marketplace snapshot — every pending ride
            // currently matching this driver's class. The driver app uses
            // this to seed the Requests list on the home screen.
            this.sendRequestsSnapshotToDriver(authSocket.userId, driver.vehicleInfo?.category);
          } else {
            socket.emit('driver:online:ack', { success: false, message: 'Invalid vehicle' });
          }
        } catch (err) {
          logger.error('Error in driver:online', { error: err });
          socket.emit('error', { message: 'Failed to go online' });
        }
      });

      // Marketplace claim — first-come-first-served lock on a pending ride.
      // Single-threaded Node makes the check-and-set safe without a real lock.
      socket.on('driver:claim_ride', async (data: { rideRequestId: string }, ack?: (r: unknown) => void) => {
        try {
          const pending = this.pendingRides.get(data.rideRequestId);
          if (!pending) {
            const r = { ok: false, reason: 'expired' as const, rideRequestId: data.rideRequestId };
            socket.emit('driver:claim_response', r);
            ack?.(r);
            return;
          }
          if (pending.claimedBy) {
            const r = { ok: false, reason: 'taken' as const, rideRequestId: data.rideRequestId };
            socket.emit('driver:claim_response', r);
            ack?.(r);
            return;
          }
          const driver = rideService.getDriver(authSocket.userId);
          if (!driver) {
            const r = { ok: false, reason: 'not_online' as const, rideRequestId: data.rideRequestId };
            socket.emit('driver:claim_response', r);
            ack?.(r);
            return;
          }
          // Class enforcement at claim time — protects against a driver who
          // somehow got a stale request for the wrong class (e.g. accepted
          // alternative path moved the ride to another class).
          if (pending.category && driver.vehicleInfo.category !== pending.category) {
            const r = { ok: false, reason: 'wrong_class' as const, rideRequestId: data.rideRequestId };
            socket.emit('driver:claim_response', r);
            ack?.(r);
            return;
          }
          pending.claimedBy = authSocket.userId;
          if (pending.classOfferTimer) { clearTimeout(pending.classOfferTimer); pending.classOfferTimer = null; }
          // Notify every other notified driver that this order is gone
          // BEFORE we run the (longer) DB insert — they should see the card
          // disappear immediately so they don't try to tap it too.
          this.notifyDriversOfRemoval(pending, authSocket.userId);
          await this.acceptPendingRideForDriver(pending, driver, authSocket, socket, data.rideRequestId);
          const r = { ok: true as const, rideRequestId: data.rideRequestId };
          ack?.(r);
        } catch (err) {
          logger.error('Error in driver:claim_ride', { error: err });
          const r = { ok: false, reason: 'error' as const, rideRequestId: data.rideRequestId };
          socket.emit('driver:claim_response', r);
          ack?.(r);
        }
      });

      // Option C — rider accepts the suggested alternative class. Switch the
      // pending ride to that category, reprice, and re-broadcast to drivers
      // of the new class (and remove from the old class's notifications).
      socket.on('customer:accept_alternative', async (data: { category: string }) => {
        try {
          const newCategory = (data?.category ?? '').trim();
          if (!newCategory) { socket.emit('error', { message: 'Missing alternative category' }); return; }
          // Resolve the user's pending ride by userId — the client doesn't
          // send the rideRequestId.
          let pending: PendingRide | null = null;
          for (const p of this.pendingRides.values()) {
            if (p.customerId === authSocket.userId && !p.claimedBy) { pending = p; break; }
          }
          if (!pending) { socket.emit('error', { message: 'No pending ride for this user' }); return; }
          if (pending.classOfferTimer) { clearTimeout(pending.classOfferTimer); pending.classOfferTimer = null; }
          // Stale-class drivers (those notified under the OLD category): tell
          // them to remove the card.
          this.notifyDriversOfRemoval(pending);
          pending.notifiedDrivers.clear();
          // Persist the new category + reprice for the matched ride. fare /
          // historical-record consistency with what the rider was shown.
          pending.category = newCategory;
          const distanceMeters = Math.sqrt(
            (pending.pickup.lat - pending.dest.lat) ** 2 + (pending.pickup.lng - pending.dest.lng) ** 2,
          ) * 111 * 1000;
          const newFare = fareForCategory(newCategory, distanceMeters);
          (pending as any).estimatedPrice = newFare;
          // Re-broadcast to the new class's pool. If still empty, kick Option
          // C again (rare — but possible if pool drained mid-decision).
          const newClassPool = rideService.findNearbyDrivers(
            pending.pickup.lat, pending.pickup.lng, 10000, newCategory,
          );
          if (newClassPool.length > 0) {
            this.broadcastRequestToDrivers(pending, newClassPool);
            this.startClassOfferTimer(pending.rideRequestId);
          } else {
            this.offerAlternativeOrNoDrivers(pending.rideRequestId);
          }
          logger.info('Customer accepted alternative class', {
            rideRequestId: pending.rideRequestId,
            newCategory,
            poolSize: newClassPool.length,
          });
        } catch (err) {
          logger.error('Error in customer:accept_alternative', { error: err });
        }
      });

      // Option C — rider keeps waiting for the originally requested class.
      // The class-offer timer already drives the re-evaluation; this handler
      // just ensures the timer is armed (a no-op if it already is).
      socket.on('customer:keep_waiting', async () => {
        try {
          let pending: PendingRide | null = null;
          for (const p of this.pendingRides.values()) {
            if (p.customerId === authSocket.userId && !p.claimedBy) { pending = p; break; }
          }
          if (!pending) return;
          if (!pending.classOfferTimer) this.startClassOfferTimer(pending.rideRequestId);
          logger.info('Customer keep-waiting', { rideRequestId: pending.rideRequestId, waitedSec: pending.waitedSec });
        } catch (err) {
          logger.error('Error in customer:keep_waiting', { error: err });
        }
      });

      socket.on('driver:offline', () => {
        rideService.driverGoOffline(authSocket.userId);
        // Going offline abandons a PRE-PICKUP ride (matched/arriving) — clear it and
        // tell the customer so they aren't stranded. An in_progress trip is NEVER
        // cancelled here: real trips must survive network drops and resume.
        const ride = rideService.getActiveRideForUser(authSocket.userId);
        if (ride && ride.driverId === authSocket.userId && ride.status !== 'in_progress') {
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
          if (pending.claimedBy && pending.claimedBy !== authSocket.userId) {
            socket.emit('error', { message: 'Ride already claimed' });
            return;
          }
          pending.claimedBy = authSocket.userId;
          if (pending.classOfferTimer) { clearTimeout(pending.classOfferTimer); pending.classOfferTimer = null; }
          if (pending.timeoutHandle) { clearTimeout(pending.timeoutHandle); pending.timeoutHandle = null; }

          const driver = rideService.getDriver(authSocket.userId);
          if (!driver) {
            socket.emit('error', { message: 'Driver not found in online pool' });
            return;
          }
          // Tell every other notified driver that this order is gone, then
          // run the shared accept flow (DB insert + ride:matched +
          // ride:confirmed) — same body used by driver:claim_ride.
          this.notifyDriversOfRemoval(pending, authSocket.userId);
          await this.acceptPendingRideForDriver(pending, driver, authSocket, socket, data.rideRequestId);
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

          // Immutable ledger row + run the (currently mock) payment-provider
          // hooks. Failure inside writeRideLedger is logged + swallowed so it
          // can never block trip completion.
          const fareRow = await query<{ total_amount: string | null; chauffeur_user_id: string | null; customer_id: string | null }>(
            'SELECT total_amount, chauffeur_user_id, customer_id FROM bookings WHERE id = $1',
            [data.bookingId]
          );
          const f = fareRow.rows[0];
          if (f?.chauffeur_user_id) {
            await writeRideLedger({
              bookingId: data.bookingId,
              driverId: f.chauffeur_user_id,
              grossFare: Number(f.total_amount ?? 0),
              customerId: f.customer_id ?? undefined,
            });
          }

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
            avatarUrl: (ride as any).driverAvatar ?? null,
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
          // Re-attach this customer to the driver's tracker set so live
          // driver:location:updated events reach the new socket instead of the
          // dead one. Scrub stale (disconnected) socket ids while we're here.
          if (ride.driverId) {
            let trackers = this.driverTrackers.get(ride.driverId);
            if (!trackers) {
              trackers = new Set<string>();
              this.driverTrackers.set(ride.driverId, trackers);
            }
            const liveSockets = this.io?.sockets.sockets;
            trackers.forEach(sid => {
              if (!liveSockets?.get(sid)) trackers!.delete(sid);
            });
            trackers.add(socket.id);
            // Push last known driver location so the marker isn't frozen until
            // the next driver:location emit arrives.
            if (ride.driverLocation) {
              socket.emit('driver:location:updated', {
                driverId: ride.driverId,
                lat: ride.driverLocation.lat,
                lng: ride.driverLocation.lng,
                timestamp: Date.now(),
              });
            }
          }
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

          const rideRequestId = uuidv4();

          // Estimate distance and price (real-distance fare uses fareForCategory)
          const distanceKm = Math.sqrt(
            (pickupLat - destLat) ** 2 + (pickupLng - destLng) ** 2
          ) * 111;
          const distanceMeters = distanceKm * 1000;
          const estimatedDuration = Math.round(distanceKm * 2); // rough ~2min per km
          const estimatedPrice = fareForCategory(vehicleCategory, distanceMeters);

          // Get customer name + rating once for both the searching ack and the
          // broadcast payload.
          const customerResult = await query<{ first_name: string; last_name: string; rating: string | null }>(
            'SELECT first_name, last_name, rating FROM users WHERE id = $1',
            [authSocket.userId]
          );
          const customerName = customerResult.rows[0]
            ? `${customerResult.rows[0].first_name} ${customerResult.rows[0].last_name}`
            : 'Customer';
          const customerRating = customerResult.rows[0]?.rating != null ? Number(customerResult.rows[0].rating) : null;

          // Store pending ride (marketplace pool model — no driverQueue push).
          const pending: PendingRide = {
            rideRequestId,
            customerId: authSocket.userId,
            socketId: socket.id,
            pickup: { lat: pickupLat, lng: pickupLng, text: pickupText },
            dest: { lat: destLat, lng: destLng, text: destText },
            category: vehicleCategory,
            notifiedDrivers: new Set<string>(),
            claimedBy: null,
            waitedSec: 0,
            classOfferTimer: null,
            driverQueue: [],
            currentDriverIndex: 0,
            timeoutHandle: null,
          };
          (pending as any).preferences = preferences;
          (pending as any).tripType = tripType;
          (pending as any).customerName = customerName;
          (pending as any).customerRating = customerRating;
          (pending as any).estimatedPrice = estimatedPrice;
          (pending as any).estimatedDistance = Math.round(distanceKm * 10) / 10;
          (pending as any).estimatedDuration = estimatedDuration;

          this.pendingRides.set(rideRequestId, pending);

          // ── Class-filtered dispatch ──────────────────────────────────────
          // The pool of drivers who can see this request, scoped to the
          // requested class. A V-Class driver never sees a Maybach order.
          const matchingDrivers = rideService.findNearbyDrivers(
            pickupLat, pickupLng, 10000, vehicleCategory,
          );

          // Acknowledge "we're searching" regardless of pool size — Option C
          // takes over below when matchingDrivers is empty.
          socket.emit('ride:searching', {
            rideRequestId,
            driversFound: matchingDrivers.length,
            estimatedPrice,
            estimatedDistance: Math.round(distanceKm * 10) / 10,
            estimatedDuration,
          });

          if (matchingDrivers.length > 0) {
            this.broadcastRequestToDrivers(pending, matchingDrivers);
            // Start the keep-waiting / class-unavailable evaluation timer.
            this.startClassOfferTimer(rideRequestId);
          } else {
            // No matching-class drivers. Option C: offer the nearest
            // available OTHER class, or fall through to ride:no_drivers if
            // no class at all is online.
            this.offerAlternativeOrNoDrivers(rideRequestId);
          }

          logger.info('Ride requested (broadcast)', {
            rideRequestId,
            customerId: authSocket.userId,
            category: vehicleCategory,
            poolSize: matchingDrivers.length,
          });
        } catch (err) {
          logger.error('Error in customer:request_ride', { error: err });
          socket.emit('error', { message: 'Failed to request ride' });
        }
      });

      socket.on('customer:cancel_ride', async (data: { rideId?: string | null; rideRequestId?: string | null }) => {
        try {
          // The customer may not know the id — pre-match they only know
          // they're "searching". Allow rideId === null / absent and resolve
          // from the authenticated user. Look in pendingRides first (search
          // hasn't matched yet), then activeRides (already accepted).
          let id = data?.rideId ?? data?.rideRequestId ?? null;
          if (!id) {
            for (const [rrId, p] of this.pendingRides.entries()) {
              if (p.customerId === authSocket.userId) { id = rrId; break; }
            }
          }
          if (!id) {
            const ride = rideService.getActiveRideForUser(authSocket.userId);
            if (ride) id = ride.rideId;
          }
          if (!id) {
            // Nothing to cancel — still ack so the client can clear local
            // state instead of getting stuck on "Searching".
            socket.emit('ride:cancelled:ack', { rideId: null });
            return;
          }

          // Case 1: pending (pre-accept) request.
          const pending = this.pendingRides.get(id);
          if (pending) {
            if (pending.customerId !== authSocket.userId) {
              socket.emit('error', { message: 'Not authorized to cancel this ride' });
              return;
            }
            if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
            if (pending.classOfferTimer) clearTimeout(pending.classOfferTimer);
            // Marketplace pool: tell every notified driver to remove the
            // card. Also emit the legacy ride:cancelled to the queue head
            // for any old-flow listeners.
            this.notifyDriversOfRemoval(pending);
            if (pending.currentDriverIndex < pending.driverQueue.length) {
              const currentDriver = pending.driverQueue[pending.currentDriverIndex];
              const payload = { rideRequestId: id, rideId: id, message: 'Customer cancelled the ride request' };
              this.io?.to(`user:${currentDriver.userId}`).emit('ride:cancelled', payload);
              this.io?.to(currentDriver.socketId).emit('ride:cancelled', payload);
            }
            this.pendingRides.delete(id);
            socket.emit('ride:cancelled:ack', { rideRequestId: id, rideId: id });
            logger.info('Pending ride cancelled by customer', { rideRequestId: id, customerId: authSocket.userId });
            return;
          }

          // Case 2: active (accepted) ride.
          const ride = rideService.getActiveRideById(id);
          if (!ride) { socket.emit('ride:cancelled:ack', { rideId: id }); return; }
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
          // Hit the driver via user room so a driver who reconnected (new
          // socket.id) still gets it. Same for the customer side.
          this.io?.to(`user:${ride.driverId}`).emit('ride:cancelled', payload);
          this.io?.to(`user:${ride.customerId}`).emit('ride:cancelled', payload);

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
          rideService.persistActiveRide(ride.rideId);
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
          rideService.persistActiveRide(ride.rideId);
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

          // Same ledger write as driver:complete_trip — keep both completion
          // paths writing one immutable row per booking.
          await writeRideLedger({
            bookingId: ride.rideId,
            driverId: ride.driverId,
            grossFare: Number(ride.fare ?? 0),
            customerId: ride.customerId,
          });

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

      // ════════════════════════════════════════════════════════════════════
      // ══  MID-RIDE preference updates (customer changes temp/music/etc.)  ══
      // ════════════════════════════════════════════════════════════════════
      // Customer flipped temperature / music / conversation / notes during the
      // trip. Relay the partial payload to the driver socket so their in-trip
      // prefs row updates live — no accept/reject, Uber-style. Driver app
      // listens on the same event name (`customer:update_preferences`) and
      // merges the partial preferences into its activeRide.preferences.
      socket.on('customer:update_preferences', (data: {
        rideId: string;
        preferences?: { temperature?: number; music?: string; conversation?: string; notes?: string };
      }) => {
        try {
          if (!data?.rideId || !data.preferences) return;
          const ride = rideService.getActiveRideById(data.rideId);
          if (!ride || ride.customerId !== authSocket.userId) return;
          if (ride.driverSocketId) {
            this.io?.to(ride.driverSocketId).emit('customer:update_preferences', {
              rideId: ride.rideId,
              preferences: data.preferences,
            });
          }
        } catch (err) {
          logger.error('Error in customer:update_preferences', { error: err });
        }
      });

      // ════════════════════════════════════════════════════════════════════
      // ══  MID-RIDE route updates (customer changes stops / destination)  ══
      // ════════════════════════════════════════════════════════════════════
      // Customer atomically replaces intermediate stops + final destination while
      // the trip is in_progress. NO accept/reject — the change is imposed
      // Uber-style; the driver UI just follows the new polyline.
      socket.on('customer:update_route', async (data: {
        rideId: string;
        stops?: Array<{ lat: number; lng: number; address: string }>;
        destination: { lat: number; lng: number; address: string };
      }) => {
        const rejectToCustomer = (reason: string) => {
          socket.emit('ride:route_update_rejected', { rideId: data?.rideId, reason });
        };
        try {
          if (!data?.rideId || !data.destination ||
              typeof data.destination.lat !== 'number' || typeof data.destination.lng !== 'number') {
            rejectToCustomer('Invalid payload');
            return;
          }
          const ride = rideService.getActiveRideById(data.rideId);
          if (!ride || ride.customerId !== authSocket.userId) {
            rejectToCustomer('Ride not found');
            return;
          }
          if (ride.status !== 'in_progress') {
            rejectToCustomer('Ride no longer in progress');
            return;
          }
          // Origin MUST be driver's current GPS — using pickup would send the
          // driver backward. driverLocation is kept fresh via driver:location.
          const origin = ride.driverLocation;
          if (!origin || typeof origin.lat !== 'number' || typeof origin.lng !== 'number') {
            rejectToCustomer('Driver location unavailable');
            return;
          }
          // Customer UI hides "Add stop" at 3 — reject anything beyond as
          // defense in depth (catches version mismatches / non-Bersenev clients).
          const stops = data.stops ?? [];
          if (stops.length > 3) {
            rejectToCustomer('Too many stops (max 3)');
            return;
          }
          // Tag this attempt with a per-ride monotonic seq. If a second update
          // arrives while we're awaiting Directions, ours becomes stale and we
          // discard our result on return — the latest update wins, no queueing.
          const mySeq = (this.routeUpdateSeq.get(ride.rideId) ?? 0) + 1;
          this.routeUpdateSeq.set(ride.rideId, mySeq);

          const directions = await getDirectionsWithWaypoints(
            { latitude: origin.lat, longitude: origin.lng },
            { latitude: data.destination.lat, longitude: data.destination.lng },
            stops.map(s => ({ latitude: s.lat, longitude: s.lng })),
          );
          if (this.routeUpdateSeq.get(ride.rideId) !== mySeq) {
            // A newer customer:update_route superseded ours during the await.
            // Do nothing — the newer one's emit is the broadcast that lands.
            return;
          }
          if (!directions) {
            rejectToCustomer('Could not recompute route');
            return;
          }

          const newFare = fareForCategory(ride.vehicleInfo?.category, directions.distanceMeters);

          // Mutate in-memory ride
          ride.dest = { lat: data.destination.lat, lng: data.destination.lng, address: data.destination.address };
          ride.routeStops = stops.map(s => ({ lat: s.lat, lng: s.lng, address: s.address }));
          ride.fare = newFare;
          rideService.persistActiveRide(ride.rideId);

          // Persist new fare AND the ordered stops to bookings so ride history
          // can replay the full route post-completion. active_rides row gets
          // deleted on endActiveRide, so bookings is the only durable home for
          // multi-stop trip data.
          await query(
            'UPDATE bookings SET total_amount = $1, route_stops = $2, updated_at = NOW() WHERE id = $3',
            [newFare, JSON.stringify(ride.routeStops ?? []), ride.rideId]
          );

          const payload = {
            rideId: ride.rideId,
            stops: ride.routeStops,
            destination: ride.dest,
            newFare,
            newDistanceMeters: directions.distanceMeters,
            newDurationSeconds: directions.durationSeconds,
            newPolyline: directions.polyline,
          };
          if (ride.customerSocketId) this.io?.to(ride.customerSocketId).emit('ride:route_updated', payload);
          if (ride.driverSocketId) this.io?.to(ride.driverSocketId).emit('ride:route_updated', payload);

          logger.info('Mid-ride route updated', {
            rideId: ride.rideId,
            stopCount: ride.routeStops.length,
            newFare,
            distanceMeters: directions.distanceMeters,
          });
        } catch (err) {
          logger.error('Error in customer:update_route', { error: err });
          rejectToCustomer('Server error');
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

        // If a DRIVER with a PRE-PICKUP ride (matched/arriving) drops, give them a
        // grace period to reconnect (driver:resume_ride clears the timer); if they
        // don't return, cancel so the customer isn't stranded. An in_progress trip
        // is NEVER auto-cancelled — it must survive network drops and resume.
        const ride = rideService.getActiveRideForUser(authSocket.userId);
        if (
          ride &&
          ride.driverId === authSocket.userId &&
          ride.status !== 'in_progress' &&
          !this.abandonTimers.has(ride.rideId)
        ) {
          const rideId = ride.rideId;
          const timer = setTimeout(() => {
            this.abandonTimers.delete(rideId);
            const r = rideService.getActiveRideById(rideId);
            // Re-check status at fire time: if the trip started during the grace
            // window (e.g. driver resumed + arrived), leave it alone.
            if (r && r.status !== 'in_progress') {
              this.cancelActiveRide(rideId, 'Driver disconnected');
            }
          }, this.ABANDON_GRACE_MS);
          this.abandonTimers.set(rideId, timer);
          logger.info('Driver disconnected pre-pickup; grace timer started', { rideId, reason });
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

        // INTENTIONAL: do NOT delete pending rides on disconnect.
        // The customer socket may briefly drop during the search window
        // (cell-tower handoff, app backgrounded, screen lock) and re-
        // connect with a new socket.id within seconds. Tearing the pending
        // ride down here used to:
        //   - cause "Ride not found" when the driver later tried to mark
        //     Arrived (the ride had been silently cancelled mid-accept), and
        //   - leave the customer's "Searching" UI hung because the new
        //     socket never received the ride:matched (it had been emitted
        //     to the dead socket.id).
        // The pending ride's own timeout (driver queue exhausted) and the
        // explicit customer:cancel_ride event are now the only paths that
        // remove a pending ride. Same for active rides — those are kept
        // alive across customer reconnects so the driver's accept/arrived/
        // complete flow can continue uninterrupted.

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

  /** Build the "order summary" emitted to drivers in the request_added /
   *  requests snapshot events. Same shape used by the marketplace list and
   *  detail screens on the driver app. */
  private buildRequestSummary(pending: PendingRide): Record<string, unknown> {
    const extra = pending as any;
    return {
      rideRequestId: pending.rideRequestId,
      category: pending.category,
      tripType: extra.tripType || 'ride',
      customerName: extra.customerName || 'Customer',
      customerRating: extra.customerRating ?? null,
      pickupText: pending.pickup.text,
      destText: pending.dest.text,
      pickupLat: pending.pickup.lat,
      pickupLng: pending.pickup.lng,
      destLat: pending.dest.lat,
      destLng: pending.dest.lng,
      estimatedPrice: extra.estimatedPrice ?? 0,
      estimatedDistance: extra.estimatedDistance ?? 0,
      estimatedDuration: extra.estimatedDuration ?? 0,
      // Scheduled rides aren't supported yet end-to-end; surfaced as
      // scheduledFor === null so the card renders the "Now" pill.
      scheduledFor: extra.scheduledFor ?? null,
      preferences: extra.preferences || null,
      createdAt: extra.createdAt ?? Date.now(),
    };
  }

  /** Broadcast a pending ride to every matching-class driver. Each driver
   *  gets a `driver:request_added` event in their user room (survives a
   *  socket reconnect). Records who was notified so cancel/claim cleanup
   *  can tell them to remove the card. */
  private broadcastRequestToDrivers(pending: PendingRide, drivers: NearbyDriver[]): void {
    const summary = this.buildRequestSummary(pending);
    for (const d of drivers) {
      pending.notifiedDrivers.add(d.userId);
      this.io?.to(`user:${d.userId}`).emit('driver:request_added', summary);
    }
  }

  /** A driver just went online — push them the full snapshot of pending
   *  rides currently matching their class. Their user room receives a
   *  `driver:requests` event with an array of the same summary shape. */
  private sendRequestsSnapshotToDriver(userId: string, category: string | undefined): void {
    const requests: Record<string, unknown>[] = [];
    for (const pending of this.pendingRides.values()) {
      if (pending.claimedBy) continue;
      if (pending.category && category && pending.category !== category) continue;
      pending.notifiedDrivers.add(userId);
      requests.push(this.buildRequestSummary(pending));
    }
    this.io?.to(`user:${userId}`).emit('driver:requests', { requests });
  }

  /** Tell every notified driver (EXCEPT the optional winner) that a ride
   *  is no longer claimable — it was claimed/cancelled/expired. */
  private notifyDriversOfRemoval(pending: PendingRide, winnerUserId?: string): void {
    for (const driverId of pending.notifiedDrivers) {
      if (driverId === winnerUserId) continue;
      this.io?.to(`user:${driverId}`).emit('driver:request_removed', {
        rideRequestId: pending.rideRequestId,
      });
    }
  }

  /** Find the nearest available class OTHER than the one the customer asked
   *  for. Used by Option C to suggest an alternative. Returns the chosen
   *  category (e.g. 'sclass') and the closest driver's distance so etaMin
   *  can be derived. */
  private findAlternativeClass(
    pickupLat: number, pickupLng: number, requested: string | undefined,
  ): { category: string; etaMin: number } | null {
    // Scan all candidate categories EXCEPT the requested one. Pick the one
    // whose nearest driver is closest.
    const candidates = ['sclass', 'maybach', 'vclass'].filter(c => c !== requested);
    let best: { category: string; distanceKm: number } | null = null;
    for (const c of candidates) {
      const list = rideService.findNearbyDrivers(pickupLat, pickupLng, 10000, c);
      if (list.length === 0) continue;
      const nearest = list[0].distanceKm;
      if (!best || nearest < best.distanceKm) {
        best = { category: c, distanceKm: nearest };
      }
    }
    if (!best) return null;
    // Rough ETA: 2 minutes per km (matches the customer-side estimate).
    const etaMin = Math.max(1, Math.round(best.distanceKm * 2));
    return { category: best.category, etaMin };
  }

  /** No matching-class driver is online. Try to suggest an alternative; if
   *  none exists either, fall back to the existing ride:no_drivers behavior. */
  private offerAlternativeOrNoDrivers(rideRequestId: string): void {
    const pending = this.pendingRides.get(rideRequestId);
    if (!pending) return;
    const requested = pending.category;
    const alt = this.findAlternativeClass(pending.pickup.lat, pending.pickup.lng, requested);
    if (!alt) {
      this.io?.to(`user:${pending.customerId}`).emit('ride:no_drivers', {
        rideRequestId,
        message: 'No drivers available nearby. Please try again later.',
      });
      this.pendingRides.delete(rideRequestId);
      logger.info('No drivers in any class — ride:no_drivers', { rideRequestId });
      return;
    }
    const distanceMeters = Math.sqrt(
      (pending.pickup.lat - pending.dest.lat) ** 2 + (pending.pickup.lng - pending.dest.lng) ** 2,
    ) * 111 * 1000;
    const fare = fareForCategory(alt.category, distanceMeters);
    this.io?.to(`user:${pending.customerId}`).emit('ride:class_unavailable', {
      requested,
      alternative: { category: alt.category, fare, etaMin: alt.etaMin },
      waitedSec: pending.waitedSec,
    });
    // Start the keep-waiting timer so if the rider DOESN'T reply we re-poll
    // the matching-class pool again and either dispatch (if a driver came
    // online) or re-emit class_unavailable with a larger waitedSec.
    this.startClassOfferTimer(rideRequestId);
    logger.info('Class unavailable — alternative offered', {
      rideRequestId, requested, alternative: alt.category, waitedSec: pending.waitedSec,
    });
  }

  // Keep-waiting / re-evaluation window. 2.5 min matches the spec range.
  private readonly CLASS_OFFER_WINDOW_MS = 150_000;

  /** Schedule a class_unavailable re-evaluation. Cancels the prior timer
   *  (e.g. if a driver claims, we cancel before firing). */
  private startClassOfferTimer(rideRequestId: string): void {
    const pending = this.pendingRides.get(rideRequestId);
    if (!pending) return;
    if (pending.classOfferTimer) clearTimeout(pending.classOfferTimer);
    pending.classOfferTimer = setTimeout(() => {
      const p = this.pendingRides.get(rideRequestId);
      if (!p || p.claimedBy) return;
      p.waitedSec += Math.round(this.CLASS_OFFER_WINDOW_MS / 1000);
      // Did any matching-class driver come online during the wait?
      const matching = rideService.findNearbyDrivers(
        p.pickup.lat, p.pickup.lng, 10000, p.category,
      );
      // Drivers we haven't notified yet (newcomers): tell them.
      const fresh = matching.filter(d => !p.notifiedDrivers.has(d.userId));
      if (fresh.length > 0) {
        this.broadcastRequestToDrivers(p, fresh);
      }
      // If at least one matching driver is in the pool, just keep waiting
      // — the keep-waiting timer reschedules itself.
      if (matching.length > 0) {
        this.startClassOfferTimer(rideRequestId);
        return;
      }
      // Still no matching class — re-emit Option C with the larger waitedSec.
      this.offerAlternativeOrNoDrivers(rideRequestId);
    }, this.CLASS_OFFER_WINDOW_MS);
  }

  /** Legacy push-model dispatch (one driver at a time). Kept for now but
   *  unused by customer:request_ride. */
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

  /** Shared accept body — runs the booking INSERT, persists the active
   *  ride, emits ride:matched to the customer's user room, ride:confirmed
   *  to the driver socket, and removes the pending entry. Both
   *  driver:accept_ride (legacy push-model) and driver:claim_ride
   *  (marketplace pool) end up here after their own validation. */
  private async acceptPendingRideForDriver(
    pending: PendingRide,
    driver: OnlineDriver,
    authSocket: AuthenticatedSocket,
    socket: Socket,
    rideRequestId: string,
  ): Promise<void> {
    const now = new Date();
    const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // estimate 2h

    const isUuidVid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driver.vehicleId);
    const vehicleIdForDb = isUuidVid ? driver.vehicleId : null;
    const fareAmount = (pending as any).estimatedPrice ?? 0;

    // Capture company at ride-creation time. Only fleet_vehicles UUIDs
    // resolve to a company; Bersenev-local vehicles (non-UUID) and personal
    // cars return NULL (solo). Snapshot survives even if the driver later
    // changes fleets — ledger attribution stays correct.
    const bookingCompanyId = isUuidVid
      ? await resolveCompanyForBooking(driver.userId, vehicleIdForDb)
      : null;

    const bookingResult = await query<{ id: string }>(
      `INSERT INTO bookings
        (customer_id, vehicle_id, chauffeur_user_id, type, mode, status,
         start_time, end_time, pickup_address, pickup_lat, pickup_lng,
         dropoff_address, dropoff_lat, dropoff_lng,
         base_amount, chauffeur_fee, insurance_fee, mileage_overage,
         platform_commission, total_amount, deposit_amount, company_id)
       VALUES ($1,$2,$3,'instant_ride','chauffeur','confirmed',$4,$5,$6,$7,$8,$9,$10,$11,
               $12,0,0,0,0,$12,0,$13)
       RETURNING id`,
      [
        pending.customerId, vehicleIdForDb, driver.userId, now, endTime,
        pending.pickup.text, pending.pickup.lat, pending.pickup.lng,
        pending.dest.text, pending.dest.lat, pending.dest.lng,
        fareAmount, bookingCompanyId,
      ],
    );
    const bookingId = bookingResult.rows[0].id;

    const customerResult = await query<{ first_name: string; last_name: string }>(
      'SELECT first_name, last_name FROM users WHERE id = $1', [pending.customerId],
    );
    const customerName = customerResult.rows[0]
      ? `${customerResult.rows[0].first_name} ${customerResult.rows[0].last_name}`
      : 'Customer';

    const driverUserResult = await query<{ first_name: string; last_name: string; rating: string | null; rating_count: number | null; avatar_url: string | null }>(
      'SELECT first_name, last_name, rating, rating_count, avatar_url FROM users WHERE id = $1',
      [authSocket.userId],
    );
    const driverRow = driverUserResult.rows[0];
    const driverName = driverRow ? `${driverRow.first_name} ${driverRow.last_name}` : authSocket.email;
    const driverRating = driverRow?.rating != null ? Number(driverRow.rating) : null;
    const driverTrips = driverRow?.rating_count ?? 0;
    const driverAvatar = driverRow?.avatar_url ?? null;

    this.rideCustomerSockets.set(bookingId, pending.socketId);
    this.rideCustomerSockets.set(rideRequestId, pending.socketId);

    const fare = fareAmount;

    rideService.startActiveRide({
      rideId: bookingId, status: 'matched',
      customerId: pending.customerId, driverId: driver.userId,
      customerSocketId: pending.socketId, driverSocketId: socket.id,
      driverName, driverRating, driverTrips, driverAvatar,
      vehicleId: driver.vehicleId, vehicleInfo: driver.vehicleInfo,
      driverLocation: driver.location,
      pickup: { lat: pending.pickup.lat, lng: pending.pickup.lng, address: pending.pickup.text },
      dest: { lat: pending.dest.lat, lng: pending.dest.lng, address: pending.dest.text },
      fare,
    });

    // ride:matched to the customer's user room (survives reconnect).
    this.io?.to(`user:${pending.customerId}`).emit('ride:matched', {
      rideRequestId, bookingId, rideId: bookingId,
      driverId: driver.userId, status: 'matched',
      tripType: (pending as any).tripType || 'ride',
      fare,
      driver: {
        userId: driver.userId, name: driverName,
        rating: driverRating, trips: driverTrips,
        avatarUrl: driverAvatar,
        vehicleInfo: driver.vehicleInfo, location: driver.location,
      },
      pickup: { lat: pending.pickup.lat, lng: pending.pickup.lng, address: pending.pickup.text },
      dest: { lat: pending.dest.lat, lng: pending.dest.lng, address: pending.dest.text },
    });

    socket.emit('ride:confirmed', {
      rideRequestId, bookingId, rideId: bookingId,
      customerName, pickup: pending.pickup, dest: pending.dest,
    });

    this.pendingRides.delete(rideRequestId);

    logger.info('Ride matched', {
      rideRequestId, bookingId,
      driverId: authSocket.userId, customerId: pending.customerId,
    });
  }
}

export const trackingGateway = new TrackingGateway();
