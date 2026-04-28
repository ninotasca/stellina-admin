import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import NoteFeed from '../components/NoteFeed';
import type {
  BookingStatus,
  CommissionEventWithLineItems,
  CommissionLineItem,
  CommissionNote,
  HotelConsidered,
  LineType,
  PaymentStatus,
} from '../types/commission';

// ---------- Shared visual tokens ----------

const LINE_TYPE_COLOR: Record<LineType, string> = {
  hotel: '#059669',
  dmc: '#4f46e5',
  air: '#0284c7',
  other: '#475569',
};

const BOOKING_STATUS_COLORS: Record<BookingStatus, string> = {
  prospect: '#9ca3af',
  tentative: '#eab308',
  definite: '#16a34a',
  on_hold: '#f97316',
  cancelled: '#ef4444',
  lost: '#1f2937',
};

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  prospect: 'Prospect',
  tentative: 'Tentative',
  definite: 'Definite',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
  lost: 'Lost',
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending_booking: 'Pending Booking',
  upcoming: 'Upcoming',
  invoiced: 'Invoiced',
  paid: 'Paid',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

const fmtMoney = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '$0';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return '$0';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const fmtDate = (v: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' });
};

const num = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isNaN(n) ? 0 : n;
};

// ---------- Hero / headline derivation ----------

interface Hero {
  title: string;
  amount: string | null;
  subtext: string;
  tone: 'green' | 'blue' | 'orange' | 'red' | 'gray' | 'indigo' | 'yellow';
  alerts: string[];
}

function deriveHero(event: CommissionEventWithLineItems): Hero {
  const today = new Date().toISOString().slice(0, 10);
  const lines = event.line_items;
  const total = lines.reduce((s, li) => s + num(li.commission_amount), 0);
  const paidTotal = lines.filter((li) => li.payment_status === 'paid').reduce((s, li) => s + num(li.commission_amount), 0);
  const invoicedTotal = lines.filter((li) => li.payment_status === 'invoiced').reduce((s, li) => s + num(li.commission_amount), 0);
  const cancelledTotal = lines.filter((li) => li.payment_status === 'cancelled').reduce((s, li) => s + num(li.commission_amount), 0);
  const arrivalPassed = !!(event.arrival_date && event.arrival_date < today);
  const departPassed = !!(event.depart_date && event.depart_date < today);
  const alerts: string[] = [];

  // ---------- Closed states ----------
  if (event.booking_status === 'cancelled') {
    return { title: 'Cancelled', amount: null, subtext: 'This event was cancelled.', tone: 'red', alerts };
  }
  if (event.booking_status === 'lost') {
    return { title: 'Lost', amount: null, subtext: "Deal didn't close.", tone: 'gray', alerts };
  }
  if (event.booking_status === 'on_hold') {
    return { title: 'On Hold', amount: total > 0 ? fmtMoney(total) : null, subtext: 'Awaiting client.', tone: 'orange', alerts };
  }

  // ---------- Pre-definite ----------
  if (event.booking_status === 'prospect' || event.booking_status === 'tentative') {
    const weight = event.booking_status === 'tentative' ? 0.5 : 0.2;
    const weighted = total * weight;
    return {
      title: BOOKING_STATUS_LABEL[event.booking_status],
      amount: fmtMoney(total),
      subtext: total > 0 ? `Estimated · weighted ${fmtMoney(weighted)} (${Math.round(weight * 100)}%)` : 'No commission lines yet',
      tone: event.booking_status === 'tentative' ? 'yellow' : 'gray',
      alerts,
    };
  }

  // ---------- Definite (rich logic) ----------
  const activeLines = lines.filter((li) => li.payment_status !== 'cancelled');

  // Stale-invoice alerts
  for (const li of lines) {
    if (li.payment_status === 'invoiced' && li.invoice_sent_date) {
      const days = Math.floor((Date.now() - new Date(li.invoice_sent_date).getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 30) {
        alerts.push(`${li.line_type.toUpperCase()} invoice sent ${days} days ago — still unpaid.`);
      }
    }
  }

  if (activeLines.length === 0 && cancelledTotal > 0) {
    return { title: 'All lines cancelled', amount: null, subtext: 'Definite, but every line item is cancelled.', tone: 'red', alerts };
  }

  if (activeLines.length === 0) {
    return { title: 'Definite — no commission lines', amount: null, subtext: 'Set up at least one commission line.', tone: 'orange', alerts };
  }

  const allActivePaid = activeLines.every((li) => li.payment_status === 'paid');
  if (allActivePaid && paidTotal > 0) {
    return {
      title: 'Paid in full',
      amount: fmtMoney(paidTotal),
      subtext: 'Trip complete · all commission received.',
      tone: 'green',
      alerts,
    };
  }

  if (paidTotal > 0) {
    const remaining = total - paidTotal - cancelledTotal;
    return {
      title: 'Partially paid',
      amount: fmtMoney(paidTotal),
      subtext: `${fmtMoney(remaining)} still to come`,
      tone: 'blue',
      alerts,
    };
  }

  if (invoicedTotal > 0) {
    return {
      title: 'Invoiced — awaiting payment',
      amount: fmtMoney(invoicedTotal),
      subtext: departPassed ? 'Trip done · awaiting client payment' : 'Invoice sent',
      tone: 'blue',
      alerts,
    };
  }

  if (departPassed) {
    return {
      title: 'Trip done — invoice needed',
      amount: fmtMoney(total),
      subtext: 'Set payment status / send invoice',
      tone: 'orange',
      alerts: [`Departed ${fmtDate(event.depart_date)} — no commission has been invoiced yet.`, ...alerts],
    };
  }

  if (arrivalPassed) {
    return {
      title: 'Trip in progress',
      amount: fmtMoney(total),
      subtext: 'Arrived · awaiting completion',
      tone: 'indigo',
      alerts,
    };
  }

  // Future / booked, all upcoming or pending_booking
  return {
    title: 'Booked',
    amount: fmtMoney(total),
    subtext: event.arrival_date ? `Trip starts ${fmtDate(event.arrival_date)}` : 'Trip date TBD',
    tone: 'indigo',
    alerts,
  };
}

// ---------- Component ----------

const CommissionView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<CommissionEventWithLineItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineItemNotes, setLineItemNotes] = useState<Record<string, CommissionNote[]>>({});
  const [openLineNotes, setOpenLineNotes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const ev = await commissionApi.getEvent(id);
        if (!cancelled) setEvent(ev);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || 'Failed to load event');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const reloadEventNotes = async () => {
    if (!id) return;
    const notes = await commissionApi.listEventNotes(id);
    setEvent((prev) => (prev ? { ...prev, event_notes: notes } : prev));
  };

  const reloadLineNotes = async (lineItemId: string) => {
    const notes = await commissionApi.listLineItemNotes(lineItemId);
    setLineItemNotes((prev) => ({ ...prev, [lineItemId]: notes }));
  };

  const hero = useMemo(() => (event ? deriveHero(event) : null), [event]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;
  if (error || !event) return <div className="p-8 text-center text-red-600">{error || 'Not found'}</div>;

  const considersHotel = event.considerations.includes('hotel');
  const selectedHotel = event.hotels_considered.find((h) => h.is_selected);
  const otherHotels = event.hotels_considered.filter((h) => !h.is_selected);

  return (
    <div>
      {/* Top bar */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex items-center gap-3">
        <button onClick={() => navigate('/commissions')} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900 truncate flex-1">{event.meeting_name}</h1>
        <button
          onClick={() => navigate(`/commissions/${event.id}/edit`)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Edit Event
        </button>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Hero */}
        {hero && <HeroBlock hero={hero} bookingStatus={event.booking_status} />}

        {/* Event facts */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Event Details</h2>
            <button
              onClick={() => navigate(`/commissions/${event.id}/edit`)}
              className="text-xs text-blue-600 hover:underline"
            >Edit</button>
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Row label="Booking Status">
              <span className="inline-flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: BOOKING_STATUS_COLORS[event.booking_status] }} />
                <span className="font-medium text-gray-900">{BOOKING_STATUS_LABEL[event.booking_status]}</span>
              </span>
            </Row>
            <Row label="Company">{event.client_company_name || <em className="text-gray-400">—</em>}</Row>
            <Row label="Primary Contact">
              {event.primary_contact_name ? (
                <span>
                  <span>{event.primary_contact_name}</span>
                  {event.primary_contact_email && <span className="ml-2 text-gray-500">{event.primary_contact_email}</span>}
                </span>
              ) : <em className="text-gray-400">—</em>}
            </Row>
            <Row label="Destinations">
              {event.destinations?.length
                ? <span>{event.destinations.join(' · ')}</span>
                : event.destination
                  ? <span>{event.destination}</span>
                  : <em className="text-gray-400">—</em>}
            </Row>
            <Row label="Trip Dates">
              {event.arrival_date || event.depart_date ? (
                <span>
                  {fmtDate(event.arrival_date)} – {fmtDate(event.depart_date)}
                  {event.dates_flexible && <span className="ml-2 text-xs text-gray-500">(flexible)</span>}
                </span>
              ) : <em className="text-gray-400">—</em>}
            </Row>
            <Row label="Considering">
              {event.considerations.length ? (
                <div className="flex gap-1.5 flex-wrap">
                  {event.considerations.map((c) => (
                    <span key={c} className="px-2 py-0.5 text-xs rounded text-white font-semibold uppercase tracking-wider"
                      style={{ background: LINE_TYPE_COLOR[c] }}>{c}</span>
                  ))}
                </div>
              ) : <em className="text-gray-400">—</em>}
            </Row>
            {considersHotel && (
              <>
                <Row label="Peak Rooms">{event.peak_rooms ?? <em className="text-gray-400">—</em>}</Row>
                <Row label="Total Room Nights">{event.total_room_nights ?? <em className="text-gray-400">—</em>}</Row>
              </>
            )}
          </dl>
        </section>

        {/* Hotels considered (if applicable) */}
        {considersHotel && event.hotels_considered.length > 0 && (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Hotels Considered</h2>
            <ul className="divide-y divide-gray-100">
              {selectedHotel && (
                <HotelRow key={selectedHotel.id} hotel={selectedHotel} />
              )}
              {otherHotels.map((h) => (
                <HotelRow key={h.id} hotel={h} />
              ))}
            </ul>
          </section>
        )}

        {/* Commission Line Items */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Commission Lines ({event.line_items.length})
          </h2>
          {event.line_items.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No commission lines yet.</p>
          ) : (
            <div className="space-y-3">
              {event.line_items.map((li) => (
                <LineItemRow
                  key={li.id}
                  li={li}
                  bookingStatus={event.booking_status}
                  notesOpen={!!openLineNotes[li.id]}
                  onToggleNotes={async () => {
                    const next = !openLineNotes[li.id];
                    setOpenLineNotes((prev) => ({ ...prev, [li.id]: next }));
                    if (next && !(li.id in lineItemNotes)) {
                      await reloadLineNotes(li.id);
                    }
                  }}
                  notes={lineItemNotes[li.id] || []}
                  onAddNote={async (body) => {
                    await commissionApi.addLineItemNote(li.id, body);
                    await reloadLineNotes(li.id);
                  }}
                  onEditNote={async (noteId, body) => {
                    await commissionApi.updateNote(noteId, body);
                    await reloadLineNotes(li.id);
                  }}
                  onDeleteNote={async (noteId) => {
                    await commissionApi.deleteNote(noteId);
                    await reloadLineNotes(li.id);
                  }}
                  onEdit={() => navigate(`/commissions/${event.id}/edit?line=${li.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Event Notes */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Event Notes
          </h2>
          <NoteFeed
            notes={event.event_notes || []}
            enabled={true}
            placeholder="Add a note about this deal…"
            emptyHint="No notes yet — add the first."
            onAdd={async (body) => {
              if (!id) return;
              await commissionApi.addEventNote(id, body);
              await reloadEventNotes();
            }}
            onEdit={async (noteId, body) => {
              await commissionApi.updateNote(noteId, body);
              await reloadEventNotes();
            }}
            onDelete={async (noteId) => {
              await commissionApi.deleteNote(noteId);
              await reloadEventNotes();
            }}
          />
        </section>
      </main>
    </div>
  );
};

// ---------- Hero block ----------

const TONE_STYLES: Record<Hero['tone'], { bg: string; text: string; ring: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-900', ring: 'ring-emerald-200' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-900', ring: 'ring-blue-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-900', ring: 'ring-orange-200' },
  red: { bg: 'bg-red-50', text: 'text-red-900', ring: 'ring-red-200' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-900', ring: 'ring-gray-300' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-900', ring: 'ring-indigo-200' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-900', ring: 'ring-yellow-200' },
};

const HeroBlock: React.FC<{ hero: Hero; bookingStatus: BookingStatus }> = ({ hero, bookingStatus }) => {
  const t = TONE_STYLES[hero.tone];
  return (
    <section className={`rounded-xl ring-1 ${t.bg} ${t.ring} p-6`}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">Status</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
          <span className="w-2 h-2 rounded-full" style={{ background: BOOKING_STATUS_COLORS[bookingStatus] }} />
          {BOOKING_STATUS_LABEL[bookingStatus]}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-4 flex-wrap">
        <h2 className={`text-3xl font-bold ${t.text}`}>{hero.title}</h2>
        {hero.amount && <span className={`text-3xl font-bold ${t.text}`}>{hero.amount}</span>}
      </div>
      <p className={`mt-2 text-sm ${t.text} opacity-80`}>{hero.subtext}</p>
      {hero.alerts.length > 0 && (
        <ul className="mt-3 space-y-1">
          {hero.alerts.map((a, i) => (
            <li key={i} className="text-xs text-orange-800 bg-orange-100 inline-block px-2 py-1 rounded mr-2">⚠ {a}</li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ---------- Building blocks ----------

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-0.5">{label}</dt>
    <dd className="text-sm text-gray-900">{children}</dd>
  </div>
);

const HotelRow: React.FC<{ hotel: HotelConsidered }> = ({ hotel }) => (
  <li className={`flex items-center gap-3 py-2 ${hotel.is_selected ? '' : ''}`}>
    <span
      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
        hotel.is_selected ? 'bg-emerald-600' : 'border-2 border-gray-200'
      }`}
    >
      {hotel.is_selected && (
        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </span>
    <span className={`text-sm ${hotel.is_selected ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
      {hotel.name}
    </span>
    {hotel.is_selected && (
      <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold px-1.5 py-0.5 bg-emerald-100 rounded">
        Selected
      </span>
    )}
  </li>
);

// ---------- Line item row (read-only with notes + edit link) ----------

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  pending_booking: 'bg-gray-100 text-gray-700',
  upcoming: 'bg-gray-100 text-gray-700',
  invoiced: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  on_hold: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-700',
};

interface LineItemRowProps {
  li: CommissionLineItem;
  bookingStatus: BookingStatus;
  notesOpen: boolean;
  onToggleNotes: () => Promise<void>;
  notes: CommissionNote[];
  onAddNote: (body: string) => Promise<void>;
  onEditNote: (noteId: string, body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onEdit: () => void;
}

const LineItemRow: React.FC<LineItemRowProps> = ({
  li, bookingStatus, notesOpen, onToggleNotes, notes,
  onAddNote, onEditNote, onDeleteNote, onEdit,
}) => {
  const accent = LINE_TYPE_COLOR[li.line_type];
  const showPayment = bookingStatus === 'definite';

  return (
    <div className="rounded-lg bg-white border border-gray-200 border-l-4" style={{ borderLeftColor: accent }}>
      <div className="p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <span
            className="px-2.5 py-0.5 text-xs uppercase tracking-wider rounded-full font-semibold text-white shrink-0"
            style={{ background: accent }}
          >
            {li.line_type}
          </span>
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-semibold text-gray-900">
              {li.company_name || <em className="text-gray-400">(no vendor)</em>}
            </p>
            {li.resort_hotel && li.resort_hotel !== li.company_name && (
              <p className="text-xs text-gray-500">{li.resort_hotel}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-gray-900">
              {fmtMoney(li.commission_amount)}
            </p>
            {li.commission_pct && li.revenue && (
              <p className="text-[11px] text-gray-500">
                {Number(li.commission_pct)}% of {fmtMoney(li.revenue)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showPayment && (
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_BADGE[li.payment_status]}`}>
                {PAYMENT_STATUS_LABEL[li.payment_status]}
              </span>
            )}
            <button onClick={onEdit} className="text-xs text-blue-600 hover:underline">Edit</button>
          </div>
        </div>

        {/* Sub-line for dates / payment dates / points */}
        <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
          {(li.arrival_date || li.depart_date) && (
            <span>
              {fmtDate(li.arrival_date, { month: 'short', day: 'numeric', year: '2-digit' })} – {fmtDate(li.depart_date, { month: 'short', day: 'numeric', year: '2-digit' })}
            </span>
          )}
          {showPayment && li.payment_status === 'invoiced' && li.invoice_sent_date && (
            <span>Invoiced {fmtDate(li.invoice_sent_date, { month: 'short', day: 'numeric' })}</span>
          )}
          {showPayment && li.payment_status === 'paid' && li.paid_date && (
            <span className="text-emerald-700">Paid {fmtDate(li.paid_date, { month: 'short', day: 'numeric' })}</span>
          )}
          {li.my_points && <span>Points: {li.my_points}</span>}
          {li.cash_forward && <span>Cash forward: {fmtMoney(li.cash_forward)}</span>}
        </div>

        {/* Notes toggle */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onToggleNotes}
            className="text-xs text-blue-700 hover:underline"
          >
            {notesOpen ? '▾ Hide notes' : `▸ Notes${notes.length ? ` (${notes.length})` : ''}`}
          </button>
          {notesOpen && (
            <div className="mt-3">
              <NoteFeed
                notes={notes}
                enabled={true}
                placeholder={`Note for this ${li.line_type} line…`}
                emptyHint="No notes on this line item yet."
                onAdd={onAddNote}
                onEdit={onEditNote}
                onDelete={onDeleteNote}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommissionView;
