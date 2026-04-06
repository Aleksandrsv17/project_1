export type BookingType = 'instant_ride' | 'scheduled' | 'hourly_rental' | 'daily_rental';
export type BookingMode = 'self_drive' | 'chauffeur';
export type BookingStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';

export interface Booking {
  id: string;
  customer_id: string;
  vehicle_id: string;
  chauffeur_id: string | null;
  type: BookingType;
  mode: BookingMode;
  status: BookingStatus;
  start_time: Date;
  end_time: Date | null;
  actual_end_time: Date | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  base_amount: number;
  chauffeur_fee: number;
  insurance_fee: number;
  mileage_overage: number;
  platform_commission: number;
  total_amount: number;
  deposit_amount: number;
  notes: string | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBookingDto {
  vehicle_id: string;
  chauffeur_id?: string;
  type: BookingType;
  mode: BookingMode;
  start_time: Date;
  end_time?: Date;
  pickup_address?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_address?: string;
  dropoff_lat?: number;
  dropoff_lng?: number;
  notes?: string;
}

export interface BookingWithDetails extends Booking {
  vehicle?: {
    make: string;
    model: string;
    year: number;
    license_plate: string;
    color: string | null;
    category: string;
  };
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
}
