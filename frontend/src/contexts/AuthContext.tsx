import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import type { User } from '../types/api';
import { apiClient, type PublicAuthConfig } from '../services/api';
import { supabase } from '../services/supabase';
import { clientLog } from '../lib/diagnostic-core';

const MAGIC_LOGIN_FRONTEND_ENABLED = import.meta.env.VITE_AUTH_ENABLE_MAGIC_LOGIN === 'true';
const SAFE_POLICY: PublicAuthConfig = {
  enabled: true,
  providers: [],
  registration: 'closed',
  password_reset: false,
  magic_login: false,
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  magicLogin: () => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  policyLoading: boolean;
  googleLoginEnabled: boolean;
  magicLoginEnabled: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<PublicAuthConfig>(SAFE_POLICY);
  const [policyLoading, setPolicyLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void apiClient.getAuthPolicy()
      .then((next) => {
        if (!active) return;
        setPolicy(next);
        clientLog('info', 'unoventi.auth.policy_loaded', {
          provider_count: next.providers.length,
          magic_login_admin: next.magic_login,
          magic_login_frontend: MAGIC_LOGIN_FRONTEND_ENABLED,
          magic_login_effective: next.magic_login && MAGIC_LOGIN_FRONTEND_ENABLED,
        });
      })
      .catch(() => {
        clientLog('error', 'unoventi.auth.policy_failed');
      })
      .finally(() => { if (active) setPolicyLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const acceptSession = async (token: string | null) => {
      if (!active) return;
      if (!token) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        setUser(null);
        setLoading(false);
        return;
      }
      localStorage.setItem('access_token', token);
      try {
        const exchanged = await apiClient.exchangeSession();
        if (!active) return;
        localStorage.setItem('access_token', exchanged.access_token);
        const currentUser = exchanged.user;
        setUser(currentUser);
        localStorage.setItem('user', JSON.stringify(currentUser));
      } catch (error) {
        void apiClient.reportAuthEvent('auth_error', 'session_restore_failed');
        // The API is the authority for whether this Supabase identity may use
        // Stellina. Clear a rejected browser session so subsequent page loads
        // do not keep retrying the same invalid token.
        if (supabase && axios.isAxiosError(error) && error.response?.status === 401) {
          try {
            const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
            clientLog(signOutError ? 'warn' : 'info', signOutError
                ? 'unoventi.auth.rejected_session_clear_failed'
                : 'unoventi.auth.rejected_session_cleared', {
              status: 401,
              success: !signOutError,
              ...(signOutError ? { error_class: 'AuthError' as const } : {}),
            });
          } catch {
            // The app token is cleared below even if local Supabase cleanup fails.
            clientLog('warn', 'unoventi.auth.rejected_session_clear_failed', {
              status: 401,
              success: false,
              error_class: 'UnknownError',
            });
          }
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
        }
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => acceptSession(data.session?.access_token ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // getSession above owns initial restoration. Ignore the matching event so
      // opening a new tab does not authorize the same stored token twice.
      if (event === 'INITIAL_SESSION') return;
      void acceptSession(session?.access_token ?? null);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const login = (token: string, userData: User) => {
    localStorage.setItem('access_token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const magicLogin = async () => {
    if (!MAGIC_LOGIN_FRONTEND_ENABLED || !policy.magic_login) {
      throw new Error('Magic Login is disabled.');
    }
    const result = await apiClient.magicLogin();
    localStorage.setItem('access_token', result.access_token);
    const exchanged = await apiClient.exchangeSession();
    localStorage.setItem('access_token', exchanged.access_token);
    const currentUser = exchanged.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    setUser(currentUser);
  };

  const logout = async () => {
    try {
      await apiClient.reportAuthEvent('logout');
      if (supabase) await supabase.auth.signOut({ scope: 'local' });
    } catch {
      clientLog('error', 'unoventi.auth.logout_failed', { error_class: 'AuthError' });
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    magicLogin,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    policyLoading,
    googleLoginEnabled: policy.enabled && policy.providers.includes('google'),
    magicLoginEnabled: policy.enabled && policy.magic_login && MAGIC_LOGIN_FRONTEND_ENABLED,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
