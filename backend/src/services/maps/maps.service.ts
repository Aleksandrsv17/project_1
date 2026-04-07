import { config } from '../../config';
import { logger } from '../../utils/logger';

const GOOGLE_MAPS_BASE = 'https://maps.googleapis.com/maps/api';

interface LatLng {
  latitude: number;
  longitude: number;
}

// ── Directions ──────────────────────────────────────────────────────────────────

export interface DirectionsResult {
  polyline: string; // encoded polyline
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

export async function getDirections(
  origin: LatLng,
  destination: LatLng
): Promise<DirectionsResult | null> {
  const url = `${GOOGLE_MAPS_BASE}/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&key=${config.google.mapsApiKey}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      logger.warn('Directions API returned no routes', { status: data.status });
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
      polyline: route.overview_polyline.points,
      distanceMeters: leg.distance.value,
      distanceText: leg.distance.text,
      durationSeconds: leg.duration.value,
      durationText: leg.duration.text,
      steps: leg.steps.map((step: any) => ({
        instruction: step.html_instructions ?? '',
        distanceText: step.distance.text,
        durationText: step.duration.text,
        polyline: step.polyline.points,
      })),
    };
  } catch (err) {
    logger.error('Directions API error', { error: err });
    return null;
  }
}

// ── Distance Matrix (ETA) ───────────────────────────────────────────────────────

export interface DistanceMatrixResult {
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
}

export async function getDistanceMatrix(
  origin: LatLng,
  destination: LatLng
): Promise<DistanceMatrixResult | null> {
  const url = `${GOOGLE_MAPS_BASE}/distancematrix/json?origins=${origin.latitude},${origin.longitude}&destinations=${destination.latitude},${destination.longitude}&key=${config.google.mapsApiKey}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();

    if (data.status !== 'OK') {
      logger.warn('Distance Matrix API error', { status: data.status });
      return null;
    }

    const element = data.rows[0]?.elements[0];
    if (!element || element.status !== 'OK') return null;

    return {
      distanceMeters: element.distance.value,
      distanceText: element.distance.text,
      durationSeconds: element.duration.value,
      durationText: element.duration.text,
    };
  } catch (err) {
    logger.error('Distance Matrix API error', { error: err });
    return null;
  }
}

// ── Geocoding ───────────────────────────────────────────────────────────────────

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string;
  country: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const url = `${GOOGLE_MAPS_BASE}/geocode/json?address=${encodeURIComponent(address)}&key=${config.google.mapsApiKey}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();

    if (data.status !== 'OK' || !data.results?.length) return null;

    const result = data.results[0];
    const loc = result.geometry.location;

    const city =
      result.address_components.find((c: any) =>
        c.types.includes('locality')
      )?.long_name ?? '';
    const country =
      result.address_components.find((c: any) =>
        c.types.includes('country')
      )?.long_name ?? '';

    return {
      latitude: loc.lat,
      longitude: loc.lng,
      formattedAddress: result.formatted_address,
      city,
      country,
    };
  } catch (err) {
    logger.error('Geocoding API error', { error: err });
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const url = `${GOOGLE_MAPS_BASE}/geocode/json?latlng=${lat},${lng}&key=${config.google.mapsApiKey}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();

    if (data.status !== 'OK' || !data.results?.length) return null;

    const result = data.results[0];

    const city =
      result.address_components.find((c: any) =>
        c.types.includes('locality')
      )?.long_name ?? '';
    const country =
      result.address_components.find((c: any) =>
        c.types.includes('country')
      )?.long_name ?? '';

    return {
      latitude: lat,
      longitude: lng,
      formattedAddress: result.formatted_address,
      city,
      country,
    };
  } catch (err) {
    logger.error('Reverse geocoding error', { error: err });
    return null;
  }
}

// ── Places Autocomplete ─────────────────────────────────────────────────────────

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export async function placesAutocomplete(
  input: string,
  location?: LatLng,
  radiusMeters = 50000
): Promise<PlacePrediction[]> {
  let url = `${GOOGLE_MAPS_BASE}/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${config.google.mapsApiKey}`;

  if (location) {
    url += `&location=${location.latitude},${location.longitude}&radius=${radiusMeters}`;
  }

  try {
    const res = await fetch(url);
    const data: any = await res.json();

    if (data.status !== 'OK') return [];

    return data.predictions.map(
      (p: any) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting.main_text,
        secondaryText: p.structured_formatting.secondary_text,
      })
    );
  } catch (err) {
    logger.error('Places autocomplete error', { error: err });
    return [];
  }
}

// ── Place Details (get lat/lng from placeId) ────────────────────────────────────

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const url = `${GOOGLE_MAPS_BASE}/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry&key=${config.google.mapsApiKey}`;

  try {
    const res = await fetch(url);
    const data: any = await res.json();

    if (data.status !== 'OK' || !data.result) return null;

    const result = data.result;
    return {
      placeId,
      name: result.name,
      formattedAddress: result.formatted_address,
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    };
  } catch (err) {
    logger.error('Place details error', { error: err });
    return null;
  }
}
