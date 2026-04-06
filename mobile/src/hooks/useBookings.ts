import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  completeBooking,
  rateBooking,
  getOwnerBookings,
  confirmBooking,
  getEarningsSummary,
  CreateBookingPayload,
} from '../api/bookings';

export const bookingKeys = {
  all: ['bookings'] as const,
  mine: (params?: object) => ['bookings', 'mine', params] as const,
  owner: (params?: object) => ['bookings', 'owner', params] as const,
  detail: (id: string) => ['bookings', 'detail', id] as const,
  earnings: () => ['bookings', 'earnings'] as const,
};

export function useMyBookings(params?: { status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: bookingKeys.mine(params),
    queryFn: () => getMyBookings(params),
    staleTime: 30_000,
  });
}

export function useOwnerBookings(params?: { status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: bookingKeys.owner(params),
    queryFn: () => getOwnerBookings(params),
    staleTime: 30_000,
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: () => getBookingById(id),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useEarningsSummary() {
  return useQuery({
    queryKey: bookingKeys.earnings(),
    queryFn: getEarningsSummary,
    staleTime: 60_000,
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBookingPayload) => createBooking(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelBooking(id, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.mine() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.owner() });
    },
  });
}

export function useCompleteBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeBooking(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.mine() });
    },
  });
}

export function useRateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating, review }: { id: string; rating: number; review: string }) =>
      rateBooking(id, rating, review),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.mine() });
    },
  });
}

export function useConfirmBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => confirmBooking(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.owner() });
    },
  });
}
