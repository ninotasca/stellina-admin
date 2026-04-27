import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

const apiClient = axios.create({ baseURL: API_BASE_URL });
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type NimbleRecordType = 'person' | 'company' | 'all';

export interface NimbleFieldEntry {
  value: string;
  modifier?: string;
  label?: string;
}

export interface NimbleContact {
  id: string;
  record_type: 'person' | 'company';
  fields: Record<string, NimbleFieldEntry[]>;
  tags?: string[];
  avatar_url?: string;
  created?: string;
  updated?: string;
  owner_id?: string;
}

export interface NimbleListResponse {
  meta: { page: number; pages: number; per_page: number; total: number };
  resources: NimbleContact[];
}

export interface NimbleCompanyLite {
  id: string;
  name: string;
  url?: string;
  domain?: string;
  industry?: string;
}

export interface NimblePersonLite {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  company_id?: string | null;
}

export const nimbleApi = {
  listContacts: async (params: {
    record_type?: NimbleRecordType;
    page?: number;
    per_page?: number;
    q?: string;
  }): Promise<NimbleListResponse> => {
    const search = new URLSearchParams();
    if (params.record_type) search.set('record_type', params.record_type);
    if (params.page) search.set('page', String(params.page));
    if (params.per_page) search.set('per_page', String(params.per_page));
    if (params.q) search.set('q', params.q);
    const res = await apiClient.get(`/nimble/contacts?${search.toString()}`);
    return res.data;
  },

  listAllCompanies: async (): Promise<NimbleCompanyLite[]> => {
    const res = await apiClient.get('/nimble/companies');
    return res.data;
  },

  listContactsByCompany: async (params: { company_id?: string | null; company?: string | null }): Promise<NimblePersonLite[]> => {
    const search = new URLSearchParams();
    if (params.company_id) search.set('company_id', params.company_id);
    if (params.company) search.set('company', params.company);
    const res = await apiClient.get(`/nimble/contacts-by-company?${search.toString()}`);
    return res.data;
  },
};
