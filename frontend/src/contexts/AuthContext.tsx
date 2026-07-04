import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../types/api';
import { apiClient } from '../services/api';

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
    // Check if user is already logged in
    const token = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user');
    const isMagicLoginSession = MAGIC_LOGIN_ENABLED && localStorage.getItem(MAGIC_LOGIN_SESSION_KEY) === 'true';

    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);

        if (isMagicLoginSession) {
          setLoading(false);
          return;
        }
        
        // Verify token is still valid
        apiClient.getCurrentUser()
          .then((currentUser) => {
            setUser(currentUser);
            localStorage.setItem('user', JSON.stringify(currentUser));
          })
          .catch(() => {
            // Token invalid, clear storage
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            localStorage.removeItem(MAGIC_LOGIN_SESSION_KEY);
            setUser(null);
          })
          .finally(() => {
            setLoading(false);
          });
      } catch (error) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        localStorage.removeItem(MAGIC_LOGIN_SESSION_KEY);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
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
      if (localStorage.getItem(MAGIC_LOGIN_SESSION_KEY) !== 'true') {
        await apiClient.logout();
      }
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
