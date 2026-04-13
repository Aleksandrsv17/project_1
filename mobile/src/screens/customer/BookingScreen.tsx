import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useBookingStore } from '../../store/bookingStore';
import { useVehicle } from '../../hooks/useVehicles';
import { useCreateBooking } from '../../hooks/useBookings';
import { useLocation } from '../../hooks/useLocation';
import { createPaymentIntent } from '../../api/payments';
import { PriceBreakdown } from '../../components/PriceBreakdown';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { PlacesAutocomplete } from '../../components/PlacesAutocomplete';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { calculateBookingTotal, formatDateTime, formatDuration } from '../../utils/formatters';
import { differenceInHours, addHours, addDays } from 'date-fns';
import { CustomerStackParamList } from '../../navigation/CustomerNavigator';

type BookingScreenProps = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'Booking'>;
  route: RouteProp<CustomerStackParamList, 'Booking'>;
};

const DURATION_PRESETS = [
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: '8h', hours: 8 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];

export function BookingScreen({ navigation, route }: BookingScreenProps) {
  const styles = getStyles();
  const { vehicleId } = route.params;
  const { bookingDraft, updateBookingDraft, setPaymentClientSecret } = useBookingStore();
  const { data: vehicle, isLoading: vehicleLoading } = useVehicle(vehicleId);
  const createBookingMutation = useCreateBooking();

  const [startTime, setStartTime] = useState(bookingDraft?.startTime ?? new Date());
  const [endTime, setEndTime] = useState(bookingDraft?.endTime ?? addHours(new Date(), 3));
  const [mode, setMode] = useState<'self_drive' | 'chauffeur'>(bookingDraft?.mode ?? 'self_drive');
  const [pickupAddress, setPickupAddress] = useState(bookingDraft?.pickupAddress ?? '');
  const [dropoffAddress, setDropoffAddress] = useState(bookingDraft?.dropoffAddress ?? '');
  const [pickupCoords, setPickupCoords] = useState<{ latitude: number; longitude: number } | null>(
    bookingDraft?.pickupLatitude
      ? { latitude: bookingDraft.pickupLatitude, longitude: bookingDraft.pickupLongitude! }
      : null
  );
  const [dropoffCoords, setDropoffCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notes, setNotes] = useState(bookingDraft?.notes ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { location: userLocation } = useLocation();

  const durationHours = Math.max(1, differenceInHours(endTime, startTime));
  const [sliderDays, setSliderDays] = useState(Math.floor(durationHours / 24));
  const [sliderHours, setSliderHours] = useState(durationHours % 24 || (durationHours < 24 ? durationHours : 0));

  const durationText = sliderDays > 0 && sliderHours > 0
    ? `${sliderDays}d ${sliderHours}h`
    : sliderDays > 0
    ? `${sliderDays} day${sliderDays !== 1 ? 's' : ''}`
    : `${Math.max(1, sliderHours)} hour${sliderHours !== 1 ? 's' : ''}`;

  const pricing = vehicle
    ? calculateBookingTotal(
        vehicle.pricePerHour,
        durationHours,
        mode === 'chauffeur' ? vehicle.chauffeurFeePerHour * durationHours : 0
      )
    : null;

  function handleSliderChange(newDays: number, newHours: number) {
    // Bug 17: Ensure minimum booking of 1 hour when both sliders are at 0
    if (newDays === 0 && newHours === 0) {
      newHours = 1;
    }
    setSliderDays(newDays);
    setSliderHours(newHours);
    const totalH = newDays * 24 + Math.max(newDays === 0 ? 1 : 0, newHours);
    setEndTime(addHours(startTime, totalH));
  }

  function adjustStartTime(direction: 1 | -1) {
    const newStart = addHours(startTime, direction);
    setStartTime(newStart);
    // Keep duration constant
    setEndTime(addHours(newStart, durationHours));
  }

  async function handleProceedToPayment() {
    if (!vehicle || !pricing) return;

    if (!pickupAddress.trim()) {
      Alert.alert('Pickup Required', 'Please enter a pickup address.');
      return;
    }

    if (durationHours < 1) {
      Alert.alert('Invalid Duration', 'Booking must be at least 1 hour.');
      return;
    }

    setIsSubmitting(true);
    try {
      const booking = await createBookingMutation.mutateAsync({
        vehicleId: vehicle.id,
        mode,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        pickupLocation: {
          latitude: pickupCoords?.latitude ?? bookingDraft?.pickupLatitude ?? vehicle.location.latitude,
          longitude: pickupCoords?.longitude ?? bookingDraft?.pickupLongitude ?? vehicle.location.longitude,
          address: pickupAddress,
        },
        dropoffLocation: dropoffAddress.trim()
          ? {
              latitude: dropoffCoords?.latitude ?? vehicle.location.latitude,
              longitude: dropoffCoords?.longitude ?? vehicle.location.longitude,
              address: dropoffAddress,
            }
          : undefined,
        notes: notes.trim() || undefined,
      });

      Alert.alert(
        'Request Sent',
        'Your booking request has been sent to the vehicle owner. You will be notified once they approve.',
        [
          { text: 'View My Bookings', onPress: () => navigation.navigate('BookingHistory') },
          { text: 'OK', onPress: () => navigation.goBack() },
        ]
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send request. Please try again.';
      Alert.alert('Booking Failed', message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (vehicleLoading) return <LoadingSpinner fullScreen message="Loading vehicle info..." />;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Vehicle</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Vehicle Summary */}
        {vehicle && (
          <View style={styles.vehicleSummary}>
            <Text style={styles.vehicleTitle}>
              {vehicle.year} {vehicle.make} {vehicle.model}
            </Text>
            <Text style={styles.vehicleLocation}>{vehicle.location.city}</Text>
          </View>
        )}

        {/* Mode Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Mode</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'self_drive' && styles.modeButtonActive]}
              onPress={() => setMode('self_drive')}
            >
              <Text style={styles.modeButtonIcon}>—</Text>
              <Text style={[styles.modeButtonText, mode === 'self_drive' && styles.modeButtonTextActive]}>
                Self Drive
              </Text>
            </TouchableOpacity>
            {vehicle?.chauffeurAvailable && (
              <TouchableOpacity
                style={[styles.modeButton, mode === 'chauffeur' && styles.modeButtonActive]}
                onPress={() => setMode('chauffeur')}
              >
                <Text style={styles.modeButtonIcon}>∧</Text>
                <Text style={[styles.modeButtonText, mode === 'chauffeur' && styles.modeButtonTextActive]}>
                  Chauffeur
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Start Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pick-up Time</Text>
          <View style={styles.timeControl}>
            <TouchableOpacity style={styles.timeAdjustButton} onPress={() => adjustStartTime(-1)}>
              <Text style={styles.timeAdjustIcon}>−</Text>
            </TouchableOpacity>
            <View style={styles.timeDisplay}>
              <Text style={styles.timeValue}>{formatDateTime(startTime)}</Text>
            </View>
            <TouchableOpacity style={styles.timeAdjustButton} onPress={() => adjustStartTime(1)}>
              <Text style={styles.timeAdjustIcon}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Duration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Duration</Text>
          <Text style={styles.durationDisplay}>{durationText}</Text>

          <Text style={styles.sliderSubLabel}>Days</Text>
          <Slider
            style={styles.slider}
            minimumValue={0} maximumValue={10} step={1} value={sliderDays}
            onValueChange={(v: number) => handleSliderChange(v, sliderHours)}
            minimumTrackTintColor="#d9c0a4" maximumTrackTintColor={COLORS.border}
            thumbTintColor="#d9c0a4"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>0</Text>
            <Text style={styles.sliderLabel}>10</Text>
          </View>

          <Text style={styles.sliderSubLabel}>Hours</Text>
          <Slider
            style={styles.slider}
            minimumValue={0} maximumValue={23} step={1} value={sliderHours}
            onValueChange={(v: number) => handleSliderChange(sliderDays, v)}
            minimumTrackTintColor="#d9c0a4" maximumTrackTintColor={COLORS.border}
            thumbTintColor="#d9c0a4"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>0</Text>
            <Text style={styles.sliderLabel}>23</Text>
          </View>

          <View style={styles.durationSummary}>
            <Text style={styles.durationSummaryText}>
              Return: {formatDateTime(endTime)}
            </Text>
          </View>
        </View>

        {/* Pickup & Dropoff Addresses (set by vehicle owner) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pickup Location</Text>
          <View style={styles.addressInfoBox}>
            <Text style={styles.addressInfoIcon}>▼</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.addressInfoText}>
                {vehicle.pickupAddress
                  ? vehicle.location.city + ' area'
                  : vehicle.location.address || vehicle.location.city}
              </Text>
              <Text style={styles.addressInfoHint}>Full address provided after owner approval</Text>
            </View>
          </View>
        </View>

        {(vehicle.dropoffAddress || vehicle.pickupAddress) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Drop-off Location</Text>
            <View style={styles.addressInfoBox}>
              <Text style={[styles.addressInfoIcon, { color: '#EF4444' }]}>▼</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.addressInfoText}>
                  {vehicle.dropoffAddress
                    ? vehicle.location.city + ' area'
                    : 'Same as pickup location'}
                </Text>
                <Text style={styles.addressInfoHint}>Full address provided after owner approval</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>
          <TextInput
            style={[styles.textInput, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any special requests or instructions..."
            placeholderTextColor={COLORS.gray}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Price Breakdown */}
        {pricing && (
          <View style={styles.section}>
            <PriceBreakdown
              subtotal={pricing.subtotal}
              chauffeurFee={pricing.chauffeurFee}
              discount={pricing.discount}
              tax={pricing.tax}
              total={pricing.total}
            />
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <SafeAreaView edges={['bottom']}>
          <TouchableOpacity
            style={[styles.proceedButton, isSubmitting && styles.disabledButton]}
            onPress={handleProceedToPayment}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Text style={styles.proceedButtonText}>
                Proceed to Payment · {pricing ? formatCurrency(pricing.total) : '...'}
              </Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </SafeAreaView>
  );
}

function formatCurrency(amount: number) {
  return `AED ${amount.toFixed(0)}`;
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
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backIcon: {
    fontSize: 22,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSpacer: {
    width: 30,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: 120,
  },
  vehicleSummary: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  vehicleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  vehicleLocation: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 4,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  modeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
  },
  modeButtonActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.grayLight,
  },
  modeButtonIcon: {
    fontSize: 20, color: COLORS.textPrimary,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modeButtonTextActive: {
    color: COLORS.textSecondary,
  },
  timeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  timeAdjustButton: {
    width: 48,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.grayLight,
  },
  timeAdjustIcon: {
    fontSize: 24,
    fontWeight: '300',
    color: COLORS.textPrimary,
  },
  timeDisplay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  timeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  durationDisplay: {
    fontSize: 26,
    fontWeight: '700',
    color: '#d9c0a4',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  sliderSubLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 2,
    marginTop: SPACING.xs,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  durationSummary: {
    backgroundColor: COLORS.grayLight,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
  },
  durationSummaryText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
  },
  notesInput: {
    minHeight: 80,
  },
  addressInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    gap: SPACING.sm,
  },
  addressInfoIcon: {
    fontSize: 14,
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  addressInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  addressInfoHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
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
  proceedButton: {
    backgroundColor: '#d9c0a4',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: SPACING.sm,
  },
  disabledButton: {
    opacity: 0.7,
  },
  proceedButtonText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 2,
  },
}); }
