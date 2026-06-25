import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { siteSelectionApi } from '../services/siteSelectionApi';
import type { SiteSelectionFormSummary } from '../types/siteSelection';
import { parseLocalDate } from '../utils/date';

const fmtDateRange = (start?: string | null, end?: string | null): string => {
  if (!start && !end) return '-';
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const s = start ? parseLocalDate(start).toLocaleDateString('en-US', options) : '-';
  const e = end ? parseLocalDate(end).toLocaleDateString('en-US', options) : '-';
  return `${s} - ${e}`;
};

const publicUrl = (guid: string) => `${window.location.origin}/site-selection/${guid}`;

const SiteSelectionList: React.FC = () => {
  const navigate = useNavigate();
  const [forms, setForms] = useState<SiteSelectionFormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadForms = async () => {
    try {
      setLoading(true);
      setError(null);
      setForms(await siteSelectionApi.listForms());
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load site selection forms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  const copyLink = async (guid: string) => {
    await navigator.clipboard.writeText(publicUrl(guid));
  };

  const deleteForm = async (form: SiteSelectionFormSummary) => {
    if (!window.confirm(`Delete ${form.title}?`)) return;
    await siteSelectionApi.deleteForm(form.id);
    await loadForms();
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto p-6 text-center">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Site Selection Forms</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Client questionnaires attached to bookings and hotel candidates.
        </p>
      </div>

      {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Form</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Booking</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hotel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dates</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {forms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No site selection forms yet. Open a booking to create one.
                </td>
              </tr>
            ) : (
              forms.map((form) => (
                <tr key={form.id}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{form.title}</div>
                    <div className="text-xs text-gray-500">Created {new Date(form.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate(`/commissions/${form.event_id}`)}
                      className="text-sm text-blue-700 hover:underline text-left"
                    >
                      {form.event_meeting_name || 'Untitled booking'}
                    </button>
                    {form.event_client_company_name && (
                      <div className="text-xs text-gray-500">{form.event_client_company_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{form.hotel_name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {fmtDateRange(form.event_arrival_date, form.event_depart_date)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      form.submitted_at ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {form.submitted_at ? 'Submitted' : 'Open'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm whitespace-nowrap">
                    <button onClick={() => navigate(`/site-selection/${form.id}/responses`)} className="text-blue-700 hover:text-blue-900 mr-4">Answers</button>
                    <button onClick={() => navigate(`/site-selection/${form.id}/edit`)} className="text-indigo-600 hover:text-indigo-900 mr-4">Edit</button>
                    <button onClick={() => copyLink(form.guid)} className="text-emerald-700 hover:text-emerald-900 mr-4">Copy Link</button>
                    <button onClick={() => deleteForm(form)} className="text-red-600 hover:text-red-900">Delete</button>
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

export default SiteSelectionList;
