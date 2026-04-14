import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useVehicles } from '../../hooks/useVehicles';
import { useBookingStore } from '../../store/bookingStore';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { Vehicle } from '../../api/vehicles';
import { CustomerStackParamList } from '../../navigation/MainNavigator';
import { addHours } from 'date-fns';

type Props = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'ChauffeurVehicleList'>;
  route: RouteProp<CustomerStackParamList, 'ChauffeurVehicleList'>;
};

const CATEGORIES = ['all', 'sedan', 'suv', 'luxury', 'sports'];

export function ChauffeurVehicleListScreen({ navigation, route }: Props) {
  const styles = getStyles();
  const params = route.params ?? {} as any;
  const { setBookingDraft } = useBookingStore();
  const [category, setCategory] = useState('all');

  const { data, isLoading, refetch, isFetching } = useVehicles({
    chauffeurAvailable: true,
    city: params.city ? params.city.replace(/ü/g,'u').replace(/ö/g,'o').replace(/ä/g,'a').replace(/Ü/g,'U').replace(/Ö/g,'O').replace(/Ä/g,'A') : undefined,
  });

  const vehicles = (data?.vehicles ?? []).filter(v => {
    if (!v.chauffeurAvailable) return false;
    // City filtering is handled by the backend API
    if (category !== 'all' && v.category !== category) return false;
    return true;
  });

  function handleSelect(vehicle: Vehicle) {
    const startTime = params.pickupTime ? new Date(params.pickupTime) : new Date();
    const endTime = addHours(startTime, params.durationHours || 3);

    setBookingDraft({
      vehicleId: vehicle.id,
      vehicle,
      mode: 'chauffeur',
      startTime,
      endTime,
      pickupAddress: params.pickupText || '',
      pickupLatitude: params.pickupCoords?.latitude,
      pickupLongitude: params.pickupCoords?.longitude,
      dropoffAddress: params.destText || undefined,
      dropoffLatitude: params.destCoords?.latitude,
      dropoffLongitude: params.destCoords?.longitude,
    });

    navigation.navigate('Booking', { vehicleId: vehicle.id });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CHAUFFEUR VEHICLES</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Route summary */}
      {params.pickupText && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText} numberOfLines={1}>
            {params.pickupText}{params.destText ? ' → ' + params.destText : ''}
          </Text>
          <Text style={styles.summaryMeta}>
            {params.durationHours || 3}h · {params.city || ''}
          </Text>
        </View>
      )}

      {/* Category tabs */}
      <View style={styles.catRow}>
        {CATEGORIES.map(c => (
          <TouchableOpacity key={c} style={[styles.catTab, category === c && styles.catTabActive]} onPress={() => setCategory(c)}>
            <Text style={[styles.catText, category === c && styles.catTextActive]}>{c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.resultCount}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} found</Text>

      {isLoading ? (
        <LoadingSpinner message="Finding chauffeur vehicles..." />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={COLORS.textPrimary} />}
          renderItem={({ item }) => (
            <ChauffeurVehicleCard vehicle={item} durationHours={params.durationHours || 3} onSelect={() => handleSelect(item)} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>◆</Text>
              <Text style={styles.emptyTitle}>No chauffeur vehicles found</Text>
              <Text style={styles.emptySubtitle}>Try a different location or category</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function ChauffeurVehicleCard({ vehicle, durationHours, onSelect }: { vehicle: Vehicle; durationHours: number; onSelect: () => void }) {
  const styles = getStyles();
  const thumbnail = vehicle.images[0] || null;
  const chauffeurFee = Math.round(vehicle.chauffeurFeePerHour || 45);
  const pricePerHour = Math.round(vehicle.pricePerHour);
  const totalEstimate = Math.round(vehicle.pricePerHour * durationHours + chauffeurFee * durationHours);

  return (
    <View style={styles.card}>
      {/* Image */}
      <View style={styles.imageContainer}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={styles.cardImagePlaceholder}><Text style={styles.cardImagePlaceholderText}>◆</Text></View>
        )}
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{vehicle.category.toUpperCase()}</Text>
        </View>
      </View>

      {/* Vehicle info */}
      <View style={styles.cardContent}>
        <Text style={styles.vehicleName}>{vehicle.year} {vehicle.make} {vehicle.model}</Text>
        <Text style={styles.vehicleLocation}>{vehicle.location.city}</Text>

        <View style={styles.specsRow}>
          <View style={styles.specChip}><Text style={styles.specText}>{vehicle.seats} seats</Text></View>
          <View style={styles.specChip}><Text style={styles.specText}>{vehicle.transmission}</Text></View>
          <View style={styles.specChip}><Text style={styles.specText}>{vehicle.fuelType}</Text></View>
        </View>

        <View style={styles.cardDivider} />

        {/* Chauffeur section */}
        <Text style={styles.chauffeurLabel}>CHAUFFEUR</Text>
        <View style={styles.chauffeurRow}>
          <View style={styles.chauffeurAvatar}>
            <Text style={styles.chauffeurAvatarText}>C</Text>
          </View>
          <View style={styles.chauffeurInfo}>
            <Text style={styles.chauffeurName}>Professional Driver</Text>
            <Text style={styles.chauffeurStats}>★ {vehicle.rating.toFixed(1)} · Available</Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        {/* Pricing */}
        <View style={styles.pricingRow}>
          <View>
            <Text style={styles.priceMain}>€{pricePerHour}/hr</Text>
            <Text style={styles.priceSub}>Vehicle</Text>
          </View>
          <View>
            <Text style={styles.priceAccent}>€{chauffeurFee}/hr</Text>
            <Text style={styles.priceSub}>Chauffeur</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.priceTotal}>€{totalEstimate}</Text>
            <Text style={styles.priceSub}>Est. {durationHours}h</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.selectButton} onPress={onSelect}>
          <Text style={styles.selectButtonText}>SELECT THIS VEHICLE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 22, color: COLORS.textPrimary },
  headerTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 3 },
  // Summary
  summaryBar: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.grayLight, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  summaryText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  summaryMeta: { fontSize: 12, color: '#d9c0a4', marginTop: 2 },
  // Categories
  catRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.xs },
  catTab: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md },
  catTabActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  catText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  catTextActive: { color: COLORS.background },
  resultCount: { fontSize: 12, color: COLORS.textSecondary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  // Card
  card: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md, overflow: 'hidden' },
  imageContainer: { position: 'relative', height: 180 },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { width: '100%', height: '100%', backgroundColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center' },
  cardImagePlaceholderText: { fontSize: 40, color: COLORS.textSecondary },
  categoryBadge: { position: 'absolute', top: SPACING.sm, left: SPACING.sm, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  categoryBadgeText: { color: COLORS.textPrimary, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  cardContent: { padding: SPACING.md },
  vehicleName: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  vehicleLocation: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  specsRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm },
  specChip: { backgroundColor: COLORS.grayLight, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.sm },
  specText: { fontSize: 11, color: COLORS.textSecondary, textTransform: 'capitalize' },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  // Chauffeur
  chauffeurLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 2, marginBottom: SPACING.xs },
  chauffeurRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  chauffeurAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.grayLight, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  chauffeurAvatarText: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  chauffeurInfo: { flex: 1 },
  chauffeurName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  chauffeurStats: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  // Pricing
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  priceMain: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  priceAccent: { fontSize: 15, fontWeight: '600', color: '#d9c0a4' },
  priceTotal: { fontSize: 18, fontWeight: '700', color: '#d9c0a4' },
  priceSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  // Select button
  selectButton: { backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.md },
  selectButtonText: { fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 3 },
  // Empty
  empty: { padding: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyIcon: { fontSize: 40, color: COLORS.textSecondary },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  emptySubtitle: { fontSize: 13, color: COLORS.textSecondary },
}); }
