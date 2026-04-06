import { create } from 'zustand';
import type { Booking } from '../api/bookings';
import type { Vehicle } from '../api/vehicles';

export interface BookingDraft {
  vehicleId: string;
  vehicle?: Vehicle;
  mode: 'self_drive' | 'chauffeur';
  startTime: Date;
  endTime: Date;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress?: string;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
  notes?: string;
}

interface BookingState {
  // Active booking (ongoing trip)
  activeBooking: Booking | null;

  // Draft being created
  bookingDraft: BookingDraft | null;

  // Payment intent client secret for Stripe
  paymentClientSecret: string | null;

  // Chauffeur real-time location during active trip
  chauffeurLocation: {
    latitude: number;
    longitude: number;
    heading: number;
    speed: number;
  } | null;

  // Actions
  setActiveBooking: (booking: Booking | null) => void;
  setBookingDraft: (draft: BookingDraft | null) => void;
  updateBookingDraft: (partial: Partial<BookingDraft>) => void;
  setPaymentClientSecret: (secret: string | null) => void;
  setChauffeurLocation: (
    location: { latitude: number; longitude: number; heading: number; speed: number } | null
  ) => void;
  clearAll: () => void;
}

export const useBookingStore = create<BookingState>((set, get) => ({
  activeBooking: null,
  bookingDraft: null,
  paymentClientSecret: null,
  chauffeurLocation: null,

  setActiveBooking: (booking) => set({ activeBooking: booking }),

  setBookingDraft: (draft) => set({ bookingDraft: draft }),

  updateBookingDraft: (partial) => {
    const current = get().bookingDraft;
    if (current) {
      set({ bookingDraft: { ...current, ...partial } });
    }
  },

  setPaymentClientSecret: (secret) => set({ paymentClientSecret: secret }),

  setChauffeurLocation: (location) => set({ chauffeurLocation: location }),

  clearAll: () =>
    set({
      activeBooking: null,
      bookingDraft: null,
      paymentClientSecret: null,
      chauffeurLocation: null,
    }),
}));
