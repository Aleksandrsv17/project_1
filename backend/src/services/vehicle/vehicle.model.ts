export type VehicleStatus = 'pending' | 'active' | 'inactive' | 'maintenance';
export type VehicleCategory = 'sedan' | 'suv' | 'coupe' | 'convertible' | 'van' | 'truck';

export interface Vehicle {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  color: string | null;
  category: VehicleCategory;
  daily_rate: number;
  hourly_rate: number | null;
  chauffeur_available: boolean;
  chauffeur_daily_rate: number | null;
  deposit_amount: number;
  max_daily_km: number;
  status: VehicleStatus;
  location_city: string | null;
  location_lat: number | null;
  location_lng: number | null;
  description: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface VehicleMedia {
  id: string;
  vehicle_id: string;
  url: string;
  type: string;
  is_primary: boolean;
  created_at: Date;
}

export interface VehicleWithMedia extends Vehicle {
  media: VehicleMedia[];
}

export interface CreateVehicleDto {
  make: string;
  model: string;
  year: number;
  license_plate: string;
  color?: string;
  category: VehicleCategory;
  daily_rate: number;
  hourly_rate?: number;
  chauffeur_available?: boolean;
  chauffeur_daily_rate?: number;
  deposit_amount?: number;
  max_daily_km?: number;
  location_city?: string;
  location_lat?: number;
  location_lng?: number;
  description?: string;
  pickup_address?: string;
  dropoff_address?: string;
}

export interface UpdateVehicleDto {
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  daily_rate?: number;
  hourly_rate?: number;
  chauffeur_available?: boolean;
  chauffeur_daily_rate?: number;
  deposit_amount?: number;
  max_daily_km?: number;
  status?: VehicleStatus;
  location_city?: string;
  location_lat?: number;
  location_lng?: number;
  description?: string;
  pickup_address?: string;
  dropoff_address?: string;
}

export interface VehicleQuery {
  city?: string;
  category?: VehicleCategory;
  status?: string;
  min_rate?: number;
  max_rate?: number;
  chauffeur?: boolean;
  page: number;
  limit: number;
  sort: 'daily_rate_asc' | 'daily_rate_desc' | 'newest';
}
