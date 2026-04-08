import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  FlatList,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { searchPlaces, getPlaceDetails, PlacePrediction, LatLng } from '../../api/maps';
import { useLocation } from '../../hooks/useLocation';
import { COLORS, SPACING, BORDER_RADIUS, REGIONS } from '../../utils/constants';
import { CustomerStackParamList } from '../../navigation/CustomerNavigator';

type Props = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'ChauffeurSearch'>;
};

export function ChauffeurSearchScreen({ navigation }: Props) {
  const styles = getStyles();
  const { location } = useLocation();
  const [step, setStep] = useState(0); // 0: region, 1: details

  // Selections
  const [region, setRegion] = useState('');
  const [pickupText, setPickupText] = useState('');
  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [dropoffText, setDropoffText] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<LatLng | null>(null);
  const [pickupTime, setPickupTime] = useState(new Date(Date.now() + 60 * 60 * 1000)); // +1h
  const [approxHours, setApproxHours] = useState(3);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Search
  const [activeField, setActiveField] = useState<'pickup' | 'dropoff'>('pickup');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((text: string, field: 'pickup' | 'dropoff') => {
    if (field === 'pickup') setPickupText(text);
    else setDropoffText(text);
    setActiveField(field);

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
    Keyboard.dismiss();
    try {
      const d = await getPlaceDetails(p.placeId);
      const coords = { latitude: d.latitude, longitude: d.longitude };
      if (activeField === 'pickup') { setPickupText(p.mainText); setPickupCoords(coords); }
      else { setDropoffText(p.mainText); setDropoffCoords(coords); }
    } catch {}
  }

  function handleFindChauffeurs() {
    if (!pickupText.trim()) { Alert.alert('Required', 'Please enter a pickup location.'); return; }
    navigation.navigate('VehicleList', { chauffeurAvailable: true, city: region } as never);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step === 0 ? navigation.goBack() : setStep(0)} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book a Chauffeur</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Step 0: Region */}
        {step === 0 && (
          <>
            <Text style={styles.sectionTitle}>Select Region</Text>
            <View style={styles.regionGrid}>
              {REGIONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.regionChip, region === r && styles.regionChipActive]}
                  onPress={() => { setRegion(r); setStep(1); }}
                >
                  <Text style={[styles.regionText, region === r && styles.regionTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Step 1: Details */}
        {step === 1 && (
          <>
            <View style={styles.selectedRegion}>
              <Text style={styles.selectedRegionLabel}>Region</Text>
              <TouchableOpacity onPress={() => setStep(0)}>
                <Text style={styles.selectedRegionValue}>{region} ›</Text>
              </TouchableOpacity>
            </View>

            {/* Pickup */}
            <Text style={styles.fieldLabel}>Pickup Point *</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputIcon}>📍</Text>
              <TextInput
                style={styles.input}
                value={pickupText}
                onChangeText={t => handleSearch(t, 'pickup')}
                placeholder="Enter pickup address..."
                placeholderTextColor={COLORS.gray}
                onFocus={() => setActiveField('pickup')}
              />
            </View>

            {/* Dropoff (optional) */}
            <Text style={styles.fieldLabel}>Drop-off Point (optional)</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputIcon}>🏁</Text>
              <TextInput
                style={styles.input}
                value={dropoffText}
                onChangeText={t => handleSearch(t, 'dropoff')}
                placeholder="Enter drop-off address..."
                placeholderTextColor={COLORS.gray}
                onFocus={() => setActiveField('dropoff')}
              />
            </View>

            {/* Predictions */}
            {predictions.length > 0 && (
              <View style={styles.predictions}>
                {predictions.map(p => (
                  <TouchableOpacity key={p.placeId} style={styles.predRow} onPress={() => handleSelectPlace(p)}>
                    <Text style={styles.predPin}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.predMain} numberOfLines={1}>{p.mainText}</Text>
                      <Text style={styles.predSub} numberOfLines={1}>{p.secondaryText}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Pickup Time */}
            <Text style={styles.fieldLabel}>Pickup Time</Text>
            <TouchableOpacity style={styles.timeBox} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.timeIcon}>🕐</Text>
              <Text style={styles.timeText}>
                {pickupTime.toLocaleDateString()} at {pickupTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.timeChange}>Change</Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={pickupTime}
                mode="datetime"
                minimumDate={new Date()}
                onChange={(_, date) => { setShowTimePicker(Platform.OS === 'android' ? false : true); if (date) setPickupTime(date); }}
              />
            )}

            {/* Approx Duration */}
            <Text style={styles.fieldLabel}>Approximate Duration</Text>
            <View style={styles.durationRow}>
              {[2, 3, 4, 6, 8, 12].map(h => (
                <TouchableOpacity
                  key={h}
                  style={[styles.durChip, approxHours === h && styles.durChipActive]}
                  onPress={() => setApproxHours(h)}
                >
                  <Text style={[styles.durText, approxHours === h && styles.durTextActive]}>{h}h</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Find button */}
            <TouchableOpacity style={styles.findButton} onPress={handleFindChauffeurs}>
              <Text style={styles.findButtonText}>Find Chauffeurs in {region}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: SPACING.xs },
  backText: { fontSize: 22, color: COLORS.textPrimary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  content: { padding: SPACING.md, paddingBottom: 100 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: SPACING.md },
  regionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  regionChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.white, borderWidth: 2, borderColor: COLORS.border, minWidth: '45%', alignItems: 'center' },
  regionChipActive: { borderColor: COLORS.accent, backgroundColor: '#fefce8' },
  regionText: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  regionTextActive: { color: COLORS.accent },
  selectedRegion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  selectedRegionLabel: { fontSize: 12, color: COLORS.gray },
  selectedRegionValue: { fontSize: 16, fontWeight: '700', color: COLORS.accent },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SPACING.xs, marginTop: SPACING.md },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  inputIcon: { fontSize: 16 },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary, paddingVertical: 12 },
  predictions: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.xs, borderWidth: 1, borderColor: COLORS.border },
  predRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight, gap: SPACING.sm },
  predPin: { fontSize: 14 },
  predMain: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  predSub: { fontSize: 12, color: COLORS.textSecondary },
  timeBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  timeIcon: { fontSize: 16 },
  timeText: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  timeChange: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  durChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  durChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  durText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  durTextActive: { color: COLORS.accent },
  findButton: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.lg },
  findButtonText: { color: COLORS.accent, fontWeight: '700', fontSize: 16 },
}); }
