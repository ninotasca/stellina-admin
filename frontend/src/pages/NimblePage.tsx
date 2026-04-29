import React, { useEffect, useState } from 'react';
import { nimbleApi, nimbleEntityUrl, type NimbleContact, type NimbleDeal, type NimbleListResponse, type NimbleRecordType } from '../services/nimbleApi';
import { parseLocalDate } from '../utils/date';

type Tab = 'all' | 'person' | 'company' | 'deals';

const PER_PAGE = 30;

// Pull the first non-empty value from a Nimble fields[key] array
const fv = (c: NimbleContact, key: string): string => {
  const arr = c.fields?.[key];
  if (!arr || arr.length === 0) return '';
  return arr[0]?.value || '';
};

const personName = (c: NimbleContact): string => {
  const first = fv(c, 'first name');
  const last = fv(c, 'last name');
  const full = `${first} ${last}`.trim();
  return full || fv(c, 'email') || '(unnamed person)';
};

const companyName = (c: NimbleContact): string => fv(c, 'company name') || fv(c, 'name') || '(unnamed company)';

const displayName = (c: NimbleContact): string =>
  c.record_type === 'company' ? companyName(c) : personName(c);

const NimblePage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState<NimbleListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NimbleContact | null>(null);
  const [deals, setDeals] = useState<NimbleDeal[] | null>(null);
  const [dealsTotal, setDealsTotal] = useState(0);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState<string | null>(null);

  // Load deals once when the tab is first opened.
  useEffect(() => {
    if (tab !== 'deals' || deals !== null) return;
    let cancelled = false;
    (async () => {
      setDealsLoading(true); setDealsError(null);
      try {
        const out: NimbleDeal[] = [];
        let p = 1;
        while (true) {
          const res = await nimbleApi.listDeals({ page: p, per_page: 100 });
          out.push(...res.deals);
          if (p === 1) setDealsTotal(res.meta.total);
          if (!res.meta.has_more || p >= res.meta.pages) break;
          p += 1;
        }
        if (!cancelled) setDeals(out);
      } catch (e: any) {
        if (!cancelled) setDealsError(e.response?.data?.detail || e.message || 'Failed to load deals');
      } finally {
        if (!cancelled) setDealsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, deals]);

  // Load contacts whenever filters/page change — but not while on the Deals tab.
  useEffect(() => {
    if (tab === 'deals') return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await nimbleApi.listContacts({
          record_type: tab as NimbleRecordType, page, per_page: PER_PAGE, q: query || undefined,
        });
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setError(e.response?.data?.detail || e.message || 'Failed to load contacts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, page, query]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  };

  const onTabChange = (t: Tab) => {
    setPage(1);
    setTab(t);
  };

  return (
    <div>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Nimble CRM</h1>
          <span className="text-xs text-gray-400 hidden sm:inline">live · read-only</span>
        </div>
        <a href="https://app.nimble.com" target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">Open Nimble ↗</a>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Tabs + search controls */}
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex gap-1 bg-gray-100 rounded-md p-1">
            {(['all', 'person', 'company', 'deals'] as Tab[]).map((t) => (
              <button key={t} onClick={() => onTabChange(t)}
                className={`px-3 py-1.5 text-sm rounded ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-800'}`}>
                {t === 'all' ? 'All' : t === 'person' ? 'People' : t === 'company' ? 'Companies' : 'Deals'}
              </button>
            ))}
          </div>
          {tab !== 'deals' && (
            <form onSubmit={onSearchSubmit} className="flex-1 flex gap-2">
              <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search Nimble (name, email, company…)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm" />
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Search</button>
              {query && (
                <button type="button" onClick={() => { setSearchInput(''); setQuery(''); setPage(1); }}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">Clear</button>
              )}
            </form>
          )}
          {tab !== 'deals' && data && (
            <div className="text-sm text-gray-500 whitespace-nowrap">
              {data.meta.total.toLocaleString()} total · page {data.meta.page} of {data.meta.pages}
            </div>
          )}
          {tab === 'deals' && deals && (
            <div className="text-sm text-gray-500 whitespace-nowrap ml-auto">
              {dealsTotal.toLocaleString()} total
            </div>
          )}
        </div>

        {tab !== 'deals' && error && <div className="p-4 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
        {tab === 'deals' && dealsError && <div className="p-4 bg-red-100 text-red-700 rounded-md text-sm">{dealsError}</div>}

        {tab === 'deals' ? (
          <DealsTable deals={deals} loading={dealsLoading} />
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Name</Th>
                    <Th>Type</Th>
                    <Th>Email</Th>
                    <Th>Phone</Th>
                    <Th>Title / Company</Th>
                    <Th>Tags</Th>
                    <Th right>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading && (!data || data.resources.length === 0) ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">Loading…</td></tr>
                  ) : !data || data.resources.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">No contacts found.</td></tr>
                  ) : data.resources.map((c) => {
                    const titleOrCompany = c.record_type === 'person'
                      ? [fv(c, 'title'), fv(c, 'company name')].filter(Boolean).join(' · ')
                      : fv(c, 'url') || '';
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {c.avatar_url ? (
                              <img src={c.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600">
                                {displayName(c).charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium text-gray-900">{displayName(c)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            c.record_type === 'company' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {c.record_type === 'company' ? 'Company' : 'Person'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{fv(c, 'email')}</td>
                        <td className="px-3 py-2 text-gray-700">{fv(c, 'phone')}</td>
                        <td className="px-3 py-2 text-gray-700">{titleOrCompany}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {(c.tags || []).slice(0, 4).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded">{t}</span>
                            ))}
                            {(c.tags || []).length > 4 && <span className="text-[10px] text-gray-400">+{(c.tags || []).length - 4}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => setSelected(c)} className="text-blue-600 hover:underline mr-3">Details</button>
                          <a href={nimbleEntityUrl('contact', c.id)} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-700">↗</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paging */}
            {data && data.meta.pages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm">
                <span className="text-gray-500">Showing {(data.meta.page - 1) * data.meta.per_page + 1}–{Math.min(data.meta.page * data.meta.per_page, data.meta.total)} of {data.meta.total.toLocaleString()}</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1 || loading} onClick={() => setPage(1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40">« First</button>
                  <button disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40">‹ Prev</button>
                  <span className="px-2 py-1 text-gray-700">Page {page} of {data.meta.pages}</span>
                  <button disabled={page >= data.meta.pages || loading} onClick={() => setPage(page + 1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40">Next ›</button>
                  <button disabled={page >= data.meta.pages || loading} onClick={() => setPage(data.meta.pages)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40">Last »</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {selected && (
        <DetailDrawer contact={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

// ---------- Deals tab ----------

const fmtMoney = (v: string | null | undefined): string => {
  if (!v) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const fmtDealDate = (v?: string | null): string => {
  if (!v) return '—';
  return parseLocalDate(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const stageLabel = (stage: NimbleDeal['stage']): string => {
  if (!stage) return '';
  if (typeof stage === 'string') return stage;
  return stage.name || '';
};

const STATUS_TONE: Record<string, string> = {
  FUTURE: 'bg-indigo-100 text-indigo-800',
  WON: 'bg-emerald-100 text-emerald-800',
  LOST: 'bg-gray-200 text-gray-700',
  CANCELLED: 'bg-red-100 text-red-700',
  ACTIVE: 'bg-blue-100 text-blue-800',
};

interface DealsTableProps {
  deals: NimbleDeal[] | null;
  loading: boolean;
}

const DealsTable: React.FC<DealsTableProps> = ({ deals, loading }) => (
  <div className="bg-white rounded-lg shadow overflow-hidden">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Meeting</Th>
            <Th>Client</Th>
            <Th>Hotel / Resort / DMC</Th>
            <Th>Destination</Th>
            <Th>Trip Dates</Th>
            <Th right>Revenue</Th>
            <Th right>Comm %</Th>
            <Th right>Comm $</Th>
            <Th>Status</Th>
            <Th right>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {loading && !deals ? (
            <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-500">Loading…</td></tr>
          ) : !deals || deals.length === 0 ? (
            <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-500">No deals.</td></tr>
          ) : deals.map((d) => {
            const tone = (d.status && STATUS_TONE[d.status.toUpperCase()]) || 'bg-gray-100 text-gray-700';
            const dates = (d.start_date || d.end_date) ? `${fmtDealDate(d.start_date)} – ${fmtDealDate(d.end_date)}` : '—';
            return (
              <tr key={d.deal_id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{d.meeting_name || d.name}</div>
                  {stageLabel(d.stage) && (
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">
                      {d.pipeline_name ? `${d.pipeline_name} · ` : ''}{stageLabel(d.stage)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-700">{d.name || '—'}</td>
                <td className="px-3 py-2 text-gray-700">{d.hotel_resort_dmc || '—'}</td>
                <td className="px-3 py-2 text-gray-700">{d.destination || '—'}</td>
                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{dates}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtMoney(d.total_revenue)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{d.commission_pct || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{fmtMoney(d.anticipated_commission || d.amount)}</td>
                <td className="px-3 py-2">
                  {d.status && (
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${tone}`}>{d.status}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <a
                    href={nimbleEntityUrl('deal', d.deal_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-500 hover:text-gray-700"
                    title="Open in Nimble"
                  >↗</a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={`px-3 py-2 text-${right ? 'right' : 'left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>{children}</th>
);

const DetailDrawer: React.FC<{ contact: NimbleContact; onClose: () => void }> = ({ contact, onClose }) => {
  const fieldEntries = Object.entries(contact.fields || {})
    .filter(([, arr]) => arr && arr.some((e) => e.value))
    .sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg bg-white shadow-xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{displayName(contact)}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            {contact.avatar_url ? (
              <img src={contact.avatar_url} alt="" className="w-14 h-14 rounded-full" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-xl text-gray-600">
                {displayName(contact).charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                contact.record_type === 'company' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
              }`}>{contact.record_type === 'company' ? 'Company' : 'Person'}</span>
              <p className="text-xs text-gray-500 mt-1">id {contact.id}</p>
            </div>
          </div>

          {(contact.tags || []).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {(contact.tags || []).map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">{t}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Fields</h3>
            <dl className="divide-y divide-gray-100">
              {fieldEntries.map(([key, arr]) => (
                <div key={key} className="py-2 grid grid-cols-3 gap-2">
                  <dt className="text-xs text-gray-500 capitalize">{key}</dt>
                  <dd className="col-span-2 text-sm text-gray-800">
                    {arr.filter((e) => e.value).map((e, i) => (
                      <div key={i}>
                        {e.value}
                        {e.modifier && <span className="ml-2 text-xs text-gray-400">({e.modifier})</span>}
                      </div>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <a href={`https://app.nimble.com/contacts/${contact.id}`} target="_blank" rel="noreferrer"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
            Open in Nimble ↗
          </a>
        </div>
      </div>
    </div>
  );
};

export default NimblePage;
