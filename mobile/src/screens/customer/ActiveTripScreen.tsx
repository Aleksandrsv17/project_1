import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { io, Socket } from 'socket.io-client';
import { useBooking, useCompleteBooking } from '../../hooks/useBookings';
import { useBookingStore } from '../../store/bookingStore';
import { useLocation } from '../../hooks/useLocation';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS, SOCKET_URL } from '../../utils/constants';
import { formatETA, formatDateTime } from '../../utils/formatters';
import { CustomerStackParamList } from '../../navigation/CustomerNavigator';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type ActiveTripScreenProps = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'ActiveTrip'>;
  route: RouteProp<CustomerStackParamList, 'ActiveTrip'>;
};

export function ActiveTripScreen({ navigation, route }: ActiveTripScreenProps) {
  const { bookingId } = route.params;
  const mapRef = useRef<MapView>(null);
  const socketRef = useRef<Socket | null>(null);

  const { data: booking, isLoading } = useBooking(bookingId);
  const { chauffeurLocation, setChauffeurLocation } = useBookingStore();
  const { location: userLocation } = useLocation();
  const completeBookingMutation = useCompleteBooking();

  const [eta, setEta] = useState<number | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Connect to Socket.io for real-time driver tracking
  useEffect(() => {
    if (!bookingId || !booking) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { bookingId },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('join-booking', bookingId);
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    // Driver location update event
    socket.on('driver-location', (data: {
      latitude: number;
      longitude: number;
      heading: number;
      speed: number;
      etaMinutes: number;
    }) => {
      setChauffeurLocation({
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading,
        speed: data.speed,
      });
      setEta(data.etaMinutes);

      // Center map on driver
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: data.latitude,
          longitude: data.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
      }
    });

    socket.on('trip-completed', () => {
      Alert.alert('Trip Completed', 'Your trip has been completed.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    });

    socket.on('connect_error', () => {
      setConnectionStatus('disconnected');
      // TODO: Fallback to polling the location API
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [bookingId, booking, setChauffeurLocation, navigation]);

  async function handleCompleteTrip() {
    Alert.alert(
      'Complete Trip',
      'Are you sure you want to mark this trip as complete?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            setIsCompleting(true);
            try {
              await completeBookingMutation.mutateAsync(bookingId);
              socketRef.current?.emit('trip-complete', bookingId);
              navigation.replace('BookingHistory');
            } catch {
              Alert.alert('Error', 'Failed to complete trip. Please try again.');
            } finally {
              setIsCompleting(false);
            }
          },
        },
      ]
    );
  }

  if (isLoading) return <LoadingSpinner fullScreen message="Loading trip details..." />;
  if (!booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.errorText}>Booking not found.</Text>
      </SafeAreaView>
    );
  }

  const defaultRegion = userLocation
    ? {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : {
        latitude: booking.pickupLocation.latitude,
        longitude: booking.pickupLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={defaultRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Pickup marker */}
        <Marker
          coordinate={booking.pickupLocation}
          title="Pickup"
        >
          <View style={styles.pickupMarker}>
            <Text style={styles.markerText}>📍</Text>
          </View>
        </Marker>

        {/* Dropoff marker */}
        {booking.dropoffLocation && (
          <Marker
            coordinate={booking.dropoffLocation}
            title="Drop-off"
          >
            <View style={styles.dropoffMarker}>
              <Text style={styles.markerText}>🏁</Text>
            </View>
          </Marker>
        )}

        {/* Chauffeur / Vehicle location */}
        {chauffeurLocation && (
          <Marker
            coordinate={chauffeurLocation}
            title="Your Vehicle"
          >
            <View style={styles.vehicleMarker}>
              <Text style={styles.vehicleMarkerText}>🚗</Text>
            </View>
          </Marker>
        )}

        {/* Route line from driver to pickup */}
        {chauffeurLocation && (
          <Polyline
            coordinates={[chauffeurLocation, booking.pickupLocation]}
            strokeColor={COLORS.accent}
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}
      </MapView>

      {/* Header Overlay */}
      <SafeAreaView style={styles.headerOverlay} edges={['top']}>
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
            <Text style={styles.headerBackText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Active Trip</Text>
            <View style={styles.connectionRow}>
              <View style={[
                styles.connectionDot,
                connectionStatus === 'connected' ? styles.connectedDot : styles.disconnectedDot,
              ]} />
              <Text style={styles.connectionText}>
                {connectionStatus === 'connected' ? 'Live tracking' : 'Reconnecting...'}
              </Text>
            </View>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom Panel */}
      <View style={styles.bottomPanel}>
        {/* ETA */}
        {eta !== null && (
          <View style={styles.etaBar}>
            <Text style={styles.etaIcon}>🕐</Text>
            <Text style={styles.etaText}>{formatETA(eta)}</Text>
          </View>
        )}

        {/* Trip Info */}
        <View style={styles.tripInfo}>
          <TripInfoRow
            icon="🚗"
            label="Vehicle"
            value={`${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`}
          />
          <TripInfoRow
            icon="📍"
            label="Pickup"
            value={booking.pickupLocation.address}
          />
          {booking.dropoffLocation && (
            <TripInfoRow
              icon="🏁"
              label="Drop-off"
              value={booking.dropoffLocation.address}
            />
          )}
          <TripInfoRow
            icon="⏰"
            label="Booked until"
            value={formatDateTime(booking.endTime)}
          />
          <TripInfoRow
            icon="💳"
            label="Payment"
            value={booking.paymentStatus === 'paid' ? 'Paid ✓' : 'Pending'}
          />
        </View>

        {/* Complete Button */}
        {booking.status === 'active' && (
          <SafeAreaView edges={['bottom']}>
            <TouchableOpacity
              style={[styles.completeButton, isCompleting && styles.disabledButton]}
              onPress={handleCompleteTrip}
              disabled={isCompleting}
            >
              {isCompleting ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.completeButtonText}>Complete Trip</Text>
              )}
            </TouchableOpacity>
          </SafeAreaView>
        )}

        {booking.status === 'confirmed' && (
          <SafeAreaView edges={['bottom']}>
            <View style={styles.waitingBanner}>
              <Text style={styles.waitingText}>⏳ Waiting for your vehicle to depart...</Text>
            </View>
          </SafeAreaView>
        )}
      </View>
    </View>
  );
}

function TripInfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.tripInfoRow}>
      <Text style={styles.tripInfoIcon}>{icon}</Text>
      <Text style={styles.tripInfoLabel}>{label}</Text>
      <Text style={styles.tripInfoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  headerOverlay: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerBack: {
    padding: 4,
  },
  headerBackText: {
    fontSize: 22,
    color: COLORS.textPrimary,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectedDot: {
    backgroundColor: COLORS.success,
  },
  disconnectedDot: {
    backgroundColor: COLORS.error,
  },
  connectionText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065f46',
  },
  pickupMarker: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 4,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  dropoffMarker: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 4,
  },
  vehicleMarker: {
    backgroundColor: COLORS.accent,
    borderRadius: 22,
    padding: 6,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  vehicleMarkerText: {
    fontSize: 22,
  },
  markerText: {
    fontSize: 22,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    maxHeight: SCREEN_HEIGHT * 0.45,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  etaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  etaIcon: {
    fontSize: 16,
  },
  etaText: {
    color: COLORS.accent,
    fontWeight: '700',
    fontSize: 15,
  },
  tripInfo: {
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  tripInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 4,
  },
  tripInfoIcon: {
    fontSize: 14,
    width: 20,
  },
  tripInfoLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    width: 72,
  },
  tripInfoValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  completeButton: {
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: SPACING.md,
  },
  disabledButton: {
    opacity: 0.7,
  },
  completeButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
  waitingBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  waitingText: {
    color: '#92400e',
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    padding: SPACING.lg,
    color: COLORS.error,
  },
});
