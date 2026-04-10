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

type Props = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'RentalVehicleList'>;
  route: RouteProp<CustomerStackParamList, 'RentalVehicleList'>;
};

const CATEGORIES = ['all', 'sedan', 'suv', 'sports', 'van'];

export function RentalVehicleListScreen({ navigation, route }: Props) {
  const styles = getStyles();
  const params = route.params ?? {} as any;
  const { setBookingDraft } = useBookingStore();
  const [category, setCategory] = useState(params.carType || 'all');

  const { data, isLoading, refetch, isFetching } = useVehicles({});

  const startDate = params.startDate ? new Date(params.startDate) : new Date();
  const endDate = params.endDate ? new Date(params.endDate) : new Date(Date.now() + 86400000);
  const durationDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000));

  const vehicles = (data?.vehicles ?? [])
    .filter(v => {
      if (category !== 'all' && v.category !== category) return false;
      return true;
    })
    .sort((a, b) => a.pricePerDay - b.pricePerDay);

  function handleSelect(vehicle: Vehicle) {
    setBookingDraft({
      vehicleId: vehicle.id,
      vehicle,
      mode: 'self_drive',
      startTime: startDate,
      endTime: endDate,
      pickupAddress: params.pickupText || '',
      pickupLatitude: params.pickupCoords?.latitude,
      pickupLongitude: params.pickupCoords?.longitude,
    });
    navigation.navigate('Booking', { vehicleId: vehicle.id });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RENTAL VEHICLES</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary */}
      {params.pickupText && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText} numberOfLines={1}>{params.pickupText}</Text>
          <Text style={styles.summaryMeta}>
            {startDate.toLocaleDateString()} – {endDate.toLocaleDateString()} · {durationDays} day{durationDays !== 1 ? 's' : ''} · {params.city || ''}
          </Text>
        </View>
      )}

      {/* Category tabs */}
      <View style={styles.catRow}>
        {CATEGORIES.map(c => (
          <TouchableOpacity key={c} style={[styles.catTab, category === c && styles.catTabActive, c === 'sports' && category !== 'sports' && styles.catTabSports]} onPress={() => setCategory(c)}>
            <Text style={[styles.catText, category === c && styles.catTextActive]}>{c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.resultCount}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} found</Text>

      {isLoading ? (
        <LoadingSpinner message="Finding rental vehicles..." />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={COLORS.textPrimary} />}
          renderItem={({ item }) => (
            <RentalVehicleCard vehicle={item} durationDays={durationDays} onSelect={() => handleSelect(item)} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>◆</Text>
              <Text style={styles.emptyTitle}>No vehicles found</Text>
              <Text style={styles.emptySubtitle}>Try a different category</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function RentalVehicleCard({ vehicle, durationDays, onSelect }: { vehicle: Vehicle; durationDays: number; onSelect: () => void }) {
  const styles = getStyles();
  const thumbnail = vehicle.images[0] || null;
  const totalEstimate = Math.round(vehicle.pricePerDay * durationDays);

  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={styles.cardImagePlaceholder}><Text style={styles.placeholderText}>◆</Text></View>
        )}
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{vehicle.category.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        <Text style={styles.vehicleName}>{vehicle.year} {vehicle.make} {vehicle.model}</Text>
        <Text style={styles.vehicleLocation}>{vehicle.location.city}</Text>

        <View style={styles.specsRow}>
          <View style={styles.specChip}><Text style={styles.specText}>{vehicle.seats} seats</Text></View>
          <View style={styles.specChip}><Text style={styles.specText}>{vehicle.transmission}</Text></View>
          <View style={styles.specChip}><Text style={styles.specText}>{vehicle.fuelType}</Text></View>
        </View>

        <View style={styles.cardDivider} />

        {/* Pricing */}
        <View style={styles.pricingRow}>
          <View>
            <Text style={styles.priceMain}>${vehicle.pricePerDay}/day</Text>
            <Text style={styles.priceSub}>Daily rate</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.priceTotal}>${totalEstimate}</Text>
            <Text style={styles.priceSub}>Est. {durationDays} day{durationDays !== 1 ? 's' : ''}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.priceDeposit}>${vehicle.depositAmount}</Text>
            <Text style={styles.priceSub}>Deposit</Text>
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
  summaryBar: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.grayLight, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  summaryText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  summaryMeta: { fontSize: 12, color: '#d9c0a4', marginTop: 2 },
  catRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.xs },
  catTab: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md },
  catTabActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  catTabSports: { borderColor: '#d9c0a4' },
  catText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  catTextActive: { color: COLORS.background },
  resultCount: { fontSize: 12, color: COLORS.textSecondary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  card: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md, overflow: 'hidden' },
  imageContainer: { position: 'relative', height: 180 },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { width: '100%', height: '100%', backgroundColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 40, color: COLORS.textSecondary },
  categoryBadge: { position: 'absolute', top: SPACING.sm, left: SPACING.sm, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  categoryBadgeText: { color: COLORS.textPrimary, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  cardContent: { padding: SPACING.md },
  vehicleName: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  vehicleLocation: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  specsRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm },
  specChip: { backgroundColor: COLORS.grayLight, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.sm },
  specText: { fontSize: 11, color: COLORS.textSecondary, textTransform: 'capitalize' },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  priceMain: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  priceTotal: { fontSize: 18, fontWeight: '700', color: '#d9c0a4' },
  priceDeposit: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  priceSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  selectButton: { backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.md },
  selectButtonText: { fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 3 },
  empty: { padding: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyIcon: { fontSize: 40, color: COLORS.textSecondary },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  emptySubtitle: { fontSize: 13, color: COLORS.textSecondary },
}); }
