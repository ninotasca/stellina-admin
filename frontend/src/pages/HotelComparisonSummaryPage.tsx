import { getApiErrorMessage } from '../services/http';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import {
  cventTrackerApi,
  type CventTrackerView,
  type CventUpload,
} from '../services/cventTrackerApi';
import type { CommissionEventWithLineItems } from '../types/commission';

type UploadStep = 'idle' | 'checking' | 'uploading' | 'reading' | 'building' | 'done';

const STEP_LABEL: Record<UploadStep, string> = {
  idle: 'Waiting for a spreadsheet',
  checking: 'Checking file type',
  uploading: 'Uploading source spreadsheet',
  reading: 'Reading workbook tabs and hotel rows',
  building: 'Building the editable summary',
  done: 'Ready',
};

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const safeFileSegment = (s: string): string =>
  s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'booking';

const downloadFilename = (bookingName: string, uploadedAtIso: string, suffix = ''): string => {
  const d = new Date(uploadedAtIso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${safeFileSegment(bookingName)} - Hotel Comparison Summary - ${yyyy}-${mm}-${dd}${suffix}.xlsx`;
};

const friendlyUploadError = (detail: string): string => {
  const lower = detail.toLowerCase();
  if (
    lower.includes('file must be a .xlsx') ||
    lower.includes('could not read .xlsx') ||
    lower.includes('unsupported content type') ||
    lower.includes('empty file')
  ) {
    return [
      'This does not look like the expected Hotel Comparison Summary input.',
      'Please upload the Cvent hotel comparison export as an .xlsx workbook with the Summary tab and destination hotel tabs intact.',
      `Technical detail: ${detail}`,
    ].join(' ');
  }
  return detail;
};

const HotelComparisonSummaryPage: React.FC = () => {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepTimerRefs = useRef<number[]>([]);

  const [event, setEvent] = useState<CommissionEventWithLineItems | null>(null);
  const [tracker, setTracker] = useState<CventTrackerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<UploadStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    setError(null);
    try {
      const [ev, t] = await Promise.all([
        commissionApi.getEvent(eventId),
        cventTrackerApi.get(eventId),
      ]);
      setEvent(ev);
      setTracker(t);
      if (t?.pending_merge_job_id) {
        navigate(`/commissions/${eventId}/cvent-merge/${t.pending_merge_job_id}`);
      }
    } catch (e: any) {
      setError(getApiErrorMessage(e, 'Failed to load Hotel Comparison Summary'));
    } finally {
      setLoading(false);
    }
  }, [eventId, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    stepTimerRefs.current.forEach((timer) => window.clearTimeout(timer));
    stepTimerRefs.current = [];
  }, []);

  const advanceStep = (next: UploadStep, afterMs = 700) => {
    const timer = window.setTimeout(() => setStep(next), afterMs);
    stepTimerRefs.current.push(timer);
  };

  const handleFile = async (file: File) => {
    if (!eventId || busy) return;
    setBusy(true);
    setError(null);
    setStep('checking');
    stepTimerRefs.current.forEach((timer) => window.clearTimeout(timer));
    stepTimerRefs.current = [];

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('This does not look like the expected Hotel Comparison Summary input. Please upload an .xlsx workbook exported from the hotel comparison process.');
      setBusy(false);
      setStep('idle');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setStep('uploading');
      advanceStep('reading');
      advanceStep('building', 1600);
      const updated = await cventTrackerApi.upload(eventId, file);
      setTracker(updated);
      setStep('done');
      if (updated.pending_merge_job_id) {
        navigate(`/commissions/${eventId}/cvent-merge/${updated.pending_merge_job_id}`);
      }
    } catch (e: any) {
      const detail = getApiErrorMessage(e, 'Upload failed');
      setError(friendlyUploadError(detail));
      setStep('idle');
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
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleDownload = async (upload: CventUpload) => {
    if (!eventId) return;
    setError(null);
    try {
      const bookingName = event?.meeting_name || event?.client_company_name || 'booking';
      const suffix = upload.source === 'master' ? '' : ' (source upload)';
      const name = downloadFilename(bookingName, upload.uploaded_at, suffix);
      const url = await cventTrackerApi.getDownloadUrl(eventId, upload.id, name);
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      setError(getApiErrorMessage(e, 'Download failed'));
    }
  };

  const handleReset = async () => {
    if (!eventId) return;
    setShowResetConfirm(false);
    setBusy(true);
    setError(null);
    try {
      await cventTrackerApi.reset(eventId);
      setTracker(null);
      setStep('idle');
    } catch (e: any) {
      setError(getApiErrorMessage(e, 'Reset failed'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading Hotel Comparison Summary…</div>;
  if (!eventId || !event) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error || 'Booking not found'}
        </div>
      </div>
    );
  }

  const uploads = tracker?.uploads ?? [];
  const originals = uploads.filter((u) => u.source === 'cvent');
  const master = uploads.find((u) => u.source === 'master') ?? null;
  const droppedVenues = tracker?.dropped_venues ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate(`/commissions/${eventId}`)}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to booking
            </button>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">Hotel Comparison Summary</h1>
            <p className="mt-1 text-sm text-gray-600">
              {event.meeting_name} · Upload the source workbook, review the editable summary, and manage re-uploads here.
            </p>
          </div>
          <Link
            to="/hotel-comparisons"
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            All Hotel Comparisons
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Upload source workbook</h2>
              <p className="mt-1 text-sm text-gray-600">
                Expected input is the hotel comparison .xlsx export with its Summary tab and destination tabs preserved.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onPickFile}
                className="hidden"
              />

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => !busy && fileInputRef.current?.click()}
                className={`mt-4 border-2 border-dashed rounded-lg px-4 py-8 text-center cursor-pointer transition-colors ${
                  isDragging ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                } ${busy ? 'opacity-70 cursor-wait' : ''}`}
              >
                <div className="text-sm font-medium">
                  {busy
                    ? STEP_LABEL[step]
                    : uploads.length === 0
                      ? 'Drop the hotel comparison .xlsx here, or click to choose one'
                      : 'Drop an updated hotel comparison .xlsx here, or click to choose one'}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {busy ? 'Please hold while the file is checked, parsed, and turned into the editable summary.' : 'Only .xlsx workbooks are accepted.'}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700">Processing steps</h3>
              <ol className="mt-3 space-y-2 text-sm">
                {(['checking', 'uploading', 'reading', 'building', 'done'] as UploadStep[]).map((s, idx) => {
                  const activeIdx = ['checking', 'uploading', 'reading', 'building', 'done'].indexOf(step);
                  const done = activeIdx > idx || step === 'done';
                  const active = step === s && step !== 'done';
                  return (
                    <li key={s} className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center ${
                        done ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-500'
                      }`}>
                        {done ? '✓' : idx + 1}
                      </span>
                      <span className={active ? 'font-medium text-blue-800' : done ? 'text-emerald-800' : 'text-gray-600'}>
                        {STEP_LABEL[s]}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Current summary</h2>
            {master && (
              <div className="flex gap-2">
                <Link
                  to={`/commissions/${eventId}/cvent/${master.id}`}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
                >
                  Open Spreadsheet
                </Link>
                <button
                  type="button"
                  onClick={() => handleDownload(master)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Download
                </button>
              </div>
            )}
          </div>

          {master ? (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
              <div className="text-sm font-medium text-gray-900">{master.original_filename}</div>
              <div className="mt-1 text-xs text-gray-600">
                Editable summary · created {formatDateTime(master.uploaded_at)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              No Hotel Comparison Summary has been created for this booking yet.
            </p>
          )}

          {originals.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">
                Source uploads ({originals.length})
              </div>
              <ul className="divide-y divide-gray-100">
                {originals.map((o) => (
                  <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{o.original_filename}</div>
                      <div className="text-xs text-gray-500">{formatDateTime(o.uploaded_at)} · read-only source</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(o)}
                      className="shrink-0 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {droppedVenues.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <div className="text-[11px] uppercase tracking-wider text-red-700 mb-1">
                Hotels dropped from latest source ({droppedVenues.length})
              </div>
              <ul className="text-xs text-gray-700 space-y-1">
                {droppedVenues.map((d) => (
                  <li key={d.id}>
                    <span className="font-medium">{d.venue_label}</span>
                    <span className="text-gray-500"> on {d.sheet_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploads.length > 0 && (
            <div className="flex justify-end pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                disabled={busy}
                className="px-3 py-1.5 text-sm font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-40"
              >
                Reset summary
              </button>
            </div>
          )}
        </section>
      </main>

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-red-700">Delete this Hotel Comparison Summary?</h3>
            <p className="mt-2 text-sm text-gray-700">
              This removes the editable summary and all source uploads for this booking. The next upload will start fresh.
            </p>
            <p className="mt-2 text-sm font-medium text-red-700">This cannot be undone.</p>
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
                Yes, reset it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HotelComparisonSummaryPage;
