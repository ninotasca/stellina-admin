import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { commissionApi } from '../services/commissionApi';
import { formatWholeDollars, formatWholeDollarsCompact } from '../utils/currency';
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
type DateBasis = 'start_date' | 'end_date' | 'booked_at' | 'paid_date';

const DATE_BASIS_LABEL: Record<DateBasis, string> = {
  start_date: 'Start Date',
  end_date: 'End Date',
  booked_at: 'Date Booked',
  paid_date: 'Date Commission Paid',
};

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

// Years to render on the axis for "today forward": from CURRENT_YEAR through
// the latest year present in the data (or just CURRENT_YEAR if nothing is
// scheduled in the future).
function forwardYears(currentYear: number, availableYears: number[]): number[] {
  const maxYear = availableYears.length
    ? Math.max(currentYear, ...availableYears)
    : currentYear;
  const out: number[] = [];
  for (let y = currentYear; y <= maxYear; y++) out.push(y);
  return out;
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

const fmtMoney0 = formatWholeDollars;
const fmtMoneyK = formatWholeDollarsCompact;

// ---------- Component ----------

interface FlatRow extends CommissionLineItem {
  event: CommissionEventWithLineItems;
  stage: Stage;
  commission: number;
  basisDate: string | null;
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
  const [dateBasis, setDateBasis] = useState<DateBasis>('start_date');
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
        const stage = deriveStage(ev.booking_status, li.payment_status);
        const basisDate =
          dateBasis === 'booked_at'
            ? ev.booked_at
            : dateBasis === 'paid_date'
              ? li.paid_date
              : dateBasis === 'end_date'
                ? li.depart_date
                : li.arrival_date;
        out.push({
          ...li,
          event: ev,
          stage,
          commission: Number(li.commission_amount || 0),
          basisDate,
          period: periodKey(basisDate, grouping),
        });
      }
    }
    return out;
  }, [events, grouping, dateBasis]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const r of allRows) {
      if (r.basisDate) years.add(new Date(r.basisDate).getUTCFullYear());
    }
    return Array.from(years).sort();
  }, [allRows]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const visibleRows: FlatRow[] = useMemo(() => {
    return allRows.filter((r) => {
      if (dateBasis === 'booked_at' && r.event.booking_status !== 'definite') return false;
      if (dateBasis === 'paid_date' && r.stage !== 'paid') return false;
      if (!stageFilter.has(r.stage)) return false;
      if (!typeFilter.has(r.line_type)) return false;
      if (yearFilter === 'all') return true;
      if (!r.basisDate) return false;
      if (yearFilter === 'ytd_forward') {
        // Today onward, across every future year
        return r.basisDate >= todayIso;
      }
      const y = new Date(r.basisDate).getUTCFullYear();
      return y === yearFilter;
    });
  }, [allRows, dateBasis, stageFilter, typeFilter, yearFilter, todayIso]);

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
          ? forwardYears(CURRENT_YEAR, availableYears)
          : [yearFilter];
    let axis = buildPeriodAxis(yearsForAxis, grouping);
    if (yearFilter === 'ytd_forward') {
      const fromKey = periodKey(todayIso, grouping);
      axis = axis.filter((p) => p >= fromKey);
    }
    return axis.map((p) => ({
      period: p,
      label: periodLabel(p, grouping),
      ...STAGE_ORDER.reduce<Record<string, number>>((acc, s) => { acc[s] = byPeriod.get(p)?.[s] || 0; return acc; }, {}),
    }));
  }, [visibleRows, grouping, yearFilter, availableYears, CURRENT_YEAR, todayIso]);

  // Period rollup — one row per period (Paid / Invoiced / Booked / In Pipeline / Total)
  type PeriodRow = {
    period: string;
    label: string;
    paid: number;
    invoiced: number;
    booked: number;
    pipeline: number; // tentative + prospect
    total: number;
    lines: FlatRow[];
  };

  const periodRollup: PeriodRow[] = useMemo(() => {
    const byPeriod = new Map<string, FlatRow[]>();
    for (const r of visibleRows) {
      const arr = byPeriod.get(r.period) || [];
      arr.push(r);
      byPeriod.set(r.period, arr);
    }
    // Build axis the same way the chart does, so empty periods stay visible
    const yearsForAxis: number[] =
      yearFilter === 'all'
        ? (availableYears.length ? availableYears : [])
        : yearFilter === 'ytd_forward'
          ? forwardYears(CURRENT_YEAR, availableYears)
          : [yearFilter];
    let axis = buildPeriodAxis(yearsForAxis, grouping);
    if (yearFilter === 'ytd_forward') {
      const fromKey = periodKey(todayIso, grouping);
      axis = axis.filter((p) => p >= fromKey);
    }

    const buildRow = (period: string, lines: FlatRow[]): PeriodRow => {
      let paid = 0, invoiced = 0, booked = 0, pipeline = 0;
      for (const r of lines) {
        if (r.stage === 'paid') paid += r.commission;
        else if (r.stage === 'invoiced') invoiced += r.commission;
        else if (r.stage === 'booked') booked += r.commission;
        else if (r.stage === 'tentative' || r.stage === 'prospect') pipeline += r.commission;
      }
      return {
        period,
        label: periodLabel(period, grouping),
        paid, invoiced, booked, pipeline,
        total: paid + invoiced + booked + pipeline,
        lines,
      };
    };

    const rows: PeriodRow[] = axis.map((p) => buildRow(p, byPeriod.get(p) || []));
    const unscheduledLines = byPeriod.get('Unscheduled');
    if (unscheduledLines && unscheduledLines.length > 0) {
      rows.push(buildRow('Unscheduled', unscheduledLines));
    }
    return rows;
  }, [visibleRows, grouping, yearFilter, availableYears, CURRENT_YEAR, todayIso]);

  const grandTotals = useMemo(() => {
    return periodRollup.reduce(
      (acc, p) => ({
        paid: acc.paid + p.paid,
        invoiced: acc.invoiced + p.invoiced,
        booked: acc.booked + p.booked,
        pipeline: acc.pipeline + p.pipeline,
        total: acc.total + p.total,
      }),
      { paid: 0, invoiced: 0, booked: 0, pipeline: 0, total: 0 }
    );
  }, [periodRollup]);

  // Which period row is expanded (only one at a time)
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

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
    <div>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Commission Tracker</h1>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {error && <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}
        {loading && <div className="text-center py-12 text-gray-500">Loading…</div>}

        {!loading && (
          <>
            {/* Filter bar */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
                <div>
                  <Label>Group bookings by</Label>
                  <select
                    value={dateBasis}
                    onChange={(e) => setDateBasis(e.target.value as DateBasis)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-full"
                  >
                    <option value="start_date">Start Date</option>
                    <option value="end_date">End Date</option>
                    <option value="booked_at">Date Booked</option>
                    <option value="paid_date">Date Commission Paid</option>
                  </select>
                  {dateBasis === 'booked_at' && (
                    <p className="mt-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1">
                      This view is limited to definite bookings only.
                    </p>
                  )}
                  {dateBasis === 'paid_date' && (
                    <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
                      This view is limited to paid bookings only.
                    </p>
                  )}
                </div>
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
                    <option value="ytd_forward">Today forward (all future years)</option>
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
                <div className="lg:col-span-5">
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
              <Kpi label="Total Visible" value={fmtMoney0(kpis.total)} sub={`${visibleRows.length} line items`} />
            </div>

            {/* Main chart */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900">
                  Commission by {DATE_BASIS_LABEL[dateBasis]} / {grouping === 'month' ? 'Month' : grouping === 'quarter' ? 'Quarter' : 'Year'}
                </h2>
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

            {/* Period rollup with expandable details */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">
                  Commission by {DATE_BASIS_LABEL[dateBasis]} / {grouping === 'month' ? 'Month' : grouping === 'quarter' ? 'Quarter' : 'Year'}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Period</Th>
                      <Th right>Paid</Th>
                      <Th right>Invoiced</Th>
                      <Th right>Booked</Th>
                      <Th right>In Pipeline</Th>
                      <Th right>Total</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {periodRollup.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No data for these filters.</td></tr>
                    ) : periodRollup.map((p) => {
                      const expanded = expandedPeriod === p.period;
                      const hasData = p.lines.length > 0;
                      return (
                        <React.Fragment key={p.period}>
                          <tr
                            onClick={() => hasData && setExpandedPeriod(expanded ? null : p.period)}
                            className={`${hasData ? 'cursor-pointer hover:bg-gray-50' : 'text-gray-400'} ${expanded ? 'bg-blue-50/50' : ''}`}
                          >
                            <td className="px-3 py-2 font-medium text-gray-900">
                              <span className="inline-flex items-center gap-1.5">
                                <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''} ${hasData ? '' : 'opacity-0'}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                {p.label}
                                {hasData && <span className="text-[10px] text-gray-400 ml-1">({p.lines.length})</span>}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.paid > 0 ? <span className="text-emerald-700">{fmtMoney0(p.paid)}</span> : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.invoiced > 0 ? <span className="text-blue-700">{fmtMoney0(p.invoiced)}</span> : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.booked > 0 ? <span className="text-indigo-700">{fmtMoney0(p.booked)}</span> : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.pipeline > 0 ? <span className="text-yellow-700">{fmtMoney0(p.pipeline)}</span> : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{p.total > 0 ? fmtMoney0(p.total) : <span className="text-gray-300 font-normal">—</span>}</td>
                          </tr>
                          {expanded && expandLines(p.lines).map((li) => (
                            <tr key={li.id} className="bg-gray-50/60">
                              <td className="pl-10 pr-3 py-1.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <button
                                    onClick={() => navigate(`/commissions/${li.event.id}`)}
                                    className="text-sm text-blue-700 hover:underline truncate text-left min-w-0"
                                    title={li.event.meeting_name}
                                  >
                                    {li.event.meeting_name}
                                  </button>
                                  <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded text-white font-semibold shrink-0"
                                    style={{ background: { hotel: '#059669', dmc: '#4f46e5', air: '#0284c7', other: '#475569' }[li.line_type] }}>
                                    {li.line_type}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-sm">
                                {li.stage === 'paid' ? <span className="text-emerald-700">{fmtMoney0(li.commission)}</span> : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-sm">
                                {li.stage === 'invoiced' ? <span className="text-blue-700">{fmtMoney0(li.commission)}</span> : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-sm">
                                {li.stage === 'booked' ? <span className="text-indigo-700">{fmtMoney0(li.commission)}</span> : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-sm">
                                {(li.stage === 'tentative' || li.stage === 'prospect') ? <span className="text-yellow-700">{fmtMoney0(li.commission)}</span> : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-sm font-medium text-gray-900">
                                {li.commission > 0 ? fmtMoney0(li.commission) : <span className="text-gray-300 font-normal">—</span>}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  {periodRollup.length > 0 && (
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{fmtMoney0(grandTotals.paid)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-blue-800">{fmtMoney0(grandTotals.invoiced)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-indigo-800">{fmtMoney0(grandTotals.booked)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-yellow-800">{fmtMoney0(grandTotals.pipeline)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney0(grandTotals.total)}</td>
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

// Sort detail rows: by event meeting (alpha), then by line type, so each
// deal's lines stay grouped within an expanded period.
function expandLines(lines: FlatRow[]): FlatRow[] {
  const TYPE_ORDER: Record<string, number> = { hotel: 0, dmc: 1, air: 2, other: 3 };
  return [...lines].sort((a, b) => {
    const cmp = a.event.meeting_name.localeCompare(b.event.meeting_name);
    if (cmp !== 0) return cmp;
    return (TYPE_ORDER[a.line_type] ?? 99) - (TYPE_ORDER[b.line_type] ?? 99);
  });
}

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

export default CommissionDashboard;
