import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { commissionApi } from '../services/commissionApi';
import type {
  CommissionEventWithLineItems,
  CommissionLineItem,
  LineType,
  PaymentStatus,
} from '../types/commission';

// ---------- Lifecycle stages (combined booking + payment) ----------

type Stage = 'paid' | 'invoiced' | 'booked' | 'tentative' | 'prospect' | 'on_hold' | 'cancelled' | 'lost';

const STAGE_ORDER: Stage[] = ['paid', 'invoiced', 'booked', 'tentative', 'prospect', 'on_hold', 'cancelled', 'lost'];

const ACTIVE_STAGES: Stage[] = ['paid', 'invoiced', 'booked', 'tentative', 'prospect', 'on_hold'];
const CLOSED_STAGES: Stage[] = ['cancelled', 'lost'];

const STAGE_LABEL: Record<Stage, string> = {
  paid: 'Paid',
  invoiced: 'Invoiced',
  booked: 'Booked',
  tentative: 'Tentative',
  prospect: 'Prospect',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
  lost: 'Lost',
};

// Tailwind-derived colors so chart matches UI
const STAGE_COLOR: Record<Stage, string> = {
  paid: '#16a34a',       // green-600
  invoiced: '#3b82f6',   // blue-500
  booked: '#6366f1',     // indigo-500
  tentative: '#eab308',  // yellow-500
  prospect: '#9ca3af',   // gray-400
  on_hold: '#f97316',    // orange-500
  cancelled: '#ef4444',  // red-500
  lost: '#1f2937',       // gray-800
};

function deriveStage(bookingStatus: string, paymentStatus: PaymentStatus): Stage {
  if (bookingStatus === 'lost') return 'lost';
  if (paymentStatus === 'cancelled') return 'cancelled';
  if (paymentStatus === 'on_hold') return 'on_hold';
  if (bookingStatus === 'prospect') return 'prospect';
  if (bookingStatus === 'tentative') return 'tentative';
  // definite
  if (paymentStatus === 'paid') return 'paid';
  if (paymentStatus === 'invoiced') return 'invoiced';
  return 'booked';
}

// ---------- Period helpers ----------

type Grouping = 'month' | 'quarter' | 'year';

function periodKey(d: string | null, g: Grouping): string {
  if (!d) return 'Unscheduled';
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  if (g === 'year') return `${y}`;
  if (g === 'month') return `${y}-${String(m).padStart(2, '0')}`;
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

function periodLabel(key: string, g: Grouping): string {
  if (key === 'Unscheduled') return key;
  if (g === 'year') return key;
  if (g === 'quarter') return key; // already 2026-Q1
  // month: 2026-03 → Mar '26
  const [y, m] = key.split('-');
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function buildPeriodAxis(years: number[], g: Grouping): string[] {
  const sorted = [...years].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  if (g === 'year') return sorted.map(String);
  if (g === 'quarter') {
    const out: string[] = [];
    for (const y of sorted) for (let q = 1; q <= 4; q++) out.push(`${y}-Q${q}`);
    return out;
  }
  const out: string[] = [];
  for (const y of sorted) for (let m = 1; m <= 12; m++) out.push(`${y}-${String(m).padStart(2, '0')}`);
  return out;
}

const fmtMoney0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtMoneyK = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};
const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '';

// ---------- Component ----------

interface FlatRow extends CommissionLineItem {
  event: CommissionEventWithLineItems;
  stage: Stage;
  commission: number;
  period: string;
}

const CommissionDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CommissionEventWithLineItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const CURRENT_YEAR = new Date().getUTCFullYear();
  type YearFilter = number | 'all' | 'ytd_forward';

  const [grouping, setGrouping] = useState<Grouping>('quarter');
  const [stageFilter, setStageFilter] = useState<Set<Stage>>(new Set(ACTIVE_STAGES));
  const [typeFilter, setTypeFilter] = useState<Set<LineType>>(new Set(['hotel', 'dmc', 'air', 'other']));
  const [yearFilter, setYearFilter] = useState<YearFilter>(CURRENT_YEAR);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => { (async () => {
    try {
      setLoading(true);
      const data = await commissionApi.listEvents();
      setEvents(data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Failed to load');
    } finally { setLoading(false); }
  })(); }, []);

  // Flatten + derive
  const allRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    for (const ev of events) {
      for (const li of ev.line_items) {
        out.push({
          ...li,
          event: ev,
          stage: deriveStage(ev.booking_status, li.payment_status),
          commission: Number(li.commission_amount || 0),
          period: periodKey(li.arrival_date, grouping),
        });
      }
    }
    return out;
  }, [events, grouping]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const r of allRows) {
      if (r.arrival_date) years.add(new Date(r.arrival_date).getUTCFullYear());
    }
    return Array.from(years).sort();
  }, [allRows]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const visibleRows: FlatRow[] = useMemo(() => {
    return allRows.filter((r) => {
      if (!stageFilter.has(r.stage)) return false;
      if (!typeFilter.has(r.line_type)) return false;
      if (yearFilter === 'all') return true;
      if (!r.arrival_date) return false;
      const y = new Date(r.arrival_date).getUTCFullYear();
      if (yearFilter === 'ytd_forward') {
        if (y !== CURRENT_YEAR) return false;
        if (r.arrival_date < todayIso) return false;
        return true;
      }
      return y === yearFilter;
    });
  }, [allRows, stageFilter, typeFilter, yearFilter, todayIso, CURRENT_YEAR]);

  // KPIs — all derived from visibleRows so they respect every active filter (year included)
  const kpis = useMemo(() => {
    let paid = 0, pendingInvoice = 0, bookedNotInvoiced = 0, inPipeline = 0, total = 0;
    for (const r of visibleRows) {
      total += r.commission;
      if (r.stage === 'paid') paid += r.commission;
      else if (r.stage === 'invoiced') pendingInvoice += r.commission;
      else if (r.stage === 'booked') bookedNotInvoiced += r.commission;
      else if (r.stage === 'tentative' || r.stage === 'prospect') inPipeline += r.commission;
    }
    return { paid, pendingInvoice, bookedNotInvoiced, inPipeline, total };
  }, [visibleRows]);

  // Bar chart data: one row per period (full axis, including empty periods)
  const chartData = useMemo(() => {
    const byPeriod = new Map<string, Record<string, number>>();
    for (const r of visibleRows) {
      if (r.period === 'Unscheduled') continue;
      const cur = byPeriod.get(r.period) || {};
      cur[r.stage] = (cur[r.stage] || 0) + r.commission;
      byPeriod.set(r.period, cur);
    }
    const yearsForAxis: number[] =
      yearFilter === 'all'
        ? (availableYears.length ? availableYears : [])
        : yearFilter === 'ytd_forward'
          ? [CURRENT_YEAR]
          : [yearFilter];
    const axis = buildPeriodAxis(yearsForAxis, grouping);
    return axis.map((p) => ({
      period: p,
      label: periodLabel(p, grouping),
      ...STAGE_ORDER.reduce<Record<string, number>>((acc, s) => { acc[s] = byPeriod.get(p)?.[s] || 0; return acc; }, {}),
    }));
  }, [visibleRows, grouping, yearFilter, availableYears]);

  // Deal rollup — one row per event, aggregated from the visible (filtered) line items only
  type DealRow = {
    eventId: string;
    meetingName: string;
    bookingStatus: string;
    destination: string | null;
    clientCompany: string | null;
    types: LineType[];
    companies: string[];
    earliestArrival: string | null;
    latestDepart: string | null;
    lineCount: number;
    total: number;
    stageBreakdown: { stage: Stage; amount: number }[];
  };

  const deals: DealRow[] = useMemo(() => {
    const byEvent = new Map<string, FlatRow[]>();
    for (const r of visibleRows) {
      const arr = byEvent.get(r.event.id) || [];
      arr.push(r);
      byEvent.set(r.event.id, arr);
    }
    const out: DealRow[] = [];
    byEvent.forEach((rows, eventId) => {
      const ev = rows[0].event;
      const types = Array.from(new Set(rows.map((r) => r.line_type)));
      const companies = Array.from(new Set(rows.map((r) => r.company_name.trim()).filter(Boolean)));
      const arrivals = rows.map((r) => r.arrival_date).filter(Boolean) as string[];
      const departs = rows.map((r) => r.depart_date).filter(Boolean) as string[];
      const total = rows.reduce((s, r) => s + r.commission, 0);
      const stageMap = new Map<Stage, number>();
      for (const r of rows) stageMap.set(r.stage, (stageMap.get(r.stage) || 0) + r.commission);
      const stageBreakdown = STAGE_ORDER
        .filter((s) => (stageMap.get(s) || 0) > 0)
        .map((s) => ({ stage: s, amount: stageMap.get(s) || 0 }));
      out.push({
        eventId,
        meetingName: ev.meeting_name,
        bookingStatus: ev.booking_status,
        destination: ev.destination,
        clientCompany: ev.client_company_name || null,
        types,
        companies,
        earliestArrival: arrivals.length ? arrivals.sort()[0] : null,
        latestDepart: departs.length ? departs.sort().slice(-1)[0] : null,
        lineCount: rows.length,
        total,
        stageBreakdown,
      });
    });
    out.sort((a, b) => {
      const ad = a.earliestArrival || '9999-12-31';
      const bd = b.earliestArrival || '9999-12-31';
      return ad.localeCompare(bd);
    });
    return out;
  }, [visibleRows]);

  // Sort state for the deals table
  type SortKey = 'meeting' | 'status' | 'arrival' | 'commission';
  const [sortKey, setSortKey] = useState<SortKey>('arrival');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sortedDeals = useMemo(() => {
    const STATUS_RANK: Record<string, number> = { definite: 4, tentative: 3, prospect: 2, lost: 1 };
    const arr = [...deals];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'meeting') cmp = a.meetingName.localeCompare(b.meetingName);
      else if (sortKey === 'status') cmp = (STATUS_RANK[a.bookingStatus] || 0) - (STATUS_RANK[b.bookingStatus] || 0);
      else if (sortKey === 'arrival') {
        const ad = a.earliestArrival || '9999-12-31';
        const bd = b.earliestArrival || '9999-12-31';
        cmp = ad.localeCompare(bd);
      } else if (sortKey === 'commission') cmp = a.total - b.total;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [deals, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'commission' ? 'desc' : 'asc'); }
  };

  const toggleStage = (s: Stage) => {
    const next = new Set(stageFilter);
    next.has(s) ? next.delete(s) : next.add(s);
    setStageFilter(next);
  };
  const toggleType = (t: LineType) => {
    const next = new Set(typeFilter);
    next.has(t) ? next.delete(t) : next.add(t);
    setTypeFilter(next);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</button>
            <h1 className="text-2xl font-bold text-gray-900">Commission Tracker</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/commissions/list')} className="px-3 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">Detail List</button>
            <button onClick={() => navigate('/commissions/projections')} className="px-3 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">Weighted View</button>
            <button onClick={() => navigate('/commissions/new')} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">+ New Event</button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        {error && <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}
        {loading && <div className="text-center py-12 text-gray-500">Loading…</div>}

        {!loading && (
          <>
            {/* Filter bar */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
                <div>
                  <Label>Period</Label>
                  <div className="flex gap-2">
                    {(['month', 'quarter', 'year'] as Grouping[]).map((g) => (
                      <button key={g} onClick={() => setGrouping(g)}
                        className={`px-3 py-1.5 text-sm rounded-md border ${grouping === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                        {g === 'month' ? 'Monthly' : g === 'quarter' ? 'Quarterly' : 'Annual'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Year</Label>
                  <select
                    value={String(yearFilter)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'all' || v === 'ytd_forward') setYearFilter(v);
                      else setYearFilter(Number(v));
                    }}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="all">All years</option>
                    <option value="ytd_forward">{CURRENT_YEAR}, going forward</option>
                    {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <Label>Active deals</Label>
                    <div className="flex gap-2 text-[11px]">
                      <button type="button" onClick={() => setStageFilter(new Set([...ACTIVE_STAGES, ...(showClosed ? CLOSED_STAGES.filter((s) => stageFilter.has(s)) : [])]))} className="text-blue-600 hover:underline">All active</button>
                      <span className="text-gray-300">·</span>
                      <button type="button" onClick={() => setStageFilter(new Set(showClosed ? CLOSED_STAGES.filter((s) => stageFilter.has(s)) : []))} className="text-gray-500 hover:underline">None</button>
                      <span className="text-gray-300">·</span>
                      <button type="button" onClick={() => { setStageFilter(new Set(ACTIVE_STAGES)); setShowClosed(false); }} className="text-gray-500 hover:underline">Reset</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ACTIVE_STAGES.map((s) => {
                      const on = stageFilter.has(s);
                      return (
                        <button key={s} type="button" onClick={() => toggleStage(s)}
                          className={`px-2.5 py-1 text-xs rounded-full border ${on ? '' : 'opacity-40'}`}
                          style={{ background: on ? STAGE_COLOR[s] : 'transparent', color: on ? 'white' : '#6b7280', borderColor: STAGE_COLOR[s] }}
                        >
                          {STAGE_LABEL[s]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2">
                    {!showClosed ? (
                      <button type="button" onClick={() => setShowClosed(true)} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                        + Show closed (cancelled, lost)
                      </button>
                    ) : (
                      <div>
                        <div className="flex items-baseline justify-between mb-1.5">
                          <Label>Closed</Label>
                          <button type="button" onClick={() => { setShowClosed(false); setStageFilter(new Set([...ACTIVE_STAGES].filter((s) => stageFilter.has(s)))); }} className="text-[11px] text-gray-500 hover:underline">Hide</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {CLOSED_STAGES.map((s) => {
                            const on = stageFilter.has(s);
                            return (
                              <button key={s} type="button" onClick={() => toggleStage(s)}
                                className={`px-2.5 py-1 text-xs rounded-full border ${on ? '' : 'opacity-40'}`}
                                style={{ background: on ? STAGE_COLOR[s] : 'transparent', color: on ? 'white' : '#6b7280', borderColor: STAGE_COLOR[s] }}
                              >
                                {STAGE_LABEL[s]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="lg:col-span-4">
                  <Label>Line types</Label>
                  <div className="flex gap-1.5">
                    {(['hotel', 'dmc', 'air', 'other'] as LineType[]).map((t) => {
                      const on = typeFilter.has(t);
                      return (
                        <button key={t} onClick={() => toggleType(t)}
                          className={`px-3 py-1 text-xs rounded-md border uppercase tracking-wider ${on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-300'}`}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* KPI tiles — all values reflect the active filters */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label={`Paid${yearFilter !== 'all' ? ` (${yearFilter})` : ''}`} value={fmtMoney0(kpis.paid)} tone="green" />
              <Kpi label="Pending Invoice" value={fmtMoney0(kpis.pendingInvoice)} tone="blue" />
              <Kpi label="Booked, Not Invoiced" value={fmtMoney0(kpis.bookedNotInvoiced)} tone="indigo" />
              <Kpi label="In Pipeline" value={fmtMoney0(kpis.inPipeline)} tone="yellow" />
              <Kpi label="Total Visible" value={fmtMoney0(kpis.total)} sub={`${deals.length} deals · ${visibleRows.length} lines`} />
            </div>

            {/* Main chart */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900">Commission by {grouping === 'month' ? 'Month' : grouping === 'quarter' ? 'Quarter' : 'Year'}</h2>
                <span className="text-xs text-gray-500">stacked by lifecycle stage</span>
              </div>
              {chartData.length === 0 ? (
                <p className="text-sm text-gray-500 py-12 text-center">No data — try widening filters.</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={fmtMoneyK} tick={{ fontSize: 12 }} width={60} />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      formatter={(v: any) => fmtMoney0(Number(v))}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {STAGE_ORDER.filter((s) => stageFilter.has(s)).map((s) => (
                      <Bar key={s} dataKey={s} stackId="a" name={STAGE_LABEL[s]} fill={STAGE_COLOR[s]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Deals (rolled up from line items) */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Deals <span className="text-sm font-normal text-gray-500">({deals.length})</span></h2>
                <button onClick={() => navigate('/commissions/list')} className="text-sm text-blue-600 hover:underline">View as line items →</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <SortTh active={sortKey === 'meeting'} dir={sortDir} onClick={() => onSort('meeting')}>Meeting</SortTh>
                      <SortTh active={sortKey === 'status'} dir={sortDir} onClick={() => onSort('status')}>Status</SortTh>
                      <Th>Lines</Th>
                      <SortTh active={sortKey === 'arrival'} dir={sortDir} onClick={() => onSort('arrival')}>Arrival</SortTh>
                      <SortTh right active={sortKey === 'commission'} dir={sortDir} onClick={() => onSort('commission')}>Commission</SortTh>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedDeals.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No deals match these filters.</td></tr>
                    ) : sortedDeals.map((d) => (
                      <tr key={d.eventId} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <button onClick={() => navigate(`/commissions/${d.eventId}/edit`)} className="text-blue-700 hover:underline text-left font-medium">
                            {d.meetingName}
                          </button>
                          {(d.clientCompany || d.destination) && (
                            <div className="text-xs text-gray-500">
                              {d.clientCompany && <span className="font-medium text-gray-600">{d.clientCompany}</span>}
                              {d.clientCompany && d.destination && <span> · </span>}
                              {d.destination}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            d.bookingStatus === 'definite' ? 'bg-green-100 text-green-800' :
                            d.bookingStatus === 'tentative' ? 'bg-yellow-100 text-yellow-800' :
                            d.bookingStatus === 'lost' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-700'
                          }`}>{d.bookingStatus}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {d.types.map((t) => (
                              <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[10px] uppercase tracking-wider rounded">{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(d.earliestArrival)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney0(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {sortedDeals.length > 0 && (
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-3 py-2" colSpan={4}>Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney0(kpis.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{children}</p>
);

const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={`px-3 py-2 text-${right ? 'right' : 'left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>{children}</th>
);

const SortTh: React.FC<{ children: React.ReactNode; right?: boolean; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }> = ({ children, right, active, dir, onClick }) => (
  <th className={`px-3 py-2 text-${right ? 'right' : 'left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
    <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? 'text-gray-900' : ''}`}>
      <span>{children}</span>
      <span className="text-[10px] w-2 inline-block">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
    </button>
  </th>
);

const Kpi: React.FC<{ label: string; value: string; sub?: string; tone?: 'green' | 'blue' | 'indigo' | 'yellow' }> = ({ label, value, sub, tone }) => {
  const color =
    tone === 'green' ? 'text-green-700' :
    tone === 'blue' ? 'text-blue-700' :
    tone === 'indigo' ? 'text-indigo-700' :
    tone === 'yellow' ? 'text-yellow-700' :
    'text-gray-900';
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const StageMixBar: React.FC<{ breakdown: { stage: Stage; amount: number }[]; total: number }> = ({ breakdown, total }) => {
  if (total <= 0 || breakdown.length === 0) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2.5 w-32 rounded-sm overflow-hidden border border-gray-200" title={breakdown.map((b) => `${STAGE_LABEL[b.stage]}: ${fmtMoney0(b.amount)}`).join(' · ')}>
        {breakdown.map((b) => (
          <div key={b.stage} style={{ width: `${(b.amount / total) * 100}%`, background: STAGE_COLOR[b.stage] }} />
        ))}
      </div>
      <span className="text-[10px] text-gray-500">{breakdown.length === 1 ? STAGE_LABEL[breakdown[0].stage] : `${breakdown.length} stages`}</span>
    </div>
  );
};

export default CommissionDashboard;
