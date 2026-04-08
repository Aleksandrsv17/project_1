import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useOwnerBookings, useEarningsSummary, useConfirmBooking } from '../../hooks/useBookings';
import { useMyVehicles } from '../../hooks/useVehicles';
import { BookingCard } from '../../components/BookingCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { InlineError } from '../../components/ErrorBoundary';
import { COLORS, SPACING, BORDER_RADIUS, DEFAULT_REGION } from '../../utils/constants';
import { formatCurrency, formatCurrencyCompact } from '../../utils/formatters';
import { Booking } from '../../api/bookings';
import { useAuthStore } from '../../store/authStore';
import { OwnerTabParamList } from '../../navigation/OwnerNavigator';
import { Alert } from 'react-native';

type OwnerDashboardProps = {
  navigation: BottomTabNavigationProp<OwnerTabParamList, 'OwnerDashboard'>;
};

export function OwnerDashboardScreen({ navigation }: OwnerDashboardProps) {
  const styles = getStyles();
  const { user } = useAuthStore();
  const { data: earnings, isLoading: earningsLoading, refetch: refetchEarnings } = useEarningsSummary();
  const { data: bookingsData, isLoading: bookingsLoading, refetch: refetchBookings } = useOwnerBookings({ limit: 10 });
  const { data: vehicles, refetch: refetchVehicles } = useMyVehicles();
  const confirmBookingMutation = useConfirmBooking();

  const isRefreshing = earningsLoading || bookingsLoading;

  function handleRefresh() {
    refetchEarnings();
    refetchBookings();
    refetchVehicles();
  }

  async function handleConfirmBooking(booking: Booking) {
    Alert.alert(
      'Confirm Booking',
      `Confirm booking from ${booking.customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await confirmBookingMutation.mutateAsync(booking.id);
              Alert.alert('Confirmed', 'Booking has been confirmed.');
            } catch {
              Alert.alert('Error', 'Failed to confirm booking.');
            }
          },
        },
      ]
    );
  }

  function handleBookingPress(booking: Booking) {
    if (booking.status === 'active') {
      (navigation as any).navigate('ActiveTrip', { bookingId: booking.id });
    }
  }

  const pendingBookings = bookingsData?.bookings.filter((b) => b.status === 'pending') ?? [];
  const activeBookings = bookingsData?.bookings.filter((b) => b.status === 'active') ?? [];
  const recentBookings = bookingsData?.bookings ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Hello, {user?.fullName.split(' ')[0] ?? 'Owner'} 👋
            </Text>
            <Text style={styles.headerSubtitle}>Your fleet overview</Text>
          </View>
          <TouchableOpacity
            style={styles.addVehicleButton}
            onPress={() => navigation.navigate('AddVehicle')}
          >
            <Text style={styles.addVehicleIcon}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Earnings Summary Cards */}
        {earningsLoading ? (
          <LoadingSpinner size="small" />
        ) : earnings ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.earningsRow}
          >
            <EarningsCard
              label="Total Earnings"
              value={formatCurrencyCompact(earnings.totalEarnings)}
              icon="💰"
              color="#1a1a2e"
            />
            <EarningsCard
              label="This Month"
              value={formatCurrencyCompact(earnings.thisMonthEarnings)}
              icon="📈"
              color="#065f46"
            />
            <EarningsCard
              label="Total Bookings"
              value={`${earnings.totalBookings}`}
              icon="📋"
              color="#1e40af"
            />
            <EarningsCard
              label="Active Now"
              value={`${earnings.activeBookings}`}
              icon="🚗"
              color="#7c3aed"
            />
            <EarningsCard
              label="Pending Payout"
              value={formatCurrencyCompact(earnings.pendingPayouts)}
              icon="⏳"
              color="#92400e"
            />
          </ScrollView>
        ) : null}

        {/* Pending Bookings Alert */}
        {pendingBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Approval</Text>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pendingBookings.length}</Text>
              </View>
            </View>
            {pendingBookings.map((booking) => (
              <View key={booking.id}>
                <BookingCard booking={booking} onPress={handleBookingPress} />
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => handleConfirmBooking(booking)}
                >
                  <Text style={styles.confirmButtonText}>✓ Confirm Booking</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Active Trips */}
        {activeBookings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Trips</Text>
            {activeBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onPress={handleBookingPress} />
            ))}
          </View>
        )}

        {/* My Vehicles Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Fleet</Text>
            <TouchableOpacity onPress={() => navigation.navigate('MyVehicles')}>
              <Text style={styles.seeAllText}>Manage →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.vehicleStatsRow}>
            <VehicleStat
              label="Total Vehicles"
              value={`${vehicles?.length ?? 0}`}
              icon="🚗"
            />
            <VehicleStat
              label="Available"
              value={`${vehicles?.filter((v) => v.isAvailable).length ?? 0}`}
              icon="✅"
            />
            <VehicleStat
              label="Booked"
              value={`${vehicles?.filter((v) => !v.isAvailable).length ?? 0}`}
              icon="🔒"
            />
          </View>
        </View>

        {/* Fleet Map Preview */}
        {vehicles && vehicles.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Fleet Map</Text>
              <TouchableOpacity onPress={() => navigation.navigate('FleetMap' as never)}>
                <Text style={styles.seeAllText}>Full Map →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.miniMapContainer}>
              <MapView
                style={styles.miniMap}
                provider={PROVIDER_GOOGLE}
                initialRegion={
                  vehicles.length > 0
                    ? {
                        latitude: vehicles[0].location.latitude,
                        longitude: vehicles[0].location.longitude,
                        latitudeDelta: 0.08,
                        longitudeDelta: 0.08,
                      }
                    : DEFAULT_REGION
                }
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                onPress={() => navigation.navigate('FleetMap' as never)}
              >
                {vehicles.map((v) => (
                  <Marker
                    key={v.id}
                    coordinate={{
                      latitude: v.location.latitude,
                      longitude: v.location.longitude,
                    }}
                  >
                    <View
                      style={[
                        styles.miniMapMarker,
                        { backgroundColor: v.isAvailable ? '#d1fae5' : '#fee2e2' },
                      ]}
                    >
                      <Text style={{ fontSize: 14 }}>🚗</Text>
                    </View>
                  </Marker>
                ))}
              </MapView>
              <View style={styles.miniMapLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                  <Text style={styles.legendText}>Available</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={styles.legendText}>Booked</Text>
                </View>
                <Text style={styles.legendTap}>Tap to expand</Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent Bookings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Bookings</Text>
          </View>

          {bookingsLoading ? (
            <LoadingSpinner size="small" />
          ) : recentBookings.length > 0 ? (
            recentBookings
              .filter((b) => b.status !== 'pending')
              .slice(0, 5)
              .map((booking) => (
                <BookingCard key={booking.id} booking={booking} onPress={handleBookingPress} />
              ))
          ) : (
            <View style={styles.emptyBookings}>
              <Text style={styles.emptyBookingsText}>No bookings yet.</Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function EarningsCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  const styles = getStyles();
  return (
    <View style={[styles.earningsCard, { backgroundColor: color }]}>
      <Text style={styles.earningsIcon}>{icon}</Text>
      <Text style={styles.earningsValue}>{value}</Text>
      <Text style={styles.earningsLabel}>{label}</Text>
    </View>
  );
}

function VehicleStat({ label, value, icon }: { label: string; value: string; icon: string }) {
  const styles = getStyles();
  return (
    <View style={styles.vehicleStat}>
      <Text style={styles.vehicleStatIcon}>{icon}</Text>
      <Text style={styles.vehicleStatValue}>{value}</Text>
      <Text style={styles.vehicleStatLabel}>{label}</Text>
    </View>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addVehicleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addVehicleIcon: {
    fontSize: 24,
    color: COLORS.primary,
    fontWeight: '700',
    lineHeight: 26,
  },
  earningsRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  earningsCard: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    minWidth: 120,
    gap: 4,
  },
  earningsIcon: {
    fontSize: 24,
  },
  earningsValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.white,
  },
  earningsLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  pendingBadge: {
    backgroundColor: COLORS.warning,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBadgeText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  seeAllText: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
  },
  confirmButtonText: {
    color: '#065f46',
    fontWeight: '700',
    fontSize: 14,
  },
  vehicleStatsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  vehicleStat: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  vehicleStatIcon: {
    fontSize: 22,
  },
  vehicleStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  vehicleStatLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  miniMapContainer: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  miniMap: {
    width: '100%',
    height: 180,
  },
  miniMapMarker: {
    borderRadius: 16,
    padding: 4,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  miniMapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    backgroundColor: COLORS.white,
    gap: SPACING.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  legendTap: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  emptyBookings: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  emptyBookingsText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  bottomSpacer: {
    height: SPACING.xxl,
  },
}); }
