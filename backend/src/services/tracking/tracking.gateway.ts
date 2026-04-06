import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../../utils/jwt';
import { query } from '../../db';
import { logger } from '../../utils/logger';
import { config } from '../../config';

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

class TrackingGateway {
  private io: SocketServer | null = null;
  private trackingRooms = new Map<string, TrackingRoom>();

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

      // ── Disconnect cleanup ───────────────────────────────────────────────
      socket.on('disconnect', (reason) => {
        // Clean up tracking rooms
        for (const [bookingId, room] of this.trackingRooms.entries()) {
          if (room.chauffeurSocketId === socket.id) room.chauffeurSocketId = null;
          if (room.customerSocketId === socket.id) room.customerSocketId = null;
          this.trackingRooms.set(bookingId, room);
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
