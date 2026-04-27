import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commissionApi, type ProjectionParams } from '../services/commissionApi';
import type { BookingStatus, ProjectionSummary } from '../types/commission';

const fmt = (v: string) => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const CommissionProjections: React.FC = () => {
  const navigate = useNavigate();
  const [grouping, setGrouping] = useState<'quarter' | 'month' | 'year'>('quarter');
  const [statuses, setStatuses] = useState<BookingStatus[]>(['definite', 'tentative', 'prospect']);
  const [wDef, setWDef] = useState(100);
  const [wTen, setWTen] = useState(50);
  const [wPro, setWPro] = useState(20);
  const [data, setData] = useState<ProjectionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const params: ProjectionParams = {
        grouping,
        statuses: statuses.length > 0 ? statuses : undefined,
        weight_definite: wDef / 100,
        weight_tentative: wTen / 100,
        weight_prospect: wPro / 100,
      };
      const res = await commissionApi.projections(params);
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load projections');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [grouping]);

  const toggleStatus = (s: BookingStatus) => {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/commissions')} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
            <h1 className="text-2xl font-bold text-gray-900">Commission Projections</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Group by</h3>
              <div className="flex gap-2">
                {(['month', 'quarter', 'year'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGrouping(g)}
                    className={`px-3 py-1.5 text-sm rounded-md border ${grouping === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Include statuses</h3>
              <div className="flex gap-2 flex-wrap">
                {(['definite', 'tentative', 'prospect'] as BookingStatus[]).map((s) => (
                  <label key={s} className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer ${statuses.includes(s) ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-500 border-gray-300'}`}>
                    <input type="checkbox" className="mr-1.5" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Probability weights (%)</h3>
              <div className="grid grid-cols-3 gap-2">
                <WeightInput label="Definite" value={wDef} onChange={setWDef} color="green" />
                <WeightInput label="Tentative" value={wTen} onChange={setWTen} color="yellow" />
                <WeightInput label="Prospect" value={wPro} onChange={setWPro} color="gray" />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Apply</button>
          </div>
        </div>

        {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Computing…</div>
        ) : data && (
          <>
            {/* Grand total cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <BigStat label="Total Commission" value={fmt(data.grand_total.commission_total)} sub="Unweighted" />
              <BigStat label="Weighted Commission" value={fmt(data.grand_total.commission_weighted)} sub="Probability-adjusted" tone="purple" />
              <BigStat label="Paid to Date" value={fmt(data.grand_total.paid_total)} tone="green" />
              <BigStat label="Outstanding" value={fmt(data.grand_total.outstanding_total)} tone="orange" />
            </div>

            {/* Buckets */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Period</Th>
                    <Th right>Lines</Th>
                    <Th right>Revenue</Th>
                    <Th right>Revenue (W)</Th>
                    <Th right>Commission</Th>
                    <Th right>Commission (W)</Th>
                    <Th right>Paid</Th>
                    <Th right>Outstanding</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.buckets.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No data for this filter set.</td></tr>
                  ) : data.buckets.map((b) => (
                    <tr key={b.period} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{b.period}</td>
                      <td className="px-3 py-2 text-right">{b.line_item_count}</td>
                      <td className="px-3 py-2 text-right">{fmt(b.revenue_total)}</td>
                      <td className="px-3 py-2 text-right text-purple-700">{fmt(b.revenue_weighted)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(b.commission_total)}</td>
                      <td className="px-3 py-2 text-right text-purple-700 font-medium">{fmt(b.commission_weighted)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmt(b.paid_total)}</td>
                      <td className="px-3 py-2 text-right text-orange-700">{fmt(b.outstanding_total)}</td>
                    </tr>
                  ))}
                </tbody>
                {data.buckets.length > 0 && (
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{data.grand_total.line_item_count}</td>
                      <td className="px-3 py-2 text-right">{fmt(data.grand_total.revenue_total)}</td>
                      <td className="px-3 py-2 text-right text-purple-700">{fmt(data.grand_total.revenue_weighted)}</td>
                      <td className="px-3 py-2 text-right">{fmt(data.grand_total.commission_total)}</td>
                      <td className="px-3 py-2 text-right text-purple-700">{fmt(data.grand_total.commission_weighted)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmt(data.grand_total.paid_total)}</td>
                      <td className="px-3 py-2 text-right text-orange-700">{fmt(data.grand_total.outstanding_total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              (W) = weighted by probability based on event booking status. Revenue/commission counted in the period of the line item's arrival date.
            </p>
          </>
        )}
      </main>
    </div>
  );
};

const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={`px-3 py-2 text-${right ? 'right' : 'left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>{children}</th>
);

const BigStat: React.FC<{ label: string; value: string; sub?: string; tone?: 'green' | 'orange' | 'purple' }> = ({ label, value, sub, tone }) => {
  const color = tone === 'green' ? 'text-green-700' : tone === 'orange' ? 'text-orange-700' : tone === 'purple' ? 'text-purple-700' : 'text-gray-900';
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
};

const WeightInput: React.FC<{ label: string; value: number; onChange: (n: number) => void; color: 'green' | 'yellow' | 'gray' }> = ({ label, value, onChange, color }) => {
  const ring = color === 'green' ? 'border-green-300' : color === 'yellow' ? 'border-yellow-300' : 'border-gray-300';
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="number" min={0} max={100}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        className={`w-full px-2 py-1.5 border ${ring} rounded text-sm`}
      />
    </div>
  );
};

export default CommissionProjections;
