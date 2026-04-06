import apiClient from './client';

export interface Chauffeur {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  avatarUrl?: string;
  licenseNumber: string;
  licenseExpiry: string;
  rating: number;
  totalTrips: number;
  isAvailable: boolean;
  currentLocation?: {
    latitude: number;
    longitude: number;
    updatedAt: string;
  };
  languages: string[];
  experience: number; // years
}

export interface ChauffeurLocation {
  chauffeurId: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  updatedAt: string;
}

export async function getAvailableChauffeurs(vehicleId?: string): Promise<Chauffeur[]> {
  const response = await apiClient.get<Chauffeur[]>('/chauffeurs/available', {
    params: { vehicleId },
  });
  return response.data;
}

export async function getChauffeurById(id: string): Promise<Chauffeur> {
  const response = await apiClient.get<Chauffeur>(`/chauffeurs/${id}`);
  return response.data;
}

export async function getChauffeurLocation(bookingId: string): Promise<ChauffeurLocation> {
  const response = await apiClient.get<ChauffeurLocation>(`/chauffeurs/booking/${bookingId}/location`);
  return response.data;
}

export async function updateChauffeurLocation(
  latitude: number,
  longitude: number,
  heading: number,
  speed: number
): Promise<void> {
  await apiClient.post('/chauffeurs/location', { latitude, longitude, heading, speed });
}
