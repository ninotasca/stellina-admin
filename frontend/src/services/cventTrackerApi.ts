import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

const apiClient = axios.create({ baseURL: API_BASE_URL });
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type CventUploadSource = 'cvent' | 'master';

export interface CventUpload {
  id: string;
  tracker_id: string;
  uploaded_by_user_id: string | null;
  original_filename: string;
  storage_path: string;
  sha256: string;
  uploaded_at: string;
  /** 'cvent' = the immutable user-uploaded file; 'master' = our styled rebuild (editable). */
  source: CventUploadSource;
  /** Set on masters, points to the cvent original they were generated from. */
  parent_upload_id: string | null;
}

export type CventSheetKind = 'summary' | 'destination';

export interface CventCell {
  row_idx: number;
  col_idx: number;
  value: string | null;
  number_format: string | null;
  font_bold: boolean;
  font_italic: boolean;
  font_color: string | null;
  fill_color: string | null;
  // Phase 4 — per-cell user edits
  value_html?: string | null;
  link_url?: string | null;
  is_red_flagged?: boolean;
  is_user_edited?: boolean;
}

export interface CventCellPatch {
  value?: string | null;
  value_html?: string | null;
  link_url?: string | null;
  is_red_flagged?: boolean;
  font_bold?: boolean;
  font_italic?: boolean;
}

export interface CventSheetWithCells {
  id: string;
  name: string;
  kind: CventSheetKind;
  position: number;
  cell_count: number;
  cells: CventCell[];
  max_row: number;
  max_col: number;
}

export interface CventUploadDetail extends CventUpload {
  sheets: CventSheetWithCells[];
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

  /** Fetch one upload's full payload (sheets + cells). Used by the viewer. */
  getUpload: async (eventId: string, uploadId: string): Promise<CventUploadDetail> => {
    const res = await apiClient.get(
      `/commissions/${eventId}/cvent-tracker/uploads/${uploadId}`,
    );
    return res.data;
  },

  /** Edit one cell on a master upload. Returns the resulting (upserted)
   * cell. 403 if called on a Cvent original. */
  patchCell: async (
    eventId: string,
    uploadId: string,
    sheetId: string,
    rowIdx: number,
    colIdx: number,
    patch: CventCellPatch,
  ): Promise<CventCell> => {
    const res = await apiClient.patch(
      `/commissions/${eventId}/cvent-tracker/uploads/${uploadId}/sheets/${sheetId}/cells/${rowIdx}/${colIdx}`,
      patch,
    );
    return res.data;
  },

  /** Returns a short-lived signed URL for direct download of the raw
   * Cvent .xlsx from Supabase Storage. Mostly useful for audit / debug;
   * the user-facing Download button uses downloadMaster instead. */
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
