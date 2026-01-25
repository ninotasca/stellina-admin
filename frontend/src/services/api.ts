import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { GoogleAuthRequest, LoginAttempt, LogoutResponse, TokenResponse, User } from '../types/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle 401 errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Clear token and redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Health check
  async healthCheck(): Promise<{ status: string; message: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }

  // Google OAuth
  async googleAuth(code: string, redirectUri: string): Promise<TokenResponse> {
    const request: GoogleAuthRequest = { code, redirect_uri: redirectUri };
    const response = await this.client.post<TokenResponse>('/auth/google', request);
    return response.data;
  }

  // Logout
  async logout(): Promise<LogoutResponse> {
    const response = await this.client.post<LogoutResponse>('/auth/logout');
    return response.data;
  }

  // Get current user
  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/auth/me');
    return response.data;
  }

  // Get login attempts (admin only)
  async getLoginAttempts(limit: number = 100, offset: number = 0): Promise<LoginAttempt[]> {
    const response = await this.client.get<LoginAttempt[]>('/auth/login-attempts', {
      params: { limit, offset },
    });
    return response.data;
  }
}

export const apiClient = new ApiClient();
