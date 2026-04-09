import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Booking } from '../api/bookings';
import { formatDate, formatDateTime, formatCurrency, getBookingStatusConfig, formatDuration } from '../utils/formatters';
import { COLORS, SPACING, BORDER_RADIUS } from '../utils/constants';
import { differenceInHours, parseISO } from 'date-fns';

interface BookingCardProps {
  booking: Booking;
  onPress: (booking: Booking) => void;
  showActions?: boolean;
  onCancel?: (booking: Booking) => void;
}

export function BookingCard({ booking, onPress, showActions, onCancel }: BookingCardProps) {
  const styles = getStyles();
  const statusConfig = getBookingStatusConfig(booking.status);
  const startTime = booking.startTime || booking.createdAt || new Date().toISOString();
  const endTime = booking.endTime || startTime;
  const durationHours = Math.max(1, differenceInHours(parseISO(endTime), parseISO(startTime)));
  const vehicle = booking.vehicle || { images: [], year: 0, make: '', model: '', licensePlate: '' };
  const thumbnailUri =
    (vehicle.images && vehicle.images[0]) || 'https://via.placeholder.com/80x60?text=Car';
  const pricing = booking.pricing || { total: 0 };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(booking)}
      activeOpacity={0.85}
    >
      <View style={styles.header}>
        <Image source={{ uri: thumbnailUri }} style={styles.vehicleImage} resizeMode="cover" />
        <View style={styles.headerInfo}>
          <Text style={styles.vehicleName} numberOfLines={1}>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </Text>
          <Text style={styles.plateText}>{vehicle.licensePlate}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.details}>
        <DetailRow
          icon="□"
          label="From"
          value={formatDateTime(startTime)}
        />
        <DetailRow
          icon="◻"
          label="To"
          value={formatDateTime(endTime)}
        />
        <DetailRow
          icon="⏱"
          label="Duration"
          value={formatDuration(durationHours)}
        />
        <DetailRow
          icon="◆"
          label="Mode"
          value={booking.mode === 'chauffeur' ? 'With Chauffeur' : 'Self Drive'}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.totalLabel}>Total Paid</Text>
        <Text style={styles.totalValue}>{formatCurrency(pricing.total)}</Text>
      </View>

      {showActions && booking.status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => onCancel?.(booking)}
          >
            <Text style={styles.cancelText}>Cancel Booking</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const styles = getStyles();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailIcon}>{icon}</Text>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function getStyles() { return StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  vehicleImage: {
    width: 80,
    height: 60,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.grayLight,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  plateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600', color: COLORS.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  details: {
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailIcon: {
    fontSize: 14,
    width: 20, color: COLORS.textPrimary,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    width: 70,
  },
  detailValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.grayLight,
  },
  totalLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.accent,
  },
  actions: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  cancelText: {
    color: COLORS.error,
    fontWeight: '600',
    fontSize: 14,
  },
}); }
