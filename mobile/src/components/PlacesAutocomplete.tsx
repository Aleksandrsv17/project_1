import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { searchPlaces, getPlaceDetails, PlacePrediction } from '../api/maps';
import { COLORS, SPACING, BORDER_RADIUS } from '../utils/constants';

interface PlacesAutocompleteProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onPlaceSelected: (place: {
    address: string;
    latitude: number;
    longitude: number;
    placeId: string;
  }) => void;
  /** User's current location for biasing results */
  biasLocation?: { latitude: number; longitude: number };
}

export function PlacesAutocomplete({
  placeholder = 'Search address...',
  value,
  onChangeText,
  onPlaceSelected,
  biasLocation,
}: PlacesAutocompleteProps) {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextChange = useCallback(
    (text: string) => {
      onChangeText(text);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (text.trim().length < 3) {
        setPredictions([]);
        setShowDropdown(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const results = await searchPlaces(text, biasLocation);
          setPredictions(results);
          setShowDropdown(results.length > 0);
        } catch {
          setPredictions([]);
          setShowDropdown(false);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [onChangeText, biasLocation]
  );

  const handleSelectPrediction = useCallback(
    async (prediction: PlacePrediction) => {
      setIsLoadingDetails(true);
      setShowDropdown(false);
      onChangeText(prediction.description);

      try {
        const details = await getPlaceDetails(prediction.placeId);
        onPlaceSelected({
          address: details.formattedAddress,
          latitude: details.latitude,
          longitude: details.longitude,
          placeId: details.placeId,
        });
      } catch {
        // Still set the text even if details fail
        onPlaceSelected({
          address: prediction.description,
          latitude: 0,
          longitude: 0,
          placeId: prediction.placeId,
        });
      } finally {
        setIsLoadingDetails(false);
      }
    },
    [onChangeText, onPlaceSelected]
  );

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.gray}
          returnKeyType="search"
          onFocus={() => {
            if (predictions.length > 0) setShowDropdown(true);
          }}
        />
        {(isSearching || isLoadingDetails) && (
          <ActivityIndicator size="small" color={COLORS.accent} />
        )}
        {value.length > 0 && !isSearching && !isLoadingDetails && (
          <TouchableOpacity
            onPress={() => {
              onChangeText('');
              setPredictions([]);
              setShowDropdown(false);
            }}
          >
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {showDropdown && predictions.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={predictions}
            keyExtractor={(item) => item.placeId}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.predictionRow}
                onPress={() => handleSelectPrediction(item)}
              >
                <Text style={styles.predictionPin}>📍</Text>
                <View style={styles.predictionTextContainer}>
                  <Text style={styles.predictionMain} numberOfLines={1}>
                    {item.mainText}
                  </Text>
                  <Text style={styles.predictionSecondary} numberOfLines={1}>
                    {item.secondaryText}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
          <View style={styles.poweredBy}>
            <Text style={styles.poweredByText}>Powered by Google</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  searchIcon: {
    fontSize: 14,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 12,
  },
  clearIcon: {
    fontSize: 14,
    color: COLORS.gray,
    padding: 4,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: BORDER_RADIUS.md,
    borderBottomRightRadius: BORDER_RADIUS.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: 250,
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
    gap: SPACING.sm,
  },
  predictionPin: {
    fontSize: 14,
  },
  predictionTextContainer: {
    flex: 1,
  },
  predictionMain: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  predictionSecondary: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  poweredBy: {
    padding: SPACING.xs,
    alignItems: 'flex-end',
    paddingRight: SPACING.md,
  },
  poweredByText: {
    fontSize: 10,
    color: COLORS.gray,
  },
});
