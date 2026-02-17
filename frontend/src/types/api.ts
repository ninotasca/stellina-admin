export interface User {
  id: string;
  site_id?: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginAttempt {
  id: string;
  user_email: string | null;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  error_message: string | null;
  timestamp: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface GoogleAuthRequest {
  code: string;
  redirect_uri: string;
  site_id?: string;
}

export interface AllowedGoogleAccount {
  id: string;
  site_id: string;
  email?: string | null;
  domain?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LogoutResponse {
  message: string;
}
