import { getApiErrorMessage } from '../services/http';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  cventTrackerApi,
  type CventTrackerView,
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

const CventResponsesCard: React.FC<Props> = ({ eventId, bookingName }) => {
  const navigate = useNavigate();
  const [tracker, setTracker] = useState<CventTrackerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const t = await cventTrackerApi.get(eventId);
      setTracker(t);
    } catch (e: any) {
      setError(getApiErrorMessage(e, 'Failed to load Hotel Comparison Summary'));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { reload(); }, [reload]);

  const uploads = tracker?.uploads ?? [];
  const master = uploads.find((u) => u.source === 'master') ?? null;
  const originals = uploads.filter((u) => u.source === 'cvent');
  const pending = tracker?.pending_merge_job_id ?? null;

  return (
    <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Hotel Comparison Summary
          </div>
          <p className="mt-1 text-sm text-gray-700">
            {loading
              ? 'Checking summary status…'
              : master
                ? `${bookingName} has an editable comparison summary from ${formatDateTime(master.uploaded_at)}.`
                : 'Upload and manage the hotel comparison spreadsheet away from the booking details.'}
          </p>
          {!loading && !error && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
              <span>{master ? '1 editable summary' : 'No summary yet'}</span>
              <span className="text-gray-300">·</span>
              <span>{originals.length} source upload{originals.length === 1 ? '' : 's'}</span>
              {pending && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="font-medium text-amber-700">Merge needs review</span>
                </>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
        <button
          type="button"
          onClick={() => navigate(`/commissions/${eventId}/hotel-comparison`)}
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-100"
        >
          {master ? 'Open Summary' : 'Start Summary'}
        </button>
      </div>
    </div>
  );
};

export default CventResponsesCard;
