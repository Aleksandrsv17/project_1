import apiClient from './client';

// ── Types ────────────────────────────────────────────────────────────────────────

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface DirectionsResult {
  polyline: string;
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  steps: Array<{
    instruction: string;
    distanceText: string;
    durationText: string;
    polyline: string;
  }>;
}

export interface DistanceResult {
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string;
  country: string;
}

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

// ── API calls ────────────────────────────────────────────────────────────────────

export async function getDirections(
  origin: LatLng,
  destination: LatLng
): Promise<DirectionsResult> {
  const { data } = await apiClient.post('/maps/directions', { origin, destination });
  return data;
}

export async function getDistance(
  origin: LatLng,
  destination: LatLng
): Promise<DistanceResult> {
  const { data } = await apiClient.post('/maps/distance', { origin, destination });
  return data;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const { data } = await apiClient.get('/maps/geocode', { params: { address } });
  return data;
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  const { data } = await apiClient.get('/maps/reverse-geocode', { params: { lat, lng } });
  return data;
}

export async function searchPlaces(
  input: string,
  location?: LatLng
): Promise<PlacePrediction[]> {
  const params: Record<string, string> = { input };
  if (location) {
    params.lat = String(location.latitude);
    params.lng = String(location.longitude);
  }
  const { data } = await apiClient.get('/maps/places/autocomplete', { params });
  return data.predictions;
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const { data } = await apiClient.get(`/maps/places/${placeId}`);
  return data;
}

// ── Polyline decoder ─────────────────────────────────────────────────────────────

/** Decode a Google Maps encoded polyline string into an array of LatLng */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}
