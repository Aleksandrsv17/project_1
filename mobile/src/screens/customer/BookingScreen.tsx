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
import DateTimePicker from '@react-native-community/datetimepicker';
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
import { useVehicleAvailability } from '../../hooks/useVehicles';
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
  const { data: availability } = useVehicleAvailability(vehicleId);

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

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(null);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [pickupTime, setPickupTime] = useState(new Date());
  const [returnTime, setReturnTime] = useState(new Date());

  // Build calendar grid
  const calendarData = React.useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cells: Array<{ day: number; date: Date; isAvailable: boolean; isPast: boolean; isBooked: boolean; isRequested: boolean; inRange: boolean; isStart: boolean; isEnd: boolean } | null> = [];

    for (let i = 0; i < firstDay; i++) cells.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
      const isPast = dayStart < today;

      let isBooked = false;
      let isRequested = false;
      if (availability) {
        for (const range of availability) {
          const rs = new Date(range.startTime);
          const re = new Date(range.endTime);
          if (rs <= dayEnd && re >= dayStart) {
            if (range.status === 'requested') isRequested = true;
            else { isBooked = true; break; }
          }
        }
      }

      const isAvailable = !isPast && !isBooked;
      const inRange = selectedStartDate && selectedEndDate
        ? dayStart >= selectedStartDate && dayStart <= selectedEndDate
        : false;
      const isStart = selectedStartDate ? dayStart.getTime() === selectedStartDate.getTime() : false;
      const isEnd = selectedEndDate ? dayStart.getTime() === selectedEndDate.getTime() : false;

      cells.push({ day: d, date, isAvailable, isPast, isBooked, isRequested, inRange, isStart, isEnd });
    }
    return cells;
  }, [calendarMonth, availability, selectedStartDate, selectedEndDate]);

  function handleDayPress(date: Date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
      setSelectedStartDate(d);
      setSelectedEndDate(null);
      const newStart = new Date(d);
      newStart.setHours(pickupTime.getHours(), pickupTime.getMinutes());
      setStartTime(newStart);
    } else {
      if (d < selectedStartDate) {
        setSelectedStartDate(d);
        const newStart = new Date(d);
        newStart.setHours(pickupTime.getHours(), pickupTime.getMinutes());
        setStartTime(newStart);
      } else {
        setSelectedEndDate(d);
        const newEnd = new Date(d);
        newEnd.setHours(returnTime.getHours(), returnTime.getMinutes());
        setEndTime(newEnd);
      }
    }
  }

  function handlePickupTimeChange(_: any, date?: Date) {
    if (date) {
      setPickupTime(date);
      if (selectedStartDate) {
        const newStart = new Date(selectedStartDate);
        newStart.setHours(date.getHours(), date.getMinutes());
        setStartTime(newStart);
      }
    }
    if (Platform.OS === 'android') setShowStartTimePicker(false);
  }

  function handleReturnTimeChange(_: any, date?: Date) {
    if (date) {
      setReturnTime(date);
      if (selectedEndDate) {
        const newEnd = new Date(selectedEndDate);
        newEnd.setHours(date.getHours(), date.getMinutes());
        setEndTime(newEnd);
      }
    }
    if (Platform.OS === 'android') setShowEndTimePicker(false);
  }

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayHeaders = ['S','M','T','W','T','F','S'];

  // Check if selected dates overlap with any booked range
  const hasDateOverlap = React.useMemo(() => {
    if (!availability || availability.length === 0) return false;
    for (const range of availability) {
      const rangeStart = new Date(range.startTime);
      const rangeEnd = new Date(range.endTime);
      if (startTime < rangeEnd && endTime > rangeStart) {
        return true;
      }
    }
    return false;
  }, [availability, startTime, endTime]);

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

        {/* Calendar */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Dates</Text>

          {/* Month navigation */}
          <View style={styles.calMonthRow}>
            <TouchableOpacity onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
              <Text style={styles.calMonthArrow}>←</Text>
            </TouchableOpacity>
            <Text style={styles.calMonthTitle}>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</Text>
            <TouchableOpacity onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
              <Text style={styles.calMonthArrow}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={styles.calRow}>
            {dayHeaders.map((d, i) => (
              <View key={i} style={styles.calHeaderCell}><Text style={styles.calHeaderText}>{d}</Text></View>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.calGrid}>
            {calendarData.map((cell, i) => {
              if (!cell) return <View key={`e${i}`} style={styles.calCell} />;
              const isSelected = cell.isStart || cell.isEnd;
              return (
                <TouchableOpacity
                  key={cell.day}
                  style={[
                    styles.calCell,
                    cell.inRange && styles.calCellInRange,
                    isSelected && styles.calCellSelected,
                    cell.isBooked && styles.calCellBooked,
                    cell.isPast && styles.calCellPast,
                  ]}
                  disabled={!cell.isAvailable}
                  onPress={() => handleDayPress(cell.date)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.calDayText,
                    isSelected && styles.calDayTextSelected,
                    cell.isBooked && { color: '#EF4444' },
                    cell.isPast && { color: COLORS.gray },
                    cell.isRequested && { color: '#F59E0B' },
                  ]}>{cell.day}</Text>
                  {cell.isBooked && <View style={styles.calDot}><View style={[styles.calDotInner, { backgroundColor: '#EF4444' }]} /></View>}
                  {cell.isRequested && !cell.isBooked && <View style={styles.calDot}><View style={[styles.calDotInner, { backgroundColor: '#F59E0B' }]} /></View>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.calLegend}>
            <View style={styles.calLegendItem}><View style={[styles.calLegendDot, { backgroundColor: COLORS.textPrimary }]} /><Text style={styles.calLegendText}>Selected</Text></View>
            <View style={styles.calLegendItem}><View style={[styles.calLegendDot, { backgroundColor: '#EF4444' }]} /><Text style={styles.calLegendText}>Booked</Text></View>
            <View style={styles.calLegendItem}><View style={[styles.calLegendDot, { backgroundColor: '#F59E0B' }]} /><Text style={styles.calLegendText}>Pending</Text></View>
          </View>

          {hasDateOverlap && (
            <Text style={styles.overlapWarning}>Vehicle is unavailable on selected dates</Text>
          )}
        </View>

        {/* Time pickers — show after dates selected */}
        {selectedStartDate && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pick-up Time</Text>
            <TouchableOpacity style={styles.timePickerBtn} onPress={() => setShowStartTimePicker(!showStartTimePicker)}>
              <Text style={styles.timePickerText}>{selectedStartDate.toLocaleDateString()} at {pickupTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </TouchableOpacity>
            {showStartTimePicker && (
              <DateTimePicker value={pickupTime} mode="time" display="spinner" onChange={handlePickupTimeChange} />
            )}

            {selectedEndDate ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: SPACING.md }]}>Return Time</Text>
                <TouchableOpacity style={styles.timePickerBtn} onPress={() => setShowEndTimePicker(!showEndTimePicker)}>
                  <Text style={styles.timePickerText}>{selectedEndDate.toLocaleDateString()} at {returnTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </TouchableOpacity>
                {showEndTimePicker && (
                  <DateTimePicker value={returnTime} mode="time" display="spinner" onChange={handleReturnTimeChange} />
                )}

                <View style={styles.durationSummary}>
                  <Text style={styles.durationSummaryText}>Duration: {durationText}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.calHint}>Tap an end date on the calendar</Text>
            )}
          </View>
        )}

        {!selectedStartDate && (
          <View style={styles.section}>
            <Text style={styles.calHint}>Tap a start date on the calendar above</Text>
          </View>
        )}

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
            style={[styles.proceedButton, (isSubmitting || hasDateOverlap) && styles.disabledButton]}
            onPress={handleProceedToPayment}
            disabled={isSubmitting || hasDateOverlap}
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
  return `€${amount.toFixed(0)}`;
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
  overlapWarning: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    marginTop: SPACING.sm,
    textAlign: 'center' as const,
  },
  // Calendar styles
  calMonthRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: SPACING.sm,
  },
  calMonthArrow: { fontSize: 20, color: COLORS.textPrimary, padding: SPACING.xs },
  calMonthTitle: { fontSize: 16, fontWeight: '700' as const, color: COLORS.textPrimary },
  calRow: { flexDirection: 'row' as const, marginBottom: 4 },
  calHeaderCell: { flex: 1, alignItems: 'center' as const, paddingVertical: 4 },
  calHeaderText: { fontSize: 12, fontWeight: '600' as const, color: COLORS.textSecondary },
  calGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  calCell: {
    width: '14.28%' as any,
    aspectRatio: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderRadius: 8,
  },
  calCellInRange: { backgroundColor: COLORS.grayLight },
  calCellSelected: { backgroundColor: COLORS.textPrimary },
  calCellBooked: { backgroundColor: '#EF444415' },
  calCellPast: { opacity: 0.3 },
  calDayText: { fontSize: 14, fontWeight: '600' as const, color: COLORS.textPrimary },
  calDayTextSelected: { color: COLORS.background },
  calDot: { position: 'absolute' as const, bottom: 4 },
  calDotInner: { width: 4, height: 4, borderRadius: 2 },
  calLegend: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: SPACING.md, marginTop: SPACING.sm },
  calLegendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  calLegendDot: { width: 8, height: 8, borderRadius: 4 },
  calLegendText: { fontSize: 11, color: COLORS.textSecondary },
  calHint: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' as const, paddingVertical: SPACING.sm },
  timePickerBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    alignItems: 'center' as const,
  },
  timePickerText: { fontSize: 15, fontWeight: '600' as const, color: COLORS.textPrimary },
}); }
