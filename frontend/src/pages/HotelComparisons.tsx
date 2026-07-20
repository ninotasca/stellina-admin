import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import { cventTrackerApi, type CventTrackerView } from '../services/cventTrackerApi';
import { parseLocalDate } from '../utils/date';
import type { CommissionEventWithLineItems } from '../types/commission';

interface ComparisonRow {
  event: CommissionEventWithLineItems;
  tracker: CventTrackerView | null;
}

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '—';
  return parseLocalDate(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (v: string | null | undefined): string => {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const HotelComparisons: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'needs_review'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [events, trackers] = await Promise.all([
          commissionApi.listEvents(),
          cventTrackerApi.listAll(),
        ]);
        const trackersByEvent = new Map(trackers.map((tracker) => [tracker.event_id, tracker]));
        const hotelEventsWithUploads = events.filter((ev) => {
          const tracker = trackersByEvent.get(ev.id);
          return ev.considerations.includes('hotel') && Boolean(tracker?.uploads.length);
        });
        const withTrackers = hotelEventsWithUploads.map((event) => ({
          event,
          tracker: trackersByEvent.get(event.id) ?? null,
        }));
        if (!cancelled) setRows(withTrackers);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || e.message || 'Failed to load hotel comparisons');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(({ event, tracker }) => {
        const needsReview = Boolean(tracker?.pending_merge_job_id);
        if (scope === 'needs_review' && !needsReview) return false;
        if (!q) return true;
        return [
          event.meeting_name,
          event.client_company_name || '',
          event.destination || '',
          ...(event.destinations || []),
        ].join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.event.arrival_date || '9999').localeCompare(b.event.arrival_date || '9999'));
  }, [rows, scope, search]);

  const counts = useMemo(() => {
    const has = rows.filter((r) => r.tracker?.uploads.some((u) => u.source === 'master')).length;
    const review = rows.filter((r) => r.tracker?.pending_merge_job_id).length;
    return { total: rows.length, has, review };
  }, [rows]);

  return (
    <div>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hotel Comparisons</h1>
            <p className="mt-1 text-sm text-gray-600">
              Bookings with uploaded hotel comparison files.
            </p>
          </div>
          <Link
            to="/commissions/list"
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Back to Bookings
          </Link>
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="With uploads" value={counts.total} />
          <Stat label="With summaries" value={counts.has} />
          <Stat label="Need review" value={counts.review} tone="amber" />
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search booking, company, destination…"
            className="min-w-[260px] flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden bg-white">
            {([
              ['all', 'All'],
              ['needs_review', 'Needs Review'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setScope(value)}
                className={`px-3 py-1.5 text-sm ${scope === value ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading hotel comparisons…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
            No uploaded hotel comparison files match this view. Start one from a booking page.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Booking</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trip</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Upload</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.map(({ event, tracker }) => {
                  const master = tracker?.uploads.find((u) => u.source === 'master') ?? null;
                  const originalCount = tracker?.uploads.filter((u) => u.source === 'cvent').length ?? 0;
                  const needsReview = Boolean(tracker?.pending_merge_job_id);
                  return (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/commissions/${event.id}`)}
                          className="text-left font-medium text-gray-900 hover:underline"
                        >
                          {event.meeting_name}
                        </button>
                        <div className="text-xs text-gray-500">{event.client_company_name || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {fmtDate(event.arrival_date)} – {fmtDate(event.depart_date)}
                      </td>
                      <td className="px-4 py-3">
                        {needsReview ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">Needs review</span>
                        ) : master ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
                            Summary ready · {originalCount} upload{originalCount === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                            Source uploaded · building summary
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {fmtDateTime(master?.uploaded_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/commissions/${event.id}/hotel-comparison`}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; tone?: 'gray' | 'amber' }> = ({ label, value, tone = 'gray' }) => (
  <div className={`rounded-lg border p-4 ${tone === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
    <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
    <div className={`mt-1 text-2xl font-semibold ${tone === 'amber' ? 'text-amber-800' : 'text-gray-900'}`}>{value}</div>
  </div>
);

export default HotelComparisons;
