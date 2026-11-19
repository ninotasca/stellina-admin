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

export type AuthIdentity = {
  id: string; email: string; full_name: string | null; avatar_url: string | null; provider: string;
}
export type AuthSessionContext = {
  site_key: string; site_uuid: string | null; identity: AuthIdentity; roles: string[]; permissions: string[];
  session_id?: string; session_started_at: string; session_expires_at: string; idle_expires_at: string; is_magic?: boolean;
}
export type BrowserSessionResponse = {
  access_token: string; token_type: 'bearer'; issued_at: string; expires_at: string; expires_in_seconds: number; csrf_token: string;
  authority: {
    site_key: string; actor: AuthIdentity; roles: string[]; permissions: string[];
    session_started_at: string; absolute_expires_at: string; idle_expires_at: string;
  };
}
export type PublicAuthConfig = {
  site_key: string; site_uuid: string | null; enabled: boolean; providers: string[];
  registration: 'open' | 'closed'; password_reset: boolean; magic_login: boolean;
  session_max_age_minutes: number; session_inactivity_minutes: number; session_resume_after_minutes: number;
}
export type AuthStatus = 'loading' | 'anonymous' | 'authorizing' | 'authenticated' | 'forbidden' | 'disabled' | 'unavailable';
