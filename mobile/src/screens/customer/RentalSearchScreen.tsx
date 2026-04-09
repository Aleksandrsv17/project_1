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
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'RentalSearch'>;
};

export function RentalSearchScreen({ navigation }: Props) {
  const styles = getStyles();
  const { location } = useLocation();
  const [step, setStep] = useState(0);

  const [region, setRegion] = useState('');
  const [startDate, setStartDate] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 26 * 60 * 60 * 1000)); // +1 day
  const [dropoffText, setDropoffText] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<LatLng | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDropoffSearch = useCallback((text: string) => {
    setDropoffText(text);
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
      setDropoffText(p.mainText);
      setDropoffCoords({ latitude: d.latitude, longitude: d.longitude });
    } catch {}
  }

  const durationHours = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)));
  const durationText = durationHours >= 24 ? `${Math.round(durationHours / 24)} day${Math.round(durationHours / 24) !== 1 ? 's' : ''}` : `${durationHours} hours`;

  function handleFindRentals() {
    if (startDate < new Date()) { Alert.alert('Invalid Date', 'Start date cannot be in the past.'); return; }
    if (endDate <= startDate) { Alert.alert('Invalid Dates', 'End date must be after start date.'); return; }
    navigation.navigate('VehicleList', { city: region } as never);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step === 0 ? navigation.goBack() : setStep(0)} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rent a Car</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        {step === 1 && (
          <>
            <View style={styles.selectedRegion}>
              <Text style={styles.selectedRegionLabel}>Region</Text>
              <TouchableOpacity onPress={() => setStep(0)}>
                <Text style={styles.selectedRegionValue}>{region} ›</Text>
              </TouchableOpacity>
            </View>

            {/* Start Date */}
            <Text style={styles.fieldLabel}>Rental Start</Text>
            <TouchableOpacity style={styles.timeBox} onPress={() => setShowStartPicker(true)}>
              <Text style={styles.timeIcon}>□</Text>
              <Text style={styles.timeText}>
                {startDate.toLocaleDateString()} at {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.timeChange}>Change</Text>
            </TouchableOpacity>
            {showStartPicker && (
              <DateTimePicker
                value={startDate}
                mode="datetime"
                minimumDate={new Date()}
                onChange={(_, date) => { setShowStartPicker(Platform.OS === 'android' ? false : true); if (date) setStartDate(date); }}
              />
            )}

            {/* End Date */}
            <Text style={styles.fieldLabel}>Rental End</Text>
            <TouchableOpacity style={styles.timeBox} onPress={() => setShowEndPicker(true)}>
              <Text style={styles.timeIcon}>□</Text>
              <Text style={styles.timeText}>
                {endDate.toLocaleDateString()} at {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.timeChange}>Change</Text>
            </TouchableOpacity>
            {showEndPicker && (
              <DateTimePicker
                value={endDate}
                mode="datetime"
                minimumDate={startDate}
                onChange={(_, date) => { setShowEndPicker(Platform.OS === 'android' ? false : true); if (date) setEndDate(date); }}
              />
            )}

            {/* Duration summary */}
            <View style={styles.durationBox}>
              <Text style={styles.durationIcon}>◔</Text>
              <Text style={styles.durationText}>Duration: {durationText}</Text>
            </View>

            {/* Drop-off location */}
            <Text style={styles.fieldLabel}>Drop-off Location</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputIcon}>▼</Text>
              <TextInput
                style={styles.input}
                value={dropoffText}
                onChangeText={handleDropoffSearch}
                placeholder="Where will you return the car?"
                placeholderTextColor={COLORS.gray}
              />
            </View>

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

            {/* Find button */}
            <TouchableOpacity style={styles.findButton} onPress={handleFindRentals}>
              <Text style={styles.findButtonText}>Browse Rentals in {region}</Text>
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
  regionChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.grayLight },
  regionText: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  regionTextActive: { color: COLORS.textPrimary },
  selectedRegion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  selectedRegionLabel: { fontSize: 12, color: COLORS.gray },
  selectedRegionValue: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SPACING.xs, marginTop: SPACING.md },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  inputIcon: { fontSize: 16, color: COLORS.textPrimary },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary, paddingVertical: 12 },
  predictions: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.xs, borderWidth: 1, borderColor: COLORS.border },
  predRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight, gap: SPACING.sm },
  predPin: { fontSize: 14, color: COLORS.textPrimary },
  predMain: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  predSub: { fontSize: 12, color: COLORS.textSecondary },
  timeBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  timeIcon: { fontSize: 16, color: COLORS.textPrimary },
  timeText: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  timeChange: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '600' },
  durationBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm, gap: SPACING.sm },
  durationIcon: { fontSize: 14, color: COLORS.textPrimary },
  durationText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  findButton: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.lg },
  findButtonText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 16 },
}); }
