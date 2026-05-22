import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

const apiClient = axios.create({ baseURL: API_BASE_URL });
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface CventUpload {
  id: string;
  tracker_id: string;
  uploaded_by_user_id: string | null;
  original_filename: string;
  storage_path: string;
  sha256: string;
  uploaded_at: string;
}

export interface CventTrackerView {
  id: string;
  event_id: string;
  created_by_user_id: string | null;
  created_at: string;
  reset_at: string | null;
  uploads: CventUpload[];
}

export const cventTrackerApi = {
  /** Returns the live tracker for a Booking, or null when there's none yet. */
  get: async (eventId: string): Promise<CventTrackerView | null> => {
    try {
      const res = await apiClient.get(`/commissions/${eventId}/cvent-tracker`);
      return res.data;
    } catch (e: any) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },

  upload: async (eventId: string, file: File): Promise<CventTrackerView> => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post(
      `/commissions/${eventId}/cvent-tracker/uploads`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  },

  reset: async (eventId: string): Promise<void> => {
    await apiClient.delete(`/commissions/${eventId}/cvent-tracker`);
  },

  /** Returns a short-lived signed URL for direct download from Supabase
   * Storage. When downloadName is provided, the browser saves the file
   * under that name (via Content-Disposition, not the <a download>
   * attribute, which is ignored cross-origin). */
  getDownloadUrl: async (
    eventId: string,
    uploadId: string,
    downloadName?: string,
  ): Promise<string> => {
    const params = downloadName
      ? `?download_name=${encodeURIComponent(downloadName)}`
      : '';
    const res = await apiClient.get(
      `/commissions/${eventId}/cvent-tracker/uploads/${uploadId}/download${params}`,
    );
    return res.data.url;
  },
};
