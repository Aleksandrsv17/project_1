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

  const pricing = vehicle
    ? calculateBookingTotal(
        vehicle.pricePerHour,
        durationHours,
        mode === 'chauffeur' ? vehicle.chauffeurFeePerHour * durationHours : 0
      )
    : null;

  function handleDurationPreset(hours: number) {
    const newEnd = addHours(startTime, hours);
    setEndTime(newEnd);
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
      // 1. Create the booking
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

      // 2. Create payment intent
      const paymentIntent = await createPaymentIntent(booking.id);
      setPaymentClientSecret(paymentIntent.clientSecret);

      // 3. Navigate to payment
      navigation.navigate('Payment', { bookingId: booking.id });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create booking. Please try again.';
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
              <Text style={styles.modeButtonIcon}>🔑</Text>
              <Text style={[styles.modeButtonText, mode === 'self_drive' && styles.modeButtonTextActive]}>
                Self Drive
              </Text>
            </TouchableOpacity>
            {vehicle?.chauffeurAvailable && (
              <TouchableOpacity
                style={[styles.modeButton, mode === 'chauffeur' && styles.modeButtonActive]}
                onPress={() => setMode('chauffeur')}
              >
                <Text style={styles.modeButtonIcon}>🎩</Text>
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
          <View style={styles.durationPresets}>
            {DURATION_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.label}
                style={[
                  styles.durationChip,
                  durationHours === preset.hours && styles.durationChipActive,
                ]}
                onPress={() => handleDurationPreset(preset.hours)}
              >
                <Text
                  style={[
                    styles.durationChipText,
                    durationHours === preset.hours && styles.durationChipTextActive,
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.durationSummary}>
            <Text style={styles.durationSummaryText}>
              Return: {formatDateTime(endTime)} · {formatDuration(durationHours)}
            </Text>
          </View>
        </View>

        {/* Pickup Address */}
        <View style={[styles.section, { zIndex: 20 }]}>
          <Text style={styles.sectionTitle}>Pickup Address *</Text>
          <PlacesAutocomplete
            placeholder="Search pickup location..."
            value={pickupAddress}
            onChangeText={setPickupAddress}
            biasLocation={userLocation ?? undefined}
            onPlaceSelected={(place) => {
              setPickupAddress(place.address);
              setPickupCoords({ latitude: place.latitude, longitude: place.longitude });
            }}
          />
        </View>

        {/* Dropoff Address */}
        <View style={[styles.section, { zIndex: 10 }]}>
          <Text style={styles.sectionTitle}>Drop-off Address (optional)</Text>
          <PlacesAutocomplete
            placeholder="Search drop-off location..."
            value={dropoffAddress}
            onChangeText={setDropoffAddress}
            biasLocation={userLocation ?? undefined}
            onPlaceSelected={(place) => {
              setDropoffAddress(place.address);
              setDropoffCoords({ latitude: place.latitude, longitude: place.longitude });
            }}
          />
        </View>

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
    backgroundColor: COLORS.white,
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
    backgroundColor: COLORS.white,
  },
  modeButtonActive: {
    borderColor: COLORS.accent,
    backgroundColor: '#fefce8',
  },
  modeButtonIcon: {
    fontSize: 20,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modeButtonTextActive: {
    color: '#78350f',
  },
  timeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
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
  durationPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  durationChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  durationChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  durationChipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  durationChipTextActive: {
    color: COLORS.accent,
    fontWeight: '600',
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
    backgroundColor: COLORS.white,
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
  proceedButton: {
    backgroundColor: COLORS.accent,
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
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 16,
  },
}); }
