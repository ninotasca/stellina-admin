import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { commissionApi } from '../services/commissionApi';
import type {
  CommissionEventWithLineItems,
  CommissionLineItem,
  PaymentStatus,
} from '../types/commission';

// ---------- Lifecycle stage (combined booking + payment) ----------

type Stage = 'paid' | 'invoiced' | 'booked' | 'tentative' | 'prospect' | 'on_hold' | 'cancelled' | 'lost';

const STAGE_ORDER: Stage[] = ['paid', 'invoiced', 'booked', 'tentative', 'prospect', 'on_hold', 'cancelled', 'lost'];

const STAGE_LABEL: Record<Stage, string> = {
  paid: 'Paid', invoiced: 'Invoiced', booked: 'Booked',
  tentative: 'Tentative', prospect: 'Prospect',
  on_hold: 'On Hold', cancelled: 'Cancelled', lost: 'Lost',
};

const STAGE_COLOR: Record<Stage, string> = {
  paid: '#16a34a', invoiced: '#3b82f6', booked: '#6366f1',
  tentative: '#eab308', prospect: '#9ca3af',
  on_hold: '#f97316', cancelled: '#ef4444', lost: '#1f2937',
};

function deriveStage(bookingStatus: string, paymentStatus: PaymentStatus): Stage {
  if (bookingStatus === 'lost') return 'lost';
  if (paymentStatus === 'cancelled') return 'cancelled';
  if (paymentStatus === 'on_hold') return 'on_hold';
  if (bookingStatus === 'prospect') return 'prospect';
  if (bookingStatus === 'tentative') return 'tentative';
  if (paymentStatus === 'paid') return 'paid';
  if (paymentStatus === 'invoiced') return 'invoiced';
  return 'booked';
}

// ---------- Quick-link categories (must match Events page presets) ----------

type CategoryKey = 'needs_invoice' | 'awaiting_payment' | 'coming_soon' | 'in_pipeline';

const CATEGORY_DEF: { key: CategoryKey; label: string; tone: string; bg: string; text: string; ring: string; rank: number }[] = [
  { key: 'needs_invoice', label: 'Needs Invoice', tone: 'orange', bg: 'bg-orange-100', text: 'text-orange-800', ring: 'ring-orange-200', rank: 1 },
  { key: 'awaiting_payment', label: 'Awaiting Payment', tone: 'blue', bg: 'bg-blue-100', text: 'text-blue-800', ring: 'ring-blue-200', rank: 2 },
  { key: 'coming_soon', label: 'Coming Soon', tone: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-800', ring: 'ring-indigo-200', rank: 3 },
  { key: 'in_pipeline', label: 'In Pipeline', tone: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-800', ring: 'ring-yellow-200', rank: 4 },
];

// ---------- Formatters ----------

const fmtMoney0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmtMoneyK = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

const num = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const eventLocation = (ev: CommissionEventWithLineItems): string => {
  if (ev.destinations && ev.destinations.length) return ev.destinations.join(' · ');
  return ev.destination || '';
};

// ---------- Component ----------

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CommissionEventWithLineItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsOpen, setEventsOpen] = useState(true);

  const CURRENT_YEAR = new Date().getUTCFullYear();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await commissionApi.listEvents();
        if (!cancelled) setEvents(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---------- Need-to-know events ----------

  type Row = { category: typeof CATEGORY_DEF[number]; event: CommissionEventWithLineItems };

  const needToKnow: Row[] = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const out: Row[] = [];

    for (const ev of events) {
      const lines = ev.line_items;

      const isInPipeline = ev.booking_status === 'prospect' || ev.booking_status === 'tentative';
      const isAwaitingPayment = ev.booking_status === 'definite' && lines.some((l) => l.payment_status === 'invoiced');
      const isNeedsInvoice = ev.booking_status === 'definite' && lines.some(
        (l) => l.depart_date && l.depart_date < today &&
               (l.payment_status === 'pending_booking' || l.payment_status === 'upcoming')
      );
      const isComingSoon = lines.some((l) => l.arrival_date && l.arrival_date >= today && l.arrival_date <= in30);

      // One row per category match (so urgency is clear)
      if (isNeedsInvoice) out.push({ category: CATEGORY_DEF.find((c) => c.key === 'needs_invoice')!, event: ev });
      if (isAwaitingPayment) out.push({ category: CATEGORY_DEF.find((c) => c.key === 'awaiting_payment')!, event: ev });
      if (isComingSoon) out.push({ category: CATEGORY_DEF.find((c) => c.key === 'coming_soon')!, event: ev });
      if (isInPipeline) out.push({ category: CATEGORY_DEF.find((c) => c.key === 'in_pipeline')!, event: ev });
    }

    // Sort by category rank, then by event start date
    out.sort((a, b) => {
      if (a.category.rank !== b.category.rank) return a.category.rank - b.category.rank;
      const ad = a.event.arrival_date || '9999';
      const bd = b.event.arrival_date || '9999';
      return ad.localeCompare(bd);
    });
    return out;
  }, [events]);

  // ---------- Commission rollup for current year, quarterly ----------

  type FlatRow = { stage: Stage; commission: number; line: CommissionLineItem; period: string };

  const flatLines: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    for (const ev of events) {
      for (const li of ev.line_items) {
        if (!li.arrival_date) continue;
        const y = new Date(li.arrival_date).getUTCFullYear();
        if (y !== CURRENT_YEAR) continue;
        const m = new Date(li.arrival_date).getUTCMonth() + 1;
        const q = Math.floor((m - 1) / 3) + 1;
        out.push({
          stage: deriveStage(ev.booking_status, li.payment_status),
          commission: num(li.commission_amount),
          line: li,
          period: `Q${q}`,
        });
      }
    }
    return out;
  }, [events, CURRENT_YEAR]);

  const kpis = useMemo(() => {
    let paid = 0, pendingInvoice = 0, bookedNotInvoiced = 0, inPipeline = 0, total = 0;
    for (const r of flatLines) {
      total += r.commission;
      if (r.stage === 'paid') paid += r.commission;
      else if (r.stage === 'invoiced') pendingInvoice += r.commission;
      else if (r.stage === 'booked') bookedNotInvoiced += r.commission;
      else if (r.stage === 'tentative' || r.stage === 'prospect') inPipeline += r.commission;
    }
    return { paid, pendingInvoice, bookedNotInvoiced, inPipeline, total };
  }, [flatLines]);

  const chartData = useMemo(() => {
    const byPeriod = new Map<string, Record<string, number>>();
    for (const r of flatLines) {
      const cur = byPeriod.get(r.period) || {};
      cur[r.stage] = (cur[r.stage] || 0) + r.commission;
      byPeriod.set(r.period, cur);
    }
    // Always show all 4 quarters
    return ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => ({
      label: `${CURRENT_YEAR}-${q}`,
      ...STAGE_ORDER.reduce<Record<string, number>>((acc, s) => { acc[s] = byPeriod.get(q)?.[s] || 0; return acc; }, {}),
    }));
  }, [flatLines, CURRENT_YEAR]);

  // ---------- Render ----------

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-1">
          Welcome{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}.
        </h2>
        <p className="text-gray-600 text-sm">Here's what needs your attention.</p>
      </div>

      {/* ===== Events: need-to-know ===== */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setEventsOpen((v) => !v)}
            className="flex items-center gap-2"
          >
            <svg className={`w-4 h-4 text-gray-500 transition-transform ${eventsOpen ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-base font-semibold text-gray-900">Events</h3>
            {!loading && (
              <span className="text-xs text-gray-500 ml-1">
                {needToKnow.length} {needToKnow.length === 1 ? 'item' : 'items'} need attention
              </span>
            )}
          </button>
          <button onClick={() => navigate('/commissions/list')} className="text-sm text-blue-600 hover:underline">
            See all events →
          </button>
        </header>
        {eventsOpen && (
          <div>
            {loading ? (
              <p className="px-5 py-6 text-center text-sm text-gray-500">Loading…</p>
            ) : needToKnow.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-gray-500">All clear — no events flagged.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Category</Th>
                    <Th>Meeting</Th>
                    <Th>Location</Th>
                    <Th>Start</Th>
                    <Th>End</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {needToKnow.map(({ category, event }, i) => (
                    <tr key={`${event.id}-${category.key}-${i}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${category.bg} ${category.text}`}>
                          {category.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => navigate(`/commissions/${event.id}`)}
                          className="text-blue-700 hover:underline font-medium text-left"
                        >
                          {event.meeting_name}
                        </button>
                        {event.client_company_name && (
                          <div className="text-xs text-gray-500">{event.client_company_name}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{eventLocation(event) || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(event.arrival_date)}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(event.depart_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* ===== Commission ===== */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Commission</h3>
            <p className="text-xs text-gray-500">{CURRENT_YEAR} · Quarterly</p>
          </div>
          <button onClick={() => navigate('/commissions')} className="text-sm text-blue-600 hover:underline">
            Open Commission Tracker →
          </button>
        </header>

        <div className="p-5 space-y-5">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label={`Paid (${CURRENT_YEAR})`} value={fmtMoney0(kpis.paid)} tone="green" />
            <Kpi label="Pending Invoice" value={fmtMoney0(kpis.pendingInvoice)} tone="blue" />
            <Kpi label="Booked, Not Invoiced" value={fmtMoney0(kpis.bookedNotInvoiced)} tone="indigo" />
            <Kpi label="In Pipeline" value={fmtMoney0(kpis.inPipeline)} tone="yellow" />
            <Kpi label={`Total ${CURRENT_YEAR}`} value={fmtMoney0(kpis.total)} sub={`${flatLines.length} line items`} />
          </div>

          {/* Chart */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Commission by Quarter</h4>
              <span className="text-xs text-gray-500">stacked by lifecycle stage</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
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
                {STAGE_ORDER.map((s) => (
                  <Bar key={s} dataKey={s} stackId="a" name={STAGE_LABEL[s]} fill={STAGE_COLOR[s]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
};

// ---------- Tiny shared bits ----------

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
    {children}
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
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-0.5 tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
};

export default Dashboard;
