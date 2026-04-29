import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLocation } from '../../hooks/useLocation';
import { searchPlaces, getPlaceDetails, reverseGeocode, PlacePrediction, LatLng } from '../../api/maps';
import { requestChauffeurTrip } from '../../api/chauffeurTrips';
import { CarType, CAR_LABELS, CAR_CAPACITY, BASE_RATE_PER_KM, WAITING_RATE_PER_MIN } from '../../utils/chauffeurPricing';
import { useAuthStore } from '../../store/authStore';
import { COLORS, SPACING, BORDER_RADIUS, DEFAULT_REGION } from '../../utils/constants';
import { darkMapStyle } from '../../themes/mapStyles';
import { useT } from '../../utils/i18n';
import { CustomerStackParamList } from '../../navigation/MainNavigator';

type ViewMode = 'search' | 'select';

type Props = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'ChauffeurSearch'>;
};

const CURRENCY_SYMBOL = '$';

export function ChauffeurSearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const st = getStyles(insets.top);
  const t = useT();
  const { user } = useAuthStore();
  const { location, address: userAddress } = useLocation();
  const mapRef = useRef<MapView>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('search');
  const [pickupText, setPickupText] = useState('');
  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [dropPin, setDropPin] = useState(false);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);

  const [carType, setCarType] = useState<CarType | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [tempDate, setTempDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [requesting, setRequesting] = useState(false);

  const region = location
    ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : DEFAULT_REGION;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchText = useCallback((text: string) => {
    setPickupText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setPredictions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try { setPredictions(await searchPlaces(text, location ?? undefined)); } catch { setPredictions([]); }
    }, 300);
  }, [location]);

  async function handleSelectPlace(p: PlacePrediction) {
    setPredictions([]);
    Keyboard.dismiss();
    try {
      const d = await getPlaceDetails(p.placeId);
      const coords = { latitude: d.latitude, longitude: d.longitude };
      setPickupText(p.mainText);
      setPickupCoords(coords);
      mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02 });
      setViewMode('select');
    } catch {}
  }

  function handleUseMyLocation() {
    if (!location) return;
    setPickupCoords({ latitude: location.latitude, longitude: location.longitude });
    setPickupText(userAddress ?? 'My Location');
    setViewMode('select');
  }

  function handleDropPin() {
    Keyboard.dismiss();
    setPredictions([]);
    setDropPin(true);
  }

  async function handleConfirmDropPin() {
    if (!mapCenter) return;
    try {
      const geo = await reverseGeocode(mapCenter.latitude, mapCenter.longitude);
      const addr = geo.formattedAddress || `${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`;
      setPickupCoords(mapCenter);
      setPickupText(addr);
    } catch {
      setPickupCoords(mapCenter);
      setPickupText(`${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`);
    }
    setDropPin(false);
    setViewMode('select');
  }

  async function handleRequest() {
    if (!pickupCoords || !carType) return;
    if (scheduled && scheduleDate.getTime() < Date.now() + 5 * 60_000) {
      Alert.alert('Schedule', 'Scheduled time must be at least 5 minutes from now.');
      return;
    }
    setRequesting(true);
    try {
      await requestChauffeurTrip({
        carType,
        pickup: { address: pickupText, latitude: pickupCoords.latitude, longitude: pickupCoords.longitude },
        scheduledAt: scheduled ? scheduleDate.getTime() : undefined,
      });
      setRequesting(false);
      (navigation as any).replace('ChauffeurActive');
    } catch (err: unknown) {
      setRequesting(false);
      Alert.alert('Request Failed', err instanceof Error ? err.message : 'Could not request chauffeur');
    }
  }

  return (
    <View style={st.container}>
      <MapView
        ref={mapRef}
        style={st.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={darkMapStyle}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        loadingEnabled
        loadingBackgroundColor="#000000"
        loadingIndicatorColor="#d9c0a4"
        onRegionChangeComplete={r => setMapCenter({ latitude: r.latitude, longitude: r.longitude })}
      >
        {pickupCoords && !dropPin && (
          <Marker coordinate={pickupCoords} anchor={{ x: 0.5, y: 1 }}>
            <View style={st.mapAddrCard}>
              <Text style={st.mapAddrText} numberOfLines={1}>{pickupText || 'Pickup'}</Text>
            </View>
            <View style={st.pin}>
              <View style={[st.pinHead, { backgroundColor: '#d9c0a4' }]}>
                <Text style={{ fontSize: 14, color: '#000000', fontWeight: '700' }}>✦</Text>
              </View>
              <View style={st.pinNeedle} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Back button — single absolute element */}
      <TouchableOpacity
        style={st.backBtnAbsolute}
        onPress={() => {
          if (dropPin) { setDropPin(false); return; }
          if (viewMode === 'select') { setViewMode('search'); return; }
          navigation.goBack();
        }}
      >
        <Text style={st.backText}>←</Text>
      </TouchableOpacity>

      {/* Drop-pin overlay */}
      {dropPin && (<>
        <View style={st.dropOverlay} pointerEvents="none">
          <View style={{ alignItems: 'center', marginBottom: 46 }}>
            <View style={[st.pinHead, { backgroundColor: '#d9c0a4' }]}>
              <Text style={{ fontSize: 14, color: '#000000', fontWeight: '700' }}>✦</Text>
            </View>
            <View style={st.pinNeedle} />
          </View>
        </View>
        <SafeAreaView style={st.dropBottomWrap} edges={['bottom']} pointerEvents="box-none">
          <View style={st.dropBottomBar}>
            <TouchableOpacity style={st.confirmBtn} onPress={handleConfirmDropPin} activeOpacity={0.85}>
              <Text style={st.confirmBtnText}>{t('home.confirm_location')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>)}

      {/* Search */}
      {viewMode === 'search' && !dropPin && (
        <SafeAreaView style={st.headerOverlay} edges={['top']}>
          <View style={{ height: 40, marginBottom: SPACING.sm }} />
          <View style={st.inputCard}>
            <Text style={st.pickupLabel}>PICKUP</Text>
            <View style={st.inputRow}>
              <TextInput
                style={st.inputField}
                value={pickupText}
                onChangeText={handleSearchText}
                placeholder={t('chauffeur.where_pickup')}
                placeholderTextColor={COLORS.gray}
                autoFocus
              />
              <TouchableOpacity onPress={handleDropPin} style={st.pinBtn}>
                <Text style={st.pinBtnText}>PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
          {location && (
            <TouchableOpacity style={st.myLocBtn} onPress={handleUseMyLocation}>
              <Text style={st.myLocIcon}>◎</Text>
              <Text style={st.myLocText}>{t('home.use_my_location')}</Text>
            </TouchableOpacity>
          )}
          {predictions.length > 0 && (
            <View style={st.preds}>
              {predictions.map(p => (
                <TouchableOpacity key={p.placeId} style={st.predRow} onPress={() => handleSelectPlace(p)}>
                  <Text style={st.predMain} numberOfLines={1}>{p.mainText}</Text>
                  <Text style={st.predSub} numberOfLines={1}>{p.secondaryText}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </SafeAreaView>
      )}

      {/* Select */}
      {viewMode === 'select' && !dropPin && (
        <SafeAreaView style={st.headerOverlay} edges={['top']}>
          <View style={{ height: 40, marginBottom: SPACING.sm }} />
          <View style={st.pickupPill}>
            <Text style={st.pickupPillLabel}>PICKUP</Text>
            <Text style={st.pickupPillText} numberOfLines={1}>{pickupText}</Text>
          </View>
        </SafeAreaView>
      )}

      {viewMode === 'select' && !dropPin && (
        <View style={st.bottomCard}>
          <View style={st.carRow}>
            {(['sedan', 'suv', 'van'] as const).map(c => (
              <TouchableOpacity
                key={c}
                style={[st.carItem, carType === c && st.carItemActive]}
                onPress={() => setCarType(c)}
              >
                <Text style={[st.carIcon, carType === c && st.carIconActive]}>
                  {c === 'sedan' ? '◆' : c === 'suv' ? '◆◆' : '◆◆◆'}
                </Text>
                <Text style={[st.carLabel, carType === c && st.carLabelActive]}>{t(`car.${c}`)}</Text>
                <Text style={[st.carSub, carType === c && st.carSubActive]}>{CAR_CAPACITY[c]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.rateHint}>
            {CURRENCY_SYMBOL}{BASE_RATE_PER_KM}/km · {CURRENCY_SYMBOL}{WAITING_RATE_PER_MIN.toFixed(2)}/min while stopped
          </Text>

          {scheduled && (
            <>
              <View style={st.scheduleDateRow}>
                <TouchableOpacity style={st.scheduleDateBox} onPress={() => { setTempDate(scheduleDate); setPickerMode('date'); setShowPicker(true); }}>
                  <Text style={st.scheduleDateText}>{scheduleDate.toLocaleDateString()}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.scheduleDateBox} onPress={() => { setTempDate(scheduleDate); setPickerMode('time'); setShowPicker(true); }}>
                  <Text style={st.scheduleDateText}>{scheduleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.scheduleClearBtn} onPress={() => setScheduled(false)}>
                  <Text style={st.scheduleClearText}>✕</Text>
                </TouchableOpacity>
              </View>
              {showPicker && (
                <View style={st.pickerContainer}>
                  <DateTimePicker
                    value={tempDate}
                    mode={pickerMode}
                    minimumDate={new Date()}
                    display="spinner"
                    textColor="#FFFFFF"
                    themeVariant="dark"
                    style={{ height: 150 }}
                    onChange={(_, date) => { if (date) setTempDate(date); }}
                  />
                  <TouchableOpacity style={st.confirmPickerBtn} onPress={() => { setScheduleDate(tempDate); setShowPicker(false); }}>
                    <Text style={st.confirmPickerText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          <View style={st.requestRow}>
            <TouchableOpacity
              style={[st.primaryBtn, (!carType || requesting) && st.primaryBtnDisabled]}
              onPress={handleRequest}
              disabled={!carType || requesting}
            >
              <Text style={st.primaryBtnText}>
                {requesting ? t('chauffeur.requesting') :
                 !carType ? t('chauffeur.select_car') :
                 scheduled ? `${t('chauffeur.schedule_car')} ${t(`car.${carType}`)}` : `${t('chauffeur.request_car')} ${t(`car.${carType}`)}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.clockBtn, scheduled && st.clockBtnActive]}
              onPress={() => { const next = !scheduled; setScheduled(next); if (!next) setShowPicker(false); }}
            >
              <Text style={[st.clockIcon, scheduled && { color: '#000000' }]}>◷</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function getStyles(topInset: number = 0) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  map: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  pin: { alignItems: 'center' },
  pinHead: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  pinNeedle: { width: 3, height: 16, backgroundColor: '#d9c0a4' },
  dropOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  dropUI: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', zIndex: 101 },
  dropTopBar: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingHorizontal: SPACING.md, paddingTop: 0 },
  dropBottomWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 101 },
  dropBottomBar: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  confirmBtn: { backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#000000', letterSpacing: 2 },
  headerOverlay: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  idleHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 22, fontWeight: '600', color: '#d9c0a4' },
  greetingRow: { flex: 1, backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2, alignItems: 'center', justifyContent: 'center' },
  greetingText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.5 },
  greetingSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, letterSpacing: 0.3 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 14, gap: 12 },
  searchIcon: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '700' },
  searchPlaceholder: { fontSize: 15, color: COLORS.textSecondary, flex: 1, letterSpacing: 0.3 },
  resumeBanner: { marginTop: SPACING.sm, backgroundColor: COLORS.textPrimary, borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 14, alignItems: 'center' },
  resumeText: { color: COLORS.background, fontWeight: '800', fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  backBtnAbsolute: { position: 'absolute', top: topInset, left: SPACING.md, width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', zIndex: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  backText: { fontSize: 22, fontWeight: '600', color: '#d9c0a4' },
  inputCard: { backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  pickupLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 2, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputField: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  pinBtn: { paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.textSecondary, borderRadius: 4 },
  pinBtnText: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5 },
  myLocBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.md + 2, paddingHorizontal: 14, paddingVertical: 12, marginTop: SPACING.sm, gap: 10 },
  myLocIcon: { fontSize: 16, color: COLORS.textSecondary },
  myLocText: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '600' },
  preds: { backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg, marginTop: 4 },
  predRow: { paddingVertical: 12, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  predMain: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  predSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  mapAddrCard: { backgroundColor: COLORS.grayLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4, maxWidth: 160, alignSelf: 'center' },
  mapAddrText: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },
  pickupPill: { backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg, paddingHorizontal: 14, paddingVertical: 10 },
  pickupPillLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 2 },
  pickupPillText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginTop: 2 },
  bottomCard: { position: 'absolute', bottom: 12, left: SPACING.md, right: SPACING.md, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md },
  carRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  carItem: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.sm, alignItems: 'center', gap: 2 },
  carItemActive: { borderColor: '#d9c0a4', backgroundColor: COLORS.grayLight },
  carIcon: { fontSize: 10, color: COLORS.textSecondary, letterSpacing: -2 },
  carIconActive: { color: '#d9c0a4' },
  carLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  carLabelActive: { color: '#d9c0a4' },
  carSub: { fontSize: 11, color: COLORS.textSecondary },
  carSubActive: { color: COLORS.textPrimary },
  rateHint: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.sm, letterSpacing: 0.5 },
  scheduleDateRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm, alignItems: 'center' },
  scheduleDateBox: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingVertical: 10, alignItems: 'center' },
  scheduleDateText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  scheduleClearBtn: { width: 40, justifyContent: 'center', alignItems: 'center' },
  scheduleClearText: { fontSize: 16, color: COLORS.textSecondary, padding: 4 },
  pickerContainer: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, overflow: 'hidden', marginBottom: SPACING.sm, backgroundColor: '#000000' },
  confirmPickerBtn: { backgroundColor: '#d9c0a4', paddingVertical: SPACING.sm, alignItems: 'center' },
  confirmPickerText: { fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 2 },
  requestRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  primaryBtn: { flex: 1, backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#000000', fontWeight: '700', fontSize: 15, letterSpacing: 1 },
  clockBtn: { width: 52, height: 52, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  clockBtnActive: { backgroundColor: '#d9c0a4', borderColor: '#d9c0a4' },
  clockIcon: { fontSize: 22, color: COLORS.textSecondary },
}); }
