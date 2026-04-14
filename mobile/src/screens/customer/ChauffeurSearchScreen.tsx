import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
// Slider removed — using calendar instead
import { searchPlaces, getPlaceDetails, reverseGeocode, PlacePrediction, LatLng } from '../../api/maps';
import { getMapStyle } from '../../themes/mapStyles';
import { useLocation } from '../../hooks/useLocation';
import { useBookingStore } from '../../store/bookingStore';
import { COLORS, SPACING, BORDER_RADIUS, DEFAULT_REGION } from '../../utils/constants';
import { CustomerStackParamList } from '../../navigation/MainNavigator';
import { addHours, addDays } from 'date-fns';
import { useVehicleAvailability } from '../../hooks/useVehicles';

type Props = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'ChauffeurSearch'>;
};

// TODO: fetch from backend pricing API
const CHAUFFEUR_HOURLY = 35;
const DELIVERY_FEE = 50;
const PER_KM = 0.20;

export function ChauffeurSearchScreen({ navigation }: Props) {
  const styles = getStyles();
  const { location, address: userAddress } = useLocation();
  const mapRef = useRef<MapView>(null);

  // Step state
  const [pickupText, setPickupText] = useState('');
  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [city, setCity] = useState('');
  const [activeInput, setActiveInput] = useState<'pickup'>('pickup');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [dropPinFor, setDropPinFor] = useState<'pickup' | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);

  const [carType, setCarType] = useState<'sedan' | 'suv' | 'van'>('sedan');

  // Calendar state
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [pickupTimeVal, setPickupTimeVal] = useState(new Date());
  const [returnTimeVal, setReturnTimeVal] = useState(new Date());
  const [showPickupTime, setShowPickupTime] = useState(false);
  const [showReturnTime, setShowReturnTime] = useState(false);

  const pickupTime = selectedStart ? (() => { const d = new Date(selectedStart); d.setHours(pickupTimeVal.getHours(), pickupTimeVal.getMinutes()); return d; })() : new Date(Date.now() + 2 * 60 * 60 * 1000);
  const endTime = selectedEnd ? (() => { const d = new Date(selectedEnd); d.setHours(returnTimeVal.getHours(), returnTimeVal.getMinutes()); return d; })() : new Date(Date.now() + 5 * 60 * 60 * 1000);

  const durationMs = Math.max(0, endTime.getTime() - pickupTime.getTime());
  const totalHoursCalc = Math.round(durationMs / (1000 * 60 * 60));
  const days = Math.floor(totalHoursCalc / 24);
  const hours = totalHoursCalc % 24;

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayHeaders = ['S','M','T','W','T','F','S'];

  const calendarData = React.useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cells: Array<{ day: number; date: Date; isAvailable: boolean; isPast: boolean; inRange: boolean; isStart: boolean; isEnd: boolean } | null> = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const isPast = dayStart < today;
      const isAvailable = !isPast;
      const ss = selectedStart ? new Date(selectedStart) : null; if (ss) ss.setHours(0,0,0,0);
      const se = selectedEnd ? new Date(selectedEnd) : null; if (se) se.setHours(0,0,0,0);
      const inRange = ss && se ? dayStart >= ss && dayStart <= se : false;
      const isStart = ss ? dayStart.getTime() === ss.getTime() : false;
      const isEnd = se ? dayStart.getTime() === se.getTime() : false;
      cells.push({ day: d, date, isAvailable, isPast, inRange, isStart, isEnd });
    }
    return cells;
  }, [calMonth, selectedStart, selectedEnd]);

  function handleDayPress(date: Date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    if (!selectedStart || (selectedStart && selectedEnd)) {
      setSelectedStart(d); setSelectedEnd(null);
    } else {
      if (d < selectedStart) setSelectedStart(d);
      else setSelectedEnd(d);
    }
  }

  // Show bottom card when pickup is set
  const showDetails = !!pickupCoords;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const region = location
    ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : DEFAULT_REGION;

  // ── Search ─────────────────────────────────────────────────────────────────
  const handleSearchText = useCallback((text: string) => {
    setPickupText(text);
    setDropPinFor(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setPredictions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(text, location ?? undefined);
        setPredictions(results);
      } catch { setPredictions([]); }
    }, 300);
  }, [location]);

  async function handleSelectPlace(p: PlacePrediction) {
    setPredictions([]);
    setDropPinFor(null);
    Keyboard.dismiss();
    try {
      const d = await getPlaceDetails(p.placeId);
      const coords = { latitude: d.latitude, longitude: d.longitude };
      setPickupText(p.mainText);
      setPickupCoords(coords);
      try { const geo = await reverseGeocode(coords.latitude, coords.longitude); setCity(geo.city || ''); } catch {}
      mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.015, longitudeDelta: 0.015 });
    } catch {}
  }

  function handleUseMyLocation() {
    if (location) {
      setPickupText(userAddress ?? 'My Location');
      setPickupCoords({ latitude: location.latitude, longitude: location.longitude });
      try { reverseGeocode(location.latitude, location.longitude).then(g => setCity(g.city || '')); } catch {}
    }
  }

  async function handleConfirmDropPin() {
    if (!mapCenter) return;
    try {
      const geo = await reverseGeocode(mapCenter.latitude, mapCenter.longitude);
      setPickupText(geo.formattedAddress || `${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`);
      setPickupCoords(mapCenter);
      setCity(geo.city || '');
    } catch {
      setPickupText(`${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`);
      setPickupCoords(mapCenter);
    }
    setDropPinFor(null);
  }

  // ── Price ──────────────────────────────────────────────────────────────────
  const totalHours = days * 24 + hours;
  const duration = Math.max(1, totalHours);
  const chauffeurCost = CHAUFFEUR_HOURLY * Math.max(1, totalHours);
  const totalPrice = chauffeurCost + DELIVERY_FEE;
  const durationText = days > 0 && hours > 0 ? `${days}d ${hours}h` : days > 0 ? `${days} day${days !== 1 ? 's' : ''}` : `${Math.max(1, hours)} hour${hours !== 1 ? 's' : ''}`;

  function handleFindVehicles() {
    Keyboard.dismiss();
    navigation.navigate('ChauffeurVehicleList' as never, {
      pickupCoords,
      pickupText,
      pickupTime: pickupTime.toISOString(),
      durationHours: duration,
      city,
      carType,
    } as never);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={getMapStyle()}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        onRegionChangeComplete={(r) => setMapCenter({ latitude: r.latitude, longitude: r.longitude })}
      >
        {pickupCoords && (
          <Marker coordinate={pickupCoords}>
            <View style={styles.pin}><View style={[styles.pinHead, { backgroundColor: '#FFFFFF' }]}><Text style={styles.pinIcon}>◆</Text></View><View style={[styles.pinNeedle, { backgroundColor: '#FFFFFF' }]} /></View>
          </Marker>
        )}
      </MapView>

      {/* Drop pin overlay */}
      {dropPinFor && (
        <>
          <View style={styles.dropPinOverlay} pointerEvents="none">
            <View style={{ alignItems: 'center', marginBottom: 46 }}>
              <View style={[styles.pinHead, { backgroundColor: '#FFFFFF' }]}><Text style={styles.pinIcon}>◆</Text></View>
              <View style={[styles.pinNeedle, { backgroundColor: '#FFFFFF' }]} />
            </View>
          </View>
          <SafeAreaView style={styles.dropPinUI} edges={['top', 'bottom']} pointerEvents="box-none">
            <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}>
              <TouchableOpacity onPress={() => setDropPinFor(null)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg }}>
              <TouchableOpacity style={styles.goldButton} onPress={handleConfirmDropPin}>
                <Text style={styles.goldButtonText}>CONFIRM LOCATION</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </>
      )}

      {/* Header + address input */}
      {!dropPinFor && (
        <SafeAreaView style={styles.headerOverlay} edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>CHAUFFEUR</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Pickup input */}
          <View style={styles.inputCard}>
            <View style={[styles.dot, { backgroundColor: '#FFFFFF' }]} />
            <TextInput style={styles.inputField} value={pickupText} onChangeText={handleSearchText}
              placeholder="Pickup address" placeholderTextColor={COLORS.gray} selectTextOnFocus />
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setPredictions([]); setDropPinFor('pickup'); }} style={styles.pinBtn}>
              <Text style={styles.pinBtnText}>PIN</Text>
            </TouchableOpacity>
            {!pickupText && (
              <TouchableOpacity onPress={handleUseMyLocation} style={styles.pinBtn}>
                <Text style={styles.pinBtnText}>GPS</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Predictions */}
          {predictions.length > 0 && (
            <View style={styles.predictions}>
              {predictions.map(p => (
                <TouchableOpacity key={p.placeId} style={styles.predRow} onPress={() => handleSelectPlace(p)}>
                  <Text style={styles.predPin}>▼</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.predMain} numberOfLines={1}>{p.mainText}</Text>
                    <Text style={styles.predSub} numberOfLines={1}>{p.secondaryText}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </SafeAreaView>
      )}

      {/* Bottom card */}
      {showDetails && !dropPinFor && (
        <View style={styles.bottomCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Calendar dropdown */}
            <Text style={styles.sectionLabel}>BOOKING PERIOD</Text>
            <TouchableOpacity style={styles.dateBox} onPress={() => setShowCalendar(!showCalendar)}>
              <Text style={styles.dateText}>
                {selectedStart && selectedEnd
                  ? `${selectedStart.toLocaleDateString()} — ${selectedEnd.toLocaleDateString()}  (${durationText})`
                  : selectedStart
                  ? `${selectedStart.toLocaleDateString()} — Select end date`
                  : 'Select dates'}
              </Text>
            </TouchableOpacity>

            {showCalendar && (
              <View style={styles.calDropdown}>
                <View style={styles.calMonthRow}>
                  <TouchableOpacity onPress={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}>
                    <Text style={styles.calArrow}>←</Text>
                  </TouchableOpacity>
                  <Text style={styles.calMonthTitle}>{monthNames[calMonth.getMonth()]} {calMonth.getFullYear()}</Text>
                  <TouchableOpacity onPress={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}>
                    <Text style={styles.calArrow}>→</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.calRow}>
                  {dayHeaders.map((d, i) => (
                    <View key={i} style={styles.calHeaderCell}><Text style={styles.calHeaderText}>{d}</Text></View>
                  ))}
                </View>
                <View style={styles.calGrid}>
                  {calendarData.map((cell, i) => {
                    if (!cell) return <View key={`e${i}`} style={styles.calCell} />;
                    const isSelected = cell.isStart || cell.isEnd;
                    return (
                      <TouchableOpacity key={cell.day} disabled={!cell.isAvailable}
                        style={[styles.calCell, cell.inRange && styles.calCellRange, isSelected && styles.calCellSelected, cell.isPast && { opacity: 0.3 }]}
                        onPress={() => handleDayPress(cell.date)} activeOpacity={0.7}>
                        <Text style={[styles.calDayText, isSelected && { color: COLORS.background }, cell.isPast && { color: COLORS.gray }]}>{cell.day}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedStart && (
                  <View style={{ marginTop: SPACING.sm }}>
                    <View style={styles.calTimeRow}>
                      <Text style={styles.calTimeLabel}>Pick-up</Text>
                      <TouchableOpacity style={styles.calTimeBtn} onPress={() => setShowPickupTime(!showPickupTime)}>
                        <Text style={styles.calTimeText}>{pickupTimeVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      </TouchableOpacity>
                    </View>
                    {showPickupTime && (
                      <DateTimePicker value={pickupTimeVal} mode="time" display="spinner" textColor={COLORS.textPrimary} themeVariant="dark"
                        onChange={(_, date) => { if (date) setPickupTimeVal(date); if (Platform.OS === 'android') setShowPickupTime(false); }} />
                    )}
                    {selectedEnd && (
                      <>
                        <View style={styles.calTimeRow}>
                          <Text style={styles.calTimeLabel}>Return</Text>
                          <TouchableOpacity style={styles.calTimeBtn} onPress={() => setShowReturnTime(!showReturnTime)}>
                            <Text style={styles.calTimeText}>{returnTimeVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                          </TouchableOpacity>
                        </View>
                        {showReturnTime && (
                          <DateTimePicker value={returnTimeVal} mode="time" display="spinner" textColor={COLORS.textPrimary} themeVariant="dark"
                            onChange={(_, date) => { if (date) setReturnTimeVal(date); if (Platform.OS === 'android') setShowReturnTime(false); }} />
                        )}
                        <Text style={styles.calDuration}>{durationText}</Text>
                        <TouchableOpacity style={styles.calConfirmBtn} onPress={() => setShowCalendar(false)}>
                          <Text style={styles.calConfirmText}>CONFIRM</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Duration display when calendar closed */}
            {!showCalendar && selectedStart && selectedEnd && (
              <Text style={styles.durationDisplay}>{durationText}</Text>
            )}

            {/* Car type */}
            <Text style={styles.sectionLabel}>VEHICLE TYPE</Text>
            <View style={styles.carTypeRow}>
              {(['sedan', 'suv', 'van'] as const).map(type => (
                <TouchableOpacity key={type} style={[styles.carTypeItem, carType === type && styles.carTypeItemActive]} onPress={() => setCarType(type)}>
                  <Text style={[styles.carTypeName, carType === type && styles.carTypeNameActive]}>
                    {type === 'sedan' ? 'Sedan' : type === 'suv' ? 'SUV' : 'Van'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Price breakdown */}
            <View style={styles.priceBlock}>
              <Text style={styles.priceLabel}>starting from</Text>
              <Text style={styles.priceValue}>${totalPrice}</Text>
              <View style={styles.priceBreakdown}>
                <Text style={styles.breakdownText}>Chauffeur: ${CHAUFFEUR_HOURLY}/hr × {durationText}</Text>
                <Text style={styles.breakdownText}>Delivery fee: ${DELIVERY_FEE}</Text>
                <Text style={styles.breakdownText}>+ ${PER_KM}/km distance</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.goldButton} onPress={handleFindVehicles}>
              <Text style={styles.goldButtonText}>FIND VEHICLES</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function getStyles() { return StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  // Pins
  pin: { alignItems: 'center' },
  pinHead: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  pinIcon: { fontSize: 14, color: '#000000' },
  pinNeedle: { width: 2, height: 14 },
  // Drop pin
  dropPinOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  dropPinUI: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', zIndex: 101, pointerEvents: 'box-none' },
  cancelText: { fontSize: 15, color: COLORS.textSecondary },
  // Header
  headerOverlay: { paddingHorizontal: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 22, color: COLORS.textPrimary },
  headerTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 3 },
  // Input
  inputCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, gap: SPACING.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  inputField: { flex: 1, fontSize: 15, color: COLORS.textPrimary, paddingVertical: 14 },
  pinBtn: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  pinBtnText: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1 },
  // Predictions
  predictions: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.xs },
  predRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight, gap: SPACING.sm },
  predPin: { fontSize: 16, color: COLORS.textPrimary },
  predMain: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  predSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  // Bottom card
  bottomCard: {
    position: 'absolute', bottom: 12, left: SPACING.md, right: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, maxHeight: '55%',
  },
  sectionLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 2, marginBottom: SPACING.xs, marginTop: SPACING.md },
  // Date & Time
  dateTimeRow: { flexDirection: 'row', gap: SPACING.sm },
  dateBox: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  dateText: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  pickerContainer: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, overflow: 'hidden', marginTop: SPACING.xs },
  confirmPickerBtn: { backgroundColor: '#d9c0a4', paddingVertical: SPACING.sm + 2, alignItems: 'center' },
  confirmPickerText: { fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 2 },
  // Toggle
  durationDisplay: { fontSize: 26, fontWeight: '700', color: '#d9c0a4', textAlign: 'center', marginBottom: SPACING.xs },
  calDropdown: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginTop: SPACING.xs },
  calMonthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  calArrow: { fontSize: 20, color: COLORS.textPrimary, padding: SPACING.xs },
  calMonthTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  calRow: { flexDirection: 'row', marginBottom: 4 },
  calHeaderCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  calHeaderText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  calCellRange: { backgroundColor: COLORS.grayLight },
  calCellSelected: { backgroundColor: COLORS.textPrimary },
  calDayText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  calTimeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  calTimeLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 1 },
  calTimeBtn: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 8 },
  calTimeText: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  calDuration: { fontSize: 20, fontWeight: '700', color: '#d9c0a4', textAlign: 'center', marginTop: SPACING.sm },
  calConfirmBtn: { backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.sm + 2, alignItems: 'center', marginTop: SPACING.sm },
  calConfirmText: { fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 2 },
  sliderSubLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 2 },
  toggleRow: { flexDirection: 'row', gap: SPACING.sm },
  toggleBtn: { flex: 1, paddingVertical: SPACING.sm + 2, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#d9c0a4', borderColor: '#d9c0a4' },
  toggleText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  toggleTextActive: { color: '#000000' },
  // Slider
  sliderBlock: { marginTop: SPACING.sm },
  sliderValue: { fontSize: 22, fontWeight: '700', color: '#d9c0a4', textAlign: 'center' },
  slider: { width: '100%', height: 40 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: { fontSize: 11, color: COLORS.textSecondary },
  // Car type
  carTypeRow: { flexDirection: 'row', gap: SPACING.sm },
  carTypeItem: { flex: 1, paddingVertical: SPACING.sm + 2, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, alignItems: 'center' },
  carTypeItemActive: { borderColor: '#d9c0a4', backgroundColor: COLORS.grayLight },
  carTypeName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  carTypeNameActive: { color: '#d9c0a4' },
  // Price
  priceBlock: { alignItems: 'center', marginVertical: SPACING.md },
  priceLabel: { fontSize: 11, color: COLORS.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  priceValue: { fontSize: 32, fontWeight: '700', color: '#d9c0a4', marginTop: 2 },
  priceBreakdown: { marginTop: SPACING.xs, alignItems: 'center' },
  breakdownText: { fontSize: 11, color: COLORS.textSecondary },
  // CTA
  goldButton: { backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  goldButtonText: { fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 3 },
}); }
