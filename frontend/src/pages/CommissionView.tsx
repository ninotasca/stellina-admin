import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import { nimbleApi, type NimbleCompanyLite, type NimblePersonLite } from '../services/nimbleApi';
import { rfpApi } from '../services/rfpApi';
import NoteFeed from '../components/NoteFeed';
import NimbleTypeahead, { type NimbleSelection, type PickerItem } from '../components/NimbleTypeahead';
import CurrencyInput from '../components/CurrencyInput';
import NimbleLink from '../components/NimbleLink';
import { parseLocalDate } from '../utils/date';
import type {
  BookingStatus,
  CommissionEventUpdate,
  CommissionEventWithLineItems,
  CommissionLineItem,
  CommissionLineItemCreate,
  CommissionNote,
  ConsiderationType,
  HotelConsidered,
  HotelConsideredUpdate,
  HotelStatus,
  LineType,
  PaymentStatus,
} from '../types/commission';
import type { RFP } from '../types/rfp';

// ---------- Shared visual tokens ----------

const LINE_TYPE_COLOR: Record<LineType, string> = {
  hotel: '#059669',
  dmc: '#4f46e5',
  air: '#0284c7',
  other: '#475569',
};

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  prospect: 'Prospect',
  tentative: 'Tentative',
  definite: 'Definite',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
  lost: 'Lost',
};

// Matched palette per booking status — used for hero card background, badges, and accents.
type Tone = 'green' | 'yellow' | 'red' | 'orange' | 'gray' | 'darkgray' | 'blue';

const STATUS_TONE: Record<BookingStatus, Tone> = {
  prospect: 'gray',
  tentative: 'yellow',
  definite: 'green',
  on_hold: 'orange',
  cancelled: 'red',
  lost: 'darkgray',
};

const TONE_BG: Record<Tone, string> = {
  green: 'bg-emerald-50 ring-emerald-200',
  yellow: 'bg-yellow-50 ring-yellow-200',
  red: 'bg-red-50 ring-red-200',
  orange: 'bg-orange-50 ring-orange-200',
  gray: 'bg-gray-50 ring-gray-200',
  darkgray: 'bg-gray-100 ring-gray-300',
  blue: 'bg-blue-50 ring-blue-200',
};

const TONE_TEXT: Record<Tone, string> = {
  green: 'text-emerald-900',
  yellow: 'text-yellow-900',
  red: 'text-red-900',
  orange: 'text-orange-900',
  gray: 'text-gray-900',
  darkgray: 'text-gray-900',
  blue: 'text-blue-900',
};

const TONE_BADGE: Record<Tone, string> = {
  green: 'bg-emerald-600 text-white',
  yellow: 'bg-yellow-500 text-white',
  red: 'bg-red-600 text-white',
  orange: 'bg-orange-500 text-white',
  gray: 'bg-gray-500 text-white',
  darkgray: 'bg-gray-800 text-white',
  blue: 'bg-blue-600 text-white',
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending_booking: 'Pending Booking',
  upcoming: 'Upcoming',
  invoiced: 'Invoiced',
  paid: 'Paid',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

const CONSIDERATION_LABEL: Record<ConsiderationType, string> = {
  hotel: 'Hotel',
  dmc: 'DMC',
  air: 'Air',
  other: 'Other',
};

const fmtMoney = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '$0';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return '$0';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const fmtDate = (v: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string => {
  if (!v) return '—';
  return parseLocalDate(v).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' });
};

const num = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isNaN(n) ? 0 : n;
};

const daysBetween = (isoDate: string): number =>
  Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));

// ---------- Payment status (definite + trip complete) ----------

interface PaymentSummary {
  tone: Tone;
  title: string;
  subtext: string;
  amount: string | null;
}

function derivePaymentSummary(event: CommissionEventWithLineItems): PaymentSummary | null {
  if (event.booking_status !== 'definite') return null;
  const today = new Date().toISOString().slice(0, 10);
  // Show only after the trip's depart date has passed.
  if (!event.depart_date || event.depart_date >= today) return null;

  const active = event.line_items.filter((li) => li.payment_status !== 'cancelled');
  if (active.length === 0) {
    return { tone: 'red', title: 'No active commission lines', subtext: 'Trip is over but no commission line is active.', amount: null };
  }

  const total = active.reduce((s, li) => s + num(li.commission_amount), 0);
  const paid = active.filter((li) => li.payment_status === 'paid').reduce((s, li) => s + num(li.commission_amount), 0);
  const invoiced = active.filter((li) => li.payment_status === 'invoiced');
  const invoicedTotal = invoiced.reduce((s, li) => s + num(li.commission_amount), 0);
  const uninvoiced = active.filter((li) => li.payment_status === 'pending_booking' || li.payment_status === 'upcoming');

  const allPaid = active.every((li) => li.payment_status === 'paid');
  if (allPaid) {
    return { tone: 'green', title: 'Paid in full', subtext: 'All commission received.', amount: fmtMoney(paid) };
  }
  if (uninvoiced.length > 0) {
    return {
      tone: 'red',
      title: 'Needs invoice',
      subtext: `${uninvoiced.length} of ${active.length} ${uninvoiced.length === 1 ? 'line is' : 'lines are'} not yet invoiced.`,
      amount: fmtMoney(total),
    };
  }
  // All invoiced or partially paid — check for stale invoices (>30 days unpaid)
  const stale = invoiced.filter((li) => li.invoice_sent_date && daysBetween(li.invoice_sent_date) >= 30);
  if (stale.length > 0) {
    const oldest = Math.max(...stale.map((li) => daysBetween(li.invoice_sent_date!)));
    return {
      tone: 'red',
      title: `Invoice ${oldest} days unpaid`,
      subtext: `${stale.length} ${stale.length === 1 ? 'invoice has' : 'invoices have'} aged past 30 days.`,
      amount: fmtMoney(invoicedTotal),
    };
  }
  if (paid > 0) {
    const remaining = total - paid;
    return {
      tone: 'yellow',
      title: 'Partially paid',
      subtext: `${fmtMoney(remaining)} still outstanding.`,
      amount: fmtMoney(paid),
    };
  }
  return {
    tone: 'yellow',
    title: 'Awaiting payment',
    subtext: 'All lines invoiced, awaiting client payment.',
    amount: fmtMoney(invoicedTotal),
  };
}

// ---------- Warnings ----------

function deriveWarnings(event: CommissionEventWithLineItems): string[] {
  const warnings: string[] = [];

  // 1. Line item dates outside event date range
  if (event.arrival_date && event.depart_date) {
    for (const li of event.line_items) {
      if (li.payment_status === 'cancelled') continue;
      if (li.arrival_date && li.arrival_date < event.arrival_date) {
        warnings.push(
          `${li.line_type.toUpperCase()} line "${li.company_name}" arrives ${fmtDate(li.arrival_date, { month: 'short', day: 'numeric' })}, before the booking arrival ${fmtDate(event.arrival_date, { month: 'short', day: 'numeric' })}.`,
        );
      }
      if (li.depart_date && li.depart_date > event.depart_date) {
        warnings.push(
          `${li.line_type.toUpperCase()} line "${li.company_name}" departs ${fmtDate(li.depart_date, { month: 'short', day: 'numeric' })}, after the booking departure ${fmtDate(event.depart_date, { month: 'short', day: 'numeric' })}.`,
        );
      }
    }
  }

  // 2. Line item types missing from event "considering"
  const considered = new Set(event.considerations);
  const lineTypes = new Set(event.line_items.filter((li) => li.payment_status !== 'cancelled').map((li) => li.line_type));
  for (const lt of lineTypes) {
    if (!considered.has(lt as ConsiderationType)) {
      warnings.push(`Has a ${lt.toUpperCase()} commission line, but the event isn't marked as "considering ${lt.toUpperCase()}".`);
    }
  }

  // 3. Considering hotel but no candidate hotels (only relevant past prospect stage)
  if (
    considered.has('hotel') &&
    event.hotels_considered.length === 0 &&
    event.booking_status !== 'prospect' &&
    event.booking_status !== 'cancelled' &&
    event.booking_status !== 'lost'
  ) {
    warnings.push('Considering hotel, but no candidate hotels listed yet.');
  }

  // 4. Definite + considers hotel but none selected
  if (
    event.booking_status === 'definite' &&
    considered.has('hotel') &&
    event.hotels_considered.length > 0 &&
    !event.hotels_considered.some((h) => h.is_selected)
  ) {
    warnings.push('Definite booking, but no candidate hotel is marked as selected.');
  }

  // 5. Multiple selected hotels (DB invariant — should be at most one)
  const selectedCount = event.hotels_considered.filter((h) => h.is_selected).length;
  if (selectedCount > 1) {
    warnings.push(`${selectedCount} hotels are marked as selected — only one should be.`);
  }

  // 6. Paid status without paid_date
  for (const li of event.line_items) {
    if (li.payment_status === 'paid' && !li.paid_date) {
      warnings.push(`${li.line_type.toUpperCase()} line "${li.company_name}" is marked Paid but has no paid date.`);
    }
    if (li.payment_status === 'invoiced' && !li.invoice_sent_date) {
      warnings.push(`${li.line_type.toUpperCase()} line "${li.company_name}" is marked Invoiced but has no invoice-sent date.`);
    }
  }

  return warnings;
}

// ---------- Component ----------

const CommissionView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<CommissionEventWithLineItems | null>(null);
  const [rfps, setRfps] = useState<RFP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineItemNotes, setLineItemNotes] = useState<Record<string, CommissionNote[]>>({});
  const [hotelNotes, setHotelNotes] = useState<Record<string, CommissionNote[]>>({});
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [addingLineType, setAddingLineType] = useState<LineType | null>(null);
  const [editingBox, setEditingBox] = useState<'contact' | 'rfp' | null>(null);

  // Pre-fetch all line-item notes so the count chip on the Notes toggle is
  // accurate before the user expands anything.
  const loadAllLineItemNotes = async (lis: { id: string }[]): Promise<Record<string, CommissionNote[]>> => {
    const entries = await Promise.all(
      lis.map(async (li) => [li.id, await commissionApi.listLineItemNotes(li.id)] as const),
    );
    return Object.fromEntries(entries);
  };

  const loadAllHotelNotes = async (hotels: { id: string }[]): Promise<Record<string, CommissionNote[]>> => {
    const entries = await Promise.all(
      hotels.map(async (h) => [h.id, await commissionApi.listHotelNotes(h.id)] as const),
    );
    return Object.fromEntries(entries);
  };

  const reloadHotelNotes = async (hotelId: string) => {
    const notes = await commissionApi.listHotelNotes(hotelId);
    setHotelNotes((prev) => ({ ...prev, [hotelId]: notes }));
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [ev, rfpsForEvent] = await Promise.all([
          commissionApi.getEvent(id),
          rfpApi.listRFPsForEvent(id).catch(() => [] as RFP[]),
        ]);
        if (cancelled) return;
        setEvent(ev);
        setRfps(rfpsForEvent);
        const [liNotes, hNotes] = await Promise.all([
          ev.line_items.length > 0 ? loadAllLineItemNotes(ev.line_items) : Promise.resolve({}),
          ev.hotels_considered.length > 0 ? loadAllHotelNotes(ev.hotels_considered) : Promise.resolve({}),
        ]);
        if (!cancelled) {
          setLineItemNotes(liNotes);
          setHotelNotes(hNotes);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || 'Failed to load booking');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const reloadEvent = async () => {
    if (!id) return;
    const ev = await commissionApi.getEvent(id);
    setEvent(ev);
    const [liNotes, hNotes] = await Promise.all([
      ev.line_items.length > 0 ? loadAllLineItemNotes(ev.line_items) : Promise.resolve({}),
      ev.hotels_considered.length > 0 ? loadAllHotelNotes(ev.hotels_considered) : Promise.resolve({}),
    ]);
    setLineItemNotes(liNotes);
    setHotelNotes(hNotes);
  };

  const reloadEventNotes = async () => {
    if (!id) return;
    const notes = await commissionApi.listEventNotes(id);
    setEvent((prev) => (prev ? { ...prev, event_notes: notes } : prev));
  };

  const reloadLineNotes = async (lineItemId: string) => {
    const notes = await commissionApi.listLineItemNotes(lineItemId);
    setLineItemNotes((prev) => ({ ...prev, [lineItemId]: notes }));
  };

  const paymentSummary = useMemo(() => (event ? derivePaymentSummary(event) : null), [event]);
  const warnings = useMemo(() => (event ? deriveWarnings(event) : []), [event]);
  // Hotel lines first; then DMC, Air, Other.
  const sortedLineItems = useMemo(() => {
    if (!event) return [];
    const order: Record<LineType, number> = { hotel: 0, dmc: 1, air: 2, other: 3 };
    return [...event.line_items].sort((a, b) => order[a.line_type] - order[b.line_type]);
  }, [event]);

  const toggleExpanded = (id: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const breadcrumbYear = useMemo(() => {
    if (!event?.arrival_date) return null;
    return new Date(event.arrival_date).getUTCFullYear();
  }, [event]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;
  if (error || !event) return <div className="p-8 text-center text-red-600">{error || 'Not found'}</div>;

  const considersHotel = event.considerations.includes('hotel');
  const tone = STATUS_TONE[event.booking_status];

  return (
    <div>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        {/* Breadcrumb + full-edit shortcut */}
        <div className="flex items-center justify-between gap-3 -mb-2">
          <nav className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
            <button
              onClick={() => navigate('/commissions/list')}
              className="hover:text-gray-900 hover:underline"
            >
              Events
            </button>
            {breadcrumbYear && (
              <>
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => navigate(`/commissions/list?year=${breadcrumbYear}`)}
                  className="hover:text-gray-900 hover:underline"
                >
                  {breadcrumbYear}
                </button>
              </>
            )}
            <span className="text-gray-300">/</span>
            <span className="text-gray-700 font-medium truncate">{event.meeting_name}</span>
          </nav>
          <button
            type="button"
            onClick={() => navigate(`/commissions/${event.id}/edit`)}
            className="shrink-0 text-xs px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Edit full event
          </button>
        </div>

        {/* Hero — color-coded by booking status. Edit always opens the full edit page. */}
        <HeroCard
          event={event}
          tone={tone}
          onEdit={() => navigate(`/commissions/${event.id}/edit`)}
        />

        {/* Payment status (definite + trip done) */}
        {paymentSummary && <PaymentStatusCard summary={paymentSummary} />}

        {/* Warnings */}
        {warnings.length > 0 && <WarningsCard warnings={warnings} />}

        {/* Company & Primary Contact */}
        {editingBox === 'contact' ? (
          <ContactEditForm
            event={event}
            onSave={async (patch) => {
              await commissionApi.updateEvent(event.id, patch);
              await reloadEvent();
              setEditingBox(null);
            }}
            onCancel={() => setEditingBox(null)}
          />
        ) : (
          <ContactCard
            event={event}
            onEdit={() => setEditingBox('contact')}
          />
        )}

        {/* RFP / Logistics — hotels considered, peak rooms, total room nights, RFPs */}
        {considersHotel && (
          editingBox === 'rfp' ? (
            <RFPInfoEditForm
              event={event}
              hotelNotes={hotelNotes}
              onSaveMetrics={async (patch) => {
                await commissionApi.updateEvent(event.id, patch);
                await reloadEvent();
                setEditingBox(null);
              }}
              onCancel={() => setEditingBox(null)}
              onAddHotel={async (name) => {
                await commissionApi.addHotel(event.id, { name, status: 'considered' });
                await reloadEvent();
              }}
              onUpdateHotel={async (hotelId, patch) => {
                await commissionApi.updateHotel(hotelId, patch);
                await reloadEvent();
              }}
              onRemoveHotel={async (hotelId) => {
                await commissionApi.deleteHotel(hotelId);
                await reloadEvent();
              }}
              onAddHotelNote={async (hotelId, body) => {
                await commissionApi.addHotelNote(hotelId, body);
                await reloadHotelNotes(hotelId);
              }}
              onEditHotelNote={async (hotelId, noteId, body) => {
                await commissionApi.updateNote(noteId, body);
                await reloadHotelNotes(hotelId);
              }}
              onDeleteHotelNote={async (hotelId, noteId) => {
                await commissionApi.deleteNote(noteId);
                await reloadHotelNotes(hotelId);
              }}
            />
          ) : (
            <RFPInfoCard
              event={event}
              rfps={rfps}
              onEditEvent={() => setEditingBox('rfp')}
              onNewRfp={() => navigate(`/commissions/${event.id}/rfps/new`)}
              onOpenRfp={(rfpId, view) => navigate(`/rfps/${rfpId}/${view}`)}
            />
          )
        )}

        {/* Commission Line Items */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Commission Lines ({event.line_items.length})
            </h2>
            <div className="flex gap-1.5">
              {(['hotel', 'dmc', 'air', 'other'] as LineType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAddingLineType(t)}
                  disabled={addingLineType !== null}
                  className="px-2.5 py-1 text-xs uppercase tracking-wider bg-white border rounded hover:bg-gray-50 font-medium disabled:opacity-40"
                  style={{ borderColor: LINE_TYPE_COLOR[t], color: LINE_TYPE_COLOR[t] }}
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>

          {/* Inline new-line form */}
          {addingLineType && (
            <div className="mb-3">
              <LineItemEditForm
                initial={{
                  line_type: addingLineType,
                  arrival_date: event.arrival_date,
                  depart_date: event.depart_date,
                }}
                showPaymentFields={event.booking_status === 'definite'}
                isNew
                eventCompanyName={event.client_company_name}
                onSave={async (payload) => {
                  await commissionApi.addLineItem(event.id, payload);
                  await reloadEvent();
                  setAddingLineType(null);
                }}
                onCancel={() => setAddingLineType(null)}
              />
            </div>
          )}

          {event.line_items.length === 0 && !addingLineType ? (
            <p className="text-sm text-gray-500 italic">No commission lines yet.</p>
          ) : event.line_items.length === 0 ? null : (
            <div className="space-y-3">
              {sortedLineItems.map((li) =>
                editingLineItemId === li.id ? (
                  <LineItemEditForm
                    key={li.id}
                    initial={li}
                    showPaymentFields={event.booking_status === 'definite'}
                    eventCompanyName={event.client_company_name}
                    onSave={async (payload) => {
                      await commissionApi.updateLineItem(li.id, payload);
                      await reloadEvent();
                      setEditingLineItemId(null);
                    }}
                    onCancel={() => setEditingLineItemId(null)}
                    onDelete={async () => {
                      await commissionApi.deleteLineItem(li.id);
                      await reloadEvent();
                      setEditingLineItemId(null);
                    }}
                    noteFeed={{
                      notes: lineItemNotes[li.id] || [],
                      onAddNote: async (body) => {
                        await commissionApi.addLineItemNote(li.id, body);
                        await reloadLineNotes(li.id);
                      },
                      onEditNote: async (noteId, body) => {
                        await commissionApi.updateNote(noteId, body);
                        await reloadLineNotes(li.id);
                      },
                      onDeleteNote: async (noteId) => {
                        await commissionApi.deleteNote(noteId);
                        await reloadLineNotes(li.id);
                      },
                    }}
                  />
                ) : (
                  <LineItemRow
                    key={li.id}
                    li={li}
                    bookingStatus={event.booking_status}
                    eventArrivalDate={event.arrival_date}
                    eventDepartDate={event.depart_date}
                    expanded={expandedLines.has(li.id)}
                    onToggleExpanded={() => toggleExpanded(li.id)}
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
                    onEdit={() => setEditingLineItemId(li.id)}
                  />
                ),
              )}
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

// ---------- Hero card ----------

interface HeroCardProps {
  event: CommissionEventWithLineItems;
  tone: Tone;
  onEdit: () => void;
}

const HeroCard: React.FC<HeroCardProps> = ({ event, tone, onEdit }) => {
  const tBg = TONE_BG[tone];
  const tText = TONE_TEXT[tone];
  const tBadge = TONE_BADGE[tone];
  const eventLocation =
    event.destinations && event.destinations.length
      ? event.destinations.join(' · ')
      : event.destination || '';

  return (
    <section className={`rounded-xl ring-1 ${tBg} p-6 relative`}>
      <button
        onClick={onEdit}
        className="absolute top-4 right-4 text-xs text-gray-700 hover:underline"
      >
        Edit
      </button>

      {/* Status badge */}
      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded ${tBadge}`}>
        {BOOKING_STATUS_LABEL[event.booking_status]}
      </span>

      {/* Event name */}
      <h1 className={`mt-3 text-3xl font-bold ${tText}`}>{event.meeting_name}</h1>

      {/* Key facts grid */}
      <dl className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        <KeyFact label="Trip Dates" tone={tone}>
          {event.arrival_date || event.depart_date ? (
            <span>
              {fmtDate(event.arrival_date)} – {fmtDate(event.depart_date)}
              {event.dates_flexible && <span className="ml-1 text-xs opacity-70">(flexible)</span>}
            </span>
          ) : <em className="opacity-60">—</em>}
        </KeyFact>
        <KeyFact label="Destinations" tone={tone}>
          {eventLocation || <em className="opacity-60">—</em>}
        </KeyFact>
        <KeyFact label="Considering" tone={tone}>
          {event.considerations.length ? (
            <div className="flex gap-1.5 flex-wrap">
              {event.considerations.map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 text-[10px] rounded text-white font-semibold uppercase tracking-wider"
                  style={{ background: LINE_TYPE_COLOR[c] }}
                >
                  {CONSIDERATION_LABEL[c]}
                </span>
              ))}
            </div>
          ) : <em className="opacity-60">—</em>}
        </KeyFact>
      </dl>
    </section>
  );
};

const KeyFact: React.FC<{ label: string; tone: Tone; children: React.ReactNode }> = ({ label, tone, children }) => (
  <div>
    <dt className={`text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-0.5 ${TONE_TEXT[tone]}`}>{label}</dt>
    <dd className={`${TONE_TEXT[tone]}`}>{children}</dd>
  </div>
);

// ---------- Payment status card ----------

const PaymentStatusCard: React.FC<{ summary: PaymentSummary }> = ({ summary }) => {
  const tBg = TONE_BG[summary.tone];
  const tText = TONE_TEXT[summary.tone];
  return (
    <section className={`rounded-xl ring-1 ${tBg} p-6`}>
      <div className={`text-xs font-semibold uppercase tracking-wider opacity-70 ${tText}`}>Payment Status</div>
      <div className="mt-2 flex items-baseline gap-4 flex-wrap">
        <h2 className={`text-2xl font-bold ${tText}`}>{summary.title}</h2>
        {summary.amount && <span className={`text-2xl font-bold ${tText}`}>{summary.amount}</span>}
      </div>
      <p className={`mt-1.5 text-sm ${tText} opacity-80`}>{summary.subtext}</p>
    </section>
  );
};

// ---------- Warnings ----------

const WarningsCard: React.FC<{ warnings: string[] }> = ({ warnings }) => (
  <section className="rounded-lg ring-1 bg-amber-50 ring-amber-200 p-5">
    <div className="flex items-baseline gap-2 mb-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">⚠ Warnings</span>
      <span className="text-[11px] text-amber-800 opacity-70">
        {warnings.length} {warnings.length === 1 ? 'item' : 'items'}
      </span>
    </div>
    <ul className="space-y-1 list-disc list-inside text-sm text-amber-900">
      {warnings.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  </section>
);

// ---------- Company & Contact ----------

const ContactCard: React.FC<{
  event: CommissionEventWithLineItems;
  onEdit: () => void;
}> = ({ event, onEdit }) => (
  <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Company & Contact</h2>
      <button onClick={onEdit} className="text-xs text-blue-600 hover:underline">Edit</button>
    </div>
    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <Row label="Company">
        {event.client_company_name ? (
          <span className="inline-flex items-center gap-1.5">
            {event.client_company_name}
            <NimbleLink kind="contact" id={event.client_company_id} title="Open company in Nimble" />
          </span>
        ) : <em className="text-gray-400">—</em>}
      </Row>
      <Row label="Primary Contact">
        {event.primary_contact_name ? (
          <div>
            <div className="inline-flex items-center gap-1.5">
              {event.primary_contact_name}
              <NimbleLink kind="contact" id={event.primary_contact_id} title="Open contact in Nimble" />
            </div>
            {event.primary_contact_email && (
              <div className="text-xs text-gray-500">{event.primary_contact_email}</div>
            )}
          </div>
        ) : <em className="text-gray-400">—</em>}
      </Row>
    </dl>
  </section>
);

// ---------- RFP / Logistics ----------

const RFPInfoCard: React.FC<{
  event: CommissionEventWithLineItems;
  rfps: RFP[];
  onEditEvent: () => void;
  onNewRfp: () => void;
  onOpenRfp: (rfpId: string, view: 'edit' | 'invitations' | 'responses' | 'preview') => void;
}> = ({ event, rfps, onEditEvent, onNewRfp, onOpenRfp }) => {
  // Sort: winner → considered → no_longer_considered, then by created_at.
  const sortedHotels = [...event.hotels_considered].sort((a, b) => {
    const order = { winner: 0, considered: 1, no_longer_considered: 2 };
    const ao = order[a.status] ?? 1;
    const bo = order[b.status] ?? 1;
    if (ao !== bo) return ao - bo;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Hotels / RFPs</h2>
        <button onClick={onEditEvent} className="text-xs text-blue-600 hover:underline">Edit</button>
      </div>

      {/* Room metrics */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Row label="Peak Rooms">
          {event.peak_rooms ?? <em className="text-gray-400">—</em>}
        </Row>
        <Row label="Total Room Nights">
          {event.total_room_nights ?? <em className="text-gray-400">—</em>}
        </Row>
      </dl>

      {/* Hotels Considered */}
      <div>
        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
          Hotels ({event.hotels_considered.length})
        </div>
        {event.hotels_considered.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No candidate hotels yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sortedHotels.map((h) => <HotelRow key={h.id} hotel={h} />)}
          </ul>
        )}
      </div>

      {/* RFPs — slightly tinted, still inside the Hotels / RFPs card */}
      <div className="rounded-md bg-indigo-50 ring-1 ring-indigo-100 p-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
            RFPs ({rfps.length})
          </span>
          <button
            onClick={onNewRfp}
            className="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-white border border-indigo-300 rounded hover:bg-indigo-100"
          >
            + New RFP
          </button>
        </div>
        {rfps.length === 0 ? (
          <p className="text-xs text-indigo-700/70 italic">No RFPs yet for this booking.</p>
        ) : (
          <ul className="divide-y divide-indigo-100">
            {rfps.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-gray-900">{r.rfp_type}</div>
                  <div className="text-[11px] text-gray-500">
                    Created {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => onOpenRfp(r.id, 'edit')} className="text-indigo-700 hover:underline">Edit</button>
                  <a
                    href={`/rfps/${r.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-700 hover:underline"
                    title="See what hotels will see (opens in new tab)"
                  >
                    Preview ↗
                  </a>
                  <button onClick={() => onOpenRfp(r.id, 'invitations')} className="text-emerald-700 hover:underline">Invitations</button>
                  <button onClick={() => onOpenRfp(r.id, 'responses')} className="text-blue-700 hover:underline">Responses</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

// ---------- Inline edit forms (Company & Contact / RFP Info) ----------

// ----- Company & Contact (Nimble-backed) -----

interface ContactEditFormProps {
  event: CommissionEventWithLineItems;
  onSave: (patch: CommissionEventUpdate) => Promise<void>;
  onCancel: () => void;
}

const ContactEditForm: React.FC<ContactEditFormProps> = ({ event, onSave, onCancel }) => {
  const [company, setCompany] = useState<NimbleSelection>({
    id: event.client_company_id || null,
    name: event.client_company_name || '',
  });
  const [contact, setContact] = useState<NimbleSelection>({
    id: event.primary_contact_id || null,
    name: event.primary_contact_name || '',
    email: event.primary_contact_email || null,
  });
  const [allCompanies, setAllCompanies] = useState<NimbleCompanyLite[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companyContacts, setCompanyContacts] = useState<NimblePersonLite[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await nimbleApi.listAllCompanies();
        if (!cancelled) setAllCompanies(data);
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!company.id && !company.name) { setCompanyContacts([]); return; }
    let cancelled = false;
    (async () => {
      setContactsLoading(true);
      try {
        const data = await nimbleApi.listContactsByCompany({
          company_id: company.id, company: company.id ? null : company.name,
        });
        if (!cancelled) setCompanyContacts(data);
      } catch {
        if (!cancelled) setCompanyContacts([]);
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company.id, company.name]);

  const companyItems: PickerItem[] = allCompanies.map((c) => ({
    id: c.id, label: c.name, sublabel: [c.industry, c.url || c.domain].filter(Boolean).join(' · '),
  }));
  const contactItems: PickerItem[] = companyContacts.map((p) => ({
    id: p.id, label: p.name, sublabel: [p.title, p.email].filter(Boolean).join(' · '), email: p.email,
  }));

  const handleSave = async () => {
    setErr(null);
    setSaving(true);
    try {
      const patch: CommissionEventUpdate = {
        client_company_id: company.id,
        client_company_name: company.name.trim() || null,
        primary_contact_id: contact.id,
        primary_contact_name: contact.name.trim() || null,
        primary_contact_email: contact.email || null,
      };
      await onSave(patch);
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-lg shadow-sm border-2 border-blue-300 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Editing Company &amp; Contact</h2>
      </div>

      {err && <div className="text-sm bg-red-50 text-red-700 px-3 py-2 rounded">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Company">
          <NimbleTypeahead
            items={companyItems}
            loading={companiesLoading}
            loadingHint="Loading companies from Nimble…"
            emptyHint="No companies in Nimble."
            value={company}
            onChange={(v) => { setCompany(v); setContact({ id: null, name: '', email: null }); }}
            placeholder={companiesLoading ? 'Loading companies…' : 'Search Nimble companies…'}
          />
        </Field>
        <Field label="Primary Contact">
          <NimbleTypeahead
            items={contactItems}
            loading={contactsLoading}
            loadingHint="Loading contacts at this company…"
            emptyHint={company.name ? 'No contacts at this company in Nimble — type a name to save.' : 'Pick a company first.'}
            disabled={!company.name && !company.id}
            value={contact}
            onChange={setContact}
            placeholder={company.name ? 'Search contacts at this company…' : 'Pick a company first'}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
};

// ----- Hotels / RFPs edit (peak rooms / total RNs / hotels considered) -----

interface RFPInfoEditFormProps {
  event: CommissionEventWithLineItems;
  hotelNotes: Record<string, CommissionNote[]>;
  onSaveMetrics: (patch: CommissionEventUpdate) => Promise<void>;
  onCancel: () => void;
  onAddHotel: (name: string) => Promise<void>;
  onUpdateHotel: (hotelId: string, patch: HotelConsideredUpdate) => Promise<void>;
  onRemoveHotel: (hotelId: string) => Promise<void>;
  onAddHotelNote: (hotelId: string, body: string) => Promise<void>;
  onEditHotelNote: (hotelId: string, noteId: string, body: string) => Promise<void>;
  onDeleteHotelNote: (hotelId: string, noteId: string) => Promise<void>;
}

const RFPInfoEditForm: React.FC<RFPInfoEditFormProps> = ({
  event, hotelNotes, onSaveMetrics, onCancel,
  onAddHotel, onUpdateHotel, onRemoveHotel,
  onAddHotelNote, onEditHotelNote, onDeleteHotelNote,
}) => {
  const [peakRooms, setPeakRooms] = useState<string>(
    event.peak_rooms !== null && event.peak_rooms !== undefined ? String(event.peak_rooms) : '',
  );
  const [totalRNs, setTotalRNs] = useState<string>(
    event.total_room_nights !== null && event.total_room_nights !== undefined ? String(event.total_room_nights) : '',
  );
  const [newHotelName, setNewHotelName] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toInt = (s: string): number | null => {
    const t = s.trim();
    if (t === '') return null;
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    setErr(null);
    setSaving(true);
    try {
      const patch: CommissionEventUpdate = {
        peak_rooms: toInt(peakRooms),
        total_room_nights: toInt(totalRNs),
      };
      await onSaveMetrics(patch);
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to save');
      setSaving(false);
    }
  };

  const handleAddHotel = async () => {
    const name = newHotelName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      await onAddHotel(name);
      setNewHotelName('');
    } finally {
      setAdding(false);
    }
  };

  // Sort: winner → considered → no_longer_considered, then by created_at.
  const sortedHotels = [...event.hotels_considered].sort((a, b) => {
    const order = { winner: 0, considered: 1, no_longer_considered: 2 };
    const ao = order[a.status] ?? 1;
    const bo = order[b.status] ?? 1;
    if (ao !== bo) return ao - bo;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  return (
    <section className="bg-white rounded-lg shadow-sm border-2 border-blue-300 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Editing Hotels / RFPs</h2>
        <span className="text-[11px] text-gray-500">Hotel changes save immediately. Peak / Total RNs save below.</span>
      </div>

      {err && <div className="text-sm bg-red-50 text-red-700 px-3 py-2 rounded">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Peak Rooms">
          <input
            type="number"
            value={peakRooms}
            onChange={(e) => setPeakRooms(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </Field>
        <Field label="Total Room Nights">
          <input
            type="number"
            value={totalRNs}
            onChange={(e) => setTotalRNs(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </Field>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
          Hotels Being Considered ({event.hotels_considered.length})
        </label>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newHotelName}
            onChange={(e) => setNewHotelName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddHotel(); } }}
            placeholder="Add a hotel candidate…"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <button
            type="button"
            onClick={handleAddHotel}
            disabled={!newHotelName.trim() || adding}
            className="px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            + Add
          </button>
        </div>

        {sortedHotels.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No hotels added yet.</p>
        ) : (
          <div className="space-y-3">
            {sortedHotels.map((h) => (
              <HotelEditCard
                key={h.id}
                hotel={h}
                notes={hotelNotes[h.id] || []}
                onChange={(patch) => onUpdateHotel(h.id, patch)}
                onRemove={() => onRemoveHotel(h.id)}
                onAddNote={(body) => onAddHotelNote(h.id, body)}
                onEditNote={(noteId, body) => onEditHotelNote(h.id, noteId, body)}
                onDeleteNote={(noteId) => onDeleteHotelNote(h.id, noteId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Done
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Hotel Info'}
        </button>
      </div>
    </section>
  );
};

// ----- Per-hotel rich edit card -----

const HOTEL_STATUS_OPTIONS: { value: HotelStatus; label: string }[] = [
  { value: 'considered', label: 'Considered' },
  { value: 'no_longer_considered', label: 'No Longer Considered' },
  { value: 'winner', label: 'Winner' },
];

interface HotelEditCardProps {
  hotel: HotelConsidered;
  notes: CommissionNote[];
  onChange: (patch: HotelConsideredUpdate) => Promise<void>;
  onRemove: () => Promise<void>;
  onAddNote: (body: string) => Promise<void>;
  onEditNote: (noteId: string, body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}

const HotelEditCard: React.FC<HotelEditCardProps> = ({
  hotel, notes, onChange, onRemove, onAddNote, onEditNote, onDeleteNote,
}) => {
  const [name, setName] = useState(hotel.name);
  const [contact, setContact] = useState<NimbleSelection>({
    id: hotel.primary_contact_id || null,
    name: hotel.contact_name || '',
    email: hotel.contact_email || null,
  });
  const [contactItems, setContactItems] = useState<PickerItem[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Load Nimble people whose company matches this hotel's name.
  useEffect(() => {
    if (!hotel.name) { setContactItems([]); return; }
    let cancelled = false;
    (async () => {
      setContactsLoading(true);
      try {
        const data = await nimbleApi.listContactsByCompany({ company: hotel.name, company_id: null });
        if (!cancelled) {
          setContactItems(data.map((p) => ({
            id: p.id, label: p.name,
            sublabel: [p.title, p.email].filter(Boolean).join(' · '),
            email: p.email,
          })));
        }
      } catch {
        if (!cancelled) setContactItems([]);
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hotel.name]);

  const tone = HOTEL_STATUS_BADGE[hotel.status] || HOTEL_STATUS_BADGE.considered;

  return (
    <div className={`rounded-lg border-2 p-4 ${
      hotel.status === 'winner' ? 'border-emerald-300 bg-emerald-50/30'
      : hotel.status === 'no_longer_considered' ? 'border-gray-200 bg-gray-50/40'
      : 'border-blue-200 bg-blue-50/30'
    }`}>
      <div className="flex items-start gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== hotel.name) onChange({ name: name.trim() }); }}
          className="flex-1 px-2 py-1.5 text-sm font-medium border border-gray-300 rounded bg-white"
        />
        <select
          value={hotel.status}
          onChange={(e) => onChange({ status: e.target.value as HotelStatus })}
          className={`px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded border ${tone.classes}`}
          title="Setting one to Winner moves all others to No Longer Considered"
        >
          {HOTEL_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={async () => {
            if (window.confirm(`Remove ${hotel.name} from this event?`)) await onRemove();
          }}
          className="px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded"
        >
          Remove
        </button>
      </div>

      <div className="mt-3">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
          Primary Contact at Hotel
        </label>
        <NimbleTypeahead
          items={contactItems}
          loading={contactsLoading}
          loadingHint="Looking up contacts at this hotel in Nimble…"
          emptyHint="No matching contacts in Nimble — type a name to save freeform."
          value={contact}
          onChange={(v) => {
            setContact(v);
            // Save immediately on selection or freeform change.
            onChange({
              primary_contact_id: v.id,
              contact_name: v.name.trim() || null,
              contact_email: v.email || null,
            });
          }}
          placeholder="Search Nimble or type a name…"
        />
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Notes{notes.length ? ` (${notes.length})` : ''}
        </div>
        <NoteFeed
          notes={notes}
          enabled={true}
          placeholder={`Note about ${hotel.name}…`}
          emptyHint="No notes on this hotel yet."
          onAdd={onAddNote}
          onEdit={onEditNote}
          onDelete={onDeleteNote}
        />
      </div>
    </div>
  );
};

// ---------- Building blocks ----------

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-0.5">{label}</dt>
    <dd className="text-sm text-gray-900">{children}</dd>
  </div>
);

const HOTEL_STATUS_BADGE: Record<HotelStatus, { label: string; classes: string }> = {
  considered: { label: 'Considered', classes: 'bg-blue-100 text-blue-800' },
  no_longer_considered: { label: 'No Longer Considered', classes: 'bg-gray-200 text-gray-600' },
  winner: { label: 'Winner', classes: 'bg-emerald-100 text-emerald-800' },
};

const HotelRow: React.FC<{ hotel: HotelConsidered }> = ({ hotel }) => {
  const badge = HOTEL_STATUS_BADGE[hotel.status] || HOTEL_STATUS_BADGE.considered;
  const isWinner = hotel.status === 'winner';
  const isOut = hotel.status === 'no_longer_considered';
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${isWinner ? 'font-semibold text-gray-900' : isOut ? 'text-gray-400' : 'text-gray-700'}`}>
            {hotel.name}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${badge.classes}`}>
            {badge.label}
          </span>
        </div>
        {(hotel.contact_name || hotel.contact_email) && (
          <div className="text-xs text-gray-500 mt-0.5">
            {hotel.contact_name}
            {hotel.contact_name && hotel.contact_email && ' · '}
            {hotel.contact_email}
          </div>
        )}
      </div>
    </li>
  );
};

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
  eventArrivalDate: string | null;
  eventDepartDate: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  notes: CommissionNote[];
  onAddNote: (body: string) => Promise<void>;
  onEditNote: (noteId: string, body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onEdit: () => void;
}

const LineItemRow: React.FC<LineItemRowProps> = ({
  li, bookingStatus, eventArrivalDate, eventDepartDate, expanded, onToggleExpanded, notes,
  onAddNote, onEditNote, onDeleteNote, onEdit,
}) => {
  const accent = LINE_TYPE_COLOR[li.line_type];
  const showPayment = bookingStatus === 'definite';

  // Show line dates only if the line has its own dates AND they differ from
  // the event's trip dates. Inherited dates are stored as null.
  const datesDiffer =
    (li.arrival_date && li.arrival_date !== eventArrivalDate) ||
    (li.depart_date && li.depart_date !== eventDepartDate);

  return (
    <div className="rounded-lg bg-white border border-gray-200 border-l-4" style={{ borderLeftColor: accent }}>
      <div className="p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <button
            type="button"
            onClick={onToggleExpanded}
            className="shrink-0 mt-0.5 text-gray-400 hover:text-gray-700 transition-transform"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span
            className="px-2.5 py-0.5 text-xs uppercase tracking-wider rounded-full font-semibold text-white shrink-0"
            style={{ background: accent }}
          >
            {li.line_type}
          </span>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="flex-1 min-w-[200px] text-left"
          >
            {li.line_type === 'hotel' ? (
              <p className="text-sm font-semibold text-gray-900">
                {li.resort_hotel || <em className="text-gray-400">(no property)</em>}
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">
                  {li.company_name || <em className="text-gray-400">(no vendor)</em>}
                </p>
                {li.resort_hotel && li.resort_hotel !== li.company_name && (
                  <p className="text-xs text-gray-500">{li.resort_hotel}</p>
                )}
              </>
            )}
            {datesDiffer && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                {fmtDate(li.arrival_date, { month: 'short', day: 'numeric', year: '2-digit' })} – {fmtDate(li.depart_date, { month: 'short', day: 'numeric', year: '2-digit' })}
              </p>
            )}
          </button>
          {notes.length > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-medium shrink-0"
              title={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {notes.length}
            </span>
          )}
          <div className="text-right shrink-0">
            <p className="text-lg font-semibold tabular-nums text-gray-900">
              {fmtMoney(li.commission_amount)}
            </p>
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

        {expanded && (
          <>
            {/* Commission read-only sub-box */}
            <div className="mt-3 rounded-lg bg-gray-50 ring-1 ring-gray-200 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Commission</div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <ReadKV label="Revenue" value={li.revenue ? fmtMoney(li.revenue) : null} />
                <ReadKV
                  label="Commission %"
                  value={li.commission_pct ? `${Number(li.commission_pct)}%` : null}
                />
                <ReadKV label="Commission $" value={li.commission_amount ? fmtMoney(li.commission_amount) : null} />
              </div>
            </div>

            {/* Payment read-only sub-box (definite only) */}
            {showPayment && (
              <div className="mt-2 rounded-lg bg-gray-50 ring-1 ring-gray-200 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Payment</div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <ReadKV label="Status" value={PAYMENT_STATUS_LABEL[li.payment_status]} />
                  <ReadKV
                    label="Invoice Sent"
                    value={li.invoice_sent_date ? fmtDate(li.invoice_sent_date, { month: 'short', day: 'numeric', year: '2-digit' }) : null}
                  />
                  <ReadKV
                    label="Payment Received"
                    value={li.paid_date ? fmtDate(li.paid_date, { month: 'short', day: 'numeric', year: '2-digit' }) : null}
                  />
                </div>
              </div>
            )}

            {/* Notes feed */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-2">
                Notes{notes.length ? ` (${notes.length})` : ''}
              </div>
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
          </>
        )}
      </div>
    </div>
  );
};

// ---------- Inline line item edit form ----------

const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'pending_booking', label: 'Pending Booking' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
];

const LINE_TYPE_OPTIONS: { value: LineType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'dmc', label: 'DMC' },
  { value: 'air', label: 'Air' },
  { value: 'other', label: 'Other' },
];

const trimToNullStr = (s: string): string | null => {
  const t = s.trim();
  return t === '' ? null : t;
};

interface LineItemEditFormProps {
  initial: Partial<CommissionLineItem> & { line_type: LineType };
  showPaymentFields: boolean;
  isNew?: boolean;
  // For hotel lines: company_name is auto-set to this on save (the event's
  // client company), since vendor/brand on hotel lines duplicates the event.
  eventCompanyName?: string | null;
  onSave: (payload: CommissionLineItemCreate) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  // Notes feed (accumulating). Omitted when isNew (line item not yet persisted).
  noteFeed?: {
    notes: CommissionNote[];
    onAddNote: (body: string) => Promise<void>;
    onEditNote: (noteId: string, body: string) => Promise<void>;
    onDeleteNote: (noteId: string) => Promise<void>;
  };
}

const LineItemEditForm: React.FC<LineItemEditFormProps> = ({
  initial, showPaymentFields, isNew, eventCompanyName, onSave, onCancel, onDelete, noteFeed,
}) => {
  const [lineType, setLineType] = useState<LineType>(initial.line_type);
  const [companyName, setCompanyName] = useState(initial.company_name || '');
  const [resortHotel, setResortHotel] = useState(initial.resort_hotel || '');
  const [arrivalDate, setArrivalDate] = useState(initial.arrival_date || '');
  const [departDate, setDepartDate] = useState(initial.depart_date || '');
  const [revenue, setRevenue] = useState(initial.revenue || '');
  const [commissionPct, setCommissionPct] = useState(initial.commission_pct || '');
  const [commissionAmount, setCommissionAmount] = useState(initial.commission_amount || '');
  const [amountManual, setAmountManual] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(initial.payment_status || 'pending_booking');
  const [invoiceSentDate, setInvoiceSentDate] = useState(initial.invoice_sent_date || '');
  const [paidDate, setPaidDate] = useState(initial.paid_date || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-recompute commission amount from revenue × pct unless user typed it manually.
  useEffect(() => {
    if (amountManual) return;
    const r = Number(revenue || 0);
    const p = Number(commissionPct || 0);
    if (r && p) {
      setCommissionAmount((r * p / 100).toFixed(2));
    } else if (!revenue && !commissionPct) {
      setCommissionAmount('');
    }
  }, [revenue, commissionPct, amountManual]);

  const handleSave = async () => {
    const isHotel = lineType === 'hotel';
    // For hotels: vendor/brand is just the event's client company; the line's
    // own identifier is the property/resort. For others: vendor is required.
    const finalCompany = isHotel
      ? (companyName.trim() || (eventCompanyName ?? '').trim() || resortHotel.trim() || 'Hotel')
      : companyName.trim();
    if (!finalCompany) {
      setErr(isHotel ? 'Property name is required.' : 'Vendor / company name is required.');
      return;
    }
    if (isHotel && !resortHotel.trim()) {
      setErr('Property name is required.');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const payload: CommissionLineItemCreate = {
        line_type: lineType,
        company_name: finalCompany,
        resort_hotel: isHotel ? resortHotel.trim() : trimToNullStr(resortHotel),
        arrival_date: trimToNullStr(arrivalDate),
        depart_date: trimToNullStr(departDate),
        revenue: trimToNullStr(revenue),
        commission_pct: trimToNullStr(commissionPct),
        commission_amount: trimToNullStr(commissionAmount),
        payment_status: paymentStatus,
        invoice_sent_date: trimToNullStr(invoiceSentDate),
        paid_date: trimToNullStr(paidDate),
      };
      await onSave(payload);
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to save line item');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm('Delete this commission line? This cannot be undone.')) return;
    setSaving(true);
    try {
      await onDelete();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to delete line item');
      setSaving(false);
    }
  };

  const accent = LINE_TYPE_COLOR[lineType];
  const isHotel = lineType === 'hotel';

  return (
    <div className="rounded-lg bg-white border-2 border-blue-300 shadow-md border-l-4" style={{ borderLeftColor: accent }}>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {isNew ? `New ${lineType} line` : 'Editing commission line'}
          </h3>
          <span className="text-[11px] text-gray-500">Changes apply on Save</span>
        </div>

        {err && <div className="text-sm bg-red-50 text-red-700 px-3 py-2 rounded">{err}</div>}

        {/* Row 1: type + identifier(s) */}
        {isHotel ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Type">
              <select
                value={lineType}
                onChange={(e) => setLineType(e.target.value as LineType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {LINE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Hotel / Property">
                <input
                  type="text"
                  value={resortHotel}
                  onChange={(e) => setResortHotel(e.target.value)}
                  placeholder="e.g., Secrets Cap Cana"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Type">
              <select
                value={lineType}
                onChange={(e) => setLineType(e.target.value as LineType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {LINE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Vendor">
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </Field>
            <Field label="Property / Destination">
              <input
                type="text"
                value={resortHotel}
                onChange={(e) => setResortHotel(e.target.value)}
                placeholder="e.g., Secrets Playa Blanca"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </Field>
          </div>
        )}

        {/* Row 2: dates */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrival">
            <input
              type="date"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </Field>
          <Field label="Departure">
            <input
              type="date"
              value={departDate}
              onChange={(e) => setDepartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </Field>
        </div>

        {/* Commission box — horizontal fields inside the grouping bubble */}
        <FieldGroup title="Commission">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Revenue ($)">
              <CurrencyInput
                value={revenue}
                onChange={setRevenue}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              />
            </Field>
            <Field label="Commission %">
              <input
                type="number"
                step="0.01"
                min="0"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              />
            </Field>
            <Field label="Commission $">
              <CurrencyInput
                value={commissionAmount}
                onChange={(v) => { setCommissionAmount(v); setAmountManual(true); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              />
              {!amountManual && revenue && commissionPct && (
                <p className="text-[10px] text-gray-500 mt-0.5">Auto-calculated from revenue × %</p>
              )}
            </Field>
          </div>
        </FieldGroup>

        {/* Payment box — horizontal fields, definite only */}
        {showPaymentFields && (
          <FieldGroup title="Payment">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Status">
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  {PAYMENT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              {(paymentStatus === 'invoiced' || paymentStatus === 'paid') && (
                <Field label="Invoice Sent">
                  <input
                    type="date"
                    value={invoiceSentDate}
                    onChange={(e) => setInvoiceSentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  />
                </Field>
              )}
              {paymentStatus === 'paid' && (
                <Field label="Payment Received">
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  />
                </Field>
              )}
            </div>
          </FieldGroup>
        )}

        {/* Notes — accumulating feed (each Add appends a new timestamped entry) */}
        <div>
          <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
            Notes
          </label>
          {isNew ? (
            <p className="text-xs text-gray-500 italic">
              Save the line first, then come back to add notes.
            </p>
          ) : noteFeed ? (
            <NoteFeed
              notes={noteFeed.notes}
              enabled={true}
              placeholder={`Note for this ${lineType} line…`}
              emptyHint="No notes on this line item yet."
              onAdd={noteFeed.onAddNote}
              onEdit={noteFeed.onEditNote}
              onDelete={noteFeed.onDeleteNote}
            />
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          {onDelete && !isNew ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50"
            >
              Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isNew ? 'Add Line' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const FieldGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-lg bg-gray-50 ring-1 ring-gray-200 p-4">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-3">{title}</div>
    {children}
  </div>
);

const ReadKV: React.FC<{ label: string; value: React.ReactNode | null }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
    <div className="text-sm text-gray-900 tabular-nums">
      {value ?? <span className="text-gray-300">—</span>}
    </div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
      {label}
    </label>
    {children}
  </div>
);

export default CommissionView;
