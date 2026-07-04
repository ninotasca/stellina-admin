import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { commissionApi } from '../services/commissionApi';
import { parseLocalDate } from '../utils/date';
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

// ---------- Badges ----------

type Badge = { label: string; bg: string; text: string };

const NEEDS_INVOICE_BADGE: Badge = { label: 'Needs Invoice', bg: 'bg-orange-100', text: 'text-orange-800' };
const AWAITING_PAYMENT_BADGE: Badge = { label: 'Awaiting Payment', bg: 'bg-blue-100', text: 'text-blue-800' };
const COMING_SOON_BADGE: Badge = { label: 'Coming Soon', bg: 'bg-indigo-100', text: 'text-indigo-800' };
const PROSPECT_BADGE: Badge = { label: 'Prospect', bg: 'bg-gray-100', text: 'text-gray-700' };
const TENTATIVE_BADGE: Badge = { label: 'Tentative', bg: 'bg-yellow-100', text: 'text-yellow-800' };

type EventRow = { event: CommissionEventWithLineItems; badge: Badge };
type LineRow = { event: CommissionEventWithLineItems; line: CommissionLineItem; badge: Badge; detail: string };

// ---------- Formatters ----------

const fmtMoney0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmtMoneyK = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '—';
  return parseLocalDate(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
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

const eventCommissionTotal = (ev: CommissionEventWithLineItems): number =>
  ev.line_items.reduce((sum, li) => sum + num(li.commission_amount), 0);

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

  // ---------- Need-to-know bookings ----------

  const groups = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const daysSince = (dateStr: string): number =>
      Math.max(0, Math.floor((Date.parse(today) - Date.parse(dateStr)) / 86400000));

    const inPipeline: EventRow[] = [];
    const needAttention: LineRow[] = [];
    const comingSoon: EventRow[] = [];

    for (const ev of events) {
      // In Pipeline — prospect or tentative bookings, badge shows actual status
      if (ev.booking_status === 'prospect') {
        inPipeline.push({ event: ev, badge: PROSPECT_BADGE });
      } else if (ev.booking_status === 'tentative') {
        inPipeline.push({ event: ev, badge: TENTATIVE_BADGE });
      }

      // Need Attention — per line item, 1-week grace
      if (ev.booking_status === 'definite') {
        for (const li of ev.line_items) {
          if (li.depart_date && li.depart_date <= oneWeekAgo &&
              (li.payment_status === 'pending_booking' || li.payment_status === 'upcoming')) {
            needAttention.push({
              event: ev, line: li, badge: NEEDS_INVOICE_BADGE,
              detail: `Ended ${daysSince(li.depart_date)}d ago`,
            });
          }
          if (li.payment_status === 'invoiced' && li.invoice_sent_date && li.invoice_sent_date <= oneWeekAgo) {
            needAttention.push({
              event: ev, line: li, badge: AWAITING_PAYMENT_BADGE,
              detail: `Invoiced ${daysSince(li.invoice_sent_date)}d ago`,
            });
          }
        }
      }

      // Coming Soon — event level, any line arriving in next 30 days
      if (ev.line_items.some((l) => l.arrival_date && l.arrival_date >= today && l.arrival_date <= in30)) {
        comingSoon.push({ event: ev, badge: COMING_SOON_BADGE });
      }
    }

    const byEventDate = (a: { event: CommissionEventWithLineItems }, b: { event: CommissionEventWithLineItems }) =>
      (a.event.arrival_date || '9999').localeCompare(b.event.arrival_date || '9999');
    inPipeline.sort(byEventDate);
    comingSoon.sort(byEventDate);
    needAttention.sort((a, b) => {
      if (a.badge.label !== b.badge.label) return a.badge.label.localeCompare(b.badge.label);
      const aDate = a.badge === NEEDS_INVOICE_BADGE ? (a.line.depart_date || '9999') : (a.line.invoice_sent_date || '9999');
      const bDate = b.badge === NEEDS_INVOICE_BADGE ? (b.line.depart_date || '9999') : (b.line.invoice_sent_date || '9999');
      return aDate.localeCompare(bDate);
    });

    return { inPipeline, needAttention, comingSoon };
  }, [events]);

  const { inPipeline, needAttention, comingSoon } = groups;
  const totalRows = inPipeline.length + needAttention.length + comingSoon.length;

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
    let paid = 0, pendingInvoice = 0, bookedNotInvoiced = 0, inPipelineAmt = 0, total = 0;
    for (const r of flatLines) {
      total += r.commission;
      if (r.stage === 'paid') paid += r.commission;
      else if (r.stage === 'invoiced') pendingInvoice += r.commission;
      else if (r.stage === 'booked') bookedNotInvoiced += r.commission;
      else if (r.stage === 'tentative' || r.stage === 'prospect') inPipelineAmt += r.commission;
    }
    return { paid, pendingInvoice, bookedNotInvoiced, inPipeline: inPipelineAmt, total };
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

      {/* ===== Bookings: need-to-know ===== */}
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
            <h3 className="text-base font-semibold text-gray-900">Bookings</h3>
            {!loading && (
              <span className="text-xs text-gray-500 ml-1">
                {inPipeline.length} in pipeline · {needAttention.length} need attention · {comingSoon.length} coming soon
              </span>
            )}
          </button>
          <button onClick={() => navigate('/commissions/list')} className="text-sm text-blue-600 hover:underline">
            See all bookings →
          </button>
        </header>
        {eventsOpen && (
          <div>
            {loading ? (
              <p className="px-5 py-6 text-center text-sm text-gray-500">Loading…</p>
            ) : totalRows === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-gray-500">All clear — no bookings flagged.</p>
            ) : (
              <>
                <EventGroup
                  title="In Pipeline"
                  subtitle="Prospect · Tentative"
                  tone="yellow"
                  rows={inPipeline}
                  emptyText="Nothing in the pipeline."
                  onRowClick={(eventId) => navigate(`/commissions/${eventId}`)}
                />
                <LineGroup
                  title="Need attention"
                  subtitle="Needs Invoice · Awaiting Payment"
                  tone="red"
                  rows={needAttention}
                  emptyText="All clear — nothing to invoice or chase."
                  onRowClick={(eventId) => navigate(`/commissions/${eventId}`)}
                />
                <EventGroup
                  title="Coming Soon"
                  subtitle="Arriving in the next 30 days"
                  tone="green"
                  rows={comingSoon}
                  emptyText="Nothing arriving soon."
                  onRowClick={(eventId) => navigate(`/commissions/${eventId}`)}
                />
              </>
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

const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right = false }) => (
  <th className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);

type Tone = 'red' | 'green' | 'yellow';

const TONE_BANNER: Record<Tone, string> = {
  red: 'bg-red-50 text-red-900 border-y border-red-200',
  green: 'bg-emerald-50 text-emerald-900 border-y border-emerald-200',
  yellow: 'bg-yellow-50 text-yellow-900 border-y border-yellow-200',
};

const GroupHeader: React.FC<{ title: string; subtitle: string; tone: Tone; count: number; totalCommission: number }> = ({
  title, subtitle, tone, count, totalCommission,
}) => (
  <div className={`px-5 py-2.5 flex items-baseline gap-2 ${TONE_BANNER[tone]}`}>
    <h4 className="text-xs font-semibold uppercase tracking-wider">{title}</h4>
    <span className="text-[11px] opacity-75">{subtitle}</span>
    <span className="ml-auto text-[11px] opacity-75 whitespace-nowrap">
      {count} {count === 1 ? 'item' : 'items'}
    </span>
    <span className="text-[11px] font-semibold tabular-nums whitespace-nowrap">
      {fmtMoney0(totalCommission)}
    </span>
  </div>
);

interface EventGroupProps {
  title: string;
  subtitle: string;
  tone: Tone;
  rows: EventRow[];
  emptyText: string;
  onRowClick: (eventId: string) => void;
}

// Shared column widths so In Pipeline / Need attention / Coming Soon line up.
const SharedCols: React.FC = () => (
  <colgroup>
    <col style={{ width: '160px' }} />
    <col />
    <col style={{ width: '180px' }} />
    <col style={{ width: '110px' }} />
    <col style={{ width: '110px' }} />
    <col style={{ width: '130px' }} />
    <col style={{ width: '180px' }} />
  </colgroup>
);

const CommissionCell: React.FC<{ value: number; strong?: boolean }> = ({ value, strong = false }) => (
  <td className={`px-3 py-2 text-right tabular-nums ${strong ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
    {value > 0 ? fmtMoney0(value) : <span className="text-gray-300 font-normal">—</span>}
  </td>
);

const EventGroup: React.FC<EventGroupProps> = ({
  title, subtitle, tone, rows, emptyText, onRowClick,
}) => {
  const totalCommission = rows.reduce((sum, { event }) => sum + eventCommissionTotal(event), 0);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <GroupHeader title={title} subtitle={subtitle} tone={tone} count={rows.length} totalCommission={totalCommission} />
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-center text-sm text-gray-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full table-fixed divide-y divide-gray-200 text-sm">
            <SharedCols />
            <thead className="bg-white">
              <tr>
                <Th>Status</Th>
                <Th>Meeting</Th>
                <Th> </Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th right>Total $</Th>
                <Th>Location</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ badge, event }, i) => {
                const commissionTotal = eventCommissionTotal(event);

                return (
                  <tr key={`${event.id}-${badge.label}-${i}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onRowClick(event.id)}
                        className="text-blue-700 hover:underline font-medium text-left truncate block max-w-full"
                        title={event.meeting_name}
                      >
                        {event.meeting_name}
                      </button>
                      {event.client_company_name && (
                        <div className="text-xs text-gray-500 truncate" title={event.client_company_name}>
                          {event.client_company_name}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(event.arrival_date)}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(event.depart_date)}</td>
                    <CommissionCell value={commissionTotal} strong />
                    <td className="px-3 py-2 text-gray-700 truncate" title={eventLocation(event)}>
                      {eventLocation(event) || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface LineGroupProps {
  title: string;
  subtitle: string;
  tone: Tone;
  rows: LineRow[];
  emptyText: string;
  onRowClick: (eventId: string) => void;
}

const LineGroup: React.FC<LineGroupProps> = ({
  title, subtitle, tone, rows, emptyText, onRowClick,
}) => {
  const totalCommission = rows.reduce((sum, { line }) => sum + num(line.commission_amount), 0);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <GroupHeader title={title} subtitle={subtitle} tone={tone} count={rows.length} totalCommission={totalCommission} />
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-center text-sm text-gray-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full table-fixed divide-y divide-gray-200 text-sm">
            <SharedCols />
            <thead className="bg-white">
              <tr>
                <Th>Status</Th>
                <Th>Meeting</Th>
                <Th>Line</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th right>Total $</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ badge, event, line, detail }, i) => {
                const commissionTotal = num(line.commission_amount);

                return (
                  <tr key={`${event.id}-${line.id}-${badge.label}-${i}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onRowClick(event.id)}
                        className="text-blue-700 hover:underline font-medium text-left truncate block max-w-full"
                        title={event.meeting_name}
                      >
                        {event.meeting_name}
                      </button>
                      {event.client_company_name && (
                        <div className="text-xs text-gray-500 truncate" title={event.client_company_name}>
                          {event.client_company_name}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 truncate" title={`${line.line_type.toUpperCase()} · ${line.company_name}`}>
                      <span className="font-medium uppercase tracking-wider text-[10px] text-gray-500 mr-1">{line.line_type}</span>
                      {line.company_name}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(line.arrival_date)}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(line.depart_date)}</td>
                    <CommissionCell value={commissionTotal} strong />
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs">{detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

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
