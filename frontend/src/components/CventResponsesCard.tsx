import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load Excel files');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { reload(); }, [reload]);

  const handleFile = async (file: File) => {
    setBusy(true); setError(null);
    try {
      const updated = await cventTrackerApi.upload(eventId, file);
      setTracker(updated);
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

  // Group originals + their masters. Each "group" renders as one parent row
  // (the immutable Cvent original) with one indented child (the editable
  // master). Legacy uploads that pre-date the two-file model show alone.
  const groups = (() => {
    const originals = uploads.filter((u) => u.source === 'cvent');
    const mastersByParent = new Map<string, CventUpload>();
    for (const u of uploads) {
      if (u.source === 'master' && u.parent_upload_id) {
        mastersByParent.set(u.parent_upload_id, u);
      }
    }
    return originals.map((o) => ({ original: o, master: mastersByParent.get(o.id) ?? null }));
  })();

  return (
    <div className="rounded-md bg-amber-50 ring-1 ring-amber-100 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
          Excel Files ({groups.length})
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
          {groups.length > 0 && (
            <ul className="divide-y divide-amber-100 mb-2">
              {groups.map(({ original, master }) => (
                <li key={original.id} className="py-2 space-y-1.5">
                  {/* Parent: Cvent original — immutable. Download only. */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2 min-w-0 text-sm">
                      <span className="font-medium text-gray-900 truncate">{original.original_filename}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-600 whitespace-nowrap">Cvent original</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500 whitespace-nowrap">{formatDateTime(original.uploaded_at)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 whitespace-nowrap">read-only</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownload(original)}
                        className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Download
                      </button>
                    </div>
                  </div>

                  {/* Child: Master — auto-generated, editable. View + Download. */}
                  {master ? (
                    <div className="flex items-center justify-between gap-3 pl-5 border-l-2 border-amber-300">
                      <div className="flex items-baseline gap-2 min-w-0 text-sm">
                        <span className="text-amber-700/80">↳</span>
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
                  ) : (
                    <div className="pl-5 text-[11px] text-amber-700/60 italic border-l-2 border-amber-200">
                      ↳ Master not generated for this upload (legacy data — reset & re-upload to create one).
                    </div>
                  )}
                </li>
              ))}
            </ul>
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
