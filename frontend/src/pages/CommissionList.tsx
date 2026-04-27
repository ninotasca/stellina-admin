import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import type {
  CommissionEventWithLineItems,
  CommissionLineItem,
  BookingStatus,
  PaymentStatus,
  LineType,
} from '../types/commission';

const STATUS_BADGE: Record<BookingStatus, string> = {
  definite: 'bg-green-100 text-green-800',
  tentative: 'bg-yellow-100 text-yellow-800',
  prospect: 'bg-gray-100 text-gray-800',
  lost: 'bg-red-100 text-red-800',
};

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  paid: 'bg-green-100 text-green-800',
  invoiced: 'bg-blue-100 text-blue-800',
  upcoming: 'bg-gray-100 text-gray-700',
  on_hold: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800',
};

const fmtMoney = (v: string | null | undefined) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const fmtDate = (v: string | null | undefined) => {
  if (!v) return '';
  return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

const CommissionList: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CommissionEventWithLineItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<LineType | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | 'all'>('all');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await commissionApi.listEvents();
      setEvents(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load commissions');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" and all its line items?`)) return;
    try {
      await commissionApi.deleteEvent(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete event');
    }
  };

  // Flat line-item view with event meta merged in
  const rows = useMemo(() => {
    type Row = CommissionLineItem & { event: CommissionEventWithLineItems };
    const out: Row[] = [];
    for (const ev of events) {
      for (const li of ev.line_items) {
        out.push({ ...li, event: ev });
      }
    }
    out.sort((a, b) => {
      const ad = a.arrival_date || '9999-12-31';
      const bd = b.arrival_date || '9999-12-31';
      return ad.localeCompare(bd);
    });
    return out.filter((r) => {
      if (statusFilter !== 'all' && r.event.booking_status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.line_type !== typeFilter) return false;
      if (paymentFilter !== 'all' && r.payment_status !== paymentFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = [
          r.event.meeting_name,
          r.company_name,
          r.resort_hotel || '',
          r.event.destination || '',
          r.notes || '',
        ].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [events, search, statusFilter, typeFilter, paymentFilter]);

  const totals = useMemo(() => {
    let revenue = 0, commission = 0, paid = 0, outstanding = 0;
    for (const r of rows) {
      const c = Number(r.commission_amount || 0);
      revenue += Number(r.revenue || 0);
      commission += c;
      if (r.payment_status === 'paid') paid += c;
      else outstanding += c;
    }
    return { revenue, commission, paid, outstanding, count: rows.length };
  }, [rows]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</button>
            <h1 className="text-2xl font-bold text-gray-900">Commission Tracker</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/commissions/projections')}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Projections
            </button>
            <button
              onClick={() => navigate('/commissions/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              + New Event
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Stat label="Line Items" value={totals.count.toString()} />
          <Stat label="Revenue" value={fmtMoney(totals.revenue.toString())} />
          <Stat label="Commission" value={fmtMoney(totals.commission.toString())} />
          <Stat label="Paid" value={fmtMoney(totals.paid.toString())} tone="green" />
          <Stat label="Outstanding" value={fmtMoney(totals.outstanding.toString())} tone="orange" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meeting, company, hotel…"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
            <option value="all">All booking statuses</option>
            <option value="definite">Definite</option>
            <option value="tentative">Tentative</option>
            <option value="prospect">Prospect</option>
            <option value="lost">Lost</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
            <option value="all">All line types</option>
            <option value="hotel">Hotel</option>
            <option value="dmc">DMC</option>
            <option value="air">Air</option>
            <option value="other">Other</option>
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
            <option value="all">All payment statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
            <option value="on_hold">On Hold</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Meeting</Th>
                    <Th>Booking</Th>
                    <Th>Type</Th>
                    <Th>Company</Th>
                    <Th>Hotel</Th>
                    <Th>Arrival</Th>
                    <Th right>Revenue</Th>
                    <Th right>Comm %</Th>
                    <Th right>Comm $</Th>
                    <Th>Payment</Th>
                    <Th right>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-500">No line items match these filters. <button className="text-blue-600 underline" onClick={() => navigate('/commissions/new')}>Create one</button>.</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <button
                          onClick={() => navigate(`/commissions/${r.event.id}/edit`)}
                          className="text-blue-700 hover:underline font-medium text-left"
                          title={r.event.destination || ''}
                        >
                          {r.event.meeting_name}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[r.event.booking_status]}`}>
                          {r.event.booking_status}
                        </span>
                      </td>
                      <td className="px-3 py-2 uppercase text-xs text-gray-700">{r.line_type}</td>
                      <td className="px-3 py-2">{r.company_name}</td>
                      <td className="px-3 py-2 text-gray-700">{r.resort_hotel || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{fmtDate(r.arrival_date)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(r.revenue)}</td>
                      <td className="px-3 py-2 text-right">{r.commission_pct ? `${Number(r.commission_pct)}%` : ''}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtMoney(r.commission_amount)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_BADGE[r.payment_status]}`}>
                          {r.payment_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => navigate(`/commissions/${r.event.id}/edit`)} className="text-indigo-600 hover:underline mr-3">Edit</button>
                        <button onClick={() => handleDelete(r.event.id, r.event.meeting_name)} className="text-red-600 hover:underline">Del</button>
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

const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={`px-3 py-2 text-${right ? 'right' : 'left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>{children}</th>
);

const Stat: React.FC<{ label: string; value: string; tone?: 'green' | 'orange' }> = ({ label, value, tone }) => {
  const color = tone === 'green' ? 'text-green-700' : tone === 'orange' ? 'text-orange-700' : 'text-gray-900';
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
};

export default CommissionList;
