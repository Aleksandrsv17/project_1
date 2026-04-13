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
  const response = await apiClient.post('/auth/login', payload);
  const raw = response.data?.data ?? response.data;
  return {
    user: {
      id: raw.user.id,
      fullName: `${raw.user.first_name ?? ''} ${raw.user.last_name ?? ''}`.trim() || raw.user.email,
      email: raw.user.email,
      phone: raw.user.phone,
      role: raw.user.role,
      avatarUrl: raw.user.avatar_url ?? undefined,
      kycVerified: raw.user.kyc_status === 'verified',
      createdAt: raw.user.created_at,
    },
    accessToken: raw.tokens?.access_token ?? raw.accessToken,
    refreshToken: raw.tokens?.refresh_token ?? raw.refreshToken,
  };
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const nameParts = payload.fullName.trim().split(/\s+/);
  const first_name = nameParts[0];
  const last_name = nameParts.slice(1).join(' ') || first_name;

  const response = await apiClient.post('/auth/register', {
    first_name,
    last_name,
    email: payload.email,
    phone: payload.phone,
    password: payload.password,
    role: payload.role,
  });

  const raw = response.data?.data ?? response.data;
  return {
    user: {
      id: raw.user.id,
      fullName: `${raw.user.first_name} ${raw.user.last_name}`.trim(),
      email: raw.user.email,
      phone: raw.user.phone,
      role: raw.user.role,
      avatarUrl: raw.user.avatar_url ?? undefined,
      kycVerified: raw.user.kyc_status === 'verified',
      createdAt: raw.user.created_at,
    },
    accessToken: raw.tokens?.access_token ?? raw.accessToken,
    refreshToken: raw.tokens?.refresh_token ?? raw.refreshToken,
  };
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refresh_token: refreshToken });
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await apiClient.post('/auth/refresh', { refresh_token: refreshToken });
  const data = response.data?.data ?? response.data;
  return {
    accessToken: data.access_token ?? data.accessToken,
    refreshToken: data.refresh_token ?? data.refreshToken,
  };
}

export async function submitKYC(payload: KYCPayload): Promise<{ message: string; status: string }> {
  const response = await apiClient.post('/auth/kyc', payload);
  return response.data;
}

export async function getProfile(): Promise<AuthResponse['user']> {
  const response = await apiClient.get('/auth/profile');
  const raw = response.data?.data?.user ?? response.data?.data ?? response.data;
  return {
    id: raw.id,
    fullName: `${raw.first_name ?? ''} ${raw.last_name ?? ''}`.trim() || raw.fullName || raw.email,
    email: raw.email,
    phone: raw.phone,
    role: raw.role,
    avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? undefined,
    kycVerified: raw.kyc_status ? raw.kyc_status === 'verified' : (raw.kycVerified ?? false),
    createdAt: raw.created_at ?? raw.createdAt,
  };
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
