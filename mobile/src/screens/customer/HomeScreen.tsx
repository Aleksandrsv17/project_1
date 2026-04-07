import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  FlatList,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useLocation } from '../../hooks/useLocation';
import { useNearbyVehicles } from '../../hooks/useVehicles';
import { searchPlaces, getPlaceDetails, getDirections, decodePolyline, PlacePrediction, LatLng } from '../../api/maps';
import { VehicleCard } from '../../components/VehicleCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS, DEFAULT_REGION } from '../../utils/constants';
import { useAuthStore } from '../../store/authStore';
import { Vehicle } from '../../api/vehicles';
import { CustomerTabParamList } from '../../navigation/CustomerNavigator';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type HomeScreenProps = {
  navigation: BottomTabNavigationProp<CustomerTabParamList, 'Home'>;
};

type ViewMode = 'idle' | 'search' | 'route';

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { user } = useAuthStore();
  const { location, address: userAddress } = useLocation();
  const mapRef = useRef<MapView>(null);

  // Search state
  const [viewMode, setViewMode] = useState<ViewMode>('idle');
  const [pickupText, setPickupText] = useState('');
  const [destText, setDestText] = useState('');
  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [destCoords, setDestCoords] = useState<LatLng | null>(null);
  const [activeInput, setActiveInput] = useState<'pickup' | 'dest'>('dest');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);

  const region = location
    ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : DEFAULT_REGION;

  const { data: nearbyVehicles, isLoading: loadingNearby } = useNearbyVehicles(
    location?.latitude,
    location?.longitude,
    15
  );

  // ── Places search ──────────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchText = useCallback((text: string, field: 'pickup' | 'dest') => {
    if (field === 'pickup') setPickupText(text);
    else setDestText(text);
    setActiveInput(field);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setPredictions([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(text, location ?? undefined);
        setPredictions(results);
      } catch {
        setPredictions([]);
      }
    }, 300);
  }, [location]);

  async function handleSelectPlace(prediction: PlacePrediction) {
    setPredictions([]);
    Keyboard.dismiss();

    try {
      const details = await getPlaceDetails(prediction.placeId);
      const coords = { latitude: details.latitude, longitude: details.longitude };

      if (activeInput === 'pickup') {
        setPickupText(prediction.mainText);
        setPickupCoords(coords);
      } else {
        setDestText(prediction.mainText);
        setDestCoords(coords);
      }

      // If both are set, show route
      const pickup = activeInput === 'pickup' ? coords : pickupCoords;
      const dest = activeInput === 'dest' ? coords : destCoords;

      if (pickup && dest) {
        showRoute(pickup, dest);
      } else {
        mapRef.current?.animateToRegion({
          ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02,
        });
      }
    } catch {
      // Fallback
    }
  }

  async function showRoute(pickup: LatLng, dest: LatLng) {
    setViewMode('route');
    try {
      const result = await getDirections(pickup, dest);
      const decoded = decodePolyline(result.polyline);
      setRouteCoords(decoded);
      setRouteInfo({ distance: result.distanceText, duration: result.durationText });

      // Fit map to route
      mapRef.current?.fitToCoordinates(
        [pickup, dest, ...decoded],
        { edgePadding: { top: 200, right: 60, bottom: 300, left: 60 }, animated: true }
      );
    } catch {
      // Just show markers
      mapRef.current?.fitToCoordinates(
        [pickup, dest],
        { edgePadding: { top: 200, right: 60, bottom: 300, left: 60 }, animated: true }
      );
    }
  }

  function handleUseMyLocation() {
    if (location) {
      setPickupText(userAddress ?? 'My Location');
      setPickupCoords({ latitude: location.latitude, longitude: location.longitude });
    }
  }

  function handleStartSearch() {
    setViewMode('search');
    if (!pickupText && location) {
      setPickupText(userAddress ?? 'My Location');
      setPickupCoords({ latitude: location.latitude, longitude: location.longitude });
    }
  }

  function handleClearRoute() {
    setViewMode('idle');
    setDestText('');
    setDestCoords(null);
    setRouteCoords([]);
    setRouteInfo(null);
    setPredictions([]);
  }

  function handleFindVehicles() {
    Keyboard.dismiss();
    navigation.navigate('VehicleList');
  }

  function handleVehiclePress(vehicle: Vehicle) {
    (navigation as any).navigate('VehicleDetail', { vehicleId: vehicle.id });
  }

  function handleCenterMap() {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude, longitude: location.longitude,
        latitudeDelta: 0.02, longitudeDelta: 0.02,
      });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {/* Vehicle markers (idle mode) */}
        {viewMode === 'idle' && nearbyVehicles?.map((vehicle) => (
          <Marker
            key={vehicle.id}
            coordinate={{ latitude: vehicle.location.latitude, longitude: vehicle.location.longitude }}
            onPress={() => handleVehiclePress(vehicle)}
          >
            <View style={styles.vehicleMarker}>
              <Text style={styles.vehicleMarkerText}>🚗</Text>
            </View>
          </Marker>
        ))}

        {/* Pickup marker */}
        {pickupCoords && (
          <Marker coordinate={pickupCoords}>
            <View style={styles.pickupMarker}>
              <View style={styles.pickupDot} />
            </View>
          </Marker>
        )}

        {/* Destination marker */}
        {destCoords && (
          <Marker coordinate={destCoords}>
            <View style={styles.destMarker}>
              <View style={styles.destDot} />
            </View>
          </Marker>
        )}

        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={COLORS.primary}
            strokeWidth={4}
          />
        )}
      </MapView>

      {/* ── IDLE MODE: Uber-style search card ── */}
      {viewMode === 'idle' && (
        <>
          <SafeAreaView style={styles.headerOverlay} edges={['top']}>
            <View style={styles.greetingRow}>
              <View>
                <Text style={styles.greetingText}>
                  Hello, {user?.fullName?.split(' ')[0] ?? 'there'} 👋
                </Text>
                <Text style={styles.greetingSubtitle}>Where to today?</Text>
              </View>
              <TouchableOpacity style={styles.notifButton}>
                <Text style={styles.notifIcon}>🔔</Text>
              </TouchableOpacity>
            </View>

            {/* Destination search bar — tap to expand */}
            <TouchableOpacity style={styles.searchBar} onPress={handleStartSearch} activeOpacity={0.9}>
              <View style={styles.searchDot} />
              <Text style={styles.searchPlaceholder}>Where are you going?</Text>
            </TouchableOpacity>
          </SafeAreaView>

          {/* Center button */}
          <TouchableOpacity style={styles.myLocationButton} onPress={handleCenterMap}>
            <Text style={styles.myLocationIcon}>📍</Text>
          </TouchableOpacity>

          {/* Bottom sheet */}
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.quickActionsRow}>
              <TouchableOpacity style={styles.quickAction} onPress={handleStartSearch}>
                <Text style={styles.quickActionIcon}>🚗</Text>
                <Text style={styles.quickActionLabel}>Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={() => (navigation as any).navigate('ChauffeurSearch')}>
                <Text style={styles.quickActionIcon}>🎩</Text>
                <Text style={styles.quickActionLabel}>Chauffeur</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={() => (navigation as any).navigate('RentalSearch')}>
                <Text style={styles.quickActionIcon}>🔑</Text>
                <Text style={styles.quickActionLabel}>Rental</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={() => Alert.alert('Coming Soon', 'Luxury services coming soon!')}>
                <Text style={styles.quickActionIcon}>👑</Text>
                <Text style={styles.quickActionLabel}>Luxury</Text>
              </TouchableOpacity>
            </View>

            {/* Nearby */}
            <View style={styles.nearbyHeader}>
              <Text style={styles.nearbyTitle}>Nearby</Text>
              <TouchableOpacity onPress={() => navigation.navigate('VehicleList')}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>
            {loadingNearby ? (
              <LoadingSpinner size="small" message="Finding vehicles..." />
            ) : nearbyVehicles && nearbyVehicles.length > 0 ? (
              <FlatList
                data={nearbyVehicles.slice(0, 5)}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.nearbyList}
                renderItem={({ item }) => (
                  <VehicleCard vehicle={item} onPress={handleVehiclePress} style={styles.nearbyCard} />
                )}
              />
            ) : (
              <TouchableOpacity style={styles.emptyNearby} onPress={() => navigation.navigate('VehicleList')}>
                <Text style={styles.emptyNearbyText}>Browse all vehicles →</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* ── SEARCH / ROUTE MODE: Pickup + Destination inputs ── */}
      {(viewMode === 'search' || viewMode === 'route') && (
        <>
          <SafeAreaView style={styles.searchOverlay} edges={['top']}>
            {/* Back button */}
            <TouchableOpacity style={styles.searchBack} onPress={handleClearRoute}>
              <Text style={styles.searchBackText}>←</Text>
            </TouchableOpacity>

            <View style={styles.inputCard}>
              {/* Dots connector */}
              <View style={styles.dotsColumn}>
                <View style={styles.greenDot} />
                <View style={styles.dotsLine} />
                <View style={styles.redSquare} />
              </View>

              {/* Inputs */}
              <View style={styles.inputsColumn}>
                {/* Pickup */}
                <TouchableOpacity
                  style={[styles.inputRow, activeInput === 'pickup' && styles.inputRowActive]}
                  onPress={() => setActiveInput('pickup')}
                >
                  <TextInput
                    style={styles.inputField}
                    value={pickupText}
                    onChangeText={(t) => handleSearchText(t, 'pickup')}
                    placeholder="Pickup location"
                    placeholderTextColor={COLORS.gray}
                    onFocus={() => setActiveInput('pickup')}
                  />
                  {!pickupText && (
                    <TouchableOpacity onPress={handleUseMyLocation} style={styles.myLocBtn}>
                      <Text style={styles.myLocText}>📍</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                <View style={styles.inputDivider} />

                {/* Destination */}
                <TouchableOpacity
                  style={[styles.inputRow, activeInput === 'dest' && styles.inputRowActive]}
                  onPress={() => setActiveInput('dest')}
                >
                  <TextInput
                    style={styles.inputField}
                    value={destText}
                    onChangeText={(t) => handleSearchText(t, 'dest')}
                    placeholder="Where to?"
                    placeholderTextColor={COLORS.gray}
                    onFocus={() => setActiveInput('dest')}
                    autoFocus={viewMode === 'search'}
                  />
                  {destText.length > 0 && (
                    <TouchableOpacity onPress={() => { setDestText(''); setDestCoords(null); setRouteCoords([]); setRouteInfo(null); }}>
                      <Text style={styles.clearBtn}>✕</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Predictions dropdown */}
            {predictions.length > 0 && (
              <View style={styles.predictionsCard}>
                {predictions.map((p) => (
                  <TouchableOpacity key={p.placeId} style={styles.predictionRow} onPress={() => handleSelectPlace(p)}>
                    <Text style={styles.predictionPin}>📍</Text>
                    <View style={styles.predictionText}>
                      <Text style={styles.predictionMain} numberOfLines={1}>{p.mainText}</Text>
                      <Text style={styles.predictionSub} numberOfLines={1}>{p.secondaryText}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </SafeAreaView>

          {/* Route info + find vehicles button */}
          {viewMode === 'route' && destCoords && (
            <View style={styles.routeBottomCard}>
              {routeInfo && (
                <View style={styles.routeInfoRow}>
                  <Text style={styles.routeInfoText}>🕐 {routeInfo.duration}</Text>
                  <Text style={styles.routeInfoDot}>·</Text>
                  <Text style={styles.routeInfoText}>📍 {routeInfo.distance}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.findVehiclesButton} onPress={handleFindVehicles}>
                <Text style={styles.findVehiclesText}>Find Available Vehicles</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  // ── Idle mode ──
  headerOverlay: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  greetingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.sm,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  greetingText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  greetingSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  notifButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center' },
  notifIcon: { fontSize: 18 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 14, gap: SPACING.md,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  searchDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  searchPlaceholder: { fontSize: 16, color: COLORS.gray, flex: 1 },

  vehicleMarker: { backgroundColor: COLORS.white, borderRadius: 20, padding: 6, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  vehicleMarkerText: { fontSize: 20 },
  myLocationButton: {
    position: 'absolute', right: SPACING.md, top: SCREEN_HEIGHT * 0.28,
    backgroundColor: COLORS.white, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  myLocationIcon: { fontSize: 20 },

  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl, borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingTop: SPACING.sm, paddingBottom: SPACING.lg + 68,
    maxHeight: SCREEN_HEIGHT * 0.48,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 16,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  quickActionsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm },
  quickAction: {
    width: '47%', backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md, alignItems: 'center', gap: 4,
  },
  quickActionIcon: { fontSize: 28 },
  quickActionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },
  nearbyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  nearbyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  seeAllText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  nearbyList: { paddingHorizontal: SPACING.md },
  nearbyCard: { width: 200, marginRight: SPACING.sm, marginBottom: 0 },
  emptyNearby: { padding: SPACING.md, alignItems: 'center' },
  emptyNearbyText: { color: COLORS.accent, fontWeight: '600', fontSize: 14 },

  // ── Search / Route mode ──
  searchOverlay: { paddingHorizontal: SPACING.md },
  searchBack: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.white,
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  searchBackText: { fontSize: 22, color: COLORS.textPrimary },

  inputCard: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  dotsColumn: { width: 20, alignItems: 'center', paddingTop: 14, paddingBottom: 14 },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10b981' },
  dotsLine: { flex: 1, width: 2, backgroundColor: COLORS.border, marginVertical: 4 },
  redSquare: { width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS.primary },

  inputsColumn: { flex: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm, height: 44,
  },
  inputRowActive: { backgroundColor: COLORS.grayLight },
  inputField: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  inputDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 2, marginLeft: SPACING.sm },
  myLocBtn: { padding: 4 },
  myLocText: { fontSize: 18 },
  clearBtn: { fontSize: 14, color: COLORS.gray, padding: 4 },

  predictionsCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, marginTop: SPACING.xs,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
    maxHeight: 250, overflow: 'hidden',
  },
  predictionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.grayLight, gap: SPACING.sm,
  },
  predictionPin: { fontSize: 16 },
  predictionText: { flex: 1 },
  predictionMain: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  predictionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  // Markers
  pickupMarker: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(16,185,129,0.2)', justifyContent: 'center', alignItems: 'center' },
  pickupDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#10b981', borderWidth: 2, borderColor: COLORS.white },
  destMarker: { width: 24, height: 24, borderRadius: 4, backgroundColor: 'rgba(26,26,46,0.2)', justifyContent: 'center', alignItems: 'center' },
  destDot: { width: 12, height: 12, borderRadius: 2, backgroundColor: COLORS.primary, borderWidth: 2, borderColor: COLORS.white },

  // Route bottom
  routeBottomCard: {
    position: 'absolute', bottom: 68 + SPACING.md, left: SPACING.md, right: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  routeInfoRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  routeInfoText: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  routeInfoDot: { fontSize: 15, color: COLORS.gray },
  findVehiclesButton: {
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  findVehiclesText: { color: COLORS.accent, fontWeight: '700', fontSize: 16 },
});
