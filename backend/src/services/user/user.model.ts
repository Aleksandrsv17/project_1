export type UserRole = 'customer' | 'owner' | 'chauffeur' | 'admin';
export type KycStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  kyc_status: KycStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  driver_uid: string | null;
}

export type PublicUser = Omit<User, 'password_hash' | 'deleted_at'>;

export interface CreateUserDto {
  email: string;
  phone?: string;
  password: string;
  role?: UserRole;
  first_name: string;
  last_name: string;
}

export interface UpdateUserDto {
  phone?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number; // seconds
}

export function toPublicUser(user: User): PublicUser {
  const { password_hash, deleted_at, ...publicUser } = user;
  void password_hash;
  void deleted_at;
  return publicUser;
}
