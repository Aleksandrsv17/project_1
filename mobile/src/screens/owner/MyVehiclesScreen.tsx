import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useMyVehicles, useToggleVehicleAvailability, useDeleteVehicle } from '../../hooks/useVehicles';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { InlineError } from '../../components/ErrorBoundary';
import { StarRating } from '../../components/StarRating';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { formatCurrency, formatVehicleName } from '../../utils/formatters';
import { Vehicle } from '../../api/vehicles';
import { OwnerTabParamList } from '../../navigation/OwnerNavigator';

type MyVehiclesScreenProps = {
  navigation: BottomTabNavigationProp<OwnerTabParamList, 'MyVehicles'>;
};

export function MyVehiclesScreen({ navigation }: MyVehiclesScreenProps) {
  const styles = getStyles();
  const { data: vehicles, isLoading, isError, refetch, isFetching } = useMyVehicles();
  const toggleAvailabilityMutation = useToggleVehicleAvailability();
  const deleteVehicleMutation = useDeleteVehicle();

  async function handleToggleAvailability(vehicle: Vehicle) {
    try {
      await toggleAvailabilityMutation.mutateAsync({
        id: vehicle.id,
        isAvailable: !vehicle.isAvailable,
      });
    } catch {
      Alert.alert('Error', 'Failed to update vehicle availability.');
    }
  }

  function handleDeleteVehicle(vehicle: Vehicle) {
    Alert.alert(
      'Delete Vehicle',
      `Are you sure you want to delete ${formatVehicleName(vehicle.year, vehicle.make, vehicle.model)}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVehicleMutation.mutateAsync(vehicle.id);
              Alert.alert('Deleted', 'Vehicle has been removed from your fleet.');
            } catch {
              Alert.alert('Error', 'Failed to delete vehicle.');
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Fleet</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddVehicle')}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <LoadingSpinner message="Loading your vehicles..." />
      ) : isError ? (
        <InlineError message="Failed to load vehicles." onRetry={refetch} />
      ) : (
        <FlatList
          data={vehicles ?? []}
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
            <VehicleManageCard
              vehicle={item}
              onToggleAvailability={() => handleToggleAvailability(item)}
              onDelete={() => handleDeleteVehicle(item)}
              isToggling={toggleAvailabilityMutation.isPending}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🚗</Text>
              <Text style={styles.emptyTitle}>No vehicles listed</Text>
              <Text style={styles.emptySubtitle}>
                Add your first vehicle to start earning.
              </Text>
              <TouchableOpacity
                style={styles.addFirstButton}
                onPress={() => navigation.navigate('AddVehicle')}
              >
                <Text style={styles.addFirstButtonText}>Add Your Vehicle</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function VehicleManageCard({
  vehicle,
  onToggleAvailability,
  onDelete,
  isToggling,
}: {
  vehicle: Vehicle;
  onToggleAvailability: () => void;
  onDelete: () => void;
  isToggling: boolean;
}) {
  const styles = getStyles();
  const thumbnail = vehicle.images[0] ?? 'https://via.placeholder.com/80x60?text=Car';

  return (
    <View style={styles.vehicleCard}>
      <View style={styles.vehicleCardTop}>
        <Image source={{ uri: thumbnail }} style={styles.vehicleImage} resizeMode="cover" />
        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleName} numberOfLines={1}>
            {formatVehicleName(vehicle.year, vehicle.make, vehicle.model)}
          </Text>
          <Text style={styles.vehiclePlate}>{vehicle.licensePlate}</Text>
          <StarRating rating={vehicle.rating} size={12} showCount count={vehicle.reviewCount} />
        </View>
      </View>

      <View style={styles.vehicleStats}>
        <StatItem label="Per Hour" value={formatCurrency(vehicle.pricePerHour)} />
        <StatItem label="Per Day" value={formatCurrency(vehicle.pricePerDay)} />
        <StatItem label="Category" value={vehicle.category} capitalize />
      </View>

      <View style={styles.vehicleCardBottom}>
        <View style={styles.availabilityRow}>
          <Text style={styles.availabilityLabel}>Available for booking</Text>
          <Switch
            value={vehicle.isAvailable}
            onValueChange={onToggleAvailability}
            disabled={isToggling}
            trackColor={{ false: COLORS.border, true: COLORS.accent }}
            thumbColor={COLORS.white}
          />
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={onDelete}
          >
            <Text style={styles.deleteButtonText}>🗑 Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editButton} onPress={() => Alert.alert('Edit Vehicle', 'Vehicle editing will be available in the next update.')}>
            <Text style={styles.editButtonText}>✏️ Edit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function StatItem({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  const styles = getStyles();
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, capitalize && styles.capitalize]}>{value}</Text>
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  addButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  addButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  vehicleCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  vehicleCardTop: {
    flexDirection: 'row',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  vehicleImage: {
    width: 90,
    height: 68,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.grayLight,
  },
  vehicleInfo: {
    flex: 1,
    gap: 4,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  vehiclePlate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  vehicleStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statItem: {
    flex: 1,
    padding: SPACING.sm,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  capitalize: {
    textTransform: 'capitalize',
  },
  vehicleCardBottom: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  availabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityLabel: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  deleteButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff5f5',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: COLORS.error,
    fontWeight: '600',
    fontSize: 13,
  },
  editButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.grayLight,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  editButtonText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 13,
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
  addFirstButton: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  addFirstButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
}); }
