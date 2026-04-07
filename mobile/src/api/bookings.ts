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

/** Map snake_case booking from API to camelCase */
function mapBooking(raw: any): Booking {
  if (!raw) return raw;
  return {
    id: raw.id,
    customerId: raw.customer_id ?? raw.customerId,
    customerName: raw.customer_name ?? raw.customerName ?? '',
    vehicleId: raw.vehicle_id ?? raw.vehicleId,
    vehicle: raw.vehicle ?? { id: raw.vehicle_id, make: '', model: '', year: 0, images: [], licensePlate: '' },
    ownerId: raw.owner_id ?? raw.ownerId,
    chauffeurId: raw.chauffeur_id ?? raw.chauffeurId,
    mode: raw.mode,
    status: raw.status,
    startTime: raw.start_time ?? raw.startTime,
    endTime: raw.end_time ?? raw.endTime,
    pickupLocation: raw.pickup_location ?? raw.pickupLocation ?? {
      latitude: parseFloat(raw.pickup_lat) || 0,
      longitude: parseFloat(raw.pickup_lng) || 0,
      address: raw.pickup_address ?? '',
    },
    dropoffLocation: raw.dropoff_location ?? raw.dropoffLocation ?? (raw.dropoff_lat ? {
      latitude: parseFloat(raw.dropoff_lat) || 0,
      longitude: parseFloat(raw.dropoff_lng) || 0,
      address: raw.dropoff_address ?? '',
    } : undefined),
    pricing: raw.pricing ?? {
      basePrice: parseFloat(raw.base_amount) || 0,
      durationHours: raw.duration_hours || 0,
      chauffeurFee: parseFloat(raw.chauffeur_fee) || 0,
      discount: parseFloat(raw.discount_amount) || 0,
      tax: parseFloat(raw.tax_amount) || 0,
      total: parseFloat(raw.total_amount) || 0,
    },
    paymentStatus: raw.payment_status ?? raw.paymentStatus ?? 'pending',
    paymentIntentId: raw.payment_intent_id ?? raw.paymentIntentId,
    notes: raw.notes,
    rating: raw.rating ? parseFloat(raw.rating) : undefined,
    review: raw.review,
    createdAt: raw.created_at ?? raw.createdAt,
    updatedAt: raw.updated_at ?? raw.updatedAt,
  };
}

export async function createBooking(payload: CreateBookingPayload): Promise<Booking> {
  const body = {
    vehicle_id: payload.vehicleId,
    mode: payload.mode,
    start_time: payload.startTime,
    end_time: payload.endTime,
    pickup_lat: payload.pickupLocation.latitude,
    pickup_lng: payload.pickupLocation.longitude,
    pickup_address: payload.pickupLocation.address,
    dropoff_lat: payload.dropoffLocation?.latitude,
    dropoff_lng: payload.dropoffLocation?.longitude,
    dropoff_address: payload.dropoffLocation?.address,
    notes: payload.notes,
  };
  const response = await apiClient.post('/bookings', body);
  const raw = response.data?.data?.booking ?? response.data?.data ?? response.data;
  return mapBooking(raw);
}

export async function getMyBookings(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<BookingListResponse> {
  const response = await apiClient.get('/bookings/my', { params });
  const data = response.data?.data ?? response.data;
  const rawBookings = data?.bookings ?? [];
  return {
    bookings: rawBookings.map(mapBooking),
    total: data?.pagination?.total ?? rawBookings.length,
    page: data?.pagination?.page ?? 1,
    totalPages: data?.pagination?.pages ?? 1,
  };
}

export async function getBookingById(id: string): Promise<Booking> {
  const response = await apiClient.get(`/bookings/${id}`);
  const raw = response.data?.data?.booking ?? response.data?.data ?? response.data;
  return mapBooking(raw);
}

export async function cancelBooking(id: string, reason?: string): Promise<Booking> {
  const response = await apiClient.patch(`/bookings/${id}/cancel`, { cancellation_reason: reason });
  const raw = response.data?.data?.booking ?? response.data?.data ?? response.data;
  return mapBooking(raw);
}

export async function completeBooking(id: string): Promise<Booking> {
  const response = await apiClient.patch(`/bookings/${id}/complete`);
  const raw = response.data?.data?.booking ?? response.data?.data ?? response.data;
  return mapBooking(raw);
}

export async function rateBooking(id: string, rating: number, review: string): Promise<Booking> {
  const response = await apiClient.post(`/bookings/${id}/rate`, { rating, review });
  const raw = response.data?.data?.booking ?? response.data?.data ?? response.data;
  return mapBooking(raw);
}

export async function getOwnerBookings(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<BookingListResponse> {
  const response = await apiClient.get('/bookings/owner-vehicles', { params });
  const data = response.data?.data ?? response.data;
  const rawBookings = data?.bookings ?? [];
  return {
    bookings: rawBookings.map(mapBooking),
    total: data?.pagination?.total ?? rawBookings.length,
    page: data?.pagination?.page ?? 1,
    totalPages: data?.pagination?.pages ?? 1,
  };
}

export async function confirmBooking(id: string): Promise<Booking> {
  const response = await apiClient.post('/bookings/confirm-payment', {
    booking_id: id,
    payment_intent_id: 'owner-confirmed',
  });
  const raw = response.data?.data?.booking ?? response.data?.data ?? response.data;
  return mapBooking(raw);
}

export async function getEarningsSummary(): Promise<{
  totalEarnings: number;
  thisMonthEarnings: number;
  totalBookings: number;
  activeBookings: number;
  pendingPayouts: number;
}> {
  const response = await apiClient.get('/bookings/earnings-summary');
  const data = response.data?.data ?? response.data;
  return {
    totalEarnings: data?.totalEarnings ?? data?.total_earnings ?? 0,
    thisMonthEarnings: data?.thisMonthEarnings ?? data?.this_month_earnings ?? 0,
    totalBookings: data?.totalBookings ?? data?.total_bookings ?? 0,
    activeBookings: data?.activeBookings ?? data?.active_bookings ?? 0,
    pendingPayouts: data?.pendingPayouts ?? data?.pending_payouts ?? 0,
  };
}
