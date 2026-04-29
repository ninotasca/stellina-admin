import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import { nimbleApi, type NimbleCompanyLite, type NimblePersonLite } from '../services/nimbleApi';
import NimbleTypeahead, { type NimbleSelection, type PickerItem } from '../components/NimbleTypeahead';
import NoteFeed from '../components/NoteFeed';
import HotelsConsidered from '../components/HotelsConsidered';
import CurrencyInput from '../components/CurrencyInput';
import type {
  BookingStatus,
  CommissionLineItem,
  CommissionLineItemCreate,
  CommissionNote,
  ConsiderationType,
  HotelConsidered,
  LineType,
  PaymentStatus,
} from '../types/commission';

// ---------- Booking status ----------

const BOOKING_STATUS_OPTIONS: { value: BookingStatus; label: string; color: string; description: string }[] = [
  { value: 'prospect', label: 'Prospect', color: '#9ca3af', description: 'Early lead, not yet committed' },
  { value: 'tentative', label: 'Tentative', color: '#eab308', description: 'Likely but not contracted' },
  { value: 'definite', label: 'Definite', color: '#16a34a', description: 'Contracted / booked' },
  { value: 'on_hold', label: 'On Hold', color: '#f97316', description: 'Paused — waiting on client' },
  { value: 'cancelled', label: 'Cancelled', color: '#ef4444', description: 'Was definite, now killed' },
  { value: 'lost', label: 'Lost', color: '#1f2937', description: "Didn't go through" },
];

// ---------- Considerations & line types ----------

const CONSIDERATION_OPTIONS: { value: ConsiderationType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'dmc', label: 'DMC' },
  { value: 'air', label: 'Air' },
  { value: 'other', label: 'Other' },
];

// One palette shared across consideration chips, line item bubble, and card accent
const LINE_TYPE_COLOR: Record<LineType, string> = {
  hotel: '#059669',  // emerald-600
  dmc: '#4f46e5',    // indigo-600
  air: '#0284c7',    // sky-600
  other: '#475569',  // slate-600
};

// Hero card color-coding by booking status (matches CommissionView).
type Tone = 'green' | 'yellow' | 'red' | 'orange' | 'gray' | 'darkgray';

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
};

const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'pending_booking', label: 'Pending Booking' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
];

// ---------- Form draft types ----------

interface DraftLineItem extends CommissionLineItemCreate {
  _id?: string;
  _persisted?: boolean;
  _amountManual?: boolean;       // user typed the commission $ directly
  _arrivalOverride?: boolean;    // diverges from event-level arrival
  _departOverride?: boolean;     // diverges from event-level depart
}

const blankLineItem = (lineType: LineType = 'hotel'): DraftLineItem => ({
  line_type: lineType,
  company_name: '',
  resort_hotel: null,
  arrival_date: null,
  depart_date: null,
  revenue: null,
  commission_pct: null,
  commission_amount: null,
  payment_status: 'pending_booking',
  invoice_sent_date: null,
  paid_date: null,
});

const lineItemHasData = (li: DraftLineItem): boolean => {
  if (li._persisted) return true;
  return Boolean(
    (li.company_name && li.company_name.trim()) ||
    (li.resort_hotel && li.resort_hotel.trim()) ||
    li.revenue || li.commission_pct || li.commission_amount ||
    (li.payment_status && li.payment_status !== 'pending_booking') ||
    li.invoice_sent_date || li.paid_date
  );
};

const numOrNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());
const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
};

const computeCommission = (revenue: string | null | undefined, pct: string | null | undefined): string | null => {
  const r = Number(revenue || 0);
  const p = Number(pct || 0);
  if (!r || !p) return null;
  return (r * p / 100).toFixed(2);
};

// ---------- Component ----------

const CommissionForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusLineId = searchParams.get('line');

  // Event state
  const [meetingName, setMeetingName] = useState('');
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('prospect');
  const [destinations, setDestinations] = useState<string[]>([]);
  const [destinationDraft, setDestinationDraft] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [departDate, setDepartDate] = useState('');
  const [datesFlexible, setDatesFlexible] = useState(false);
  const [considerations, setConsiderations] = useState<Set<ConsiderationType>>(new Set(['hotel']));
  const [peakRooms, setPeakRooms] = useState<number | null>(null);
  const [totalRNs, setTotalRNs] = useState<number | null>(null);

  const [company, setCompany] = useState<NimbleSelection>({ id: null, name: '' });
  const [contact, setContact] = useState<NimbleSelection>({ id: null, name: '', email: null });

  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);

  // Server-only data (only meaningful for persisted events)
  const [hotelsConsidered, setHotelsConsidered] = useState<HotelConsidered[]>([]);
  const [eventNotes, setEventNotes] = useState<CommissionNote[]>([]);
  const [lineItemNotes, setLineItemNotes] = useState<Record<string, CommissionNote[]>>({});

  // Nimble preload
  const [allCompanies, setAllCompanies] = useState<NimbleCompanyLite[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companyContacts, setCompanyContacts] = useState<NimblePersonLite[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Suppress soft warnings on a fresh blank form until the user has tried to
  // save at least once. (For existing events they always show — anything
  // missing is a real gap to fix.)
  const [attemptedSave, setAttemptedSave] = useState(false);

  // Track the booking status as it was last saved on the server, so we can
  // detect meaningful transitions on save and trigger an interstitial.
  const priorBookingStatusRef = useRef<BookingStatus | null>(null);
  const [interstitial, setInterstitial] =
    useState<{ variant: InterstitialVariant; targetEventId: string } | null>(null);

  // ---------- Load event ----------

  useEffect(() => {
    if (!editing || !id) return;
    (async () => {
      try {
        const ev = await commissionApi.getEvent(id);
        setMeetingName(ev.meeting_name);
        setBookingStatus(ev.booking_status);
        priorBookingStatusRef.current = ev.booking_status;
        setDestinations(ev.destinations?.length ? ev.destinations : (ev.destination ? [ev.destination] : []));
        setArrivalDate(ev.arrival_date || '');
        setDepartDate(ev.depart_date || '');
        setDatesFlexible(!!ev.dates_flexible);
        setConsiderations(new Set(ev.considerations || []));
        setPeakRooms(ev.peak_rooms);
        setTotalRNs(ev.total_room_nights);
        setCompany({ id: ev.client_company_id || null, name: ev.client_company_name || '' });
        setContact({
          id: ev.primary_contact_id || null,
          name: ev.primary_contact_name || '',
          email: ev.primary_contact_email || null,
        });
        setHotelsConsidered(ev.hotels_considered || []);
        setEventNotes(ev.event_notes || []);
        setLineItems(
          ev.line_items.length === 0 ? [] : ev.line_items.map((li) => liToDraft(li, ev.arrival_date, ev.depart_date))
        );
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load event');
      } finally {
        setLoading(false);
      }
    })();
  }, [editing, id]);

  // ---------- Nimble preload ----------

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

  // ---------- Hotels considered + event notes ----------
  // Both work in create mode too: in create, items are buffered in state with
  // synthetic ids ("draft-...") and POSTed to the backend after event creation.

  const isDraftId = (id: string) => id.startsWith('draft-');

  const reloadHotels = async () => {
    if (!id) return;
    setHotelsConsidered(await commissionApi.listHotels(id));
  };
  const reloadEventNotes = async () => {
    if (!id) return;
    setEventNotes(await commissionApi.listEventNotes(id));
  };

  // Hotel handlers (work in both create and edit modes)
  const handleAddHotel = async (name: string) => {
    if (id) {
      // Edit mode — backend handles the unique-selected invariant
      await commissionApi.addHotel(id, { name, is_selected: hotelsConsidered.length === 0 });
      await reloadHotels();
    } else {
      // Create mode — buffer locally
      const newHotel: HotelConsidered = {
        id: `draft-${crypto.randomUUID()}`,
        event_id: '',
        name,
        is_selected: hotelsConsidered.length === 0, // first one auto-selects
        notes: null,
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };
      setHotelsConsidered((prev) => [...prev, newHotel]);
    }
  };

  const handleSelectHotel = async (hotelId: string) => {
    if (id && !isDraftId(hotelId)) {
      await commissionApi.updateHotel(hotelId, { is_selected: true });
      await reloadHotels();
    } else {
      setHotelsConsidered((prev) => prev.map((h) => ({ ...h, is_selected: h.id === hotelId })));
    }
  };

  const handleRenameHotel = async (hotelId: string, name: string) => {
    if (id && !isDraftId(hotelId)) {
      await commissionApi.updateHotel(hotelId, { name });
      await reloadHotels();
    } else {
      setHotelsConsidered((prev) => prev.map((h) => (h.id === hotelId ? { ...h, name } : h)));
    }
  };

  const handleRemoveHotel = async (hotelId: string) => {
    if (id && !isDraftId(hotelId)) {
      await commissionApi.deleteHotel(hotelId);
      await reloadHotels();
    } else {
      setHotelsConsidered((prev) => prev.filter((h) => h.id !== hotelId));
    }
  };

  // Event note handlers
  const handleAddEventNote = async (body: string) => {
    if (id) {
      await commissionApi.addEventNote(id, body);
      await reloadEventNotes();
    } else {
      const synthetic: CommissionNote = {
        id: `draft-${crypto.randomUUID()}`,
        parent_type: 'event',
        parent_id: '',
        body,
        author_id: null,
        author_name: null,
        created_at: new Date().toISOString(),
      };
      // Newest-first to match server ordering
      setEventNotes((prev) => [synthetic, ...prev]);
    }
  };

  const handleEditEventNote = async (noteId: string, body: string) => {
    if (isDraftId(noteId)) {
      setEventNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, body } : n)));
    } else {
      await commissionApi.updateNote(noteId, body);
      await reloadEventNotes();
    }
  };

  const handleDeleteEventNote = async (noteId: string) => {
    if (isDraftId(noteId)) {
      setEventNotes((prev) => prev.filter((n) => n.id !== noteId));
    } else {
      await commissionApi.deleteNote(noteId);
      await reloadEventNotes();
    }
  };

  const handleEditLineItemNote = async (lineItemId: string, noteId: string, body: string) => {
    await commissionApi.updateNote(noteId, body);
    const fresh = await commissionApi.listLineItemNotes(lineItemId);
    setLineItemNotes((prev) => ({ ...prev, [lineItemId]: fresh }));
  };

  const handleDeleteLineItemNote = async (lineItemId: string, noteId: string) => {
    await commissionApi.deleteNote(noteId);
    const fresh = await commissionApi.listLineItemNotes(lineItemId);
    setLineItemNotes((prev) => ({ ...prev, [lineItemId]: fresh }));
  };

  // ---------- Line item helpers ----------

  const considersHotel = considerations.has('hotel');

  // Add a line item draft for any newly-checked consideration (no auto-remove here —
  // handled explicitly in toggleConsideration so we can block when there's data).
  useEffect(() => {
    setLineItems((prev) => {
      let next = prev;
      considerations.forEach((c) => {
        if (!next.some((li) => li.line_type === c)) {
          next = [...next, blankLineItem(c)];
        }
      });
      return next;
    });
  }, [considerations]);

  // Bidirectional sync: removing a consideration removes its empty drafts;
  // adding one ensures a matching line item exists (handled by the useEffect above).
  const toggleConsideration = (cat: ConsiderationType) => {
    if (considerations.has(cat)) {
      const lines = lineItems.filter((li) => li.line_type === cat);
      const dirty = lines.find(lineItemHasData);
      if (dirty) {
        alert(
          `You have data on ${lines.length === 1 ? `the ${cat.toUpperCase()} line item` : `${lines.length} ${cat.toUpperCase()} line items`}. ` +
          `Remove ${lines.length === 1 ? 'it' : 'them'} below before unchecking.`
        );
        return;
      }
      // Safe to drop empty drafts
      setLineItems((prev) => prev.filter((li) => li.line_type !== cat));
      setConsiderations((prev) => { const next = new Set(prev); next.delete(cat); return next; });
    } else {
      setConsiderations((prev) => { const next = new Set(prev); next.add(cat); return next; });
    }
  };

  // When a line item is added/removed manually, keep considerations in sync.
  useEffect(() => {
    const types = new Set(lineItems.map((li) => li.line_type));
    let changed = false;
    const next = new Set(considerations);
    types.forEach((t) => {
      if (!next.has(t as ConsiderationType)) { next.add(t as ConsiderationType); changed = true; }
    });
    if (changed) setConsiderations(next);
    // Note: we don't auto-uncheck a consideration when its last line item is removed —
    // user may still be considering that category even with no commission line yet.
  }, [lineItems]);

  // Auto-fill hotel line items' vendor from the selected considered hotel
  useEffect(() => {
    const selected = hotelsConsidered.find((h) => h.is_selected);
    if (!selected) return;
    setLineItems((prev) => prev.map((li) => {
      if (li.line_type !== 'hotel') return li;
      // Only auto-fill if blank or matches a previous selected hotel
      if (!li.company_name || li.company_name.trim() === '') {
        return { ...li, company_name: selected.name, resort_hotel: selected.name };
      }
      return li;
    }));
  }, [hotelsConsidered]);

  const updateLI = (idx: number, patch: Partial<DraftLineItem>) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, ...patch } : li)));
  };

  const addLI = (type: LineType = 'other') => setLineItems((prev) => [...prev, blankLineItem(type)]);

  const removeLI = async (idx: number) => {
    const li = lineItems[idx];
    if (li._persisted && li._id) {
      if (!window.confirm('Delete this line item?')) return;
      try { await commissionApi.deleteLineItem(li._id); } catch (err: any) {
        alert(err.response?.data?.detail || 'Failed to delete'); return;
      }
    }
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---------- Destinations chip input ----------

  const commitDestination = () => {
    const v = destinationDraft.trim().replace(/,$/, '').trim();
    if (!v) { setDestinationDraft(''); return; }
    setDestinations((prev) => prev.includes(v) ? prev : [...prev, v]);
    setDestinationDraft('');
  };

  // ---------- Validation ----------
  // Hard validation = blocks save (DB-level requirements only).
  // Everything else surfaces as soft warnings the user can fix later.

  const hardValidate = (): string | null => {
    if (!meetingName.trim()) return 'Meeting Name is required';
    return null;
  };

  const warnings = useMemo<string[]>(() => {
    const w: string[] = [];
    if (!company.name.trim()) w.push('Company is empty.');
    for (const [i, li] of lineItems.entries()) {
      const tag = `Line ${i + 1} (${li.line_type.toUpperCase()})`;
      if (bookingStatus === 'definite') {
        if (li.payment_status === 'paid' && !li.paid_date) {
          w.push(`${tag}: status is Paid but no Paid Date is set.`);
        }
        if ((li.payment_status === 'invoiced' || li.payment_status === 'paid') && !li.invoice_sent_date) {
          w.push(`${tag}: status is ${li.payment_status === 'paid' ? 'Paid' : 'Invoiced'} but no Invoice Sent date.`);
        }
      }
    }
    return w;
  }, [meetingName, company, lineItems, bookingStatus]);

  // ---------- Submit ----------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAttemptedSave(true);
    const v = hardValidate();
    if (v) { setError(v); return; }
    setSaving(true);
    try {
      const eventBody = {
        meeting_name: meetingName.trim(),
        booking_status: bookingStatus,
        destinations,
        // keep legacy single destination in sync (first chip)
        destination: destinations[0] || null,
        arrival_date: arrivalDate || null,
        depart_date: departDate || null,
        dates_flexible: datesFlexible,
        considerations: Array.from(considerations),
        peak_rooms: considersHotel ? peakRooms : null,
        total_room_nights: considersHotel ? totalRNs : null,
        client_company_id: company.id,
        client_company_name: company.name.trim() || null,
        primary_contact_id: contact.id,
        primary_contact_name: contact.name.trim() || null,
        primary_contact_email: contact.email || null,
      };

      const liPayloads: CommissionLineItemCreate[] = lineItems.map((li) => {
        const isHotel = li.line_type === 'hotel';
        // For hotel lines: the line's identifier is the property; vendor/brand
        // duplicates the event's client company, so derive it.
        const finalCompany = isHotel
          ? (company.name.trim() || (li.company_name ?? '').trim() || (li.resort_hotel ?? '').trim() || 'Hotel')
          : (li.company_name ?? '');
        const out: CommissionLineItemCreate = {
          line_type: li.line_type,
          company_name: finalCompany,
          resort_hotel: isHotel ? (li.resort_hotel || li.company_name) : li.resort_hotel,
          arrival_date: li._arrivalOverride ? li.arrival_date : (arrivalDate || null),
          depart_date: li._departOverride ? li.depart_date : (departDate || null),
          revenue: li.revenue,
          commission_pct: li.commission_pct,
          commission_amount: li.commission_amount ?? computeCommission(li.revenue, li.commission_pct),
          payment_status: bookingStatus === 'definite' ? li.payment_status : 'upcoming',
          invoice_sent_date: bookingStatus === 'definite' ? li.invoice_sent_date : null,
          paid_date: bookingStatus === 'definite' ? li.paid_date : null,
        };
        return out;
      });

      const transition = classifyTransition(priorBookingStatusRef.current, bookingStatus);

      let targetId: string | null = null;
      if (!editing) {
        const created = await commissionApi.createEvent({ ...eventBody, line_items: liPayloads });
        // Flush any pending hotels (created order) — preserve which one was selected
        const pendingHotels = hotelsConsidered.filter((h) => h.id.startsWith('draft-'));
        for (const h of pendingHotels) {
          await commissionApi.addHotel(created.id, { name: h.name, is_selected: h.is_selected });
        }
        // Flush pending event notes in chronological order (oldest first)
        const pendingNotes = eventNotes
          .filter((n) => n.id.startsWith('draft-'))
          .slice()
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        for (const n of pendingNotes) {
          await commissionApi.addEventNote(created.id, n.body);
        }
        targetId = created.id;
      } else if (id) {
        await commissionApi.updateEvent(id, eventBody);
        for (const [i, li] of lineItems.entries()) {
          const payload = liPayloads[i];
          if (li._persisted && li._id) await commissionApi.updateLineItem(li._id, payload);
          else await commissionApi.addLineItem(id, payload);
        }
        targetId = id;
      }

      // Update the prior-status ref so back-to-back saves don't celebrate twice.
      priorBookingStatusRef.current = bookingStatus;

      if (!targetId) return;

      if (transition) {
        // Show the interstitial; navigation happens when the user dismisses it.
        setInterstitial({ variant: transition, targetEventId: targetId });
      } else {
        navigate(`/commissions/${targetId}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Line item notes ----------

  const loadLineItemNotes = async (lineItemId: string) => {
    const notes = await commissionApi.listLineItemNotes(lineItemId);
    setLineItemNotes((prev) => ({ ...prev, [lineItemId]: notes }));
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  // ---------- Render ----------

  const breadcrumbYear = arrivalDate ? new Date(arrivalDate).getUTCFullYear() : null;
  const heroTone = STATUS_TONE[bookingStatus];

  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {editing ? (
          <nav className="flex items-center gap-1.5 text-sm text-gray-500">
            <button
              type="button"
              onClick={() => navigate('/commissions/list')}
              className="hover:text-gray-900 hover:underline"
            >
              Events
            </button>
            {breadcrumbYear && (
              <>
                <span className="text-gray-300">/</span>
                <button
                  type="button"
                  onClick={() => navigate(`/commissions/list?year=${breadcrumbYear}`)}
                  className="hover:text-gray-900 hover:underline"
                >
                  {breadcrumbYear}
                </button>
              </>
            )}
            <span className="text-gray-300">/</span>
            <button
              type="button"
              onClick={() => id && navigate(`/commissions/${id}`)}
              className="hover:text-gray-900 hover:underline truncate"
            >
              {meetingName || 'Event'}
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-gray-700 font-medium">Edit</span>
          </nav>
        ) : (
          <h1 className="text-2xl font-bold text-gray-900">New Event</h1>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {error && <div className="p-4 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
          {(editing || attemptedSave) && warnings.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">{warnings.length === 1 ? '1 thing to clean up' : `${warnings.length} things to clean up`}</p>
                  <p className="text-xs text-amber-800 mt-0.5">You can save now and fix these later — they won't block.</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-900 list-disc pl-5">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {/* ===== Hero card — event basics, color-coded by booking status ===== */}
          <section className={`rounded-xl ring-1 ${TONE_BG[heroTone]} p-6 space-y-5`}>
            <div>
              <Label>Booking Status</Label>
              <BookingStatusSelect value={bookingStatus} onChange={setBookingStatus} />
            </div>

            <Field label="Meeting Name *">
              <input
                type="text"
                required
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                className="w-full px-3 py-2 text-2xl font-bold text-gray-900 bg-white border border-gray-300 rounded-md"
                placeholder="e.g., The Org Chart 2025"
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Trip Dates">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    className="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  />
                  <input
                    type="date"
                    value={departDate}
                    onChange={(e) => setDepartDate(e.target.value)}
                    className="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  />
                </div>
                <label className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={datesFlexible}
                    onChange={(e) => setDatesFlexible(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Flexible
                </label>
              </Field>

              <Field label="Destinations">
                <div className="border border-gray-300 rounded-md px-2 py-1.5 flex flex-wrap gap-1.5 items-center min-h-[38px] bg-white">
                  {destinations.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                      {d}
                      <button
                        type="button"
                        onClick={() => setDestinations((p) => p.filter((x) => x !== d))}
                        className="text-gray-400 hover:text-red-600 leading-none text-sm"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={destinationDraft}
                    onChange={(e) => setDestinationDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitDestination(); }
                      else if (e.key === 'Backspace' && !destinationDraft && destinations.length) {
                        setDestinations((p) => p.slice(0, -1));
                      }
                    }}
                    onBlur={commitDestination}
                    className="flex-1 min-w-[100px] px-1 py-0.5 text-sm outline-none bg-transparent"
                    placeholder={destinations.length === 0 ? 'Type & Enter (e.g. Cancun, Mexico)' : 'Add another…'}
                  />
                </div>
              </Field>

              <Field label="Considering">
                <div className="flex gap-1.5 flex-wrap">
                  {CONSIDERATION_OPTIONS.map((opt) => {
                    const on = considerations.has(opt.value);
                    const color = LINE_TYPE_COLOR[opt.value];
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => toggleConsideration(opt.value)}
                        className="px-2.5 py-1 text-xs rounded-md border font-medium transition-colors"
                        style={on
                          ? { background: color, borderColor: color, color: 'white' }
                          : { background: 'white', borderColor: '#d1d5db', color: '#374151' }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-gray-500">Toggling adds a matching commission line below.</p>
              </Field>
            </div>
          </section>

          {/* ===== Company & Primary Contact ===== */}
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              Company &amp; Contact
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Company *">
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
          </section>

          {/* ===== RFP Info (only if hotel is being considered) ===== */}
          {considersHotel && (
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">RFP Info</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Peak Rooms">
                  <input
                    type="number"
                    value={peakRooms ?? ''}
                    onChange={(e) => setPeakRooms(intOrNull(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </Field>
                <Field label="Total Room Nights">
                  <input
                    type="number"
                    value={totalRNs ?? ''}
                    onChange={(e) => setTotalRNs(intOrNull(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </Field>
              </div>

              <div>
                <Label>Hotels Being Considered</Label>
                <HotelsConsidered
                  hotels={hotelsConsidered}
                  enabled={true}
                  onAdd={handleAddHotel}
                  onSelect={handleSelectHotel}
                  onRename={handleRenameHotel}
                  onRemove={handleRemoveHotel}
                />
              </div>
            </section>
          )}

          {/* ===== Line items ===== */}
          <section className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Commission Line Items</h2>
              <div className="flex gap-1.5">
                {(['hotel', 'dmc', 'air', 'other'] as LineType[]).map((t) => (
                  <button type="button" key={t} onClick={() => addLI(t)}
                    className="px-2.5 py-1 text-xs uppercase tracking-wider bg-white border rounded hover:bg-gray-50 font-medium"
                    style={{ borderColor: LINE_TYPE_COLOR[t], color: LINE_TYPE_COLOR[t] }}>
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {lineItems.length === 0 && (
                <p className="text-sm text-gray-500 italic">Pick what the client is considering above, or add a line manually.</p>
              )}
              {lineItems.map((li, i) => (
                <LineItemCard
                  key={li._id || `draft-${i}`}
                  li={li}
                  forceOpen={!!focusLineId && li._id === focusLineId}
                  bookingStatus={bookingStatus}
                  eventArrival={arrivalDate}
                  eventDepart={departDate}
                  selectedHotelName={hotelsConsidered.find((h) => h.is_selected)?.name || null}
                  notes={li._id ? lineItemNotes[li._id] || [] : []}
                  notesLoaded={li._id ? li._id in lineItemNotes : false}
                  onUpdate={(patch) => updateLI(i, patch)}
                  onRemove={() => removeLI(i)}
                  onLoadNotes={async () => { if (li._id) await loadLineItemNotes(li._id); }}
                  onAddNote={async (body) => {
                    if (!li._id) return;
                    await commissionApi.addLineItemNote(li._id, body);
                    await loadLineItemNotes(li._id);
                  }}
                  onEditNote={async (noteId, body) => {
                    if (!li._id) return;
                    await handleEditLineItemNote(li._id, noteId, body);
                  }}
                  onDeleteNote={async (noteId) => {
                    if (!li._id) return;
                    await handleDeleteLineItemNote(li._id, noteId);
                  }}
                />
              ))}
            </div>
          </section>

          {/* ===== Event Notes ===== */}
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Event Notes</h2>
            <NoteFeed
              notes={eventNotes}
              enabled={true}
              placeholder="What just happened with this deal?"
              emptyHint={id ? 'No notes yet \u2014 add the first.' : 'No notes yet \u2014 they\u2019ll save when you create the event.'}
              onAdd={handleAddEventNote}
              onEdit={handleEditEventNote}
              onDelete={handleDeleteEventNote}
            />
          </section>

        </main>

        {/* Full-width sticky save bar */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 z-10 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.08)]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-end gap-3">
            <button type="button" onClick={() => navigate('/commissions')} className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </div>
      </form>

      {interstitial && (
        <StatusInterstitial
          variant={interstitial.variant}
          onDismiss={() => {
            const target = interstitial.targetEventId;
            setInterstitial(null);
            navigate(`/commissions/${target}`);
          }}
        />
      )}
    </div>
  );
};

// ---------- Status-transition interstitial ----------

type InterstitialVariant = 'celebrate' | 'progress' | 'encourage';

// Decide which interstitial (if any) to show given a status transition.
// Returns null if the change isn't worth a fanfare.
function classifyTransition(
  from: BookingStatus | null,
  to: BookingStatus,
): InterstitialVariant | null {
  if (from === to) return null;
  if (to === 'definite' && from !== 'definite') return 'celebrate';
  if (to === 'tentative' && from === 'prospect') return 'progress';
  if (to === 'cancelled' || to === 'lost') return 'encourage';
  return null;
}

interface InterstitialConfig {
  background: string;
  hero: string;            // big centered emoji on the card
  heroAnimation: string;   // tailwind animation class
  title: string;
  messages: string[];
  confettiEmojis: string[];
  buttonClass: string;
  buttonText: string;
  motion: 'rise' | 'drift'; // confetti motion style
}

const INTERSTITIAL_CONFIG: Record<InterstitialVariant, InterstitialConfig> = {
  celebrate: {
    background:
      'linear-gradient(135deg, rgba(6,95,70,0.92) 0%, rgba(15,118,110,0.92) 50%, rgba(30,58,138,0.92) 100%)',
    hero: '🎉',
    heroAnimation: 'animate-bounce',
    title: 'Definite!',
    messages: [
      "You're crushing it!",
      "Definite > everything else. You did the thing.",
      "That's how it's done.",
      "Look at you, sealing deals like a pro.",
      "Hard work, big win. Well played.",
      "From prospect to definite — perfectly executed.",
      "Boom! Another one in the books.",
      "You make it look easy.",
      "Champion's mindset, champion's results.",
      "The kind of energy we love to see.",
      "Money in motion!",
      "Closed. Locked in. Cha-ching.",
    ],
    confettiEmojis: ['🎉', '🎊', '✨', '⭐', '🚀', '💫', '🎈', '🌟', '🥳', '🎯', '💰', '🏆'],
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
    buttonText: 'Continue →',
    motion: 'rise',
  },
  progress: {
    background:
      'linear-gradient(135deg, rgba(30,64,175,0.92) 0%, rgba(67,56,202,0.92) 50%, rgba(126,34,206,0.92) 100%)',
    hero: '🚂',
    heroAnimation: 'animate-bounce',
    title: 'All aboard!',
    messages: [
      'Making great progress!',
      'Picking up steam.',
      'Tentative — one big step closer.',
      'Look at you go. Keep the momentum.',
      'The ball is rolling.',
      'Building toward definite.',
      'On the right track.',
      "Don't stop now — keep going.",
    ],
    confettiEmojis: ['🚂', '💨', '✨', '📈', '⭐', '🛤️', '🌟', '🎯', '⚡'],
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700',
    buttonText: 'Keep going →',
    motion: 'rise',
  },
  encourage: {
    background:
      'linear-gradient(135deg, rgba(120,53,15,0.85) 0%, rgba(67,20,7,0.88) 50%, rgba(31,41,55,0.92) 100%)',
    hero: '🐶',
    heroAnimation: 'animate-pulse',
    title: 'Heads up.',
    messages: [
      "Keep your head up — onto the next one.",
      "You can't win 'em all. Tomorrow's a new day.",
      "Every no gets you closer to a yes.",
      "Shake it off — bigger fish ahead.",
      "Sometimes the best deals are the ones you walk away from.",
      "Good people lose deals. Great people learn from them.",
      "This one wasn't yours. The next one might be.",
      "Hey, this dog believes in you.",
    ],
    confettiEmojis: ['🐶', '🐾', '🌈', '☀️', '💪', '🌸', '🍀', '⭐'],
    buttonClass: 'bg-amber-600 hover:bg-amber-700',
    buttonText: 'Onward →',
    motion: 'drift',
  },
};

interface StatusInterstitialProps {
  variant: InterstitialVariant;
  onDismiss: () => void;
}

const StatusInterstitial: React.FC<StatusInterstitialProps> = ({ variant, onDismiss }) => {
  const config = INTERSTITIAL_CONFIG[variant];
  const message = useMemo(
    () => config.messages[Math.floor(Math.random() * config.messages.length)],
    [config.messages],
  );

  // Pre-generate confetti so positions/delays are stable across re-renders.
  const confetti = useMemo(
    () => Array.from({ length: variant === 'encourage' ? 35 : 60 }).map((_, i) => ({
      emoji: config.confettiEmojis[i % config.confettiEmojis.length],
      left: Math.random() * 100,
      delay: Math.random() * 3,
      duration: variant === 'encourage' ? 6 + Math.random() * 4 : 4 + Math.random() * 3,
      size: variant === 'encourage' ? 18 + Math.random() * 18 : 22 + Math.random() * 22,
    })),
    [config.confettiEmojis, variant],
  );

  const animationName = config.motion === 'rise' ? 'confetti-rise' : 'confetti-drift';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{ background: config.background }}
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes confetti-rise {
          0%   { transform: translateY(110vh) rotate(0deg) scale(0.7); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(-20vh) rotate(720deg) scale(1.15); opacity: 0; }
        }
        @keyframes confetti-drift {
          0%   { transform: translateY(-10vh) rotate(0deg) scale(0.8); opacity: 0; }
          15%  { opacity: 0.85; }
          100% { transform: translateY(110vh) rotate(180deg) scale(1); opacity: 0; }
        }
        @keyframes celebrate-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {confetti.map((c, i) => (
        <span
          key={i}
          className="absolute pointer-events-none select-none"
          style={{
            left: `${c.left}%`,
            top: 0,
            fontSize: `${c.size}px`,
            animation: `${animationName} ${c.duration}s ${c.delay}s linear infinite`,
          }}
        >
          {c.emoji}
        </span>
      ))}

      <div
        className="relative bg-white rounded-3xl shadow-2xl px-12 py-10 max-w-lg mx-4 text-center"
        style={{ animation: 'celebrate-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        <div className={`text-7xl mb-4 ${config.heroAnimation}`}>{config.hero}</div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2">{config.title}</h1>
        <p className="text-xl text-gray-700 mb-7 font-medium">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className={`px-8 py-3 text-white rounded-xl font-semibold text-lg shadow-md hover:shadow-lg transition-shadow ${config.buttonClass}`}
        >
          {config.buttonText}
        </button>
      </div>
    </div>
  );
};

// ---------- Line Item card ----------

interface LineItemCardProps {
  li: DraftLineItem;
  forceOpen?: boolean;
  bookingStatus: BookingStatus;
  eventArrival: string;
  eventDepart: string;
  selectedHotelName: string | null;
  notes: CommissionNote[];
  notesLoaded: boolean;
  onUpdate: (patch: Partial<DraftLineItem>) => void;
  onRemove: () => void;
  onLoadNotes: () => Promise<void>;
  onAddNote: (body: string) => Promise<void>;
  onEditNote: (noteId: string, body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}

const LINE_TYPE_LABEL: Record<LineType, string> = {
  hotel: 'Hotel',
  dmc: 'DMC',
  air: 'Air',
  other: 'Other',
};

const LineItemCard: React.FC<LineItemCardProps> = ({
  li, forceOpen, bookingStatus, eventArrival, eventDepart, selectedHotelName,
  notes, notesLoaded, onUpdate, onRemove, onLoadNotes, onAddNote, onEditNote, onDeleteNote,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  const computed = computeCommission(li.revenue, li.commission_pct);
  const displayedAmount = li._amountManual ? (li.commission_amount || '') : (li.commission_amount || computed || '');
  const definite = bookingStatus === 'definite';

  const arrivalEffective = li._arrivalOverride ? li.arrival_date : (eventArrival || null);
  const departEffective = li._departOverride ? li.depart_date : (eventDepart || null);

  const hotelHint = li.line_type === 'hotel' && selectedHotelName && !li.company_name?.trim()
    ? `Will use selected hotel: ${selectedHotelName}` : null;

  const accent = LINE_TYPE_COLOR[li.line_type];
  // All line items default to expanded; user can collapse manually.
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect(() => {
    if (forceOpen) {
      setCollapsed(false);
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [forceOpen]);

  const summaryAmount = li._amountManual
    ? li.commission_amount
    : (li.commission_amount || computeCommission(li.revenue, li.commission_pct));
  const fmtMoney = (v: string | null | undefined) => {
    if (!v) return null;
    const n = Number(v);
    if (Number.isNaN(n)) return null;
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  };
  const summaryMoney = fmtMoney(summaryAmount);

  return (
    <div
      ref={cardRef}
      className="rounded-lg bg-white border border-gray-200 border-l-4 transition-colors overflow-hidden"
      style={{ borderLeftColor: accent }}
    >
      {/* Header — always visible. Click to expand/collapse. */}
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
          aria-expanded={!collapsed}
        >
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${collapsed ? '' : 'rotate-90'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span
            className="px-2.5 py-0.5 text-xs uppercase tracking-wider rounded-full font-semibold text-white shrink-0"
            style={{ background: accent }}
          >
            {LINE_TYPE_LABEL[li.line_type]}
          </span>
          {collapsed && (
            <span className="flex items-center gap-2 text-sm text-gray-700 truncate">
              <span className={li.company_name ? 'font-medium text-gray-900' : 'italic text-gray-400'}>
                {li.company_name || '(no vendor yet)'}
              </span>
              {summaryMoney && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="font-medium tabular-nums text-gray-900">{summaryMoney}</span>
                </>
              )}
              {bookingStatus === 'definite' && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-500 capitalize">{(li.payment_status || 'pending_booking').replace('_', ' ')}</span>
                </>
              )}
            </span>
          )}
          {!li._persisted && <span className="text-[10px] uppercase tracking-wider text-amber-700 ml-2 shrink-0">Draft</span>}
        </button>
        {!collapsed && (
          <button type="button" onClick={onRemove} className="text-sm text-red-600 hover:underline shrink-0">Remove</button>
        )}
      </div>

      {collapsed ? null : (
      <div className="px-4 pb-4">

      {/* Row 1: type + identifier(s) */}
      {li.line_type === 'hotel' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Type">
            <select value={li.line_type} onChange={(e) => onUpdate({ line_type: e.target.value as LineType })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="hotel">Hotel</option>
              <option value="dmc">DMC</option>
              <option value="air">Air</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Hotel / Property">
              <input type="text" value={li.resort_hotel || ''}
                onChange={(e) => onUpdate({ resort_hotel: e.target.value })}
                placeholder="e.g., Secrets Cap Cana"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
              {hotelHint && <p className="mt-1 text-[11px] text-amber-700">{hotelHint}</p>}
            </Field>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Type">
            <select value={li.line_type} onChange={(e) => onUpdate({ line_type: e.target.value as LineType })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="hotel">Hotel</option>
              <option value="dmc">DMC</option>
              <option value="air">Air</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Vendor">
            <input type="text" value={li.company_name || ''}
              onChange={(e) => onUpdate({ company_name: e.target.value })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
          <Field label="Property / Destination">
            <input type="text" value={li.resort_hotel || ''}
              onChange={(e) => onUpdate({ resort_hotel: e.target.value })}
              placeholder="e.g., Secrets Playa Blanca"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </Field>
        </div>
      )}

      {/* Row 2: dates */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Arrival">
          <DateInheritedInput
            override={!!li._arrivalOverride}
            value={li._arrivalOverride ? li.arrival_date : arrivalEffective}
            inheritedValue={eventArrival}
            onValueChange={(v) => onUpdate({ arrival_date: v })}
            onToggleOverride={(o) => onUpdate({ _arrivalOverride: o, arrival_date: o ? li.arrival_date : null })}
          />
        </Field>
        <Field label="Depart">
          <DateInheritedInput
            override={!!li._departOverride}
            value={li._departOverride ? li.depart_date : departEffective}
            inheritedValue={eventDepart}
            onValueChange={(v) => onUpdate({ depart_date: v })}
            onToggleOverride={(o) => onUpdate({ _departOverride: o, depart_date: o ? li.depart_date : null })}
          />
        </Field>
      </div>

      {/* Commission box — horizontal fields inside a grouping bubble */}
      <div className="mt-4 rounded-lg bg-gray-50 ring-1 ring-gray-200 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-3">Commission</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Revenue $">
            <CurrencyInput
              value={li.revenue || ''}
              onChange={(v) => onUpdate({ revenue: v || null })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
            />
          </Field>
          <Field label="Commission %">
            <input type="number" step="0.01" value={li.commission_pct || ''}
              onChange={(e) => onUpdate({ commission_pct: numOrNull(e.target.value) })}
              placeholder="10"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white" />
          </Field>
          <Field label="Commission $">
            <div className="relative">
              <CurrencyInput
                value={displayedAmount || ''}
                onChange={(v) => onUpdate({ commission_amount: v || null, _amountManual: true })}
                placeholder={computed || ''}
                className={`w-full px-2 py-1.5 pr-16 border rounded text-sm ${li._amountManual ? 'border-amber-400 bg-amber-50' : 'border-gray-300 bg-white'}`}
              />
              {li._amountManual ? (
                <button type="button"
                  onClick={() => onUpdate({ commission_amount: computed, _amountManual: false })}
                  className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-amber-100 text-amber-800 rounded hover:bg-amber-200"
                  title="Clear override and use revenue × %"
                >Manual</button>
              ) : computed && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-gray-400">auto</span>
              )}
            </div>
          </Field>
        </div>
      </div>

      {/* Payment box — horizontal fields, definite only */}
      {definite ? (
        <div className="mt-4 rounded-lg bg-gray-50 ring-1 ring-gray-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-3">Payment</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Status">
              <select value={li.payment_status}
                onChange={(e) => onUpdate({ payment_status: e.target.value as PaymentStatus })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                {PAYMENT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {(li.payment_status === 'invoiced' || li.payment_status === 'paid') && (
              <Field label="Invoice Sent">
                <input type="date" value={li.invoice_sent_date || ''}
                  onChange={(e) => onUpdate({ invoice_sent_date: e.target.value || null })}
                  className={`w-full px-2 py-1.5 border rounded text-sm bg-white ${!li.invoice_sent_date ? 'border-amber-400 !bg-amber-50' : 'border-gray-300'}`} />
              </Field>
            )}
            {li.payment_status === 'paid' && (
              <Field label="Payment Received">
                <input type="date" value={li.paid_date || ''}
                  onChange={(e) => onUpdate({ paid_date: e.target.value || null })}
                  className={`w-full px-2 py-1.5 border rounded text-sm bg-white ${!li.paid_date ? 'border-amber-400 !bg-amber-50' : 'border-gray-300'}`} />
              </Field>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400 italic">Payment status applies once booking is Definite.</p>
      )}

      {/* Notes feed */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <button type="button"
          onClick={async () => {
            const next = !notesOpen;
            setNotesOpen(next);
            if (next && li._id && !notesLoaded) await onLoadNotes();
          }}
          className="text-sm text-blue-700 hover:underline">
          {notesOpen ? '▾ Hide notes' : `▸ Notes${li._persisted ? ` (${notes.length})` : ''}`}
        </button>
        {notesOpen && (
          <div className="mt-3">
            <NoteFeed
              notes={notes}
              enabled={!!li._id}
              disabledHint="Save the event first, then come back to add notes for this line item."
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
      )}
    </div>
  );
};

// ---------- Booking Status custom select (dropdown with color dot) ----------

const BookingStatusSelect: React.FC<{ value: BookingStatus; onChange: (v: BookingStatus) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = BOOKING_STATUS_OPTIONS.find((o) => o.value === value) || BOOKING_STATUS_OPTIONS[0];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full max-w-xs flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-sm"
      >
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: current.color }} />
          <span className="font-medium text-gray-900">{current.label}</span>
        </span>
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="absolute z-30 mt-1 w-full max-w-xs bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
          {BOOKING_STATUS_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-gray-50 ${value === opt.value ? 'bg-gray-50' : ''}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ background: opt.color }} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                  <span className="block text-[11px] text-gray-500">{opt.description}</span>
                </span>
                {value === opt.value && (
                  <svg className="w-4 h-4 text-gray-700 mt-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ---------- Reusable bits ----------

const Field: React.FC<{ label: string; children: React.ReactNode; wide?: boolean }> = ({ label, children, wide }) => (
  <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
    {label && <span className="text-xs font-medium text-gray-700 mb-1 block">{label}</span>}
    {children}
  </label>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">{children}</p>
);

const DateInheritedInput: React.FC<{
  override: boolean;
  value: string | null | undefined;
  inheritedValue: string;
  onValueChange: (v: string | null) => void;
  onToggleOverride: (override: boolean) => void;
}> = ({ override, value, inheritedValue, onValueChange, onToggleOverride }) => {
  if (!override) {
    return (
      <div className="flex items-center gap-2">
        <input type="date" value={inheritedValue || ''} disabled
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm bg-gray-50 text-gray-500" />
        <button type="button" onClick={() => onToggleOverride(true)}
          className="text-[11px] text-blue-600 hover:underline whitespace-nowrap">Override</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input type="date" value={value || ''} onChange={(e) => onValueChange(e.target.value || null)}
        className="flex-1 px-2 py-1.5 border border-amber-300 bg-amber-50 rounded text-sm" />
      <button type="button" onClick={() => onToggleOverride(false)}
        className="text-[11px] text-gray-500 hover:underline whitespace-nowrap">Use event</button>
    </div>
  );
};

// ---------- Helpers ----------

function liToDraft(li: CommissionLineItem, eventArrival: string | null, eventDepart: string | null): DraftLineItem {
  const arrivalOverride = li.arrival_date != null && li.arrival_date !== (eventArrival || '');
  const departOverride = li.depart_date != null && li.depart_date !== (eventDepart || '');
  // If line item commission_amount differs from computed, infer manual override
  const computed = computeCommission(li.revenue, li.commission_pct);
  const amountManual = !!(li.commission_amount && computed && li.commission_amount !== computed);
  return {
    _id: li.id,
    _persisted: true,
    _amountManual: amountManual,
    _arrivalOverride: arrivalOverride,
    _departOverride: departOverride,
    line_type: li.line_type,
    company_name: li.company_name,
    resort_hotel: li.resort_hotel,
    arrival_date: arrivalOverride ? li.arrival_date : null,
    depart_date: departOverride ? li.depart_date : null,
    revenue: li.revenue,
    commission_pct: li.commission_pct,
    commission_amount: li.commission_amount,
    payment_status: li.payment_status,
    invoice_sent_date: li.invoice_sent_date,
    paid_date: li.paid_date,
  };
}

export default CommissionForm;
