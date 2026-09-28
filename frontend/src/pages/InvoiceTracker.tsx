import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import { getApiErrorMessage } from '../services/http';
import type { CommissionEventWithLineItems, CommissionLineItem, CommissionNote } from '../types/commission';
import { formatWholeDollars } from '../utils/currency';
import { parseLocalDate } from '../utils/date';

interface InvoiceRow {
  event: CommissionEventWithLineItems;
  line: CommissionLineItem;
  lineNotes: CommissionNote[];
}

const fmtDate = (value: string | null): string => {
  if (!value) return 'Not recorded';
  return parseLocalDate(value).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

const daysSince = (value: string | null): number | null => {
  if (!value) return null;
  const start = parseLocalDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
};

const responsibleParty = (line: CommissionLineItem): { name: string; context: string | null } => {
  if (line.line_type === 'hotel') {
    const name = line.resort_hotel || line.company_name || 'Unnamed hotel';
    const context = line.company_name && line.company_name !== name ? line.company_name : null;
    return { name, context };
  }
  return {
    name: line.company_name || line.resort_hotel || `Unnamed ${line.line_type.toUpperCase()}`,
    context: line.resort_hotel && line.resort_hotel !== line.company_name ? line.resort_hotel : null,
  };
};

const InvoiceTracker: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CommissionEventWithLineItems[]>([]);
  const [notesByLine, setNotesByLine] = useState<Record<string, CommissionNote[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await commissionApi.listEvents();
        const outstanding = data.flatMap((event) =>
          event.line_items.filter((line) => line.payment_status === 'invoiced'),
        );
        const noteEntries = await Promise.all(
          outstanding.map(async (line) => [line.id, await commissionApi.listLineItemNotes(line.id)] as const),
        );
        if (!cancelled) {
          setEvents(data);
          setNotesByLine(Object.fromEntries(noteEntries));
        }
      } catch (err: unknown) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load outstanding invoices'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [selected]);

  const rows = useMemo<InvoiceRow[]>(() => {
    const query = search.trim().toLowerCase();
    return events
      .flatMap((event) => event.line_items
        .filter((line) => line.payment_status === 'invoiced')
        .map((line) => ({ event, line, lineNotes: notesByLine[line.id] || [] })))
      .filter(({ event, line }) => {
        if (!query) return true;
        const party = responsibleParty(line);
        return [party.name, party.context, event.meeting_name, event.client_company_name, line.line_type]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => (a.line.invoice_sent_date || '9999').localeCompare(b.line.invoice_sent_date || '9999'));
  }, [events, notesByLine, search]);

  const totalOutstanding = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.line.commission_amount || 0), 0),
    [rows],
  );
  const overdueCount = useMemo(
    () => rows.filter((row) => (daysSince(row.line.invoice_sent_date) || 0) >= 30).length,
    [rows],
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoice Tracker</h1>
          <p className="mt-1 text-sm text-gray-600">Outstanding commissions that have been invoiced and are awaiting payment.</p>
        </div>
        <label className="block w-full sm:w-80">
          <span className="sr-only">Search invoices</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search hotel, DMC, or meeting…"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Outstanding invoices" value={String(rows.length)} />
        <SummaryCard label="Outstanding amount" value={formatWholeDollars(totalOutstanding)} tone="blue" />
        <SummaryCard label="30+ days outstanding" value={String(overdueCount)} tone={overdueCount ? 'amber' : undefined} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">Loading outstanding invoices…</p>
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-base font-medium text-gray-900">No outstanding invoices</p>
            <p className="mt-1 text-sm text-gray-500">{search ? 'No invoices match this search.' : 'Everything invoiced has been paid.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Who owes you</Th>
                  <Th>Date invoiced</Th>
                  <Th>Age</Th>
                  <Th>Meeting</Th>
                  <Th right>Amount</Th>
                  <Th>Meeting end date</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const party = responsibleParty(row.line);
                  const age = daysSince(row.line.invoice_sent_date);
                  const noteCount = row.lineNotes.length + row.event.event_notes.length;
                  return (
                    <tr key={row.line.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{party.name}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold uppercase tracking-wider">{row.line.line_type}</span>
                          {party.context && <span className="truncate" title={party.context}>{party.context}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtDate(row.line.invoice_sent_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {age == null ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${age >= 30 ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>
                            {age} {age === 1 ? 'day' : 'days'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => navigate(`/commissions/${row.event.id}`)} className="font-medium text-blue-700 hover:underline text-left">
                          {row.event.meeting_name}
                        </button>
                        {row.event.client_company_name && <div className="mt-0.5 text-xs text-gray-500">{row.event.client_company_name}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatWholeDollars(Number(row.line.commission_amount || 0))}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtDate(row.line.depart_date || row.event.depart_date)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelected(row)}
                          className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs font-medium ${noteCount ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          {noteCount ? `View ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}` : 'No notes'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <NotesOverlay row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: string; tone?: 'blue' | 'amber' }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
    <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'blue' ? 'text-blue-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
  </div>
);

const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th scope="col" className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);

const NotesOverlay: React.FC<{ row: InvoiceRow; onClose: () => void }> = ({ row, onClose }) => {
  const party = responsibleParty(row.line);
  const notes = [
    ...row.lineNotes.map((note) => ({ ...note, source: 'Invoice' })),
    ...row.event.event_notes.map((note) => ({ ...note, source: 'Meeting' })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="invoice-notes-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Invoice notes</p>
            <h2 id="invoice-notes-title" className="mt-1 text-xl font-semibold text-gray-900">{party.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{row.event.meeting_name} · {formatWholeDollars(Number(row.line.commission_amount || 0))}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close notes" className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
        </header>
        <div className="overflow-y-auto px-6 py-5">
          {notes.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">There are no notes on this invoice or meeting.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <article key={`${note.source}-${note.id}`} className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${note.source === 'Invoice' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{note.source}</span>
                    <span className="font-medium text-gray-700">{note.author_name || 'Stellina team'}</span>
                    <span className="text-gray-400">{new Date(note.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{note.body}</p>
                </article>
              ))}
            </div>
          )}
        </div>
        <footer className="flex justify-end border-t border-gray-200 bg-gray-50 px-6 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
        </footer>
      </div>
    </div>
  );
};

export default InvoiceTracker;
