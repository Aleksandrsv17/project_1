import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useVehicles } from '../../hooks/useVehicles';
import { useBookingStore } from '../../store/bookingStore';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { Vehicle } from '../../api/vehicles';
import { CustomerStackParamList } from '../../navigation/MainNavigator';

type Props = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'RentalSearch'>;
};

const CITIES = ['All Cities', 'Moscow', 'Zurich', 'Dubai'];
const CATEGORIES = ['all', 'sedan', 'suv', 'sports', 'van'];

export function RentalSearchScreen({ navigation }: Props) {
  const styles = getStyles();
  const { setBookingDraft } = useBookingStore();

  const [selectedCity, setSelectedCity] = useState('All Cities');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [category, setCategory] = useState('all');

  const [startDate, setStartDate] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 26 * 60 * 60 * 1000));
  const [tempDate, setTempDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [pickerTarget, setPickerTarget] = useState<'startDate' | 'startTime' | 'endDate' | 'endTime'>('startDate');

  const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const durationTotalHours = Math.round(durationMs / (1000 * 60 * 60));
  const durationDays = Math.floor(durationTotalHours / 24);
  const durationHours = durationTotalHours % 24;
  const durationText = durationDays > 0 && durationHours > 0
    ? `${durationDays}d ${durationHours}h`
    : durationDays > 0
    ? `${durationDays} day${durationDays !== 1 ? 's' : ''}`
    : `${Math.max(1, durationHours)} hour${durationHours !== 1 ? 's' : ''}`;
  const durationBillingDays = Math.max(1, Math.ceil(durationTotalHours / 24));

  const { data, isLoading, refetch, isFetching } = useVehicles({
    city: selectedCity !== 'All Cities' ? selectedCity : undefined,
  });

  const vehicles = (data?.vehicles ?? [])
    .filter(v => {
      if (category !== 'all' && v.category !== category) return false;
      return true;
    })
    .sort((a, b) => a.pricePerDay - b.pricePerDay);

  function openPicker(target: typeof pickerTarget) {
    setPickerTarget(target);
    setPickerMode(target.includes('Date') ? 'date' : 'time');
    setTempDate(target.startsWith('start') ? startDate : endDate);
    setShowPicker(true);
  }

  function confirmPicker() {
    if (pickerTarget.startsWith('start')) setStartDate(tempDate);
    else setEndDate(tempDate);
    setShowPicker(false);
  }

  function handleSelect(vehicle: Vehicle) {
    setBookingDraft({
      vehicleId: vehicle.id,
      vehicle,
      mode: 'self_drive',
      startTime: startDate,
      endTime: endDate,
      pickupAddress: vehicle.location.city,
      pickupLatitude: vehicle.location.latitude,
      pickupLongitude: vehicle.location.longitude,
    });
    navigation.navigate('Booking', { vehicleId: vehicle.id });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RENTAL</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* City */}
        <Text style={styles.sectionLabel}>CITY</Text>
        <TouchableOpacity style={styles.citySelector} onPress={() => setShowCityPicker(!showCityPicker)}>
          <Text style={styles.citySelectorText}>{selectedCity}</Text>
          <Text style={styles.citySelectorArrow}>{showCityPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showCityPicker && (
          <View style={styles.cityDropdown}>
            <View style={styles.citySearchBox}>
              <TextInput style={styles.citySearchInput} value={citySearch} onChangeText={setCitySearch}
                placeholder="Search city..." placeholderTextColor={COLORS.gray} />
            </View>
            {CITIES.filter(c => c.toLowerCase().includes(citySearch.toLowerCase())).map(c => (
              <TouchableOpacity key={c} style={[styles.cityItem, selectedCity === c && styles.cityItemActive]}
                onPress={() => { setSelectedCity(c); setShowCityPicker(false); setCitySearch(''); }}>
                <Text style={[styles.cityItemText, selectedCity === c && styles.cityItemTextActive]}>{c}</Text>
                {selectedCity === c && <Text style={styles.cityCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Start */}
        <Text style={styles.sectionLabel}>RENTAL START</Text>
        <View style={styles.dateTimeRow}>
          <TouchableOpacity style={styles.dateBox} onPress={() => openPicker('startDate')}>
            <Text style={styles.dateText}>{startDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateBox} onPress={() => openPicker('startTime')}>
            <Text style={styles.dateText}>{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>
        </View>

        {/* End */}
        <Text style={styles.sectionLabel}>RENTAL END</Text>
        <View style={styles.dateTimeRow}>
          <TouchableOpacity style={styles.dateBox} onPress={() => openPicker('endDate')}>
            <Text style={styles.dateText}>{endDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateBox} onPress={() => openPicker('endTime')}>
            <Text style={styles.dateText}>{endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>
        </View>

        {showPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker value={tempDate} mode={pickerMode}
              minimumDate={pickerTarget.startsWith('end') ? startDate : new Date()}
              display="spinner" textColor={COLORS.textPrimary} themeVariant="dark"
              onChange={(_, date) => { if (date) setTempDate(date); }} />
            <TouchableOpacity style={styles.confirmPickerBtn} onPress={confirmPicker}>
              <Text style={styles.confirmPickerText}>CONFIRM</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.durationValue}>{durationText}</Text>

        {/* Category */}
        <Text style={styles.sectionLabel}>VEHICLE TYPE</Text>
        <View style={styles.catRow}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c} style={[styles.catTab, category === c && styles.catTabActive, c === 'sports' && category !== 'sports' && styles.catTabSports]}
              onPress={() => setCategory(c)}>
              <Text style={[styles.catText, category === c && styles.catTextActive]}>
                {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Results */}
        <Text style={styles.resultCount}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} available</Text>

        {isLoading ? (
          <LoadingSpinner message="Finding vehicles..." />
        ) : vehicles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◆</Text>
            <Text style={styles.emptyTitle}>No vehicles found</Text>
            <Text style={styles.emptySubtitle}>Try a different city or category</Text>
          </View>
        ) : (
          vehicles.map(v => (
            <RentalCard key={v.id} vehicle={v} durationBillingDays={durationBillingDays} durationLabel={durationText} onSelect={() => handleSelect(v)} />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function RentalCard({ vehicle, durationBillingDays, durationLabel, onSelect }: { vehicle: Vehicle; durationBillingDays: number; durationLabel: string; onSelect: () => void }) {
  const styles = getStyles();
  const thumbnail = vehicle.images[0] || null;
  const totalEstimate = Math.round(vehicle.pricePerDay * durationBillingDays);

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
        {vehicle.description ? <Text style={styles.descText} numberOfLines={2}>{vehicle.description}</Text> : null}
        <View style={styles.cardDivider} />
        <View style={styles.pricingRow}>
          <View>
            <Text style={styles.priceMain}>${vehicle.pricePerDay}/day</Text>
            <Text style={styles.priceSub}>Daily rate</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.priceTotal}>${totalEstimate}</Text>
            <Text style={styles.priceSub}>Est. {durationLabel}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.priceDeposit}>${vehicle.depositAmount}</Text>
            <Text style={styles.priceSub}>Deposit</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.selectButton} onPress={onSelect}>
          <Text style={styles.selectButtonText}>SELECT</Text>
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
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  sectionLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 2, marginBottom: SPACING.xs, marginTop: SPACING.md },
  citySelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
  citySelectorText: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  citySelectorArrow: { fontSize: 12, color: COLORS.textSecondary },
  cityDropdown: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.xs, overflow: 'hidden' },
  citySearchBox: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  citySearchInput: { fontSize: 14, color: COLORS.textPrimary },
  cityItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  cityItemActive: { backgroundColor: COLORS.grayLight },
  cityItemText: { fontSize: 15, color: COLORS.textPrimary },
  cityItemTextActive: { color: '#d9c0a4', fontWeight: '700' },
  cityCheck: { fontSize: 16, color: '#d9c0a4', fontWeight: '700' },
  dateTimeRow: { flexDirection: 'row', gap: SPACING.sm },
  dateBox: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  dateText: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  pickerContainer: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, overflow: 'hidden', marginTop: SPACING.xs },
  confirmPickerBtn: { backgroundColor: '#d9c0a4', paddingVertical: SPACING.sm + 2, alignItems: 'center' },
  confirmPickerText: { fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 2 },
  durationValue: { fontSize: 22, fontWeight: '700', color: '#d9c0a4', textAlign: 'center', marginTop: SPACING.sm },
  catRow: { flexDirection: 'row', gap: SPACING.xs },
  catTab: { flex: 1, paddingVertical: SPACING.sm + 2, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, alignItems: 'center' },
  catTabActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  catTabSports: { borderColor: '#d9c0a4' },
  catText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  catTextActive: { color: COLORS.background },
  resultCount: { fontSize: 12, color: COLORS.textSecondary, marginTop: SPACING.md, marginBottom: SPACING.sm },
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
  descText: { fontSize: 12, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 18 },
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
