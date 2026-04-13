import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  RefreshControl,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useVehicles } from '../../hooks/useVehicles';
import { VehicleCard } from '../../components/VehicleCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { InlineError } from '../../components/ErrorBoundary';
import { COLORS, SPACING, BORDER_RADIUS, VEHICLE_CATEGORIES } from '../../utils/constants';
import { Vehicle, VehicleFilters } from '../../api/vehicles';
import { CustomerStackParamList } from '../../navigation/CustomerNavigator';

type VehicleListScreenProps = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'VehicleList'>;
  route: RouteProp<CustomerStackParamList, 'VehicleList'>;
};

export function VehicleListScreen({ navigation, route }: VehicleListScreenProps) {
  const styles = getStyles();
  const initialCategory = route.params?.category;
  const initialChauffeur = route.params?.chauffeurAvailable;
  const initialCity = route.params?.city;

  const [selectedCategory, setSelectedCategory] = useState(initialCategory ?? 'all');
  const [chauffeurOnly, setChauffeurOnly] = useState(initialChauffeur ?? false);
  const [citySearch, setCitySearch] = useState(initialCity ?? '');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(500);

  const filters: VehicleFilters = {
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    chauffeurAvailable: chauffeurOnly ? true : undefined,
    city: citySearch.trim() || undefined,
    minPrice: minPrice > 0 ? minPrice : undefined,
    maxPrice: maxPrice < 500 ? maxPrice : undefined,
  };

  const { data, isLoading, isError, refetch, isFetching } = useVehicles(filters);

  const handleVehiclePress = useCallback(
    (vehicle: Vehicle) => {
      navigation.navigate('VehicleDetail', { vehicleId: vehicle.id });
    },
    [navigation]
  );

  const activeFilterCount = [
    selectedCategory !== 'all',
    chauffeurOnly,
    minPrice > 0,
    maxPrice < 500,
  ].filter(Boolean).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Browse Vehicles</Text>
      </View>

      {/* Search by City */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={citySearch}
          onChangeText={setCitySearch}
          placeholder="Search by city..."
          placeholderTextColor={COLORS.gray}
          returnKeyType="search"
        />
      </View>

      {/* Category Dropdown */}
      <TouchableOpacity
        style={styles.categoryDropdown}
        onPress={() => setShowCategoryPicker(v => !v)}
      >
        <Text style={styles.categoryDropdownLabel}>
          {VEHICLE_CATEGORIES.find(c => c.value === selectedCategory)?.label ?? 'All'}
        </Text>
        <Text style={styles.categoryDropdownArrow}>{showCategoryPicker ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showCategoryPicker && (
        <View style={styles.categoryPickerList}>
          {VEHICLE_CATEGORIES.map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.categoryPickerItem,
                selectedCategory === item.value && styles.categoryPickerItemActive,
              ]}
              onPress={() => { setSelectedCategory(item.value); setShowCategoryPicker(false); }}
            >
              <Text
                style={[
                  styles.categoryPickerText,
                  selectedCategory === item.value && styles.categoryPickerTextActive,
                ]}
              >
                {item.label}
              </Text>
              {selectedCategory === item.value && <Text style={styles.categoryCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Price Filter Dropdown */}
      <TouchableOpacity
        style={styles.categoryDropdown}
        onPress={() => setShowPriceFilter(v => !v)}
      >
        <Text style={styles.categoryDropdownLabel}>
          {minPrice > 0 || maxPrice < 500 ? `${minPrice} — ${maxPrice} AED/hr` : 'Price Range'}
        </Text>
        <Text style={styles.categoryDropdownArrow}>{showPriceFilter ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showPriceFilter && (
        <View style={styles.priceDropdown}>
          <View style={styles.priceSliderRow}>
            <Text style={styles.priceSliderLabel}>From</Text>
            <Text style={styles.priceSliderValue}>{minPrice} AED</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={500}
            step={10}
            value={minPrice}
            onValueChange={v => { const val = Math.round(v); if (val < maxPrice) setMinPrice(val); }}
            minimumTrackTintColor={COLORS.textPrimary}
            maximumTrackTintColor={COLORS.border}
            thumbTintColor={COLORS.textPrimary}
          />
          <View style={styles.priceSliderRow}>
            <Text style={styles.priceSliderLabel}>Maximum</Text>
            <Text style={styles.priceSliderValue}>{maxPrice < 500 ? `${maxPrice} AED` : 'Any'}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={500}
            step={10}
            value={maxPrice}
            onValueChange={v => { const val = Math.round(v); if (val > minPrice) setMaxPrice(val); }}
            minimumTrackTintColor={COLORS.textPrimary}
            maximumTrackTintColor={COLORS.border}
            thumbTintColor={COLORS.textPrimary}
          />
          <TouchableOpacity style={styles.priceResetBtn} onPress={() => { setMinPrice(0); setMaxPrice(500); }}>
            <Text style={styles.priceResetText}>Reset</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chauffeur Toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Chauffeur available</Text>
        <TouchableOpacity
          style={[styles.toggle, chauffeurOnly && styles.toggleActive]}
          onPress={() => setChauffeurOnly((v) => !v)}
        >
          <View style={[styles.toggleThumb, chauffeurOnly && styles.toggleThumbActive]} />
        </TouchableOpacity>
      </View>

      {/* Results count */}
      {data && (
        <Text style={styles.resultCount}>
          {data.total} vehicle{data.total !== 1 ? 's' : ''} found
        </Text>
      )}

      {/* Vehicle List */}
      {isLoading ? (
        <LoadingSpinner message="Loading vehicles..." />
      ) : isError ? (
        <InlineError
          message="Failed to load vehicles. Please try again."
          onRetry={refetch}
        />
      ) : (
        <FlatList
          data={data?.vehicles ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={COLORS.accent}
            />
          }
          renderItem={({ item }) => (
            <VehicleCard vehicle={item} onPress={handleVehiclePress} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>◆</Text>
              <Text style={styles.emptyTitle}>No vehicles found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your filters or search.</Text>
            </View>
          }
        />
      )}

    </SafeAreaView>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
    marginRight: SPACING.sm,
  },
  backIcon: {
    fontSize: 22,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    margin: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  searchIcon: {
    fontSize: 15, color: COLORS.textPrimary,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  categoryDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
  },
  categoryDropdownLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  categoryDropdownArrow: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  categoryPickerList: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  categoryPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },
  categoryPickerItemActive: {
    backgroundColor: COLORS.grayLight,
  },
  categoryPickerText: {
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  categoryPickerTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  categoryCheck: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleLabel: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  toggle: {
    width: 48,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#d9c0a4',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  resultCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyIcon: {
    fontSize: 48, color: COLORS.textPrimary,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Price dropdown
  priceDropdown: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  priceSliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  priceSliderLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  priceSliderValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  slider: {
    width: '100%',
    height: 40,
    marginBottom: SPACING.sm,
  },
  priceResetBtn: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  priceResetText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
}); }
