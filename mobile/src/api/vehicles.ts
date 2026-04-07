import apiClient from './client';

export interface Vehicle {
  id: string;
  ownerId: string;
  ownerName: string;
  make: string;
  model: string;
  year: number;
  category: 'sedan' | 'suv' | 'luxury' | 'sports' | 'van';
  color: string;
  licensePlate: string;
  seats: number;
  transmission: 'automatic' | 'manual';
  fuelType: 'petrol' | 'diesel' | 'electric' | 'hybrid';
  pricePerHour: number;
  pricePerDay: number;
  chauffeurAvailable: boolean;
  chauffeurFeePerHour: number;
  images: string[];
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
  };
  rating: number;
  reviewCount: number;
  isAvailable: boolean;
  features: string[];
  createdAt: string;
}

export interface VehicleFilters {
  category?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  chauffeurAvailable?: boolean;
  startDate?: string;
  endDate?: string;
  seats?: number;
  page?: number;
  limit?: number;
}

export interface VehicleListResponse {
  vehicles: Vehicle[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AddVehiclePayload {
  make: string;
  model: string;
  year: number;
  category: Vehicle['category'];
  color: string;
  licensePlate: string;
  seats: number;
  transmission: Vehicle['transmission'];
  fuelType: Vehicle['fuelType'];
  pricePerHour: number;
  pricePerDay: number;
  chauffeurAvailable: boolean;
  chauffeurFeePerHour?: number;
  images: string[];
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
  };
  features: string[];
}

/** Map snake_case API vehicle to camelCase app Vehicle */
function mapVehicle(raw: any): Vehicle {
  return {
    id: raw.id,
    ownerId: raw.owner_id,
    ownerName: raw.owner_name || 'Owner',
    make: raw.make,
    model: raw.model,
    year: raw.year,
    category: raw.category,
    color: raw.color || '',
    licensePlate: raw.license_plate || '',
    seats: raw.seats || 5,
    transmission: raw.transmission || 'automatic',
    fuelType: raw.fuel_type || 'petrol',
    pricePerHour: parseFloat(raw.hourly_rate) || parseFloat(raw.daily_rate) / 8 || 0,
    pricePerDay: parseFloat(raw.daily_rate) || 0,
    chauffeurAvailable: raw.chauffeur_available || false,
    chauffeurFeePerHour: parseFloat(raw.chauffeur_daily_rate) / 8 || 0,
    images: raw.media?.map((m: any) => m.url) ?? [],
    description: raw.description || '',
    location: {
      latitude: parseFloat(raw.location_lat) || 25.2048,
      longitude: parseFloat(raw.location_lng) || 55.2708,
      address: raw.location_address || raw.location_city || '',
      city: raw.location_city || '',
    },
    rating: parseFloat(raw.rating) || 4.5,
    reviewCount: raw.review_count || 0,
    isAvailable: raw.status === 'active',
    features: raw.features || [],
    createdAt: raw.created_at,
  };
}

export async function getVehicles(filters?: VehicleFilters): Promise<VehicleListResponse> {
  const response = await apiClient.get('/vehicles', { params: filters });
  const data = response.data?.data ?? response.data;
  const rawVehicles = data?.vehicles ?? [];
  return {
    vehicles: rawVehicles.map(mapVehicle),
    total: data?.pagination?.total ?? rawVehicles.length,
  };
}

export async function getVehicleById(id: string): Promise<Vehicle> {
  const response = await apiClient.get(`/vehicles/${id}`);
  const raw = response.data?.data?.vehicle ?? response.data?.data ?? response.data;
  return mapVehicle(raw);
}

export async function getMyVehicles(): Promise<Vehicle[]> {
  const response = await apiClient.get('/vehicles/owner/my-vehicles');
  const data = response.data?.data?.vehicles ?? response.data?.data ?? [];
  return (Array.isArray(data) ? data : []).map(mapVehicle);
}

export async function addVehicle(payload: AddVehiclePayload): Promise<Vehicle> {
  const response = await apiClient.post('/vehicles', payload);
  const raw = response.data?.data?.vehicle ?? response.data?.data ?? response.data;
  return mapVehicle(raw);
}

export async function updateVehicle(id: string, payload: Partial<AddVehiclePayload>): Promise<Vehicle> {
  const response = await apiClient.patch(`/vehicles/${id}`, payload);
  const raw = response.data?.data?.vehicle ?? response.data?.data ?? response.data;
  return mapVehicle(raw);
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiClient.delete(`/vehicles/${id}`);
}

export async function toggleVehicleAvailability(id: string, isAvailable: boolean): Promise<Vehicle> {
  const response = await apiClient.patch(`/vehicles/${id}`, {
    status: isAvailable ? 'active' : 'inactive',
  });
  const raw = response.data?.data?.vehicle ?? response.data?.data ?? response.data;
  return mapVehicle(raw);
}

export async function getNearbyVehicles(
  latitude: number,
  longitude: number,
  radiusKm: number = 10
): Promise<Vehicle[]> {
  // No dedicated nearby endpoint — use regular list and client-side filter
  const response = await apiClient.get('/vehicles', { params: { limit: 50 } });
  const data = response.data?.data ?? response.data;
  const rawVehicles = data?.vehicles ?? [];
  return rawVehicles.map(mapVehicle).filter((v: Vehicle) => {
    if (!v.location.latitude || !v.location.longitude) return false;
    const dist = haversine(latitude, longitude, v.location.latitude, v.location.longitude);
    return dist <= radiusKm;
  });
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
