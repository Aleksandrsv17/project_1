import apiClient from './client';

export interface Booking {
  id: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    images: string[];
    licensePlate: string;
  };
  ownerId: string;
  chauffeurId?: string;
  mode: 'self_drive' | 'chauffeur';
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  startTime: string;
  endTime: string;
  pickupLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  dropoffLocation?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  pricing: {
    basePrice: number;
    durationHours: number;
    chauffeurFee: number;
    discount: number;
    tax: number;
    total: number;
  };
  paymentStatus: 'pending' | 'paid' | 'refunded';
  paymentIntentId?: string;
  notes?: string;
  rating?: number;
  review?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingPayload {
  vehicleId: string;
  mode: 'self_drive' | 'chauffeur';
  startTime: string;
  endTime: string;
  pickupLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  dropoffLocation?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  notes?: string;
}

export interface BookingListResponse {
  bookings: Booking[];
  total: number;
  page: number;
  totalPages: number;
}

export async function createBooking(payload: CreateBookingPayload): Promise<Booking> {
  const response = await apiClient.post<Booking>('/bookings', payload);
  return response.data;
}

export async function getMyBookings(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<BookingListResponse> {
  const response = await apiClient.get<BookingListResponse>('/bookings/my-bookings', { params });
  return response.data;
}

export async function getBookingById(id: string): Promise<Booking> {
  const response = await apiClient.get<Booking>(`/bookings/${id}`);
  return response.data;
}

export async function cancelBooking(id: string, reason?: string): Promise<Booking> {
  const response = await apiClient.post<Booking>(`/bookings/${id}/cancel`, { reason });
  return response.data;
}

export async function completeBooking(id: string): Promise<Booking> {
  const response = await apiClient.post<Booking>(`/bookings/${id}/complete`);
  return response.data;
}

export async function rateBooking(id: string, rating: number, review: string): Promise<Booking> {
  const response = await apiClient.post<Booking>(`/bookings/${id}/rate`, { rating, review });
  return response.data;
}

export async function getOwnerBookings(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<BookingListResponse> {
  const response = await apiClient.get<BookingListResponse>('/bookings/owner-bookings', { params });
  return response.data;
}

export async function confirmBooking(id: string): Promise<Booking> {
  const response = await apiClient.post<Booking>(`/bookings/${id}/confirm`);
  return response.data;
}

export async function getEarningsSummary(): Promise<{
  totalEarnings: number;
  thisMonthEarnings: number;
  totalBookings: number;
  activeBookings: number;
  pendingPayouts: number;
}> {
  const response = await apiClient.get('/bookings/earnings-summary');
  return response.data;
}
