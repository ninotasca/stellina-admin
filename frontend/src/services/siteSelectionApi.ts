import axios from 'axios';
import type {
  SiteSelectionFormCreate,
  SiteSelectionFormDetails,
  SiteSelectionFormSummary,
  SiteSelectionFormUpdate,
  SiteSelectionSubmit,
} from '../types/siteSelection';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

const getAuthToken = () => localStorage.getItem('access_token');

const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const siteSelectionApi = {
  listForms: async (eventId?: string): Promise<SiteSelectionFormSummary[]> => {
    const params = eventId ? { event_id: eventId } : undefined;
    const response = await apiClient.get('/site-selection/forms', { params });
    return response.data;
  },

  createForm: async (payload: SiteSelectionFormCreate): Promise<SiteSelectionFormDetails> => {
    const response = await apiClient.post('/site-selection/forms', payload);
    return response.data;
  },

  getForm: async (formId: string): Promise<SiteSelectionFormDetails> => {
    const response = await apiClient.get(`/site-selection/forms/${formId}`);
    return response.data;
  },

  updateForm: async (
    formId: string,
    payload: SiteSelectionFormUpdate,
  ): Promise<SiteSelectionFormDetails> => {
    const response = await apiClient.put(`/site-selection/forms/${formId}`, payload);
    return response.data;
  },

  deleteForm: async (formId: string): Promise<void> => {
    await apiClient.delete(`/site-selection/forms/${formId}`);
  },
};

export const publicSiteSelectionApi = {
  getForm: async (guid: string): Promise<SiteSelectionFormDetails> => {
    const response = await axios.get(`${API_BASE_URL}/site-selection/public/${guid}`);
    return response.data;
  },

  submitForm: async (guid: string, payload: SiteSelectionSubmit): Promise<void> => {
    await axios.post(`${API_BASE_URL}/site-selection/public/${guid}/submit`, payload);
  },
};
