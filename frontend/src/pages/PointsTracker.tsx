import { getApiErrorMessage } from '../services/http';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import { parseLocalDate } from '../utils/date';
import type { CommissionPointsRow } from '../types/commission';

type SortKey = 'meeting' | 'start' | 'end' | 'type' | 'points' | 'received';
type SortDir = 'asc' | 'desc';
type ReceivedFilter = 'all' | 'yes' | 'no';

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '—';
  return parseLocalDate(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

const fmtPoints = (n: number | null): string => {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
};

const PointsTracker: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CommissionPointsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [receivedFilter, setReceivedFilter] = useState<ReceivedFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('start');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await commissionApi.listAllPoints();
        if (!cancelled) setRows(data);
      } catch (err: any) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load points'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (receivedFilter === 'yes' && !r.received) return false;
      if (receivedFilter === 'no' && r.received) return false;
      if (q && !`${r.event_meeting_name} ${r.point_type}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, receivedFilter]);

  const sorted = useMemo(() => {
    const out = filtered.slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'meeting': cmp = a.event_meeting_name.localeCompare(b.event_meeting_name); break;
        case 'start':   cmp = (a.event_arrival_date || '9999').localeCompare(b.event_arrival_date || '9999'); break;
        case 'end':     cmp = (a.event_depart_date || '9999').localeCompare(b.event_depart_date || '9999'); break;
        case 'type':    cmp = a.point_type.localeCompare(b.point_type); break;
        case 'points':  cmp = (a.points ?? -1) - (b.points ?? -1); break;
        case 'received':cmp = Number(a.received) - Number(b.received); break;
      }
      return cmp * dir;
    });
    return out;
  }, [filtered, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'points' || key === 'received' ? 'desc' : 'asc');
    }
  };

  const counts = useMemo(() => {
    let yes = 0, no = 0;
    for (const r of filtered) (r.received ? yes++ : no++);
    return { yes, no };
  }, [filtered]);

  return (
    <div>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Points Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">Rewards and loyalty points earned across bookings.</p>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Booking name or points type…"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">Received</label>
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden bg-white">
              {([
                { v: 'all' as const, label: 'All' },
                { v: 'yes' as const, label: 'Yes' },
                { v: 'no' as const,  label: 'No' },
              ]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setReceivedFilter(opt.v)}
                  className={`px-3 py-1.5 text-sm ${receivedFilter === opt.v ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-gray-500 ml-auto">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · {counts.yes} received · {counts.no} pending
          </div>
        </div>

        {error && <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            {rows.length === 0
              ? "No points yet. Toggle 'I can earn points' on a booking to start tracking."
              : 'No entries match these filters.'}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <SortHeader active={sortKey === 'meeting'}  dir={sortDir} onClick={() => onSort('meeting')}>Booking Name</SortHeader>
                    <SortHeader active={sortKey === 'start'}    dir={sortDir} onClick={() => onSort('start')}>Start Date</SortHeader>
                    <SortHeader active={sortKey === 'end'}      dir={sortDir} onClick={() => onSort('end')}>End Date</SortHeader>
                    <SortHeader active={sortKey === 'type'}     dir={sortDir} onClick={() => onSort('type')}>Type of Points</SortHeader>
                    <SortHeader right active={sortKey === 'points'}   dir={sortDir} onClick={() => onSort('points')}>Number of Points</SortHeader>
                    <SortHeader active={sortKey === 'received'} dir={sortDir} onClick={() => onSort('received')}>Received</SortHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sorted.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <button
                          onClick={() => navigate(`/commissions/${r.event_id}`)}
                          className="text-blue-700 hover:underline font-medium text-left"
                        >
                          {r.event_meeting_name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(r.event_arrival_date)}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(r.event_depart_date)}</td>
                      <td className="px-3 py-2 text-gray-700">{r.point_type || <em className="text-gray-400">—</em>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPoints(r.points)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${r.received ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                          {r.received ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const SortHeader: React.FC<{
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  right?: boolean;
  children: React.ReactNode;
}> = ({ active, dir, onClick, right, children }) => (
  <th className={`px-3 py-2 text-${right ? 'right' : 'left'} text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap`}>
    <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-gray-700">
      {children}
      {active && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  </th>
);

export default PointsTracker;
