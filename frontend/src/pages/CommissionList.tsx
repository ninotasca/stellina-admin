import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import MultiSelect from '../components/MultiSelect';
import { downloadCSV, timestampedFilename } from '../utils/csv';
import type {
  CommissionEventWithLineItems,
  CommissionLineItem,
  BookingStatus,
  PaymentStatus,
  LineType,
} from '../types/commission';

// ---------- Visual tokens ----------

const LINE_TYPE_COLOR: Record<LineType, string> = {
  hotel: '#059669',
  dmc: '#4f46e5',
  air: '#0284c7',
  other: '#475569',
};

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  prospect: 'bg-gray-100 text-gray-700',
  tentative: 'bg-yellow-100 text-yellow-800',
  definite: 'bg-green-100 text-green-800',
  on_hold: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-700',
  lost: 'bg-gray-200 text-gray-800',
};

const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  pending_booking: 'bg-gray-100 text-gray-600',
  upcoming: 'bg-gray-100 text-gray-700',
  invoiced: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  on_hold: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-700',
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending_booking: 'Pending Booking',
  upcoming: 'Upcoming',
  invoiced: 'Invoiced',
  paid: 'Paid',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

const BOOKING_STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: 'definite', label: 'Definite' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'lost', label: 'Lost' },
];

const LINE_TYPE_OPTIONS: { value: LineType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'dmc', label: 'DMC' },
  { value: 'air', label: 'Air' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'pending_booking', label: 'Pending Booking' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
];

const fmtMoney = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const fmtDate = (v: string | null | undefined) => {
  if (!v) return '';
  return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

const eventLocation = (ev: CommissionEventWithLineItems): string => {
  if (ev.destinations && ev.destinations.length) return ev.destinations.join(' · ');
  return ev.destination || '';
};

// Sort priority for booking status (higher = "more active")
const BOOKING_STATUS_RANK: Record<BookingStatus, number> = {
  definite: 6, tentative: 5, prospect: 4, on_hold: 3, cancelled: 2, lost: 1,
};

// Sort priority for payment status (higher = "more progressed")
const PAYMENT_RANK: Record<PaymentStatus, number> = {
  paid: 6, invoiced: 5, upcoming: 4, pending_booking: 3, on_hold: 2, cancelled: 1,
};

// ---------- Payment rollup for Events view ----------

interface PaymentRollup {
  primaryLabel: string;
  primaryClass: string;
  detail: { status: PaymentStatus; count: number }[];
  rank: number; // for sorting
}

function rollupPayment(ev: CommissionEventWithLineItems, lines: CommissionLineItem[]): PaymentRollup {
  // Pre-definite events don't have a payment lifecycle
  if (ev.booking_status !== 'definite') {
    return {
      primaryLabel: '—',
      primaryClass: 'bg-gray-50 text-gray-400',
      detail: [],
      rank: -1,
    };
  }
  if (lines.length === 0) {
    return { primaryLabel: '—', primaryClass: 'bg-gray-50 text-gray-400', detail: [], rank: -1 };
  }
  const counts = new Map<PaymentStatus, number>();
  for (const l of lines) counts.set(l.payment_status, (counts.get(l.payment_status) || 0) + 1);
  const detail = Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => (PAYMENT_RANK[b.status] || 0) - (PAYMENT_RANK[a.status] || 0));

  if (detail.length === 1) {
    const only = detail[0];
    return {
      primaryLabel: PAYMENT_STATUS_LABEL[only.status],
      primaryClass: PAYMENT_STATUS_BADGE[only.status],
      detail,
      rank: PAYMENT_RANK[only.status] || 0,
    };
  }
  // Mixed — rank by the dominant status
  return {
    primaryLabel: 'Mixed',
    primaryClass: 'bg-purple-100 text-purple-800',
    detail,
    rank: detail[0] ? (PAYMENT_RANK[detail[0].status] || 0) : 0,
  };
}

// ---------- Sort helpers ----------

type SortDir = 'asc' | 'desc';

function flipDir<T extends string>(key: T, prevKey: T, prevDir: SortDir, defaultDirByKey: Partial<Record<T, SortDir>> = {}): { key: T; dir: SortDir } {
  if (key === prevKey) return { key, dir: prevDir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: defaultDirByKey[key] || 'asc' };
}

const SortHeader: React.FC<{ active: boolean; dir: SortDir; onClick: () => void; right?: boolean; children: React.ReactNode }> = ({ active, dir, onClick, right, children }) => (
  <th className={`px-3 py-2 text-${right ? 'right' : 'left'} text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap`}>
    <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? 'text-gray-900' : ''}`}>
      <span>{children}</span>
      <span className="text-[10px] w-2 inline-block">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
    </button>
  </th>
);

// ---------- Component ----------

type ViewMode = 'events' | 'lines' | 'expanded';
type PresetKey = 'in_pipeline' | 'awaiting_payment' | 'needs_invoice' | 'coming_soon';

const PRESETS: { key: PresetKey; label: string; description: string; tone: string }[] = [
  { key: 'in_pipeline', label: 'In Pipeline', description: 'Prospect + Tentative', tone: 'yellow' },
  { key: 'awaiting_payment', label: 'Awaiting Payment', description: 'Definite & invoiced, not yet paid', tone: 'blue' },
  { key: 'needs_invoice', label: 'Needs Invoice', description: 'Trip done, no invoice sent yet', tone: 'orange' },
  { key: 'coming_soon', label: 'Coming Soon', description: 'Arriving in the next 30 days', tone: 'indigo' },
];

const PRESET_TONE: Record<string, { active: string; idle: string }> = {
  yellow: { active: 'bg-yellow-500 text-white border-yellow-500', idle: 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50' },
  blue: { active: 'bg-blue-600 text-white border-blue-600', idle: 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50' },
  orange: { active: 'bg-orange-500 text-white border-orange-500', idle: 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50' },
  indigo: { active: 'bg-indigo-600 text-white border-indigo-600', idle: 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50' },
};

// Sort keys per view
type EventSortKey = 'meeting' | 'status' | 'location' | 'start' | 'end' | 'lineCount' | 'payment' | 'total';
type LineSortKey = 'meeting' | 'type' | 'vendor' | 'arrival' | 'depart' | 'payment' | 'commission';
type ExpandedSortKey = 'meeting' | 'type' | 'vendor' | 'resort' | 'booking' | 'arrival' | 'depart' | 'peakRooms' | 'rns' | 'revenue' | 'pct' | 'commission' | 'paymentStatus' | 'invoiceSent' | 'paidDate' | 'cashForward';

const CommissionList: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CommissionEventWithLineItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>('events');

  // Filters (multi-select)
  const [search, setSearch] = useState('');
  const [statusSel, setStatusSel] = useState<Set<BookingStatus>>(new Set());
  const [typeSel, setTypeSel] = useState<Set<LineType>>(new Set());
  const [paymentSel, setPaymentSel] = useState<Set<PaymentStatus>>(new Set());
  const [yearSel, setYearSel] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<PresetKey | null>(null);

  // Years available across the loaded data (line item arrival dates)
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const ev of events) {
      for (const li of ev.line_items) {
        if (li.arrival_date) years.add(new Date(li.arrival_date).getUTCFullYear());
      }
    }
    return Array.from(years).sort((a, b) => a - b).map((y) => ({ value: String(y), label: String(y) }));
  }, [events]);

  // Per-view sort state
  const [eventSort, setEventSort] = useState<{ key: EventSortKey; dir: SortDir }>({ key: 'start', dir: 'asc' });
  const [lineSort, setLineSort] = useState<{ key: LineSortKey; dir: SortDir }>({ key: 'arrival', dir: 'asc' });
  const [expandedSort, setExpandedSort] = useState<{ key: ExpandedSortKey; dir: SortDir }>({ key: 'arrival', dir: 'asc' });

  // Accordion expansion state for events view
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true); setError(null);
      const data = await commissionApi.listEvents();
      setEvents(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Filtering ----------

  // ISO date strings for preset comparisons (string compare on YYYY-MM-DD works)
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const eventMatchesPreset = (ev: CommissionEventWithLineItems): boolean => {
    if (!preset) return true;
    if (preset === 'in_pipeline') return ev.booking_status === 'prospect' || ev.booking_status === 'tentative';
    if (preset === 'awaiting_payment' || preset === 'needs_invoice') return ev.booking_status === 'definite';
    return true; // coming_soon — delegate to line check
  };

  const lineMatchesPreset = (li: CommissionLineItem): boolean => {
    if (!preset) return true;
    if (preset === 'awaiting_payment') return li.payment_status === 'invoiced';
    if (preset === 'needs_invoice') {
      if (!li.depart_date || li.depart_date >= today) return false;
      return li.payment_status === 'pending_booking' || li.payment_status === 'upcoming';
    }
    if (preset === 'coming_soon') {
      if (!li.arrival_date) return false;
      return li.arrival_date >= today && li.arrival_date <= in30;
    }
    return true;
  };

  const lineMatchesFilters = (li: CommissionLineItem, ev: CommissionEventWithLineItems): boolean => {
    if (!lineMatchesPreset(li)) return false;
    if (typeSel.size > 0 && !typeSel.has(li.line_type)) return false;
    if (paymentSel.size > 0 && !paymentSel.has(li.payment_status)) return false;
    if (yearSel.size > 0) {
      if (!li.arrival_date) return false;
      const y = String(new Date(li.arrival_date).getUTCFullYear());
      if (!yearSel.has(y)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hay = [
        ev.meeting_name, li.company_name, li.resort_hotel || '',
        eventLocation(ev), ev.client_company_name || '',
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  type EventVisible = { event: CommissionEventWithLineItems; lines: CommissionLineItem[] };

  const visibleEvents: EventVisible[] = useMemo(() => {
    return events
      .filter((ev) => eventMatchesPreset(ev))
      .filter((ev) => statusSel.size === 0 || statusSel.has(ev.booking_status))
      .map((ev) => ({ event: ev, lines: ev.line_items.filter((li) => lineMatchesFilters(li, ev)) }))
      .filter(({ lines }) => lines.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, statusSel, typeSel, paymentSel, yearSel, search, preset]);

  const visibleLines = useMemo(() => {
    const out: { event: CommissionEventWithLineItems; line: CommissionLineItem }[] = [];
    for (const { event: ev, lines } of visibleEvents) {
      for (const line of lines) out.push({ event: ev, line });
    }
    return out;
  }, [visibleEvents]);

  // ---------- Sort wrappers ----------

  const sortedEvents = useMemo(() => {
    const arr = [...visibleEvents];
    const { key, dir } = eventSort;
    arr.sort((a, b) => {
      const ea = a.event, eb = b.event;
      let cmp = 0;
      const totalA = a.lines.reduce((s, l) => s + Number(l.commission_amount || 0), 0);
      const totalB = b.lines.reduce((s, l) => s + Number(l.commission_amount || 0), 0);
      switch (key) {
        case 'meeting': cmp = ea.meeting_name.localeCompare(eb.meeting_name); break;
        case 'status': cmp = (BOOKING_STATUS_RANK[ea.booking_status] || 0) - (BOOKING_STATUS_RANK[eb.booking_status] || 0); break;
        case 'location': cmp = eventLocation(ea).localeCompare(eventLocation(eb)); break;
        case 'start': cmp = (ea.arrival_date || '9999').localeCompare(eb.arrival_date || '9999'); break;
        case 'end': cmp = (ea.depart_date || '9999').localeCompare(eb.depart_date || '9999'); break;
        case 'lineCount': cmp = a.lines.length - b.lines.length; break;
        case 'payment': cmp = rollupPayment(ea, a.lines).rank - rollupPayment(eb, b.lines).rank; break;
        case 'total': cmp = totalA - totalB; break;
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [visibleEvents, eventSort]);

  const sortedLines = useMemo(() => {
    const arr = [...visibleLines];
    const { key, dir } = lineSort;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case 'meeting': cmp = a.event.meeting_name.localeCompare(b.event.meeting_name); break;
        case 'type': cmp = a.line.line_type.localeCompare(b.line.line_type); break;
        case 'vendor': cmp = (a.line.company_name || '').localeCompare(b.line.company_name || ''); break;
        case 'arrival': cmp = (a.line.arrival_date || '9999').localeCompare(b.line.arrival_date || '9999'); break;
        case 'depart': cmp = (a.line.depart_date || '9999').localeCompare(b.line.depart_date || '9999'); break;
        case 'payment': cmp = (PAYMENT_RANK[a.line.payment_status] || 0) - (PAYMENT_RANK[b.line.payment_status] || 0); break;
        case 'commission': cmp = Number(a.line.commission_amount || 0) - Number(b.line.commission_amount || 0); break;
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [visibleLines, lineSort]);

  const sortedExpanded = useMemo(() => {
    const arr = [...visibleLines];
    const { key, dir } = expandedSort;
    arr.sort((a, b) => {
      let cmp = 0;
      const al = a.line, bl = b.line;
      switch (key) {
        case 'meeting': cmp = a.event.meeting_name.localeCompare(b.event.meeting_name); break;
        case 'type': cmp = al.line_type.localeCompare(bl.line_type); break;
        case 'vendor': cmp = (al.company_name || '').localeCompare(bl.company_name || ''); break;
        case 'resort': cmp = (al.resort_hotel || '').localeCompare(bl.resort_hotel || ''); break;
        case 'booking': cmp = (BOOKING_STATUS_RANK[a.event.booking_status] || 0) - (BOOKING_STATUS_RANK[b.event.booking_status] || 0); break;
        case 'arrival': cmp = (al.arrival_date || '9999').localeCompare(bl.arrival_date || '9999'); break;
        case 'depart': cmp = (al.depart_date || '9999').localeCompare(bl.depart_date || '9999'); break;
        case 'peakRooms': cmp = (al.peak_rooms || 0) - (bl.peak_rooms || 0); break;
        case 'rns': cmp = (al.total_room_nights || 0) - (bl.total_room_nights || 0); break;
        case 'revenue': cmp = Number(al.revenue || 0) - Number(bl.revenue || 0); break;
        case 'pct': cmp = Number(al.commission_pct || 0) - Number(bl.commission_pct || 0); break;
        case 'commission': cmp = Number(al.commission_amount || 0) - Number(bl.commission_amount || 0); break;
        case 'paymentStatus': cmp = (PAYMENT_RANK[al.payment_status] || 0) - (PAYMENT_RANK[bl.payment_status] || 0); break;
        case 'invoiceSent': cmp = (al.invoice_sent_date || '9999').localeCompare(bl.invoice_sent_date || '9999'); break;
        case 'paidDate': cmp = (al.paid_date || '9999').localeCompare(bl.paid_date || '9999'); break;
        case 'cashForward': cmp = Number(al.cash_forward || 0) - Number(bl.cash_forward || 0); break;
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [visibleLines, expandedSort]);

  // ---------- CSV downloads ----------

  const downloadEventsCSV = () => {
    const rows = sortedEvents.map(({ event: ev, lines }) => {
      const total = lines.reduce((s, l) => s + Number(l.commission_amount || 0), 0);
      const types = Array.from(new Set(lines.map((l) => l.line_type))).join(', ');
      const r = rollupPayment(ev, lines);
      const paymentText = r.detail.length === 0 ? '' : r.detail.length === 1
        ? PAYMENT_STATUS_LABEL[r.detail[0].status]
        : r.detail.map((d) => `${d.count} ${PAYMENT_STATUS_LABEL[d.status]}`).join(' · ');
      return [
        ev.meeting_name,
        ev.client_company_name || '',
        ev.booking_status,
        eventLocation(ev),
        ev.arrival_date || '',
        ev.depart_date || '',
        types,
        lines.length,
        paymentText,
        total,
      ];
    });
    downloadCSV(timestampedFilename('events'),
      ['Meeting', 'Company', 'Status', 'Location', 'Start', 'End', 'Line Types', 'Line Count', 'Payment', 'Total Commission'],
      rows);
  };

  const downloadLinesCSV = () => {
    const rows = sortedLines.map(({ event: ev, line: l }) => [
      ev.meeting_name, l.line_type, l.company_name || '',
      l.arrival_date || '', l.depart_date || '',
      l.payment_status, Number(l.commission_amount || 0),
    ]);
    downloadCSV(timestampedFilename('commission-lines'),
      ['Meeting', 'Type', 'Vendor', 'Arrival', 'Depart', 'Payment', 'Commission'],
      rows);
  };

  const downloadExpandedCSV = () => {
    const rows = sortedExpanded.map(({ event: ev, line: l }) => [
      ev.meeting_name, l.line_type, l.company_name || '', l.resort_hotel || '',
      ev.booking_status, l.arrival_date || '', l.depart_date || '',
      l.peak_rooms ?? '', l.total_room_nights ?? '',
      Number(l.revenue || 0), l.commission_pct ?? '', Number(l.commission_amount || 0),
      l.payment_status, l.invoice_sent_date || '', l.paid_date || '',
      l.my_points || '', Number(l.cash_forward || 0),
    ]);
    downloadCSV(timestampedFilename('commission-detail'),
      ['Meeting', 'Type', 'Vendor', 'Resort/Hotel', 'Booking', 'Arrival', 'Depart',
       'Peak Rooms', 'Total RNs', 'Revenue', 'Comm %', 'Commission',
       'Payment', 'Invoice Sent', 'Paid Date', 'My Points', 'Cash Forward'],
      rows);
  };

  // ---------- Other handlers ----------

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" and all its line items?`)) return;
    try { await commissionApi.deleteEvent(id); load(); }
    catch (err: any) { alert(err.response?.data?.detail || 'Failed to delete event'); }
  };

  const toggleEvent = (id: string) => {
    setOpenEvents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const onEventSort = (key: EventSortKey) => setEventSort((prev) => flipDir(key, prev.key, prev.dir, { total: 'desc', start: 'asc', end: 'asc', lineCount: 'desc' }));
  const onLineSort = (key: LineSortKey) => setLineSort((prev) => flipDir(key, prev.key, prev.dir, { commission: 'desc', arrival: 'asc', depart: 'asc' }));
  const onExpandedSort = (key: ExpandedSortKey) => setExpandedSort((prev) => flipDir(key, prev.key, prev.dir, { commission: 'desc', revenue: 'desc', arrival: 'asc', depart: 'asc' }));

  return (
    <div>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <button
          onClick={() => navigate('/commissions/new')}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          + New Event
        </button>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* View toggle + download */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-gray-500 font-medium">View:</span>
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden bg-white">
              {(['events', 'lines', 'expanded'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm ${view === v ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  {v === 'events' ? 'Events' : v === 'lines' ? 'Lines' : 'Expanded'}
                </button>
              ))}
            </div>
          </div>
          <DownloadButton onClick={view === 'events' ? downloadEventsCSV : view === 'lines' ? downloadLinesCSV : downloadExpandedCSV} />
        </div>

        {/* Quick-link presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-gray-500 font-medium mr-1">Quick filters:</span>
          {PRESETS.map((p) => {
            const active = preset === p.key;
            const tone = PRESET_TONE[p.tone];
            return (
              <button
                key={p.key}
                onClick={() => setPreset(active ? null : p.key)}
                title={p.description}
                className={`px-3 py-1.5 text-sm rounded-full border font-medium transition-colors ${active ? tone.active : tone.idle}`}
              >
                {p.label}
              </button>
            );
          })}
          {preset && (
            <button onClick={() => setPreset(null)} className="ml-1 text-xs text-gray-500 hover:text-gray-800 underline">
              Clear
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 border border-gray-200">
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meeting, company, hotel…"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <MultiSelect<string>
            options={yearOptions}
            selected={yearSel}
            onChange={setYearSel}
            allLabel="All years"
            groupLabel="Arrival Year"
          />
          <MultiSelect<BookingStatus>
            options={BOOKING_STATUS_OPTIONS}
            selected={statusSel}
            onChange={setStatusSel}
            allLabel="All booking statuses"
            groupLabel="Booking Status"
          />
          <MultiSelect<LineType>
            options={LINE_TYPE_OPTIONS}
            selected={typeSel}
            onChange={setTypeSel}
            allLabel="All line types"
            groupLabel="Line Type"
          />
          <MultiSelect<PaymentStatus>
            options={PAYMENT_STATUS_OPTIONS}
            selected={paymentSel}
            onChange={setPaymentSel}
            allLabel="All payment statuses"
            groupLabel="Payment Status"
          />
        </div>

        {error && <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : view === 'events' ? (
          <EventsView
            sortedEvents={sortedEvents}
            sort={eventSort}
            onSort={onEventSort}
            openEvents={openEvents}
            onToggleEvent={toggleEvent}
            onNavigateEvent={(id) => navigate(`/commissions/${id}`)}
            onDelete={handleDelete}
          />
        ) : view === 'lines' ? (
          <LinesView
            sortedLines={sortedLines}
            sort={lineSort}
            onSort={onLineSort}
            onNavigateEvent={(id) => navigate(`/commissions/${id}`)}
          />
        ) : (
          <ExpandedView
            sortedLines={sortedExpanded}
            sort={expandedSort}
            onSort={onExpandedSort}
            onNavigateEvent={(id) => navigate(`/commissions/${id}`)}
          />
        )}

        {!loading && (
          <div className="flex justify-end">
            <DownloadButton onClick={view === 'events' ? downloadEventsCSV : view === 'lines' ? downloadLinesCSV : downloadExpandedCSV} />
          </div>
        )}
      </main>
    </div>
  );
};

const DownloadButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="px-3 py-1.5 text-sm border border-gray-300 bg-white rounded-md hover:bg-gray-50 inline-flex items-center gap-1.5"
    title="Download current view as CSV (opens in Excel)"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
    </svg>
    Download CSV
  </button>
);

// ---------- Events view (rolled up + accordion) ----------

const EventsView: React.FC<{
  sortedEvents: { event: CommissionEventWithLineItems; lines: CommissionLineItem[] }[];
  sort: { key: EventSortKey; dir: SortDir };
  onSort: (k: EventSortKey) => void;
  openEvents: Set<string>;
  onToggleEvent: (id: string) => void;
  onNavigateEvent: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}> = ({ sortedEvents, sort, onSort, openEvents, onToggleEvent, onNavigateEvent, onDelete }) => {
  if (sortedEvents.length === 0) {
    return <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">No events match these filters.</div>;
  }
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <SortHeader active={sort.key === 'meeting'} dir={sort.dir} onClick={() => onSort('meeting')}>Meeting</SortHeader>
              <SortHeader active={sort.key === 'status'} dir={sort.dir} onClick={() => onSort('status')}>Status</SortHeader>
              <SortHeader active={sort.key === 'location'} dir={sort.dir} onClick={() => onSort('location')}>Location</SortHeader>
              <SortHeader active={sort.key === 'start'} dir={sort.dir} onClick={() => onSort('start')}>Start</SortHeader>
              <SortHeader active={sort.key === 'end'} dir={sort.dir} onClick={() => onSort('end')}>End</SortHeader>
              <SortHeader active={sort.key === 'lineCount'} dir={sort.dir} onClick={() => onSort('lineCount')}>Lines</SortHeader>
              <SortHeader active={sort.key === 'payment'} dir={sort.dir} onClick={() => onSort('payment')}>Payment</SortHeader>
              <SortHeader right active={sort.key === 'total'} dir={sort.dir} onClick={() => onSort('total')}>Total</SortHeader>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedEvents.map(({ event: ev, lines }) => {
              const open = openEvents.has(ev.id);
              const types = Array.from(new Set(lines.map((l) => l.line_type)));
              const total = lines.reduce((s, l) => s + Number(l.commission_amount || 0), 0);
              const r = rollupPayment(ev, lines);
              return (
                <React.Fragment key={ev.id}>
                  <tr
                    onClick={() => onToggleEvent(ev.id)}
                    className={`cursor-pointer hover:bg-gray-50 ${open ? 'bg-blue-50/40' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateEvent(ev.id); }}
                          className="text-blue-700 hover:underline font-medium text-left"
                        >
                          {ev.meeting_name}
                        </button>
                      </div>
                      {ev.client_company_name && <div className="ml-5 text-xs text-gray-500">{ev.client_company_name}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${BOOKING_STATUS_BADGE[ev.booking_status]}`}>
                        {ev.booking_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{eventLocation(ev) || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(ev.arrival_date) || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(ev.depart_date) || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {types.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded text-white font-semibold"
                            style={{ background: LINE_TYPE_COLOR[t] }}>{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <PaymentRollupCell rollup={r} />
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(total) || '—'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(ev.id, ev.meeting_name); }}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >Delete</button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={9} className="px-0 py-0">
                        <div className="px-6 py-3 border-y border-gray-200 bg-gray-50/60">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider">Type</th>
                                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider">Vendor</th>
                                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider">Arrival</th>
                                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider">Depart</th>
                                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider">Payment</th>
                                <th className="px-2 py-1 text-right font-semibold uppercase tracking-wider">Revenue</th>
                                <th className="px-2 py-1 text-right font-semibold uppercase tracking-wider">Comm %</th>
                                <th className="px-2 py-1 text-right font-semibold uppercase tracking-wider">Commission</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {lines.map((l) => (
                                <tr key={l.id}>
                                  <td className="px-2 py-1.5">
                                    <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded text-white font-semibold"
                                      style={{ background: LINE_TYPE_COLOR[l.line_type] }}>{l.line_type}</span>
                                  </td>
                                  <td className="px-2 py-1.5 text-gray-700">{l.company_name || <em className="text-gray-400">—</em>}</td>
                                  <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{fmtDate(l.arrival_date) || '—'}</td>
                                  <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{fmtDate(l.depart_date) || '—'}</td>
                                  <td className="px-2 py-1.5">
                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${PAYMENT_STATUS_BADGE[l.payment_status]}`}>
                                      {PAYMENT_STATUS_LABEL[l.payment_status]}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(l.revenue) || '—'}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{l.commission_pct ? `${Number(l.commission_pct)}%` : '—'}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtMoney(l.commission_amount) || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PaymentRollupCell: React.FC<{ rollup: PaymentRollup }> = ({ rollup }) => {
  if (rollup.detail.length === 0) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  if (rollup.detail.length === 1) {
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${rollup.primaryClass}`}>
        {rollup.primaryLabel}
      </span>
    );
  }
  return (
    <div className="flex gap-1 flex-wrap">
      {rollup.detail.map((d) => (
        <span key={d.status} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${PAYMENT_STATUS_BADGE[d.status]}`}>
          <span className="font-semibold">{d.count}</span>
          <span>{PAYMENT_STATUS_LABEL[d.status]}</span>
        </span>
      ))}
    </div>
  );
};

// ---------- Lines view ----------

const LinesView: React.FC<{
  sortedLines: { event: CommissionEventWithLineItems; line: CommissionLineItem }[];
  sort: { key: LineSortKey; dir: SortDir };
  onSort: (k: LineSortKey) => void;
  onNavigateEvent: (id: string) => void;
}> = ({ sortedLines, sort, onSort, onNavigateEvent }) => {
  if (sortedLines.length === 0) {
    return <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">No line items match these filters.</div>;
  }
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <SortHeader active={sort.key === 'meeting'} dir={sort.dir} onClick={() => onSort('meeting')}>Meeting</SortHeader>
              <SortHeader active={sort.key === 'type'} dir={sort.dir} onClick={() => onSort('type')}>Type</SortHeader>
              <SortHeader active={sort.key === 'vendor'} dir={sort.dir} onClick={() => onSort('vendor')}>Vendor</SortHeader>
              <SortHeader active={sort.key === 'arrival'} dir={sort.dir} onClick={() => onSort('arrival')}>Arrival</SortHeader>
              <SortHeader active={sort.key === 'depart'} dir={sort.dir} onClick={() => onSort('depart')}>Depart</SortHeader>
              <SortHeader active={sort.key === 'payment'} dir={sort.dir} onClick={() => onSort('payment')}>Payment</SortHeader>
              <SortHeader right active={sort.key === 'commission'} dir={sort.dir} onClick={() => onSort('commission')}>Commission</SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedLines.map(({ event: ev, line: l }) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <button onClick={() => onNavigateEvent(ev.id)} className="text-blue-700 hover:underline font-medium text-left">
                    {ev.meeting_name}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded text-white font-semibold"
                    style={{ background: LINE_TYPE_COLOR[l.line_type] }}>{l.line_type}</span>
                </td>
                <td className="px-3 py-2 text-gray-700">{l.company_name || <em className="text-gray-400">—</em>}</td>
                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(l.arrival_date) || '—'}</td>
                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(l.depart_date) || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_STATUS_BADGE[l.payment_status]}`}>
                    {PAYMENT_STATUS_LABEL[l.payment_status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(l.commission_amount) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------- Expanded view ----------

const ExpandedView: React.FC<{
  sortedLines: { event: CommissionEventWithLineItems; line: CommissionLineItem }[];
  sort: { key: ExpandedSortKey; dir: SortDir };
  onSort: (k: ExpandedSortKey) => void;
  onNavigateEvent: (id: string) => void;
}> = ({ sortedLines, sort, onSort, onNavigateEvent }) => {
  if (sortedLines.length === 0) {
    return <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">No line items match these filters.</div>;
  }
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50">
            <tr>
              <SortHeader active={sort.key === 'meeting'} dir={sort.dir} onClick={() => onSort('meeting')}>Meeting</SortHeader>
              <SortHeader active={sort.key === 'type'} dir={sort.dir} onClick={() => onSort('type')}>Type</SortHeader>
              <SortHeader active={sort.key === 'vendor'} dir={sort.dir} onClick={() => onSort('vendor')}>Vendor</SortHeader>
              <SortHeader active={sort.key === 'resort'} dir={sort.dir} onClick={() => onSort('resort')}>Resort/Hotel</SortHeader>
              <SortHeader active={sort.key === 'booking'} dir={sort.dir} onClick={() => onSort('booking')}>Booking</SortHeader>
              <SortHeader active={sort.key === 'arrival'} dir={sort.dir} onClick={() => onSort('arrival')}>Arrival</SortHeader>
              <SortHeader active={sort.key === 'depart'} dir={sort.dir} onClick={() => onSort('depart')}>Depart</SortHeader>
              <SortHeader right active={sort.key === 'peakRooms'} dir={sort.dir} onClick={() => onSort('peakRooms')}>Peak Rms</SortHeader>
              <SortHeader right active={sort.key === 'rns'} dir={sort.dir} onClick={() => onSort('rns')}>Total RNs</SortHeader>
              <SortHeader right active={sort.key === 'revenue'} dir={sort.dir} onClick={() => onSort('revenue')}>Revenue</SortHeader>
              <SortHeader right active={sort.key === 'pct'} dir={sort.dir} onClick={() => onSort('pct')}>Comm %</SortHeader>
              <SortHeader right active={sort.key === 'commission'} dir={sort.dir} onClick={() => onSort('commission')}>Commission</SortHeader>
              <SortHeader active={sort.key === 'paymentStatus'} dir={sort.dir} onClick={() => onSort('paymentStatus')}>Payment</SortHeader>
              <SortHeader active={sort.key === 'invoiceSent'} dir={sort.dir} onClick={() => onSort('invoiceSent')}>Invoice Sent</SortHeader>
              <SortHeader active={sort.key === 'paidDate'} dir={sort.dir} onClick={() => onSort('paidDate')}>Paid Date</SortHeader>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">My Points</th>
              <SortHeader right active={sort.key === 'cashForward'} dir={sort.dir} onClick={() => onSort('cashForward')}>Cash Forward</SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedLines.map(({ event: ev, line: l }) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <button onClick={() => onNavigateEvent(ev.id)} className="text-blue-700 hover:underline font-medium text-left">
                    {ev.meeting_name}
                  </button>
                </td>
                <td className="px-2 py-1.5">
                  <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded text-white font-semibold"
                    style={{ background: LINE_TYPE_COLOR[l.line_type] }}>{l.line_type}</span>
                </td>
                <td className="px-2 py-1.5 text-gray-700">{l.company_name || '—'}</td>
                <td className="px-2 py-1.5 text-gray-700">{l.resort_hotel || '—'}</td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${BOOKING_STATUS_BADGE[ev.booking_status]}`}>
                    {ev.booking_status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(l.arrival_date) || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(l.depart_date) || '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.peak_rooms ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.total_room_nights ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(l.revenue) || '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.commission_pct ? `${Number(l.commission_pct)}%` : '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtMoney(l.commission_amount) || '—'}</td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${PAYMENT_STATUS_BADGE[l.payment_status]}`}>
                    {PAYMENT_STATUS_LABEL[l.payment_status]}
                  </span>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(l.invoice_sent_date) || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(l.paid_date) || '—'}</td>
                <td className="px-2 py-1.5 text-gray-700 truncate max-w-[180px]" title={l.my_points || ''}>{l.my_points || '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(l.cash_forward) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CommissionList;
