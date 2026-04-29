import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { rfpApi } from '../services/rfpApi';
import type { RFPWithEventSummary } from '../types/rfp';
import { parseLocalDate } from '../utils/date';

const fmtDateRange = (start?: string | null, end?: string | null): string => {
  if (!start && !end) return '—';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const s = start ? parseLocalDate(start).toLocaleDateString('en-US', opts) : '—';
  const e = end ? parseLocalDate(end).toLocaleDateString('en-US', opts) : '—';
  return `${s} – ${e}`;
};

const RFPList: React.FC = () => {
  const navigate = useNavigate();
  const [rfps, setRfps] = useState<RFPWithEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRFPs();
  }, []);

  const loadRFPs = async () => {
    try {
      setLoading(true);
      const data = await rfpApi.listRFPs();
      setRfps(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load RFPs');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this RFP?')) {
      return;
    }
    try {
      await rfpApi.deleteRFP(id);
      loadRFPs();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete RFP');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">RFPs</h1>
        <p className="text-gray-600 mt-1 text-sm">
          RFPs are created from a commission event. Open an event to start one.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Event
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trip Dates
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                RFP Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Responses
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rfps.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No RFPs yet. Open a commission event and start an RFP from there.
                </td>
              </tr>
            ) : (
              rfps.map((rfp) => (
                <tr key={rfp.id}>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate(`/commissions/${rfp.event_id}`)}
                      className="text-sm font-medium text-blue-700 hover:underline text-left"
                    >
                      {rfp.event_meeting_name || <em className="text-gray-400">Untitled event</em>}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {rfp.event_client_company_name || <em className="text-gray-400">—</em>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {fmtDateRange(rfp.event_arrival_date, rfp.event_depart_date)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{rfp.rfp_type}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {rfp.completed_count} / {rfp.invitation_count}
                    </div>
                    <div className="text-xs text-gray-500">
                      {rfp.invitation_count === 0 ? 'No invites' : 'completed'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(rfp.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => navigate(`/rfps/${rfp.id}/edit`)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => navigate(`/rfps/${rfp.id}/invitations`)}
                      className="text-green-600 hover:text-green-900 mr-4"
                    >
                      Invitations
                    </button>
                    <button
                      onClick={() => navigate(`/rfps/${rfp.id}/responses`)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Responses
                    </button>
                    <button
                      onClick={() => handleDelete(rfp.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RFPList;
