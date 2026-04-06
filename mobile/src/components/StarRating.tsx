import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS } from '../utils/constants';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  showCount?: boolean;
  count?: number;
}

export function StarRating({
  rating,
  maxStars = 5,
  size = 16,
  interactive = false,
  onRate,
  showCount = false,
  count,
}: StarRatingProps) {
  const stars = Array.from({ length: maxStars }, (_, i) => i + 1);

  const getStarColor = (star: number) => {
    if (star <= Math.floor(rating)) return '#f59e0b';
    if (star === Math.ceil(rating) && rating % 1 >= 0.5) return '#f59e0b';
    return '#d1d5db';
  };

  return (
    <View style={styles.container}>
      {stars.map((star) =>
        interactive ? (
          <TouchableOpacity
            key={star}
            onPress={() => onRate?.(star)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={{ fontSize: size, color: getStarColor(star) }}>★</Text>
          </TouchableOpacity>
        ) : (
          <Text key={star} style={{ fontSize: size, color: getStarColor(star) }}>
            ★
          </Text>
        )
      )}
      {showCount && count !== undefined && (
        <Text style={[styles.count, { fontSize: size - 2 }]}>({count})</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  count: {
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
});
