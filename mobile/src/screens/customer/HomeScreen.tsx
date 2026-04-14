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
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useLayout } from '../../themes/useLayout';
import { useLocation } from '../../hooks/useLocation';
import { useNearbyVehicles } from '../../hooks/useVehicles';
import { searchPlaces, getPlaceDetails, getDirections, decodePolyline, reverseGeocode, PlacePrediction, LatLng } from '../../api/maps';
import { VehicleCard } from '../../components/VehicleCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS, DEFAULT_REGION, SOCKET_URL, API_BASE_URL } from '../../utils/constants';
import DateTimePicker from '@react-native-community/datetimepicker';
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS } from '../../utils/constants';
import { useAuthStore } from '../../store/authStore';
import { Vehicle } from '../../api/vehicles';
import { CustomerTabParamList } from '../../navigation/CustomerNavigator';
import { getMapStyle } from '../../themes/mapStyles';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type HomeScreenProps = {
  navigation: BottomTabNavigationProp<CustomerTabParamList, 'Home'>;
};

type ViewMode = 'idle' | 'search' | 'route' | 'preferences' | 'searching';

export function HomeScreen({ navigation }: HomeScreenProps) {
  const styles = getStyles();
  const layout = useLayout();
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
  const [searchingSeconds, setSearchingSeconds] = useState(0);
  const [dropPinFor, setDropPinFor] = useState<'pickup' | 'dest' | null>(null);
  const [rideType, setRideType] = useState<'sedan' | 'suv' | 'van'>('sedan');
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [scheduled, setScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [tempDate, setTempDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [prefTemp, setPrefTemp] = useState(22);
  const [prefMusic, setPrefMusic] = useState<'on' | 'off'>('on');
  const [prefNotes, setPrefNotes] = useState('');

  // Socket & matched driver state
  const socketRef = useRef<Socket | null>(null);
  const [matchedDriver, setMatchedDriver] = useState<{ driverName: string; vehicleMake: string; vehicleModel: string; vehiclePlate: string; driverLat: number; driverLng: number } | null>(null);
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null);
  const [tripStatus, setTripStatus] = useState<'searching' | 'matched' | 'arriving' | 'in_progress' | 'completed'>('searching');

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
    setDropPinFor(null);

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

    setDropPinFor(null);
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

  function handleDropPin(field: 'pickup' | 'dest') {
    Keyboard.dismiss();
    setPredictions([]);
    setDropPinFor(field);
  }

  async function handleConfirmDropPin() {
    if (!mapCenter || !dropPinFor) return;
    try {
      const geo = await reverseGeocode(mapCenter.latitude, mapCenter.longitude);
      if (dropPinFor === 'pickup') {
        setPickupCoords(mapCenter);
        setPickupText(geo.formattedAddress || `${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`);
      } else {
        setDestCoords(mapCenter);
        setDestText(geo.formattedAddress || `${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`);
      }
    } catch {
      if (dropPinFor === 'pickup') {
        setPickupCoords(mapCenter);
        setPickupText(`${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`);
      } else {
        setDestCoords(mapCenter);
        setDestText(`${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`);
      }
    }
    const newPickup = dropPinFor === 'pickup' ? mapCenter : pickupCoords;
    const newDest = dropPinFor === 'dest' ? mapCenter : destCoords;
    setDropPinFor(null);

    // Redraw route with new coordinates
    if (newPickup && newDest) {
      setRouteCoords([]);
      setRouteInfo(null);
      showRoute(newPickup, newDest);
    }
  }

  function handleRequestRide() {
    Keyboard.dismiss();
    setViewMode('preferences');
  }

  async function handleConfirmRide() {
    setViewMode('searching');
    setSearchingSeconds(0);
    setMatchedDriver(null);
    setTripStatus('searching');
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    // Connect Socket.io — get fresh token
    let token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    if (!token) {
      Alert.alert('Error', 'Please log out and log back in.');
      setViewMode('route');
      return;
    }

    // Try to refresh token first to ensure it's valid
    try {
      const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
      if (refreshToken) {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (response.ok) {
          const data = await response.json();
          const newToken = data?.data?.access_token ?? data?.access_token;
          if (newToken) {
            token = newToken;
            await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, newToken);
          }
        }
      }
    } catch {}

    const socket = io(SOCKET_URL, { auth: { token }, transports: ['polling', 'websocket'] });
    socketRef.current = socket;

    socket.on('connect_error', (err) => {
      console.log('[Socket] Customer connection error:', err.message);
    });

    socket.on('connect', () => {
      console.log('[Socket] Customer connected');
      // Send ride request
      socket.emit('customer:request_ride', {
        pickupLat: pickupCoords?.latitude,
        pickupLng: pickupCoords?.longitude,
        destLat: destCoords?.latitude,
        destLng: destCoords?.longitude,
        pickupText,
        destText,
        vehicleCategory: rideType,
      });
    });

    socket.on('ride:matched', (data: any) => {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      const d = data.driver ?? data;
      const vi = d.vehicleInfo ?? {};
      setMatchedDriver({
        driverName: d.name ?? d.driverName ?? 'Driver',
        vehicleMake: vi.make ?? d.vehicleMake ?? '',
        vehicleModel: vi.model ?? d.vehicleModel ?? '',
        vehiclePlate: vi.plate ?? vi.licensePlate ?? d.vehiclePlate ?? '',
        driverLat: d.location?.lat ?? d.driverLat ?? 0,
        driverLng: d.location?.lng ?? d.driverLng ?? 0,
      });
      setDriverLocation({
        latitude: d.location?.lat ?? d.driverLat ?? 0,
        longitude: d.location?.lng ?? d.driverLng ?? 0,
      });
      setTripStatus('matched');

      // Track driver location
      socket.emit('customer:track_driver', { driverId: d.userId ?? data.driverId });
    });

    socket.on('driver:location_update', (data: any) => {
      const newLoc = { latitude: data.lat, longitude: data.lng };
      setDriverLocation(newLoc);
      // Follow driver on map
      mapRef.current?.animateToRegion({ ...newLoc, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
    });

    socket.on('ride:trip_started', () => {
      setTripStatus('in_progress');
    });

    socket.on('ride:trip_completed', () => {
      setTripStatus('completed');
      setTimeout(() => {
        socket.disconnect();
        socketRef.current = null;
        setViewMode('idle');
        setMatchedDriver(null);
        setDriverLocation(null);
        setPickupText('');
        setDestText('');
        setPickupCoords(null);
        setDestCoords(null);
        setRouteCoords([]);
        setRouteInfo(null);
        Alert.alert('Trip Completed', 'Thank you for riding with us!');
      }, 2000);
    });

    socket.on('ride:no_drivers', () => {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      socket.disconnect();
      socketRef.current = null;
      Alert.alert('No Drivers Available', 'No drivers found nearby. Please try again later.');
      setViewMode('route');
    });
  }

  function handleCancelSearch() {
    Alert.alert('Cancel Ride', 'Stop searching for a driver?', [
      { text: 'Keep Searching', style: 'cancel' },
      {
        text: 'Cancel',
        style: 'destructive',
        onPress: () => {
          pulseAnim.stopAnimation();
          pulseAnim.setValue(1);
          setViewMode('route');
        },
      },
    ]);
  }

  // Searching timer
  React.useEffect(() => {
    if (viewMode !== 'searching') return;
    const timer = setInterval(() => setSearchingSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [viewMode]);

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
      <MapView customMapStyle={getMapStyle()}
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        onRegionChangeComplete={(r) => setMapCenter({ latitude: r.latitude, longitude: r.longitude })}
      >
        {/* Vehicle markers (idle mode) */}
        {viewMode === 'idle' && layout.showVehicleMarkers && nearbyVehicles?.map((vehicle) => (
          <Marker
            key={vehicle.id}
            coordinate={{ latitude: vehicle.location.latitude, longitude: vehicle.location.longitude }}
            onPress={() => handleVehiclePress(vehicle)}
          >
            <View style={styles.vehicleMarker}>
              <Text style={styles.vehicleMarkerText}>◆</Text>
            </View>
          </Marker>
        ))}

        {/* Pickup marker */}
        {pickupCoords && (
          <Marker coordinate={pickupCoords}>
            <View style={styles.pickupPin}>
              <View style={styles.pickupPinHead}>
                <Text style={styles.pickupPinIcon}>◆</Text>
              </View>
              <View style={styles.pickupPinNeedle} />
            </View>
          </Marker>
        )}

        {/* Destination marker */}
        {destCoords && (
          <Marker coordinate={destCoords}>
            <View style={styles.destPin}>
              <View style={styles.destPinHead}>
                <Text style={styles.destPinIcon}>◆</Text>
              </View>
              <View style={styles.destPinNeedle} />
            </View>
          </Marker>
        )}

        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={'#d9c0a4'}
            strokeWidth={4}
          />
        )}
        {/* Live driver marker */}
        {driverLocation && viewMode === 'searching' && matchedDriver && (
          <Marker coordinate={driverLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.driverMarker}><Text style={styles.driverMarkerText}>◆</Text></View>
          </Marker>
        )}
        {/* Pickup marker during matched */}
        {viewMode === 'searching' && matchedDriver && pickupCoords && (
          <Marker coordinate={pickupCoords}>
            <View style={styles.matchedPickupPin}><Text style={styles.matchedPinText}>P</Text></View>
          </Marker>
        )}
        {/* Destination marker during trip */}
        {viewMode === 'searching' && matchedDriver && destCoords && tripStatus === 'in_progress' && (
          <Marker coordinate={destCoords}>
            <View style={styles.matchedDestPin}><Text style={styles.matchedPinText}>D</Text></View>
          </Marker>
        )}
      </MapView>

      {/* Drop pin mode — fixed center pin */}
      {dropPinFor && (
        <>
          <View style={styles.dropPinOverlay} pointerEvents="none">
            <View style={styles.dropPinCenter}>
              <View style={[styles.dropPinCenterHead, dropPinFor === 'pickup' ? { backgroundColor: '#FFFFFF' } : { backgroundColor: '#d9c0a4' }]}>
                <Text style={styles.dropPinCenterIcon}>◆</Text>
              </View>
              <View style={[styles.dropPinCenterNeedle, dropPinFor === 'pickup' ? { backgroundColor: '#FFFFFF' } : { backgroundColor: '#d9c0a4' }]} />
              <View style={styles.dropPinShadow} />
            </View>
          </View>
          <SafeAreaView style={styles.dropPinUI} edges={['top', 'bottom']} pointerEvents="box-none">
            <View style={styles.dropPinHeader}>
              <TouchableOpacity onPress={() => setDropPinFor(null)} style={styles.dropPinCancel}>
                <Text style={styles.dropPinCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dropPinFooter}>
              <TouchableOpacity style={styles.dropPinConfirm} onPress={handleConfirmDropPin}>
                <Text style={styles.dropPinConfirmText}>CONFIRM LOCATION</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </>
      )}

      {/* ── IDLE MODE: Uber-style search card ── */}
      {viewMode === 'idle' && (
        <>
          <SafeAreaView style={styles.headerOverlay} edges={['top']}>
            {layout.showGreetingBar && (
              <View style={styles.greetingRow}>
                <View>
                  <Text style={styles.greetingText}>
                    Hello, {user?.fullName?.split(' ')[0] ?? 'there'}
                  </Text>
                  <Text style={styles.greetingSubtitle}>Where to today?</Text>
                </View>
                <TouchableOpacity style={styles.notifButton}>
                  <Text style={styles.notifIcon}>●</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Destination search bar — tap to expand */}
            {layout.showSearchBar && (
              <TouchableOpacity style={styles.searchBar} onPress={handleStartSearch} activeOpacity={0.9}>
                <View style={styles.searchDot} />
                <Text style={styles.searchPlaceholder}>Where are you going?</Text>
              </TouchableOpacity>
            )}
          </SafeAreaView>

          {/* Center button */}
          <TouchableOpacity style={styles.myLocationButton} onPress={handleCenterMap}>
            <Text style={styles.myLocationIcon}>▼</Text>
          </TouchableOpacity>

          {/* Bottom sheet */}
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            {layout.showQuickActions && (<View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={{
                  width: '48%',
                  backgroundColor: COLORS.grayLight,
                  borderRadius: BORDER_RADIUS.md,
                  paddingVertical: SPACING.sm + 4,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 6,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                activeOpacity={0.85}
                onPress={handleStartSearch}
              >
                <Image
                  source={require('../../../assets/ride-car.png')}
                  style={{ width: 80, height: 44, resizeMode: 'contain' }}
                />
                <Text style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: COLORS.textPrimary,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                }}>Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  width: '48%',
                  backgroundColor: COLORS.grayLight,
                  borderRadius: BORDER_RADIUS.md,
                  paddingVertical: SPACING.sm + 4,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 6,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                activeOpacity={0.85}
                onPress={() => (navigation as any).navigate('ChauffeurSearch')}
              >
                <Image
                  source={require('../../../assets/chauffeur-hat.png')}
                  style={{ width: 60, height: 36, resizeMode: 'contain' }}
                />
                <Text style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: COLORS.textPrimary,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                }}>Chauffeur</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  width: '48%',
                  backgroundColor: COLORS.grayLight,
                  borderRadius: BORDER_RADIUS.md,
                  paddingVertical: SPACING.sm + 4,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 6,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                activeOpacity={0.85}
                onPress={() => (navigation as any).navigate('RentalSearch')}
              >
                <Image
                  source={require('../../../assets/rental-key.png')}
                  style={{ width: 60, height: 36, resizeMode: 'contain' }}
                />
                <Text style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: COLORS.textPrimary,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                }}>Rental</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  width: '48%',
                  backgroundColor: COLORS.grayLight,
                  borderRadius: BORDER_RADIUS.md,
                  paddingVertical: SPACING.sm + 4,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 6,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
                activeOpacity={0.85}
                onPress={() => Alert.alert('Coming Soon', 'Luxury services coming soon!')}
              >
                <Image
                  source={require('../../../assets/luxury-crown.png')}
                  style={{ width: 60, height: 36, resizeMode: 'contain' }}
                />
                <Text style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: COLORS.textPrimary,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                }}>Luxury</Text>
              </TouchableOpacity>
            </View>)}

            {/* Nearby */}
            {layout.showNearbySection && (<>
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
            </>)}

            {/* Sphere button — replaces nearby in sandbox */}
            {!layout.showNearbySection && (
              <TouchableOpacity
                style={styles.sphereButton}
                onPress={() => navigation.navigate('VehicleList')}
                activeOpacity={0.9}
              >
                <Image
                  source={require('../../../assets/sphere.gif')}
                  style={styles.sphereImage}
                />
                <Text style={styles.sphereText}>CONCIERGE</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* ── SEARCH / ROUTE MODE: Pickup + Destination inputs ── */}
      {(viewMode === 'search' || viewMode === 'route') && !dropPinFor && (
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
                    selectTextOnFocus
                  />
                  <TouchableOpacity onPress={() => handleDropPin('pickup')} style={styles.dropPinBtn}>
                    <Text style={styles.dropPinText}>PIN</Text>
                  </TouchableOpacity>
                  {!pickupText && (
                    <TouchableOpacity onPress={handleUseMyLocation} style={styles.myLocBtn}>
                      <Text style={styles.myLocText}>▼</Text>
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
                    selectTextOnFocus
                  />
                  <TouchableOpacity onPress={() => handleDropPin('dest')} style={styles.dropPinBtn}>
                    <Text style={styles.dropPinText}>PIN</Text>
                  </TouchableOpacity>
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
                    <Text style={styles.predictionPin}>▼</Text>
                    <View style={styles.predictionText}>
                      <Text style={styles.predictionMain} numberOfLines={1}>{p.mainText}</Text>
                      <Text style={styles.predictionSub} numberOfLines={1}>{p.secondaryText}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </SafeAreaView>

          {/* Route info + car type + request ride button */}
          {viewMode === 'route' && destCoords && (
            <View style={styles.routeBottomCard}>
              {routeInfo && (
                <View style={styles.routeInfoRow}>
                  <Text style={styles.routeInfoText}>◔ {routeInfo.duration}</Text>
                  <Text style={styles.routeInfoDot}>·</Text>
                  <Text style={styles.routeInfoText}>▼ {routeInfo.distance}</Text>
                </View>
              )}

              {/* Price estimate */}
              {routeInfo && (
                <View style={styles.priceEstimate}>
                  <Text style={styles.priceEstimateLabel}>starting from</Text>
                  <Text style={styles.priceEstimateValue}>
                    ${(parseFloat(routeInfo.distance.replace(/[^0-9.]/g, '')) * 2.5 * (rideType === 'van' ? 1.6 : rideType === 'suv' ? 1.3 : 1)).toFixed(0)}
                  </Text>
                </View>
              )}

              {/* Car type selector with prices */}
              <View style={styles.carTypeRow}>
                {([
                  { key: 'sedan', label: 'Sedan', sub: '1-3', mult: 1 },
                  { key: 'suv', label: 'SUV', sub: '1-5', mult: 1.3 },
                  { key: 'van', label: 'Van', sub: '1-7', mult: 1.6 },
                ] as const).map((type) => {
                  const price = routeInfo ? Math.round(parseFloat(routeInfo.distance.replace(/[^0-9.]/g, '')) * 2.5 * type.mult) : 0;
                  return (
                    <TouchableOpacity key={type.key} style={[styles.carTypeItem, rideType === type.key && styles.carTypeItemActive]} onPress={() => setRideType(type.key)}>
                      <Text style={[styles.carTypeIcon, rideType === type.key && styles.carTypeIconActive]}>
                        {type.key === 'sedan' ? '◆' : type.key === 'suv' ? '◆◆' : '◆◆◆'}
                      </Text>
                      <Text style={[styles.carTypeName, rideType === type.key && styles.carTypeNameActive]}>{type.label}</Text>
                      <Text style={[styles.carTypePrice, rideType === type.key && styles.carTypePriceActive]}>${price}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Schedule section */}
              {scheduled && (
                <View style={styles.scheduleRow}>
                  <TouchableOpacity style={styles.scheduleDateBox} onPress={() => { setTempDate(scheduleDate); setPickerMode('date'); setShowPicker(true); }}>
                    <Text style={styles.scheduleDateText}>{scheduleDate.toLocaleDateString()}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.scheduleDateBox} onPress={() => { setTempDate(scheduleDate); setPickerMode('time'); setShowPicker(true); }}>
                    <Text style={styles.scheduleDateText}>{scheduleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setScheduled(false)}>
                    <Text style={{ fontSize: 16, color: COLORS.textSecondary, padding: 4 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {showPicker && (
                <View style={styles.pickerWrap}>
                  <DateTimePicker value={tempDate} mode={pickerMode} minimumDate={new Date()} display="spinner" textColor={COLORS.textPrimary} themeVariant="dark"
                    onChange={(_, date) => { if (date) setTempDate(date); }} />
                  <TouchableOpacity style={styles.pickerConfirmBtn} onPress={() => { setScheduleDate(tempDate); setShowPicker(false); }}>
                    <Text style={styles.pickerConfirmText}>CONFIRM</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Request button + schedule clock */}
              <View style={styles.requestRow}>
                <TouchableOpacity style={[styles.findVehiclesButton, { flex: 1 }]} onPress={handleRequestRide}>
                  <Text style={styles.findVehiclesText}>{scheduled ? 'Schedule' : 'Request'} {rideType === 'sedan' ? 'Sedan' : rideType === 'suv' ? 'SUV' : 'Van'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clockBtn, scheduled && styles.clockBtnActive]} onPress={() => setScheduled(!scheduled)}>
                  <Text style={[styles.clockIcon, scheduled && { color: '#FFF' }]}>◷</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* ── PREFERENCES MODE ── */}
      {viewMode === 'preferences' && (
        <>
          <SafeAreaView style={styles.searchOverlay} edges={['top']}>
            <TouchableOpacity style={styles.searchBack} onPress={() => setViewMode('route')}>
              <Text style={styles.searchBackText}>←</Text>
            </TouchableOpacity>
          </SafeAreaView>
          <View style={styles.routeBottomCard}>
            <Text style={styles.prefTitle}>Ride Preferences</Text>

            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>Temperature</Text>
              <View style={styles.prefTempRow}>
                <TouchableOpacity style={styles.prefTempBtn} onPress={() => setPrefTemp(t => Math.max(16, t - 1))}><Text style={styles.prefTempBtnText}>-</Text></TouchableOpacity>
                <Text style={styles.prefTempValue}>{prefTemp}°C</Text>
                <TouchableOpacity style={styles.prefTempBtn} onPress={() => setPrefTemp(t => Math.min(28, t + 1))}><Text style={styles.prefTempBtnText}>+</Text></TouchableOpacity>
              </View>
            </View>

            <View style={styles.prefDivider} />

            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>Music</Text>
              <View style={styles.prefToggleRow}>
                <TouchableOpacity style={[styles.prefToggle, prefMusic === 'on' && styles.prefToggleActive]} onPress={() => setPrefMusic('on')}>
                  <Text style={[styles.prefToggleText, prefMusic === 'on' && styles.prefToggleTextActive]}>On</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.prefToggle, prefMusic === 'off' && styles.prefToggleActive]} onPress={() => setPrefMusic('off')}>
                  <Text style={[styles.prefToggleText, prefMusic === 'off' && styles.prefToggleTextActive]}>Off</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.prefDivider} />

            <Text style={styles.prefLabel}>Notes for driver</Text>
            <TextInput
              style={styles.prefInput}
              value={prefNotes}
              onChangeText={setPrefNotes}
              placeholder="E.g. child seat, quiet ride, luggage..."
              placeholderTextColor={COLORS.gray}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity style={styles.findVehiclesButton} onPress={handleConfirmRide}>
              <Text style={styles.findVehiclesText}>Confirm & Search</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── SEARCHING MODE: Looking for driver ── */}
      {viewMode === 'searching' && !matchedDriver && (
        <>
          <SafeAreaView style={styles.searchingHeader} edges={['top']}>
            <View style={styles.searchingHeaderCard}>
              <Text style={styles.searchingHeaderTitle}>Looking for your driver...</Text>
              <Text style={styles.searchingHeaderSub}>{pickupText} → {destText}</Text>
            </View>
          </SafeAreaView>
          <View style={styles.searchingOverlay}>
            <Animated.View style={[styles.pulseCircleOuter, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.pulseCircleInner}><Text style={styles.pulseIcon}>◆</Text></View>
            </Animated.View>
            <Text style={styles.searchingTitle}>Searching for drivers nearby</Text>
            <Text style={styles.searchingTimer}>{Math.floor(searchingSeconds / 60)}:{(searchingSeconds % 60).toString().padStart(2, '0')}</Text>
            {routeInfo && (
              <View style={styles.searchingRouteInfo}>
                <Text style={styles.searchingRouteText}>◔ {routeInfo.duration}  ·  ▼ {routeInfo.distance}</Text>
              </View>
            )}
            <Text style={styles.searchingHint}>This usually takes less than a minute</Text>
            <TouchableOpacity style={styles.cancelSearchButton} onPress={handleCancelSearch}>
              <Text style={styles.cancelSearchText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── DRIVER MATCHED ── */}
      {viewMode === 'searching' && matchedDriver && (
        <>
          <View style={styles.matchedPanel}>
            {/* Status */}
            <View style={styles.matchedHeader}>
              <View style={[styles.matchedStatusDot, {
                backgroundColor: tripStatus === 'in_progress' ? '#3B82F6' : tripStatus === 'completed' ? '#10B981' : '#F59E0B'
              }]} />
              <Text style={styles.matchedStatus}>
                {tripStatus === 'matched' ? 'Driver is on the way' :
                 tripStatus === 'in_progress' ? 'Trip in progress' :
                 tripStatus === 'completed' ? 'Trip completed!' : 'Arriving...'}
              </Text>
            </View>

            {/* Driver info */}
            <View style={styles.matchedDriverCard}>
              <View style={styles.matchedAvatar}><Text style={styles.matchedAvatarText}>{matchedDriver.driverName?.charAt(0) ?? 'D'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.matchedDriverName}>{matchedDriver.driverName}</Text>
                <Text style={styles.matchedVehicle}>{matchedDriver.vehicleMake} {matchedDriver.vehicleModel}</Text>
                <Text style={styles.matchedPlate}>{matchedDriver.vehiclePlate}</Text>
              </View>
            </View>

            {/* Contact buttons */}
            <View style={styles.contactRow}>
              <TouchableOpacity style={styles.contactBtn} onPress={() => Alert.alert('Call Driver', `Calling ${matchedDriver.driverName}...`)}>
                <Text style={styles.contactBtnIcon}>☎</Text>
                <Text style={styles.contactBtnText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactBtn} onPress={() => Alert.alert('Message Driver', `Opening chat with ${matchedDriver.driverName}...`)}>
                <Text style={styles.contactBtnIcon}>✉</Text>
                <Text style={styles.contactBtnText}>Message</Text>
              </TouchableOpacity>
            </View>

            {/* Route */}
            <View style={styles.matchedRoute}>
              <View style={styles.matchedRouteRow}>
                <View style={[styles.matchedDot, { backgroundColor: tripStatus === 'in_progress' ? '#64748B' : '#10B981' }]} />
                <Text style={styles.matchedRouteText} numberOfLines={1}>{pickupText}</Text>
                {tripStatus === 'in_progress' && <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>✓</Text>}
              </View>
              <View style={{ width: 1, height: 12, backgroundColor: COLORS.border, marginLeft: 4.5 }} />
              <View style={styles.matchedRouteRow}>
                <View style={[styles.matchedDot, { backgroundColor: tripStatus === 'in_progress' ? '#EF4444' : '#64748B' }]} />
                <Text style={styles.matchedRouteText} numberOfLines={1}>{destText}</Text>
              </View>
            </View>

            {tripStatus === 'completed' && (
              <TouchableOpacity style={styles.rateBtn} onPress={() => {
                setViewMode('idle');
                setMatchedDriver(null);
                setDriverLocation(null);
                setPickupText(''); setDestText('');
                setPickupCoords(null); setDestCoords(null);
                setRouteCoords([]); setRouteInfo(null);
              }}>
                <Text style={styles.rateBtnText}>DONE</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function getStyles() { return StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  // ── Idle mode ──
  headerOverlay: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  greetingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.grayLight, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.sm,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  greetingText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  greetingSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  notifButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center' },
  notifIcon: { fontSize: 18, color: COLORS.textPrimary },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 14, gap: SPACING.md,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  searchDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  searchPlaceholder: { fontSize: 16, color: COLORS.gray, flex: 1 },

  vehicleMarker: { backgroundColor: COLORS.white, borderRadius: 20, padding: 6, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  vehicleMarkerText: { fontSize: 20, color: COLORS.textPrimary },
  myLocationButton: {
    position: 'absolute', right: SPACING.md, top: SCREEN_HEIGHT * 0.28,
    backgroundColor: COLORS.white, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  myLocationIcon: { fontSize: 20, color: COLORS.textPrimary },

  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl, borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingTop: SPACING.sm, paddingBottom: SPACING.lg + 68,
    maxHeight: SCREEN_HEIGHT * 0.48,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 16,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  quickActionsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm, justifyContent: 'space-between' },
  quickAction: {
    width: '47%', backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md, alignItems: 'center', gap: 4,
  },
  quickActionIcon: { fontSize: 28, color: COLORS.textPrimary },
  quickActionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },
  nearbyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  nearbyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  seeAllText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  nearbyList: { paddingHorizontal: SPACING.md },
  nearbyCard: { width: 200, marginRight: SPACING.sm, marginBottom: 0 },
  emptyNearby: { padding: SPACING.md, alignItems: 'center' },
  emptyNearbyText: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 14 },
  dropPinBtn: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  dropPinText: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1 },
  dropPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  dropPinCenter: { alignItems: 'center', marginBottom: 46 },
  dropPinCenterHead: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  dropPinCenterIcon: { fontSize: 16, color: '#000000' },
  dropPinCenterNeedle: { width: 2, height: 18 },
  dropPinShadow: { width: 12, height: 4, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 2 },
  dropPinUI: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', zIndex: 101, pointerEvents: 'box-none' },
  dropPinHeader: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  dropPinCancel: { padding: SPACING.xs },
  dropPinCancelText: { fontSize: 15, color: COLORS.textSecondary },
  dropPinFooter: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg },
  dropPinConfirm: {
    backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  dropPinConfirmText: { fontSize: 14, fontWeight: '700', color: '#000000', letterSpacing: 2 },
  sphereButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  sphereImage: {
    width: 120,
    height: 120,
    resizeMode: 'cover',
    borderRadius: 60,
  },
  sphereText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: SPACING.xs,
  },

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
  redSquare: { width: 10, height: 10, borderRadius: 2, backgroundColor: '#d9c0a4' },

  inputsColumn: { flex: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm, height: 44,
  },
  inputRowActive: { backgroundColor: COLORS.grayLight },
  inputField: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  inputDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 2, marginLeft: SPACING.sm },
  myLocBtn: { padding: 4 },
  myLocText: { fontSize: 18 , color: COLORS.textPrimary },
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
  predictionPin: { fontSize: 16, color: COLORS.textPrimary },
  predictionText: { flex: 1 },
  predictionMain: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  predictionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  // Markers
  pickupPin: { alignItems: 'center' },
  pickupPinHead: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  pickupPinIcon: { fontSize: 14, color: '#000000' },
  pickupPinNeedle: { width: 2, height: 14, backgroundColor: '#FFFFFF' },
  destPin: { alignItems: 'center' },
  destPinHead: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#d9c0a4', justifyContent: 'center', alignItems: 'center' },
  destPinIcon: { fontSize: 14, color: '#000000' },
  destPinNeedle: { width: 2, height: 14, backgroundColor: '#d9c0a4' },

  // Route bottom
  routeBottomCard: {
    position: 'absolute', bottom: 12, left: SPACING.md, right: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  routeInfoRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  routeInfoText: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  routeInfoDot: { fontSize: 15, color: COLORS.gray },
  priceEstimate: {
    alignItems: 'center', marginBottom: SPACING.md,
  },
  priceEstimateLabel: {
    fontSize: 11, color: COLORS.textSecondary, letterSpacing: 1, textTransform: 'uppercase',
  },
  priceEstimateValue: {
    fontSize: 28, fontWeight: '700', color: '#d9c0a4', marginTop: 2,
  },
  carTypeRow: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md,
  },
  carTypeItem: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.sm,
    alignItems: 'center', gap: 2,
  },
  carTypeItemActive: {
    borderColor: '#d9c0a4', backgroundColor: COLORS.grayLight,
  },
  carTypeIcon: { fontSize: 10, color: COLORS.textSecondary, letterSpacing: -2 },
  carTypeIconActive: { color: '#d9c0a4' },
  carTypeName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  carTypeNameActive: { color: '#d9c0a4' },
  carTypeSub: { fontSize: 11, color: COLORS.textSecondary },
  carTypeSubActive: { color: COLORS.textPrimary },
  carTypePrice: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  carTypePriceActive: { color: '#d9c0a4' },
  findVehiclesButton: {
    backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  findVehiclesText: { color: '#000000', fontWeight: '700', fontSize: 15, letterSpacing: 1 },

  // Schedule
  requestRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  clockBtn: { width: 52, height: 52, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  clockBtnActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  clockIcon: { fontSize: 22, color: COLORS.textSecondary },
  scheduleRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm, alignItems: 'center' },
  scheduleDateBox: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingVertical: 10, alignItems: 'center' },
  scheduleDateText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  pickerWrap: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, overflow: 'hidden', marginBottom: SPACING.sm },
  pickerConfirmBtn: { backgroundColor: '#d9c0a4', paddingVertical: SPACING.sm, alignItems: 'center' },
  pickerConfirmText: { fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 2 },

  // Preferences
  prefTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.md, textAlign: 'center' },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm },
  prefLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 4 },
  prefDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  prefTempRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prefTempBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  prefTempBtnText: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  prefTempValue: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, minWidth: 50, textAlign: 'center' },
  prefToggleRow: { flexDirection: 'row', gap: SPACING.sm },
  prefToggle: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md },
  prefToggleActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  prefToggleText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  prefToggleTextActive: { color: COLORS.background },
  prefInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary, marginTop: 4, marginBottom: SPACING.md, minHeight: 70, textAlignVertical: 'top' },

  // ── Searching mode ──
  searchingHeader: { paddingHorizontal: SPACING.md },
  searchingHeaderCard: {
    backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  searchingHeaderTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  searchingHeaderSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  searchingOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl, borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingTop: SPACING.lg, paddingBottom: SPACING.xl + 68, paddingHorizontal: SPACING.md,
    alignItems: 'center',
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 16,
  },
  pulseCircleOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(201,168,76,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.md,
  },
  pulseCircleInner: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  pulseIcon: { fontSize: 30, color: COLORS.textPrimary },
  searchingTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  searchingTimer: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, marginBottom: SPACING.md },
  searchingRouteInfo: {
    backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginBottom: SPACING.sm,
  },
  searchingRouteText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  searchingHint: { fontSize: 13, color: COLORS.gray, marginBottom: SPACING.lg },
  cancelSearchButton: {
    borderWidth: 1, borderColor: COLORS.grayLight, backgroundColor: COLORS.grayLight,
    borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xxl,
  },
  cancelSearchText: { fontSize: 15, fontWeight: '600', color: COLORS.error },
  // Matched driver
  driverMarker: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#3B82F6', borderWidth: 3, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  driverMarkerText: { fontSize: 14, color: '#FFFFFF' },
  matchedPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.md, paddingBottom: 40 },
  matchedHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  matchedStatus: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  matchedDriverCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md, backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.md },
  matchedAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.textPrimary, justifyContent: 'center', alignItems: 'center' },
  matchedAvatarText: { fontSize: 20, fontWeight: '700', color: COLORS.background },
  matchedDriverName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  matchedVehicle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  matchedPlate: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary, marginTop: 2, letterSpacing: 1 },
  matchedRoute: { marginBottom: SPACING.sm },
  matchedRouteRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  matchedDot: { width: 10, height: 10, borderRadius: 5 },
  matchedRouteText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  matchedStatusDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.sm },
  contactRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  contactBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.md, paddingVertical: 10 },
  contactBtnIcon: { fontSize: 16, color: COLORS.textPrimary },
  contactBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  rateBtn: { backgroundColor: COLORS.textPrimary, borderRadius: BORDER_RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.md },
  rateBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.background, letterSpacing: 2 },
  matchedPickupPin: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  matchedDestPin: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  matchedPinText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
}); }
