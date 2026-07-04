import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  cventTrackerApi,
  type CventCellConflict,
  type CventMergeJobDetail,
  type CventVenueMatchProposal,
  type ConflictResolution,
} from '../services/cventTrackerApi';

const colLetter = (n: number): string => {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const CventMergePage: React.FC = () => {
  const { id: eventId, mergeJobId } = useParams<{ id: string; mergeJobId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<CventMergeJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!eventId || !mergeJobId) return;
    setError(null);
    try {
      const res = await cventTrackerApi.getMergeJob(eventId, mergeJobId);
      setDetail(res);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load merge');
    } finally {
      setLoading(false);
    }
  }, [eventId, mergeJobId]);

  useEffect(() => { reload(); }, [reload]);

  const handleProposal = async (p: CventVenueMatchProposal, accepted: boolean) => {
    if (!eventId) return;
    setBusy(true);
    try {
      await cventTrackerApi.resolveMatchProposal(eventId, p.id, accepted);
      await reload();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async (c: CventCellConflict, resolution: ConflictResolution) => {
    if (!eventId) return;
    setBusy(true);
    try {
      await cventTrackerApi.resolveConflict(eventId, c.id, resolution);
      await reload();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!eventId || !mergeJobId) return;
    setBusy(true);
    try {
      await cventTrackerApi.completeMergeJob(eventId, mergeJobId);
      navigate(`/commissions/${eventId}`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed to complete');
      setBusy(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading merge…</div>;
  if (error && !detail) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
        <button onClick={() => navigate(`/commissions/${eventId}`)} className="mt-4 text-sm text-blue-600 hover:underline">
          ← Back to booking
        </button>
      </div>
    );
  }
  if (!detail) return null;

  const proposals = detail.pending_match_proposals;
  const unresolved = detail.unresolved_conflicts;
  const allClear = proposals.length === 0 && unresolved.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold text-gray-900">
            Merge Cvent re-upload
          </h1>
          <span className="text-xs text-gray-500">
            into your Master tracker
          </span>
        </div>
        <button
          onClick={() => navigate(`/commissions/${eventId}`)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          ← Back (without completing)
        </button>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
        )}

        {/* Summary card */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">Summary of changes</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <Stat label="Auto-applied" value={detail.cells_auto_applied} tone="green" />
            <Stat label="Unchanged" value={detail.cells_unchanged} tone="gray" />
            <Stat label="Venues added" value={detail.venues_added} tone="blue" />
            <Stat label="Venues renamed" value={detail.venues_renamed} tone="amber" />
            <Stat label="Venues dropped" value={detail.venues_dropped} tone="red" />
          </dl>
        </section>

        {/* Venue match proposals — surfaced first since cell diff only runs
            after they're resolved (in the v1 impl, low-confidence pairs
            are surfaced for future re-diff; high-conf already applied). */}
        {proposals.length > 0 && (
          <section className="bg-white rounded-lg shadow-sm border border-amber-200 p-4">
            <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider mb-2">
              Did Cvent rename these venues? ({proposals.length})
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Claude wasn't sure these are the same venue. Confirm so the diff can use them as one.
            </p>
            <ul className="divide-y divide-gray-100">
              {proposals.map((p) => (
                <li key={p.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="text-gray-500 text-xs">{p.sheet_name}</div>
                    <div>
                      <span className="font-medium text-gray-900">{p.old_venue_label}</span>
                      <span className="mx-2 text-gray-400">→</span>
                      <span className="font-medium text-gray-900">{p.new_venue_label}</span>
                      <span className="ml-2 text-[10px] text-gray-500">
                        confidence {Math.round(parseFloat(p.confidence) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => handleProposal(p, true)}
                      className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-40"
                    >
                      Yes, same venue
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleProposal(p, false)}
                      className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                    >
                      No, different
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Cell conflicts */}
        {unresolved.length > 0 ? (
          <section className="bg-white rounded-lg shadow-sm border border-red-200 p-4">
            <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-2">
              Cell conflicts ({unresolved.length})
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              You edited these cells and Cvent's new file also changes them. Pick one.
            </p>
            <ul className="space-y-3">
              {unresolved.map((c) => (
                <li key={c.id} className="border border-gray-200 rounded p-3">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{c.venue_label ?? '—'}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {colLetter(c.col_idx)}{c.row_idx}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <ConflictChoice
                      label="Your edit"
                      value={c.master_value}
                      onPick={() => handleResolve(c, 'keep_mine')}
                      tone="amber"
                      busy={busy}
                    />
                    <ConflictChoice
                      label="Cvent's new value"
                      value={c.new_cvent_value}
                      onPick={() => handleResolve(c, 'take_new')}
                      tone="blue"
                      busy={busy}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleResolve(c, 'show_both')}
                    className="mt-2 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    Keep both (yours then Cvent's, separated by a newline)
                  </button>
                  {c.old_cvent_value && (
                    <div className="mt-2 text-[10px] text-gray-400">
                      old Cvent value (for reference): {c.old_cvent_value}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="bg-white rounded-lg shadow-sm border border-emerald-200 p-4">
            <h2 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">No conflicts</h2>
            <p className="text-sm text-gray-700 mt-1">
              Cvent's changes have been auto-applied to your Master. Hit "Complete merge" to return to the booking.
            </p>
          </section>
        )}

        {/* Resolved (audit) */}
        {detail.resolved_conflicts.length > 0 && (
          <details className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <summary className="cursor-pointer text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Resolved conflicts ({detail.resolved_conflicts.length})
            </summary>
            <ul className="mt-2 divide-y divide-gray-100 text-xs">
              {detail.resolved_conflicts.map((c) => (
                <li key={c.id} className="py-2 flex justify-between gap-3">
                  <span className="truncate">
                    {c.venue_label ?? '—'} {colLetter(c.col_idx)}{c.row_idx}
                  </span>
                  <span className="text-gray-500">{c.resolution}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Complete button */}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || !allClear}
            onClick={handleComplete}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title={allClear ? '' : 'Resolve every conflict + match proposal first'}
          >
            Complete merge
          </button>
        </div>
      </main>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; tone: 'green' | 'gray' | 'blue' | 'amber' | 'red' }> = ({
  label, value, tone,
}) => {
  const toneCls = {
    green: 'text-emerald-700',
    gray: 'text-gray-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  }[tone];
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${toneCls}`}>{value}</dd>
    </div>
  );
};

const ConflictChoice: React.FC<{
  label: string;
  value: string | null;
  tone: 'amber' | 'blue';
  busy: boolean;
  onPick: () => void;
}> = ({ label, value, tone, busy, onPick }) => {
  const border = tone === 'amber' ? 'border-amber-300 hover:bg-amber-50' : 'border-blue-300 hover:bg-blue-50';
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onPick}
      className={`text-left border-2 rounded p-2 ${border} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">{value ?? <em className="text-gray-400">(empty)</em>}</div>
    </button>
  );
};

export default CventMergePage;
