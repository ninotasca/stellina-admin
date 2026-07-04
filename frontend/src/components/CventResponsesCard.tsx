import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  cventTrackerApi,
  type CventTrackerView,
  type CventUpload,
} from '../services/cventTrackerApi';

interface Props {
  eventId: string;
  bookingName: string;
}

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// macOS/Windows reject /, \, :, *, ?, ", <, >, | in filenames.
const safeFileSegment = (s: string): string =>
  s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'booking';

const downloadFilename = (bookingName: string, uploadedAtIso: string, suffix = ''): string => {
  const d = new Date(uploadedAtIso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${safeFileSegment(bookingName)} - ${yyyy}-${mm}-${dd}${suffix}.xlsx`;
};

const CventResponsesCard: React.FC<Props> = ({ eventId, bookingName }) => {
  const navigate = useNavigate();
  const [tracker, setTracker] = useState<CventTrackerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const t = await cventTrackerApi.get(eventId);
      setTracker(t);
      // Phase 5: if there's a pending merge, drag the user into it. The
      // Master is "locked" until they complete the merge.
      if (t?.pending_merge_job_id) {
        navigate(`/commissions/${eventId}/cvent-merge/${t.pending_merge_job_id}`);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load Excel files');
    } finally {
      setLoading(false);
    }
  }, [eventId, navigate]);

  useEffect(() => { reload(); }, [reload]);

  const handleFile = async (file: File) => {
    setBusy(true); setError(null);
    try {
      const updated = await cventTrackerApi.upload(eventId, file);
      setTracker(updated);
      // A re-upload spawns a merge job — go straight to the conflict page.
      if (updated.pending_merge_job_id) {
        navigate(`/commissions/${eventId}/cvent-merge/${updated.pending_merge_job_id}`);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleDownload = async (upload: CventUpload) => {
    setError(null);
    try {
      const suffix = upload.source === 'master' ? '' : ' (cvent original)';
      const name = downloadFilename(bookingName, upload.uploaded_at, suffix);
      const url = await cventTrackerApi.getDownloadUrl(eventId, upload.id, name);
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Download failed');
    }
  };

  const handleReset = async () => {
    setShowResetConfirm(false);
    setBusy(true); setError(null);
    try {
      await cventTrackerApi.reset(eventId);
      setTracker(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  const uploads = tracker?.uploads ?? [];
  const droppedVenues = tracker?.dropped_venues ?? [];

  // Phase 5: there's one living Master per tracker (not per original).
  // Render all cvent originals as their own rows, and the single Master
  // once at the top.
  const originals = uploads.filter((u) => u.source === 'cvent');
  const master = uploads.find((u) => u.source === 'master') ?? null;

  return (
    <div className="rounded-md bg-amber-50 ring-1 ring-amber-100 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
          Excel Files
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={onPickFile}
        className="hidden"
      />

      {error && (
        <div className="mb-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-amber-700/70 italic">Loading…</p>
      ) : (
        <>
          {/* Master — the single living document for this tracker. */}
          {master && (
            <div className="mb-2 p-2 rounded bg-amber-100/50 ring-1 ring-amber-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2 min-w-0 text-sm">
                  <span className="font-medium text-gray-900 truncate">Master</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-600 whitespace-nowrap">auto-styled</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 whitespace-nowrap">editable</span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Link
                    to={`/commissions/${eventId}/cvent/${master.id}`}
                    className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded hover:bg-amber-100"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDownload(master)}
                    className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded hover:bg-amber-100"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cvent originals — one per re-upload, immutable. Download only. */}
          {originals.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                Cvent originals ({originals.length})
              </div>
              <ul className="divide-y divide-gray-100">
                {originals.map((o) => (
                  <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2 min-w-0 text-sm">
                      <span className="font-medium text-gray-900 truncate">{o.original_filename}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500 whitespace-nowrap">{formatDateTime(o.uploaded_at)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 whitespace-nowrap">read-only</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(o)}
                      className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 shrink-0"
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dropped from Cvent — venues that disappeared in a re-upload. */}
          {droppedVenues.length > 0 && (
            <div className="mb-2 mt-2 pt-2 border-t border-amber-200">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">
                Dropped from Cvent ({droppedVenues.length})
              </div>
              <ul className="text-xs text-gray-700 space-y-1">
                {droppedVenues.map((d) => (
                  <li key={d.id} className="flex items-baseline gap-2">
                    <span className="text-gray-400">·</span>
                    <span className="font-medium">{d.venue_label}</span>
                    <span className="text-gray-500">on {d.sheet_name}</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(d.dropped_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Drop-zone — always available so a new file can land at any time. */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => !busy && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded px-3 py-2 text-center text-xs cursor-pointer transition-colors ${
              isDragging ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-amber-300 text-amber-700/80 hover:bg-amber-100'
            } ${busy ? 'opacity-50 cursor-wait' : ''}`}
          >
            {busy ? 'Working…' : (uploads.length === 0
              ? 'Drop a Cvent .xlsx here, or click to pick one'
              : 'Drop another .xlsx here to add a newer version')}
          </div>

          {uploads.length > 0 && (
            <div className="flex justify-end mt-3 pt-2 border-t border-amber-100">
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                disabled={busy}
                className="px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200 rounded hover:bg-red-50 disabled:opacity-40"
              >
                Reset — delete all Excel files
              </button>
            </div>
          )}
        </>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-red-700">Delete all Excel files?</h3>
            <p className="mt-2 text-sm text-gray-700">
              This will remove <strong>all {uploads.length} uploaded file{uploads.length === 1 ? '' : 's'}</strong> from this booking's tracker. The next upload starts fresh.
            </p>
            <p className="mt-2 text-sm font-medium text-red-700">
              This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Yes, delete everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CventResponsesCard;
