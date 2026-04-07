import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMyBookings, useCancelBooking, useRateBooking } from '../../hooks/useBookings';
import { BookingCard } from '../../components/BookingCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { InlineError } from '../../components/ErrorBoundary';
import { StarRating } from '../../components/StarRating';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { Booking } from '../../api/bookings';
import { CustomerStackParamList } from '../../navigation/CustomerNavigator';

type BookingHistoryScreenProps = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'BookingHistory'>;
};

const STATUS_TABS = [
  { label: 'All', value: undefined },
  { label: 'Active', value: 'active' },
  { label: 'Upcoming', value: 'confirmed' },
  { label: 'Past', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export function BookingHistoryScreen({ navigation }: BookingHistoryScreenProps) {
  const [activeStatus, setActiveStatus] = useState<string | undefined>(undefined);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [ratingModal, setRatingModal] = useState<{ booking: Booking } | null>(null);
  const [selectedRating, setSelectedRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  const { data, isLoading, isError, refetch, isFetching } = useMyBookings(
    activeStatus ? { status: activeStatus } : undefined
  );
  const cancelBookingMutation = useCancelBooking();
  const rateBookingMutation = useRateBooking();

  function handleBookingPress(booking: Booking) {
    if (booking.status === 'active') {
      navigation.navigate('ActiveTrip', { bookingId: booking.id });
    }
    // TODO: Navigate to booking detail screen
  }

  function handleCancelBooking(booking: Booking) {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking? Cancellation fees may apply.',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelBookingMutation.mutateAsync({ id: booking.id });
              Alert.alert('Booking Cancelled', 'Your booking has been cancelled.');
            } catch {
              Alert.alert('Error', 'Failed to cancel booking. Please try again.');
            }
          },
        },
      ]
    );
  }

  function openRatingModal(booking: Booking) {
    setRatingModal({ booking });
    setSelectedRating(5);
    setReviewText('');
  }

  async function handleSubmitRating() {
    if (!ratingModal) return;
    try {
      await rateBookingMutation.mutateAsync({
        id: ratingModal.booking.id,
        rating: selectedRating,
        review: reviewText.trim(),
      });
      setRatingModal(null);
      Alert.alert('Thank you!', 'Your rating has been submitted.');
    } catch {
      Alert.alert('Error', 'Failed to submit rating. Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Bookings</Text>
      </View>

      {/* Status Dropdown */}
      <TouchableOpacity
        style={styles.statusDropdown}
        onPress={() => setShowStatusPicker(v => !v)}
      >
        <Text style={styles.statusDropdownLabel}>
          {STATUS_TABS.find(t => t.value === activeStatus)?.label ?? 'All'}
        </Text>
        <Text style={styles.statusDropdownArrow}>{showStatusPicker ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showStatusPicker && (
        <View style={styles.statusPickerList}>
          {STATUS_TABS.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.statusPickerItem, activeStatus === item.value && styles.statusPickerItemActive]}
              onPress={() => { setActiveStatus(item.value); setShowStatusPicker(false); }}
            >
              <Text style={[styles.statusPickerText, activeStatus === item.value && styles.statusPickerTextActive]}>
                {item.label}
              </Text>
              {activeStatus === item.value && <Text style={styles.statusCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSpinner message="Loading bookings..." />
      ) : isError ? (
        <InlineError message="Failed to load bookings." onRetry={refetch} />
      ) : (
        <FlatList
          data={data?.bookings ?? []}
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
            <View>
              <BookingCard
                booking={item}
                onPress={handleBookingPress}
                showActions
                onCancel={handleCancelBooking}
              />
              {/* Rate button for completed, unrated bookings */}
              {item.status === 'completed' && !item.rating && (
                <TouchableOpacity
                  style={styles.rateButton}
                  onPress={() => openRatingModal(item)}
                >
                  <Text style={styles.rateButtonText}>⭐ Rate this booking</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptySubtitle}>
                Your booking history will appear here.
              </Text>
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => navigation.navigate('VehicleList')}
              >
                <Text style={styles.browseButtonText}>Browse Vehicles</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Rating Modal */}
      <Modal
        visible={ratingModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRatingModal(null)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Rate Your Experience</Text>
            <TouchableOpacity onPress={() => setRatingModal(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.ratingVehicleName}>
              {ratingModal?.booking.vehicle.make} {ratingModal?.booking.vehicle.model}
            </Text>

            <Text style={styles.ratingPrompt}>How was your experience?</Text>

            <View style={styles.starRow}>
              <StarRating
                rating={selectedRating}
                size={40}
                interactive
                onRate={setSelectedRating}
              />
            </View>

            <Text style={styles.ratingLabel}>
              {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][selectedRating]}
            </Text>

            <TextInput
              style={styles.reviewInput}
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Share your experience (optional)..."
              placeholderTextColor={COLORS.gray}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity
              style={[styles.submitRatingButton, rateBookingMutation.isPending && styles.disabledButton]}
              onPress={handleSubmitRating}
              disabled={rateBookingMutation.isPending}
            >
              <Text style={styles.submitRatingText}>Submit Rating</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statusDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
  },
  statusDropdownLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  statusDropdownArrow: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  statusPickerList: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  statusPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },
  statusPickerItemActive: {
    backgroundColor: '#fefce8',
  },
  statusPickerText: {
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  statusPickerTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  statusCheck: {
    fontSize: 16,
    color: COLORS.accent,
    fontWeight: '700',
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  rateButton: {
    backgroundColor: '#fefce8',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
    marginHorizontal: 0,
  },
  rateButtonText: {
    color: '#92400e',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyIcon: {
    fontSize: 48,
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
  browseButton: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  browseButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  // Modal
  modalSafeArea: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalClose: {
    fontSize: 18,
    color: COLORS.textSecondary,
    padding: SPACING.xs,
  },
  modalContent: {
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  ratingVehicleName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  ratingPrompt: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  starRow: {
    marginVertical: SPACING.sm,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accent,
  },
  reviewInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: 14,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  submitRatingButton: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitRatingText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 16,
  },
});
