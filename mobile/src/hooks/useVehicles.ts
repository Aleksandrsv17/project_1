import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  getVehicles,
  getVehicleById,
  getMyVehicles,
  addVehicle,
  updateVehicle,
  deleteVehicle,
  toggleVehicleAvailability,
  getNearbyVehicles,
  VehicleFilters,
  AddVehiclePayload,
} from '../api/vehicles';

export const vehicleKeys = {
  all: ['vehicles'] as const,
  lists: () => [...vehicleKeys.all, 'list'] as const,
  list: (filters?: VehicleFilters) => [...vehicleKeys.lists(), filters] as const,
  details: () => [...vehicleKeys.all, 'detail'] as const,
  detail: (id: string) => [...vehicleKeys.details(), id] as const,
  myVehicles: () => [...vehicleKeys.all, 'my-vehicles'] as const,
  nearby: (lat: number, lng: number) => [...vehicleKeys.all, 'nearby', lat, lng] as const,
};

export function useVehicles(filters?: VehicleFilters) {
  return useQuery({
    queryKey: vehicleKeys.list(filters),
    queryFn: () => getVehicles(filters),
    staleTime: 60_000,
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => getVehicleById(id),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useMyVehicles() {
  return useQuery({
    queryKey: vehicleKeys.myVehicles(),
    queryFn: getMyVehicles,
    staleTime: 30_000,
  });
}

export function useNearbyVehicles(latitude?: number, longitude?: number, radiusKm?: number) {
  return useQuery({
    queryKey: vehicleKeys.nearby(latitude ?? 0, longitude ?? 0),
    queryFn: () => getNearbyVehicles(latitude!, longitude!, radiusKm),
    enabled: latitude !== undefined && longitude !== undefined,
    staleTime: 30_000,
  });
}

export function useAddVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddVehiclePayload) => addVehicle(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.myVehicles() });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AddVehiclePayload> }) =>
      updateVehicle(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.myVehicles() });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.myVehicles() });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
    },
  });
}

export function useToggleVehicleAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      toggleVehicleAvailability(id, isAvailable),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.myVehicles() });
    },
  });
}
