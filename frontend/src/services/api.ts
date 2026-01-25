import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { GoogleAuthRequest, LoginAttempt, LogoutResponse, TokenResponse, User } from '../types/api';

const STELLINA_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';
const CORE_API_URL = import.meta.env.VITE_CORE_API_URL || 'http://localhost:3501/api/v1/core';
const SITE_ID = import.meta.env.VITE_SITE_ID;

class ApiClient {
  private coreClient: AxiosInstance;
  private stellinaClient: AxiosInstance;

  constructor() {
    this.coreClient = axios.create({
      baseURL: CORE_API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.stellinaClient = axios.create({
      baseURL: STELLINA_API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    const attachAuth = (config: any) => {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    };

    this.coreClient.interceptors.request.use(
      (config) => attachAuth(config),
      (error) => Promise.reject(error)
    );

    this.stellinaClient.interceptors.request.use(
      (config) => {
        return attachAuth(config);
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle 401 errors
    const handleUnauthorized = (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Clear token and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    };

    this.coreClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => handleUnauthorized(error)
    );

    this.stellinaClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => handleUnauthorized(error)
    );
  }

  // Health check
  async healthCheck(): Promise<{ status: string; message: string }> {
    const response = await this.stellinaClient.get('/health');
    return response.data;
  }

  // Google OAuth
  async googleAuth(code: string, redirectUri: string): Promise<TokenResponse> {
    const request: GoogleAuthRequest = {
      code,
      redirect_uri: redirectUri,
      ...(SITE_ID ? { site_id: SITE_ID } : {}),
    };
    const response = await this.coreClient.post<TokenResponse>('/auth/google', request);
    return response.data;
  }

  // Logout
  async logout(): Promise<LogoutResponse> {
    const response = await this.coreClient.post<LogoutResponse>('/auth/logout');
    return response.data;
  }

  // Get current user
  async getCurrentUser(): Promise<User> {
    const response = await this.coreClient.get<User>('/auth/me');
    return response.data;
  }

  // Get login attempts (admin only)
  async getLoginAttempts(limit: number = 100, offset: number = 0): Promise<LoginAttempt[]> {
    const response = await this.coreClient.get<LoginAttempt[]>('/auth/login-attempts', {
      params: { limit, offset },
    });
    return response.data;
  }
}

export const apiClient = new ApiClient();
