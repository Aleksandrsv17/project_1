import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useVehicle } from '../../hooks/useVehicles';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { InlineError } from '../../components/ErrorBoundary';
import { StarRating } from '../../components/StarRating';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { formatCurrency, formatVehicleName } from '../../utils/formatters';
import { CustomerStackParamList } from '../../navigation/CustomerNavigator';
import { useBookingStore } from '../../store/bookingStore';
import { getMapStyle } from '../../themes/mapStyles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type VehicleDetailScreenProps = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'VehicleDetail'>;
  route: RouteProp<CustomerStackParamList, 'VehicleDetail'>;
};

export function VehicleDetailScreen({ navigation, route }: VehicleDetailScreenProps) {
  const styles = getStyles();
  const { vehicleId } = route.params;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedMode, setSelectedMode] = useState<'self_drive' | 'chauffeur'>('self_drive');

  const { data: vehicle, isLoading, isError, refetch } = useVehicle(vehicleId);
  const { setBookingDraft } = useBookingStore();

  function handleBookNow() {
    if (!vehicle) return;

    const now = new Date();
    const defaultEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000); // +3 hours

    setBookingDraft({
      vehicleId: vehicle.id,
      vehicle,
      mode: selectedMode,
      startTime: now,
      endTime: defaultEnd,
      pickupAddress: vehicle.location.address,
      pickupLatitude: vehicle.location.latitude,
      pickupLongitude: vehicle.location.longitude,
    });

    navigation.navigate('Booking', { vehicleId: vehicle.id });
  }

  if (isLoading) return <LoadingSpinner fullScreen message="Loading vehicle details..." />;
  if (isError || !vehicle) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <InlineError message="Failed to load vehicle details." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const images =
    vehicle.images.length > 0
      ? vehicle.images
      : ['https://via.placeholder.com/400x250?text=No+Image'];

  const totalHourlyPrice =
    selectedMode === 'chauffeur'
      ? vehicle.pricePerHour + vehicle.chauffeurFeePerHour
      : vehicle.pricePerHour;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Image Gallery */}
        <View style={styles.galleryContainer}>
          <FlatList
            data={images}
            keyExtractor={(item, index) => `${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setActiveImageIndex(index);
            }}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={styles.galleryImage}
                resizeMode="cover"
              />
            )}
          />

          {/* Image dots */}
          {images.length > 1 && (
            <View style={styles.imageDots}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.imageDot, i === activeImageIndex && styles.imageDotActive]}
                />
              ))}
            </View>
          )}

          {/* Back button overlay */}
          <SafeAreaView style={styles.galleryOverlay} edges={['top']}>
            <TouchableOpacity style={styles.galleryBackButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
          </SafeAreaView>

          {/* Category Badge */}
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{vehicle.category.toUpperCase()}</Text>
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.content}>
          {/* Title Row */}
          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <Text style={styles.vehicleName}>
                {formatVehicleName(vehicle.year, vehicle.make, vehicle.model)}
              </Text>
              <Text style={styles.vehicleColor}>{vehicle.color} · {vehicle.licensePlate}</Text>
            </View>
            {vehicle.isAvailable ? (
              <View style={styles.availableBadge}>
                <Text style={styles.availableText}>Available</Text>
              </View>
            ) : (
              <View style={styles.unavailableBadge}>
                <Text style={styles.unavailableText}>Booked</Text>
              </View>
            )}
          </View>

          {/* Rating */}
          <View style={styles.ratingRow}>
            <StarRating rating={vehicle.rating} size={16} />
            <Text style={styles.ratingText}>
              {vehicle.rating.toFixed(1)} ({vehicle.reviewCount} reviews)
            </Text>
            <Text style={styles.locationText}>· {vehicle.location.city}</Text>
          </View>

          {/* Specs Grid */}
          <View style={styles.specsGrid}>
            <SpecCard icon="⊡" label="Seats" value={`${vehicle.seats}`} />
            <SpecCard icon="⊕" label="Transmission" value={vehicle.transmission} />
            <SpecCard icon="◈" label="Fuel" value={vehicle.fuelType} />
            <SpecCard icon="□" label="Year" value={`${vehicle.year}`} />
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this vehicle</Text>
            <Text style={styles.description}>{vehicle.description}</Text>
          </View>

          {/* Features */}
          {vehicle.features.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Features</Text>
              <View style={styles.featuresGrid}>
                {vehicle.features.map((feature) => (
                  <View key={feature} style={styles.featureTag}>
                    <Text style={styles.featureText}>✓ {feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Vehicle Location Map */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vehicle Location</Text>
            <View style={styles.mapContainer}>
              <MapView customMapStyle={getMapStyle()}
                style={styles.miniMap}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                  latitude: vehicle.location.latitude,
                  longitude: vehicle.location.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                <Marker
                  coordinate={{
                    latitude: vehicle.location.latitude,
                    longitude: vehicle.location.longitude,
                  }}
                >
                  <View style={styles.mapPin}>
                    <View style={styles.mapPinHead}>
                      <Text style={styles.mapPinIcon}>◆</Text>
                    </View>
                    <View style={styles.mapPinNeedle} />
                  </View>
                </Marker>
              </MapView>
              <Text style={styles.mapAddress}>{vehicle.location.address}</Text>
            </View>
          </View>

          {/* Pricing & Mode Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Mode</Text>

            <TouchableOpacity
              style={[styles.modeOption, selectedMode === 'self_drive' && styles.modeOptionActive]}
              onPress={() => setSelectedMode('self_drive')}
            >
              <View style={styles.modeLeft}>
                <Text style={styles.modeIcon}>—</Text>
                <View>
                  <Text style={styles.modeTitle}>Self Drive</Text>
                  <Text style={styles.modeSubtitle}>Drive it yourself</Text>
                </View>
              </View>
              <Text style={styles.modePrice}>
                {formatCurrency(vehicle.pricePerHour)}<Text style={styles.modePriceUnit}>/hr</Text>
              </Text>
            </TouchableOpacity>

            {vehicle.chauffeurAvailable && (
              <TouchableOpacity
                style={[styles.modeOption, selectedMode === 'chauffeur' && styles.modeOptionActive]}
                onPress={() => setSelectedMode('chauffeur')}
              >
                <View style={styles.modeLeft}>
                  <Text style={styles.modeIcon}>∧</Text>
                  <View>
                    <Text style={styles.modeTitle}>With Chauffeur</Text>
                    <Text style={styles.modeSubtitle}>Professional driver included</Text>
                  </View>
                </View>
                <Text style={styles.modePrice}>
                  {formatCurrency(vehicle.pricePerHour + vehicle.chauffeurFeePerHour)}
                  <Text style={styles.modePriceUnit}>/hr</Text>
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Owner Info */}
          <View style={styles.ownerCard}>
            <View style={styles.ownerAvatar}>
              <Text style={styles.ownerAvatarText}>
                {vehicle.ownerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.ownerLabel}>Listed by</Text>
              <Text style={styles.ownerName}>{vehicle.ownerName}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View style={styles.bottomBar}>
        <SafeAreaView edges={['bottom']}>
          <View style={styles.bottomBarInner}>
            <View>
              <Text style={styles.bottomPrice}>
                {formatCurrency(totalHourlyPrice)}
                <Text style={styles.bottomPriceUnit}>/hr</Text>
              </Text>
              <Text style={styles.bottomDayPrice}>
                {formatCurrency(vehicle.pricePerDay)}/day
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.bookButton, !vehicle.isAvailable && styles.bookButtonDisabled]}
              onPress={handleBookNow}
              disabled={!vehicle.isAvailable}
            >
              <Text style={styles.bookButtonText}>
                {vehicle.isAvailable ? 'Book Now' : 'Unavailable'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

function SpecCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  const styles = getStyles();
  return (
    <View style={styles.specCard}>
      <Text style={styles.specIcon}>{icon}</Text>
      <Text style={styles.specValue}>{value}</Text>
      <Text style={styles.specLabel}>{label}</Text>
    </View>
  );
}

function getStyles() { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  galleryContainer: {
    position: 'relative',
    height: 280,
    backgroundColor: COLORS.grayLight,
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: 280,
  },
  galleryOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  galleryBackButton: {
    margin: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    margin: SPACING.md,
  },
  backIcon: {
    fontSize: 22,
    color: COLORS.textPrimary,
  },
  imageDots: {
    position: 'absolute',
    bottom: SPACING.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  imageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  imageDotActive: {
    backgroundColor: COLORS.white,
    width: 16,
  },
  categoryBadge: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  categoryText: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  content: {
    padding: SPACING.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  titleLeft: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  vehicleName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  vehicleColor: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  availableBadge: {
    backgroundColor: COLORS.grayLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  availableText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  unavailableBadge: {
    backgroundColor: COLORS.grayLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  unavailableText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  ratingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  locationText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  specsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  specCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  specIcon: {
    fontSize: 20, color: COLORS.textPrimary,
  },
  specValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textTransform: 'capitalize',
  },
  specLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  featureTag: {
    backgroundColor: COLORS.grayLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  featureText: {
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  mapContainer: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  miniMap: {
    width: '100%',
    height: 160,
  },
  mapPin: {
    alignItems: 'center',
  },
  mapPinHead: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d9c0a4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPinIcon: {
    fontSize: 14,
    color: '#000000',
  },
  mapPinNeedle: {
    width: 2,
    height: 14,
    backgroundColor: '#d9c0a4',
  },
  mapAddress: {
    fontSize: 12,
    color: COLORS.textSecondary,
    padding: SPACING.sm,
    backgroundColor: COLORS.white,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
  },
  modeOptionActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.grayLight,
  },
  modeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  modeIcon: {
    fontSize: 24, color: COLORS.textPrimary,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modeSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  modePrice: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modePriceUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ownerAvatarText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  ownerLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  ownerName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomBarInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.sm,
  },
  bottomPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  bottomPriceUnit: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  bottomDayPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  bookButton: {
    backgroundColor: COLORS.accent === '#000000' ? 'transparent' : COLORS.accent,
    borderWidth: COLORS.accent === '#000000' ? 1 : 0,
    borderColor: '#FFFFFF',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    minWidth: 140,
    alignItems: 'center',
  },
  bookButtonDisabled: {
    backgroundColor: COLORS.gray,
    borderWidth: 0,
  },
  bookButtonText: {
    color: COLORS.accent === '#000000' ? '#FFFFFF' : COLORS.primary,
    fontWeight: '700',
    fontSize: 16,
  },
}); }
