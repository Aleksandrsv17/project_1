import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { Vehicle } from '../api/vehicles';
import { StarRating } from './StarRating';
import { formatCurrency, formatVehicleName } from '../utils/formatters';
import { COLORS, SPACING, BORDER_RADIUS } from '../utils/constants';

interface VehicleCardProps {
  vehicle: Vehicle;
  onPress: (vehicle: Vehicle) => void;
  style?: object;
}

export function VehicleCard({ vehicle, onPress, style }: VehicleCardProps) {
  const styles = getStyles();
  const thumbnailUri = vehicle.images[0] ?? 'https://via.placeholder.com/300x200?text=No+Image';

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={() => onPress(vehicle)}
      activeOpacity={0.85}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: thumbnailUri }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{vehicle.category.toUpperCase()}</Text>
        </View>
        {!vehicle.isAvailable && (
          <View style={styles.unavailableOverlay}>
            <Text style={styles.unavailableText}>Unavailable</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.vehicleName} numberOfLines={1}>
            {formatVehicleName(vehicle.year, vehicle.make, vehicle.model)}
          </Text>
          {vehicle.chauffeurAvailable && (
            <View style={styles.chauffeurBadge}>
              <Text style={styles.chauffeurText}>Chauffeur</Text>
            </View>
          )}
        </View>

        <Text style={styles.location} numberOfLines={1}>
          {vehicle.location.city}
        </Text>

        <View style={styles.detailsRow}>
          <SpecItem label={`${vehicle.seats} seats`} />
          <SpecItem label={vehicle.transmission} />
          <SpecItem label={vehicle.fuelType} />
        </View>

        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.price}>{formatCurrency(vehicle.pricePerHour, 'AED')}<Text style={styles.priceUnit}>/hr</Text></Text>
            <Text style={styles.dayPrice}>{formatCurrency(vehicle.pricePerDay, 'AED')}/day</Text>
          </View>

          <View style={styles.ratingContainer}>
            <StarRating rating={vehicle.rating} size={12} />
            <Text style={styles.ratingText}>
              {vehicle.rating.toFixed(1)} ({vehicle.reviewCount})
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SpecItem({ label }: { label: string }) {
  const styles = getStyles();
  return (
    <View style={styles.specItem}>
      <Text style={styles.specText}>{label}</Text>
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
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  imageContainer: {
    position: 'relative',
    height: 180,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  categoryText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
  content: {
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  chauffeurBadge: {
    backgroundColor: COLORS.grayLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  chauffeurText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  location: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 4,
  },
  specItem: {
    backgroundColor: COLORS.grayLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  specText: {
    fontSize: 11,
    color: COLORS.grayDark,
    textTransform: 'capitalize',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.accent,
  },
  priceUnit: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  dayPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  ratingContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },
  ratingText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
}); }
