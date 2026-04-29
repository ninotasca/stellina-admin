import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

const apiClient = axios.create({ baseURL: API_BASE_URL });
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type NimbleRecordType = 'person' | 'company' | 'all';

// External URL builder. Nimble's web app uses hash-routing.
export const nimbleEntityUrl = (kind: 'contact' | 'deal', id: string): string =>
  kind === 'deal'
    ? `https://app.nimble.com/#/app/deals-next/pipeline/view?id=${id}`
    : `https://app.nimble.com/#/app/contacts/list/view?id=${id}`;

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

export interface NimbleDeal {
  deal_id: string;
  deal_number: number;
  name: string;
  description?: string | null;
  amount?: string | null;
  currency?: string | null;
  destination?: string | null;
  hotel_resort_dmc?: string | null;
  commission_pct?: string | null;
  total_revenue?: string | null;
  anticipated_commission?: string | null;
  what?: string | null;
  status?: string | null;
  meeting_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  expected_close_date?: string | null;
  actual_close_date?: string | null;
  stage?: { id?: string; name?: string } | string | null;
  pipeline_name?: string | null;
  owner_name?: string | null;
  created?: string;
  updated?: string;
  related_contact_count: number;
}

export interface NimbleDealsResponse {
  meta: { page: number; pages: number; per_page: number; total: number; total_amount?: number; weighted_amount?: number; has_more?: boolean };
  deals: NimbleDeal[];
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

  listDeals: async (params: { page?: number; per_page?: number } = {}): Promise<NimbleDealsResponse> => {
    const search = new URLSearchParams();
    if (params.page) search.set('page', String(params.page));
    if (params.per_page) search.set('per_page', String(params.per_page));
    const qs = search.toString();
    const res = await apiClient.get(`/nimble/deals${qs ? `?${qs}` : ''}`);
    return res.data;
  },
};
