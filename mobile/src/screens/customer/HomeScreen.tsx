import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useLocation } from '../../hooks/useLocation';
import { useNearbyVehicles } from '../../hooks/useVehicles';
import { VehicleCard } from '../../components/VehicleCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS, DEFAULT_REGION } from '../../utils/constants';
import { useAuthStore } from '../../store/authStore';
import { Vehicle } from '../../api/vehicles';
import { CustomerTabParamList } from '../../navigation/CustomerNavigator';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const QUICK_ACTIONS = [
  { id: 'ride', icon: '🚗', label: 'Book a Ride', color: '#eff6ff', iconBg: '#2563eb' },
  { id: 'rent', icon: '🔑', label: 'Rent a Car', color: '#f0fdf4', iconBg: '#16a34a' },
  { id: 'chauffeur', icon: '🎩', label: 'Chauffeur', color: '#fefce8', iconBg: '#ca8a04' },
  { id: 'luxury', icon: '👑', label: 'Luxury', color: '#fdf4ff', iconBg: '#9333ea' },
];

type HomeScreenProps = {
  navigation: BottomTabNavigationProp<CustomerTabParamList, 'Home'>;
};

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { user } = useAuthStore();
  const { location } = useLocation();
  const [searchText, setSearchText] = useState('');
  const [showBottomSheet, setShowBottomSheet] = useState(true);
  const mapRef = useRef<MapView>(null);

  const region = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      }
    : DEFAULT_REGION;

  const { data: nearbyVehicles, isLoading: loadingNearby } = useNearbyVehicles(
    location?.latitude,
    location?.longitude,
    15
  );

  function handleVehiclePress(vehicle: Vehicle) {
    // Navigate to VehicleDetail in the stack that wraps this tab
    (navigation as unknown as { navigate: (screen: string, params: object) => void }).navigate(
      'VehicleDetail',
      { vehicleId: vehicle.id }
    );
  }

  function handleQuickAction(id: string) {
    switch (id) {
      case 'ride':
      case 'rent':
        navigation.navigate('VehicleList');
        break;
      case 'chauffeur':
        navigation.navigate('VehicleList', { chauffeurAvailable: true } as never);
        break;
      case 'luxury':
        navigation.navigate('VehicleList', { category: 'luxury' } as never);
        break;
    }
  }

  function handleCenterMap() {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    }
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        region={region}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {/* Nearby vehicle markers */}
        {nearbyVehicles?.map((vehicle) => (
          <Marker
            key={vehicle.id}
            coordinate={{
              latitude: vehicle.location.latitude,
              longitude: vehicle.location.longitude,
            }}
            onPress={() => handleVehiclePress(vehicle)}
          >
            <View style={styles.vehicleMarker}>
              <Text style={styles.vehicleMarkerText}>🚗</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Safe area header overlay */}
      <SafeAreaView style={styles.headerOverlay} edges={['top']}>
        {/* Greeting */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greetingText}>
              Hello, {user?.fullName.split(' ')[0] ?? 'there'} 👋
            </Text>
            <Text style={styles.greetingSubtitle}>Where to today?</Text>
          </View>
          <TouchableOpacity style={styles.notifButton}>
            <Text style={styles.notifIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by city or address..."
            placeholderTextColor={COLORS.gray}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (searchText.trim()) {
                navigation.navigate('VehicleList', { city: searchText.trim() } as never);
              }
            }}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* Center on me button */}
      <TouchableOpacity style={styles.myLocationButton} onPress={handleCenterMap}>
        <Text style={styles.myLocationIcon}>📍</Text>
      </TouchableOpacity>

      {/* Bottom Sheet */}
      {showBottomSheet && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />

          {/* Quick Actions */}
          <View style={styles.quickActionsRow}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={[styles.quickAction, { backgroundColor: action.color }]}
                onPress={() => handleQuickAction(action.id)}
              >
                <Text style={styles.quickActionIcon}>{action.icon}</Text>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Nearby Vehicles */}
          <View style={styles.nearbySection}>
            <View style={styles.nearbyHeader}>
              <Text style={styles.nearbyTitle}>Nearby Vehicles</Text>
              <TouchableOpacity onPress={() => navigation.navigate('VehicleList')}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            {loadingNearby ? (
              <LoadingSpinner size="small" message="Finding vehicles near you..." />
            ) : nearbyVehicles && nearbyVehicles.length > 0 ? (
              <FlatList
                data={nearbyVehicles.slice(0, 5)}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.nearbyList}
                renderItem={({ item }) => (
                  <VehicleCard
                    vehicle={item}
                    onPress={handleVehiclePress}
                    style={styles.nearbyCard}
                  />
                )}
              />
            ) : (
              <View style={styles.emptyNearby}>
                <Text style={styles.emptyNearbyText}>No vehicles found nearby.</Text>
                <TouchableOpacity onPress={() => navigation.navigate('VehicleList')}>
                  <Text style={styles.browseAllText}>Browse all vehicles →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  headerOverlay: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  greetingText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  greetingSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  notifButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifIcon: {
    fontSize: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    gap: SPACING.sm,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  clearIcon: {
    fontSize: 14,
    color: COLORS.gray,
    padding: 4,
  },
  vehicleMarker: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 6,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  vehicleMarkerText: {
    fontSize: 20,
  },
  myLocationButton: {
    position: 'absolute',
    right: SPACING.md,
    top: SCREEN_HEIGHT * 0.25,
    backgroundColor: COLORS.white,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  myLocationIcon: {
    fontSize: 20,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    maxHeight: SCREEN_HEIGHT * 0.52,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  quickAction: {
    flex: 1,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  quickActionIcon: {
    fontSize: 22,
  },
  quickActionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  nearbySection: {
    flex: 1,
  },
  nearbyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  nearbyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  seeAllText: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
  },
  nearbyList: {
    paddingHorizontal: SPACING.md,
  },
  nearbyCard: {
    width: 220,
    marginRight: SPACING.sm,
    marginBottom: 0,
  },
  emptyNearby: {
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyNearbyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  browseAllText: {
    color: COLORS.accent,
    fontWeight: '600',
    fontSize: 14,
  },
});
