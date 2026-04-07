import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Circle } from 'react-native-maps';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useMyVehicles } from '../../hooks/useVehicles';
import { useOwnerBookings } from '../../hooks/useBookings';
import { useLocation } from '../../hooks/useLocation';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS, DEFAULT_REGION } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import { Vehicle } from '../../api/vehicles';
import { OwnerTabParamList } from '../../navigation/OwnerNavigator';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

type FleetMapScreenProps = {
  navigation: BottomTabNavigationProp<OwnerTabParamList, 'FleetMap'>;
};

export function FleetMapScreen({ navigation }: FleetMapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const { location } = useLocation();
  const { data: vehicles, isLoading: vehiclesLoading } = useMyVehicles();
  const { data: bookingsData } = useOwnerBookings({ limit: 50 });
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [filter, setFilter] = useState<'all' | 'available' | 'booked'>('all');

  const activeBookings = bookingsData?.bookings.filter(
    (b) => b.status === 'active' || b.status === 'confirmed'
  ) ?? [];

  const filteredVehicles = (vehicles ?? []).filter((v) => {
    if (filter === 'available') return v.isAvailable;
    if (filter === 'booked') return !v.isAvailable;
    return true;
  });

  const region = location
    ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : DEFAULT_REGION;

  function handleVehicleMarkerPress(vehicle: Vehicle) {
    setSelectedVehicle(vehicle);
    mapRef.current?.animateToRegion({
      latitude: vehicle.location.latitude,
      longitude: vehicle.location.longitude,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    });
  }

  function handleCenterOnFleet() {
    if (!vehicles || vehicles.length === 0) return;
    const coords = vehicles.map((v) => ({
      latitude: v.location.latitude,
      longitude: v.location.longitude,
    }));
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
      animated: true,
    });
  }

  if (vehiclesLoading) return <LoadingSpinner fullScreen message="Loading fleet..." />;

  const availableCount = (vehicles ?? []).filter((v) => v.isAvailable).length;
  const bookedCount = (vehicles ?? []).filter((v) => !v.isAvailable).length;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Vehicle markers */}
        {filteredVehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            coordinate={{
              latitude: vehicle.location.latitude,
              longitude: vehicle.location.longitude,
            }}
            onPress={() => handleVehicleMarkerPress(vehicle)}
          >
            <View
              style={[
                styles.vehicleMarker,
                vehicle.isAvailable ? styles.markerAvailable : styles.markerBooked,
                selectedVehicle?.id === vehicle.id && styles.markerSelected,
              ]}
            >
              <Text style={styles.vehicleMarkerText}>🚗</Text>
            </View>
          </Marker>
        ))}

        {/* Active booking pickup/dropoff markers */}
        {activeBookings.map((booking) => (
          <React.Fragment key={`booking-${booking.id}`}>
            {booking.pickupLocation && (
              <Marker
                coordinate={booking.pickupLocation}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.bookingMarker}>
                  <Text style={styles.bookingMarkerText}>📍</Text>
                </View>
              </Marker>
            )}
            {booking.dropoffLocation && (
              <Marker
                coordinate={booking.dropoffLocation}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.bookingMarker}>
                  <Text style={styles.bookingMarkerText}>🏁</Text>
                </View>
              </Marker>
            )}
          </React.Fragment>
        ))}

        {/* Selected vehicle radius */}
        {selectedVehicle && (
          <Circle
            center={{
              latitude: selectedVehicle.location.latitude,
              longitude: selectedVehicle.location.longitude,
            }}
            radius={500}
            fillColor="rgba(201, 168, 76, 0.1)"
            strokeColor="rgba(201, 168, 76, 0.3)"
            strokeWidth={1}
          />
        )}
      </MapView>

      {/* Header overlay */}
      <SafeAreaView style={styles.headerOverlay} edges={['top']}>
        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>My Fleet</Text>
            <Text style={styles.headerSubtitle}>
              {vehicles?.length ?? 0} vehicles · {activeBookings.length} active trips
            </Text>
          </View>
          <TouchableOpacity style={styles.centerButton} onPress={handleCenterOnFleet}>
            <Text style={styles.centerButtonText}>📍</Text>
          </TouchableOpacity>
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {([
            { key: 'all', label: `All (${vehicles?.length ?? 0})` },
            { key: 'available', label: `Available (${availableCount})` },
            { key: 'booked', label: `Booked (${bookedCount})` },
          ] as const).map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => { setFilter(f.key); setSelectedVehicle(null); }}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* Selected vehicle detail card */}
      {selectedVehicle && (
        <View style={styles.detailCard}>
          <View style={styles.detailCardHandle} />
          <View style={styles.detailCardHeader}>
            <View style={styles.detailCardInfo}>
              <Text style={styles.detailCardTitle}>
                {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
              </Text>
              <Text style={styles.detailCardAddress}>{selectedVehicle.location.address}</Text>
            </View>
            <View
              style={[
                styles.statusDot,
                selectedVehicle.isAvailable ? styles.statusAvailable : styles.statusBooked,
              ]}
            >
              <Text style={styles.statusText}>
                {selectedVehicle.isAvailable ? 'Available' : 'Booked'}
              </Text>
            </View>
          </View>

          <View style={styles.detailCardStats}>
            <View style={styles.detailStat}>
              <Text style={styles.detailStatLabel}>Hourly</Text>
              <Text style={styles.detailStatValue}>{formatCurrency(selectedVehicle.pricePerHour)}</Text>
            </View>
            <View style={styles.detailStatDivider} />
            <View style={styles.detailStat}>
              <Text style={styles.detailStatLabel}>Daily</Text>
              <Text style={styles.detailStatValue}>{formatCurrency(selectedVehicle.pricePerDay)}</Text>
            </View>
            <View style={styles.detailStatDivider} />
            <View style={styles.detailStat}>
              <Text style={styles.detailStatLabel}>Rating</Text>
              <Text style={styles.detailStatValue}>{selectedVehicle.rating.toFixed(1)} / 5</Text>
            </View>
            <View style={styles.detailStatDivider} />
            <View style={styles.detailStat}>
              <Text style={styles.detailStatLabel}>Category</Text>
              <Text style={[styles.detailStatValue, { textTransform: 'capitalize' }]}>
                {selectedVehicle.category}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.closeDetailButton}
            onPress={() => setSelectedVehicle(null)}
          >
            <Text style={styles.closeDetailText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  headerOverlay: {
    paddingHorizontal: SPACING.md,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  headerSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  centerButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center', alignItems: 'center',
  },
  centerButtonText: { fontSize: 18 },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  filterChip: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.accent },
  vehicleMarker: {
    borderRadius: 22, padding: 6,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  markerAvailable: { backgroundColor: '#d1fae5' },
  markerBooked: { backgroundColor: '#fee2e2' },
  markerSelected: {
    borderWidth: 3, borderColor: COLORS.accent,
    transform: [{ scale: 1.2 }],
  },
  vehicleMarkerText: { fontSize: 20 },
  bookingMarker: {
    backgroundColor: 'rgba(201,168,76,0.2)',
    borderRadius: 12, padding: 4,
  },
  bookingMarkerText: { fontSize: 14 },
  detailCard: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 16,
  },
  detailCardHandle: {
    width: 40, height: 4, backgroundColor: COLORS.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md,
  },
  detailCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  detailCardInfo: { flex: 1, marginRight: SPACING.sm },
  detailCardTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  detailCardAddress: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  statusDot: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusAvailable: { backgroundColor: '#d1fae5' },
  statusBooked: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: 11, fontWeight: '700' },
  detailCardStats: {
    flexDirection: 'row', marginTop: SPACING.md,
    backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
  },
  detailStat: { flex: 1, alignItems: 'center' },
  detailStatLabel: { fontSize: 10, color: COLORS.textSecondary },
  detailStatValue: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginTop: 2 },
  detailStatDivider: { width: 1, backgroundColor: COLORS.border },
  closeDetailButton: {
    marginTop: SPACING.md, alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  closeDetailText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
});
