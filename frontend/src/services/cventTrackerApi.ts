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

export interface CventDroppedVenue {
  id: string;
  tracker_id: string;
  merge_job_id: string;
  sheet_name: string;
  venue_label: string;
  snapshot_cells: Array<{ row: number; col: number; value: string | null }>;
  dropped_at: string;
}

export interface CventTrackerView {
  id: string;
  event_id: string;
  created_by_user_id: string | null;
  created_at: string;
  reset_at: string | null;
  uploads: CventUpload[];
  pending_merge_job_id: string | null;
  dropped_venues: CventDroppedVenue[];
}

// ---------- Phase 5: merge jobs / conflicts ----------

export type ConflictResolution = 'keep_mine' | 'take_new' | 'show_both';

export interface CventCellConflict {
  id: string;
  merge_job_id: string;
  master_sheet_id: string;
  row_idx: number;
  col_idx: number;
  old_cvent_value: string | null;
  new_cvent_value: string | null;
  master_value: string | null;
  master_value_html: string | null;
  venue_label: string | null;
  resolution: ConflictResolution | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CventVenueMatchProposal {
  id: string;
  merge_job_id: string;
  sheet_name: string;
  old_venue_label: string;
  new_venue_label: string;
  confidence: string;  // Decimal arrives as string
  accepted: boolean | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CventMergeJobDetail {
  id: string;
  tracker_id: string;
  new_upload_id: string;
  previous_upload_id: string | null;
  cells_unchanged: number;
  cells_auto_applied: number;
  venues_added: number;
  venues_dropped: number;
  venues_renamed: number;
  created_at: string;
  completed_at: string | null;
  pending_match_proposals: CventVenueMatchProposal[];
  unresolved_conflicts: CventCellConflict[];
  resolved_conflicts: CventCellConflict[];
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

  // ---------- Phase 5: merge jobs / conflicts ----------

  getMergeJob: async (eventId: string, mergeJobId: string): Promise<CventMergeJobDetail> => {
    const res = await apiClient.get(
      `/commissions/${eventId}/cvent-tracker/merge-jobs/${mergeJobId}`,
    );
    return res.data;
  },

  resolveConflict: async (
    eventId: string, conflictId: string, resolution: ConflictResolution,
  ): Promise<CventCellConflict> => {
    const res = await apiClient.post(
      `/commissions/${eventId}/cvent-tracker/conflicts/${conflictId}/resolve`,
      { resolution },
    );
    return res.data;
  },

  resolveMatchProposal: async (
    eventId: string, proposalId: string, accepted: boolean,
  ): Promise<CventVenueMatchProposal> => {
    const res = await apiClient.post(
      `/commissions/${eventId}/cvent-tracker/match-proposals/${proposalId}/resolve`,
      { accepted },
    );
    return res.data;
  },

  completeMergeJob: async (eventId: string, mergeJobId: string): Promise<void> => {
    await apiClient.post(
      `/commissions/${eventId}/cvent-tracker/merge-jobs/${mergeJobId}/complete`,
    );
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
