import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import { nimbleApi, type NimbleCompanyLite, type NimblePersonLite } from '../services/nimbleApi';
import NimbleTypeahead, { type NimbleSelection, type PickerItem } from '../components/NimbleTypeahead';
import type {
  BookingStatus,
  CommissionLineItem,
  CommissionLineItemCreate,
  LineType,
  PaymentStatus,
} from '../types/commission';

interface DraftLineItem extends CommissionLineItemCreate {
  _id?: string;
  _persisted?: boolean;
}

const blankLineItem = (): DraftLineItem => ({
  line_type: 'hotel',
  company_name: '',
  resort_hotel: null,
  arrival_date: null,
  depart_date: null,
  peak_rooms: null,
  total_room_nights: null,
  revenue: null,
  commission_pct: null,
  commission_amount: null,
  payment_status: 'upcoming',
  invoice_sent_date: null,
  paid_date: null,
  my_points: null,
  cash_forward: null,
  notes: null,
});

const numOrNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());
const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
};

const computeCommission = (li: DraftLineItem): string | null => {
  const r = Number(li.revenue || 0);
  const p = Number(li.commission_pct || 0);
  if (!r || !p) return li.commission_amount ?? null;
  return (r * p / 100).toFixed(2);
};

const CommissionForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [meetingName, setMeetingName] = useState('');
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('prospect');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [company, setCompany] = useState<NimbleSelection>({ id: null, name: '' });
  const [contact, setContact] = useState<NimbleSelection>({ id: null, name: '', email: null });
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([blankLineItem()]);

  // Preloaded Nimble data
  const [allCompanies, setAllCompanies] = useState<NimbleCompanyLite[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companyContacts, setCompanyContacts] = useState<NimblePersonLite[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Load companies once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await nimbleApi.listAllCompanies();
        if (!cancelled) setAllCompanies(data);
      } catch {
        // silent — typeahead just falls back to "no items"
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When the selected company changes, preload contacts for it
  useEffect(() => {
    if (!company.id && !company.name) {
      setCompanyContacts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setContactsLoading(true);
      try {
        const data = await nimbleApi.listContactsByCompany({
          company_id: company.id,
          company: company.id ? null : company.name,
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
    id: c.id,
    label: c.name,
    sublabel: [c.industry, c.url || c.domain].filter(Boolean).join(' · '),
  }));

  const contactItems: PickerItem[] = companyContacts.map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: [p.title, p.email].filter(Boolean).join(' · '),
    email: p.email,
  }));

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || !id) return;
    (async () => {
      try {
        const ev = await commissionApi.getEvent(id);
        setMeetingName(ev.meeting_name);
        setBookingStatus(ev.booking_status);
        setDestination(ev.destination || '');
        setNotes(ev.notes || '');
        setCompany({ id: ev.client_company_id || null, name: ev.client_company_name || '' });
        setContact({
          id: ev.primary_contact_id || null,
          name: ev.primary_contact_name || '',
          email: ev.primary_contact_email || null,
        });
        setLineItems(
          ev.line_items.length === 0
            ? [blankLineItem()]
            : ev.line_items.map((li) => ({
                _id: li.id,
                _persisted: true,
                line_type: li.line_type,
                company_name: li.company_name,
                resort_hotel: li.resort_hotel,
                arrival_date: li.arrival_date,
                depart_date: li.depart_date,
                peak_rooms: li.peak_rooms,
                total_room_nights: li.total_room_nights,
                revenue: li.revenue,
                commission_pct: li.commission_pct,
                commission_amount: li.commission_amount,
                payment_status: li.payment_status,
                invoice_sent_date: li.invoice_sent_date,
                paid_date: li.paid_date,
                my_points: li.my_points,
                cash_forward: li.cash_forward,
                notes: li.notes,
              }))
        );
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load event');
      } finally {
        setLoading(false);
      }
    })();
  }, [editing, id]);

  const updateLI = (idx: number, patch: Partial<DraftLineItem>) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, ...patch } : li)));
  };

  const addLI = () => setLineItems((prev) => [...prev, blankLineItem()]);

  const removeLI = async (idx: number) => {
    const li = lineItems[idx];
    if (li._persisted && li._id) {
      if (!window.confirm('Delete this line item?')) return;
      try {
        await commissionApi.deleteLineItem(li._id);
      } catch (err: any) {
        alert(err.response?.data?.detail || 'Failed to delete line item');
        return;
      }
    }
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!meetingName.trim()) { setError('Meeting Name is required'); return; }
    for (const [i, li] of lineItems.entries()) {
      if (!li.company_name.trim()) { setError(`Line ${i + 1}: Company is required`); return; }
    }
    setSaving(true);
    try {
      const payloadLineItems: CommissionLineItemCreate[] = lineItems.map((li) => {
        const { _id, _persisted, ...rest } = li;
        const out = { ...rest };
        // auto-compute commission_amount if blank but pct + revenue given
        if ((out.commission_amount === null || out.commission_amount === '') ) {
          out.commission_amount = computeCommission(li);
        }
        return out;
      });

      const clientFields = {
        client_company_id: company.id,
        client_company_name: company.name.trim() || null,
        primary_contact_id: contact.id,
        primary_contact_name: contact.name.trim() || null,
        primary_contact_email: contact.email || null,
      };

      if (!editing) {
        const created = await commissionApi.createEvent({
          meeting_name: meetingName.trim(),
          booking_status: bookingStatus,
          destination: destination.trim() || null,
          notes: notes.trim() || null,
          ...clientFields,
          line_items: payloadLineItems,
        });
        navigate(`/commissions/${created.id}/edit`);
      } else if (id) {
        await commissionApi.updateEvent(id, {
          meeting_name: meetingName.trim(),
          booking_status: bookingStatus,
          destination: destination.trim() || null,
          notes: notes.trim() || null,
          ...clientFields,
        });
        // Sync line items
        for (const li of lineItems) {
          const { _id, _persisted, ...rest } = li;
          if ((rest.commission_amount === null || rest.commission_amount === '')) {
            rest.commission_amount = computeCommission(li);
          }
          if (_persisted && _id) {
            await commissionApi.updateLineItem(_id, rest);
          } else {
            await commissionApi.addLineItem(id, rest);
          }
        }
        navigate('/commissions');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/commissions')} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">{editing ? 'Edit Event' : 'New Event'}</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Event card */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Event Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Meeting Name *">
                <input
                  type="text" required value={meetingName}
                  onChange={(e) => setMeetingName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., The Org Chart 2025"
                />
              </Field>
              <Field label="Booking Status">
                <select value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value as BookingStatus)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                  <option value="prospect">Prospect</option>
                  <option value="tentative">Tentative</option>
                  <option value="definite">Definite</option>
                  <option value="lost">Lost</option>
                </select>
              </Field>
              <Field label="Destination">
                <input
                  type="text" value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Cancun, Mexico"
                />
              </Field>
              <Field label="Client Company">
                <NimbleTypeahead
                  items={companyItems}
                  loading={companiesLoading}
                  loadingHint="Loading companies from Nimble…"
                  emptyHint="No companies in Nimble."
                  value={company}
                  onChange={(v) => {
                    setCompany(v);
                    // Reset contact when company changes
                    setContact({ id: null, name: '', email: null });
                  }}
                  placeholder={companiesLoading ? 'Loading companies…' : 'Search Nimble companies…'}
                />
              </Field>
              <Field label="Primary Contact">
                <NimbleTypeahead
                  items={contactItems}
                  loading={contactsLoading}
                  loadingHint="Loading contacts at this company…"
                  emptyHint={company.name ? 'No contacts at this company in Nimble — type any name to save.' : 'Pick a company first to see its contacts.'}
                  disabled={!company.name && !company.id}
                  value={contact}
                  onChange={setContact}
                  placeholder={company.name ? 'Search contacts at this company…' : 'Pick a company first'}
                />
              </Field>
              {contact.email && (
                <Field label="Contact Email">
                  <input type="email" value={contact.email}
                    onChange={(e) => setContact({ ...contact, email: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700" />
                </Field>
              )}
              <Field label="Event Notes" wide>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </Field>
            </div>
          </section>

          {/* Line items */}
          <section className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Commission Line Items</h2>
              <button type="button" onClick={addLI} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">+ Add Line</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">A meeting may have multiple line items (Hotel, DMC, Air, Other) — each tracked independently for commission and payment status.</p>

            <div className="space-y-4">
              {lineItems.map((li, i) => (
                <div key={li._id || i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Line #{i + 1}</span>
                    <button type="button" onClick={() => removeLI(i)} className="text-sm text-red-600 hover:underline">Remove</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Type *">
                      <select value={li.line_type} onChange={(e) => updateLI(i, { line_type: e.target.value as LineType })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                        <option value="hotel">Hotel</option>
                        <option value="dmc">DMC</option>
                        <option value="air">Air</option>
                        <option value="other">Other</option>
                      </select>
                    </Field>
                    <Field label="Company *">
                      <input type="text" required value={li.company_name} onChange={(e) => updateLI(i, { company_name: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="AMSTAR, ACTS29…" />
                    </Field>
                    <Field label="Resort / Hotel">
                      <input type="text" value={li.resort_hotel || ''} onChange={(e) => updateLI(i, { resort_hotel: e.target.value || null })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>
                    <Field label="Payment Status">
                      <select value={li.payment_status} onChange={(e) => updateLI(i, { payment_status: e.target.value as PaymentStatus })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                        <option value="upcoming">Upcoming</option>
                        <option value="invoiced">Invoiced</option>
                        <option value="paid">Paid</option>
                        <option value="on_hold">On Hold</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </Field>

                    <Field label="Arrival">
                      <input type="date" value={li.arrival_date || ''} onChange={(e) => updateLI(i, { arrival_date: e.target.value || null })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>
                    <Field label="Depart">
                      <input type="date" value={li.depart_date || ''} onChange={(e) => updateLI(i, { depart_date: e.target.value || null })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>
                    <Field label="Peak Rooms">
                      <input type="number" value={li.peak_rooms ?? ''} onChange={(e) => updateLI(i, { peak_rooms: intOrNull(e.target.value) })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>
                    <Field label="Total RNs">
                      <input type="number" value={li.total_room_nights ?? ''} onChange={(e) => updateLI(i, { total_room_nights: intOrNull(e.target.value) })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>

                    <Field label="Revenue $">
                      <input type="number" step="0.01" value={li.revenue || ''} onChange={(e) => updateLI(i, { revenue: numOrNull(e.target.value) })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>
                    <Field label="Commission %">
                      <input type="number" step="0.01" value={li.commission_pct || ''} onChange={(e) => updateLI(i, { commission_pct: numOrNull(e.target.value) })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="10" />
                    </Field>
                    <Field label="Commission $ (auto)">
                      <input type="number" step="0.01" value={li.commission_amount || ''} onChange={(e) => updateLI(i, { commission_amount: numOrNull(e.target.value) })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder={computeCommission(li) || ''} />
                    </Field>
                    <Field label="Cash Forward $">
                      <input type="number" step="0.01" value={li.cash_forward || ''} onChange={(e) => updateLI(i, { cash_forward: numOrNull(e.target.value) })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>

                    <Field label="Invoice Sent">
                      <input type="date" value={li.invoice_sent_date || ''} onChange={(e) => updateLI(i, { invoice_sent_date: e.target.value || null })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>
                    <Field label="Paid Date">
                      <input type="date" value={li.paid_date || ''} onChange={(e) => updateLI(i, { paid_date: e.target.value || null })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>
                    <Field label="My Points">
                      <input type="text" value={li.my_points || ''} onChange={(e) => updateLI(i, { my_points: e.target.value || null })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="50,000 Marriott" />
                    </Field>
                    <Field label="Notes">
                      <input type="text" value={li.notes || ''} onChange={(e) => updateLI(i, { notes: e.target.value || null })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </Field>
                  </div>
                </div>
              ))}
              {lineItems.length === 0 && (
                <p className="text-sm text-gray-500 italic">No line items yet — add one above.</p>
              )}
            </div>
          </section>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => navigate('/commissions')} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; wide?: boolean }> = ({ label, children, wide }) => (
  <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
    <span className="text-xs font-medium text-gray-700 mb-1 block">{label}</span>
    {children}
  </label>
);

export default CommissionForm;
