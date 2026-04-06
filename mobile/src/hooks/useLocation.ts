import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

interface UseLocationResult {
  location: LocationCoords | null;
  address: string | null;
  isLoading: boolean;
  error: string | null;
  requestLocation: () => Promise<void>;
  reverseGeocode: (lat: number, lng: number) => Promise<string>;
}

export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const { street, streetNumber, city, country } = results[0];
        const parts = [streetNumber, street, city, country].filter(Boolean);
        return parts.join(', ');
      }
    } catch {
      // Fallback to coordinates
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }, []);

  const requestLocation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        Alert.alert(
          'Location Required',
          'Please enable location access in settings to use this feature.',
          [{ text: 'OK' }]
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords: LocationCoords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      };
      setLocation(coords);

      const addr = await reverseGeocode(coords.latitude, coords.longitude);
      setAddress(addr);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get location';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [reverseGeocode]);

  // Request on mount
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { location, address, isLoading, error, requestLocation, reverseGeocode };
}

/**
 * Hook for watching location updates during an active trip
 */
export function useLocationWatch(enabled: boolean) {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [subscription, setSubscription] = useState<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) {
      subscription?.remove();
      setSubscription(null);
      return;
    }

    let sub: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (loc) => {
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
          });
        }
      );
      setSubscription(sub);
    })();

    return () => {
      sub?.remove();
    };
  }, [enabled]);

  return location;
}
