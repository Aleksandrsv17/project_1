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

export async function getVehicles(filters?: VehicleFilters): Promise<VehicleListResponse> {
  const response = await apiClient.get<VehicleListResponse>('/vehicles', { params: filters });
  return response.data;
}

export async function getVehicleById(id: string): Promise<Vehicle> {
  const response = await apiClient.get<Vehicle>(`/vehicles/${id}`);
  return response.data;
}

export async function getMyVehicles(): Promise<Vehicle[]> {
  const response = await apiClient.get<Vehicle[]>('/vehicles/my-vehicles');
  return response.data;
}

export async function addVehicle(payload: AddVehiclePayload): Promise<Vehicle> {
  const response = await apiClient.post<Vehicle>('/vehicles', payload);
  return response.data;
}

export async function updateVehicle(id: string, payload: Partial<AddVehiclePayload>): Promise<Vehicle> {
  const response = await apiClient.patch<Vehicle>(`/vehicles/${id}`, payload);
  return response.data;
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiClient.delete(`/vehicles/${id}`);
}

export async function toggleVehicleAvailability(id: string, isAvailable: boolean): Promise<Vehicle> {
  const response = await apiClient.patch<Vehicle>(`/vehicles/${id}/availability`, { isAvailable });
  return response.data;
}

export async function getNearbyVehicles(
  latitude: number,
  longitude: number,
  radiusKm: number = 10
): Promise<Vehicle[]> {
  const response = await apiClient.get<Vehicle[]>('/vehicles/nearby', {
    params: { latitude, longitude, radiusKm },
  });
  return response.data;
}
