import axios from 'axios';
import type {
  CommissionEvent,
  CommissionEventCreate,
  CommissionEventUpdate,
  CommissionEventWithLineItems,
  CommissionLineItem,
  CommissionLineItemCreate,
  ProjectionSummary,
  BookingStatus,
} from '../types/commission';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

const getAuthToken = () => localStorage.getItem('access_token');

const apiClient = axios.create({ baseURL: API_BASE_URL });
apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ProjectionParams {
  grouping?: 'quarter' | 'month' | 'year';
  statuses?: BookingStatus[];
  start?: string;
  end?: string;
  weight_definite?: number;
  weight_tentative?: number;
  weight_prospect?: number;
}

export const commissionApi = {
  // Events
  listEvents: async (): Promise<CommissionEventWithLineItems[]> => {
    const res = await apiClient.get('/commissions/events');
    return res.data;
  },
  getEvent: async (id: string): Promise<CommissionEventWithLineItems> => {
    const res = await apiClient.get(`/commissions/events/${id}`);
    return res.data;
  },
  createEvent: async (payload: CommissionEventCreate): Promise<CommissionEventWithLineItems> => {
    const res = await apiClient.post('/commissions/events', payload);
    return res.data;
  },
  updateEvent: async (id: string, payload: CommissionEventUpdate): Promise<CommissionEvent> => {
    const res = await apiClient.put(`/commissions/events/${id}`, payload);
    return res.data;
  },
  deleteEvent: async (id: string): Promise<void> => {
    await apiClient.delete(`/commissions/events/${id}`);
  },

  // Line items
  addLineItem: async (eventId: string, payload: CommissionLineItemCreate): Promise<CommissionLineItem> => {
    const res = await apiClient.post(`/commissions/events/${eventId}/line-items`, payload);
    return res.data;
  },
  updateLineItem: async (id: string, payload: CommissionLineItemCreate): Promise<CommissionLineItem> => {
    const res = await apiClient.put(`/commissions/line-items/${id}`, payload);
    return res.data;
  },
  deleteLineItem: async (id: string): Promise<void> => {
    await apiClient.delete(`/commissions/line-items/${id}`);
  },

  // Projections
  projections: async (params: ProjectionParams = {}): Promise<ProjectionSummary> => {
    const search = new URLSearchParams();
    if (params.grouping) search.set('grouping', params.grouping);
    if (params.start) search.set('start', params.start);
    if (params.end) search.set('end', params.end);
    if (params.statuses) params.statuses.forEach((s) => search.append('statuses', s));
    if (params.weight_definite !== undefined) search.set('weight_definite', String(params.weight_definite));
    if (params.weight_tentative !== undefined) search.set('weight_tentative', String(params.weight_tentative));
    if (params.weight_prospect !== undefined) search.set('weight_prospect', String(params.weight_prospect));
    const qs = search.toString();
    const res = await apiClient.get(`/commissions/projections${qs ? `?${qs}` : ''}`);
    return res.data;
  },
};
