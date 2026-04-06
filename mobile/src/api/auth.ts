import apiClient from './client';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: 'customer' | 'owner';
}

export interface AuthResponse {
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: 'customer' | 'owner' | 'admin';
    avatarUrl?: string;
    kycVerified: boolean;
    createdAt: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface KYCPayload {
  documentType: 'passport' | 'national_id' | 'drivers_license';
  documentNumber: string;
  documentImageFront: string; // base64 or URL
  documentImageBack?: string;
  selfieImage: string;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', payload);
  return response.data;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/register', payload);
  return response.data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken });
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await apiClient.post('/auth/refresh', { refreshToken });
  return response.data;
}

export async function submitKYC(payload: KYCPayload): Promise<{ message: string; status: string }> {
  const response = await apiClient.post('/auth/kyc', payload);
  return response.data;
}

export async function getProfile(): Promise<AuthResponse['user']> {
  const response = await apiClient.get('/auth/profile');
  return response.data;
}

export async function updateProfile(updates: Partial<{
  fullName: string;
  phone: string;
  avatarUrl: string;
}>): Promise<AuthResponse['user']> {
  const response = await apiClient.patch('/auth/profile', updates);
  return response.data;
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const response = await apiClient.post('/auth/forgot-password', { email });
  return response.data;
}
