import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../types/api';
import { apiClient } from '../services/api';
import { supabase } from '../services/supabase';

const MAGIC_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_MAGIC_LOGIN === 'true';
const MAGIC_LOGIN_SESSION_KEY = 'magic_login_enabled';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  magicLogin: () => void;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
        const currentUser = await apiClient.getCurrentUser();
        if (!active) return;
        setUser(currentUser);
        localStorage.setItem('user', JSON.stringify(currentUser));
      } catch {
        void apiClient.reportAuthEvent('auth_error', 'session_restore_failed');
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
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void acceptSession(session?.access_token ?? null);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const login = (token: string, userData: User) => {
    localStorage.setItem('access_token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.removeItem(MAGIC_LOGIN_SESSION_KEY);
    setUser(userData);
  };

  const magicLogin = () => {
    if (!MAGIC_LOGIN_ENABLED) return;

    const now = new Date().toISOString();
    const userData: User = {
      id: 'magic-local-user',
      email: 'magic-login@stellina.local',
      full_name: 'Magic Login',
      avatar_url: null,
      is_admin: true,
      created_at: now,
      updated_at: now,
    };

    localStorage.setItem('access_token', 'dev_magic_token_local');
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem(MAGIC_LOGIN_SESSION_KEY, 'true');
    setUser(userData);
  };

  const logout = async () => {
    try {
      await apiClient.reportAuthEvent('logout');
      if (supabase) await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      localStorage.removeItem(MAGIC_LOGIN_SESSION_KEY);
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
