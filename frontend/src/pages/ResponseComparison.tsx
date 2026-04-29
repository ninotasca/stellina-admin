import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rfpApi, hotelInvitationApi } from '../services/rfpApi';
import { commissionApi } from '../services/commissionApi';
import type { HotelResponseView, RFPWithDetails } from '../types/rfp';
import type { CommissionEventWithLineItems } from '../types/commission';

import { parseLocalDate } from '../utils/date';

const fmtDate = (v?: string | null) =>
  v ? parseLocalDate(v).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const ResponseComparison: React.FC = () => {
  const { rfpId } = useParams<{ rfpId: string }>();
  const navigate = useNavigate();
  const [rfp, setRfp] = useState<RFPWithDetails | null>(null);
  const [event, setEvent] = useState<CommissionEventWithLineItems | null>(null);
  const [responses, setResponses] = useState<HotelResponseView[]>([]);
  const [selectedHotels, setSelectedHotels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (rfpId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfpId]);

  const loadData = async () => {
    if (!rfpId) return;
    try {
      setLoading(true);
      const rfpData = await rfpApi.getRFP(rfpId);
      const [eventData, responsesData] = await Promise.all([
        commissionApi.getEvent(rfpData.event_id),
        hotelInvitationApi.getAllResponses(rfpId),
      ]);
      setRfp(rfpData);
      setEvent(eventData);
      const completed = responsesData.filter((r) => r.completed_at);
      setResponses(completed);
      setSelectedHotels(new Set(completed.map((r) => r.invitation_id)));
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleHotel = (invitationId: string) => {
    const next = new Set(selectedHotels);
    if (next.has(invitationId)) next.delete(invitationId);
    else next.add(invitationId);
    setSelectedHotels(next);
  };

  const exportToCSV = () => {
    if (!rfp) return;
    const filtered = responses.filter((r) => selectedHotels.has(r.invitation_id));
    if (filtered.length === 0) {
      alert('No hotels selected for export');
      return;
    }

    const rowName = (r: HotelResponseView) => r.hotel_name || 'Unknown';
    let csv = '';
    csv += 'Category,Item,' + filtered.map(rowName).join(',') + '\n';

    rfp.room_nights.forEach((rn) => {
      const date = parseLocalDate(rn.date).toLocaleDateString();
      csv += `Room Nights,${date} - Single (${rn.single_occupancy} rooms),`;
      csv += filtered
        .map((r) => {
          const resp = r.room_night_responses.find((x) => x.room_night_id === rn.id);
          return resp?.single_rate || '';
        })
        .join(',');
      csv += '\n';
      csv += `Room Nights,${date} - Double (${rn.double_occupancy} rooms),`;
      csv += filtered
        .map((r) => {
          const resp = r.room_night_responses.find((x) => x.room_night_id === rn.id);
          return resp?.double_rate || '';
        })
        .join(',');
      csv += '\n';
    });

    rfp.meeting_rooms.forEach((mr) => {
      const date = parseLocalDate(mr.date).toLocaleDateString();
      csv += `Meeting Rooms,"${mr.title} (${date}) - Location",`;
      csv += filtered
        .map((r) => {
          const resp = r.meeting_room_responses.find((x) => x.meeting_room_id === mr.id);
          return `"${resp?.suggested_location || ''}"`;
        })
        .join(',');
      csv += '\n';
      csv += `Meeting Rooms,"${mr.title} (${date}) - Setup Fee",`;
      csv += filtered
        .map((r) => {
          const resp = r.meeting_room_responses.find((x) => x.meeting_room_id === mr.id);
          return resp?.setup_fee_per_person || '';
        })
        .join(',');
      csv += '\n';
    });

    rfp.custom_questions.forEach((q) => {
      csv += `Custom Questions,"${q.question_text.replace(/"/g, '""')}",`;
      csv += filtered
        .map((r) => {
          const resp = r.custom_question_responses.find((x) => x.custom_question_id === q.id);
          if (resp?.answer_list) return `"${resp.answer_list.join('; ')}"`;
          return `"${resp?.answer || ''}"`;
        })
        .join(',');
      csv += '\n';
    });

    csv += 'Comments,Additional Comments,';
    csv += filtered.map((r) => `"${r.comments || ''}"`).join(',');
    csv += '\n';

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (event?.meeting_name || 'rfp').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `rfp-comparison-${slug}-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="max-w-full mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }
  if (!rfp || !event) {
    return (
      <div className="max-w-full mx-auto p-6">
        <div className="text-center">RFP not found</div>
      </div>
    );
  }

  const filtered = responses.filter((r) => selectedHotels.has(r.invitation_id));

  return (
    <div className="max-w-full mx-auto p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(`/rfps/${rfpId}/invitations`)}
          className="text-blue-600 hover:text-blue-800 mb-2"
        >
          ← Back to Invitations
        </button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Response Comparison</h1>
            <p className="text-gray-600 mt-1">
              {event.meeting_name}
              {' · '}
              {fmtDate(event.arrival_date)} – {fmtDate(event.depart_date)}
            </p>
          </div>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Export to Excel
          </button>
        </div>
      </div>

      {/* Hotel selection */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Select Hotels to Compare</h2>
        <div className="flex flex-wrap gap-3">
          {responses.map((r) => (
            <label key={r.invitation_id} className="flex items-center">
              <input
                type="checkbox"
                checked={selectedHotels.has(r.invitation_id)}
                onChange={() => toggleHotel(r.invitation_id)}
                className="mr-2"
              />
              <span className="text-sm font-medium">{r.hotel_name || 'Unknown'}</span>
            </label>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          No hotels selected or no completed responses available.
        </div>
      ) : (
        <>
          {/* Room Nights */}
          {rfp.room_nights.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold">Room Night Rates</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Type</th>
                    {filtered.map((r) => (
                      <th key={r.invitation_id} className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        {r.hotel_name || 'Unknown'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rfp.room_nights.map((rn) => (
                    <React.Fragment key={rn.id}>
                      <tr className="bg-gray-50">
                        <td rowSpan={2} className="px-4 py-3 text-sm font-medium text-gray-900">
                          {parseLocalDate(rn.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Single ({rn.single_occupancy} rooms)
                        </td>
                        {filtered.map((r) => {
                          const resp = r.room_night_responses.find((x) => x.room_night_id === rn.id);
                          return (
                            <td key={r.invitation_id} className="px-4 py-3 text-sm">
                              {resp?.single_rate ? `$${resp.single_rate.toFixed(2)}` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Double ({rn.double_occupancy} rooms)
                        </td>
                        {filtered.map((r) => {
                          const resp = r.room_night_responses.find((x) => x.room_night_id === rn.id);
                          return (
                            <td key={r.invitation_id} className="px-4 py-3 text-sm">
                              {resp?.double_rate ? `$${resp.double_rate.toFixed(2)}` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Meeting rooms */}
          {rfp.meeting_rooms.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold">Meeting Rooms</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Meeting</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Info</th>
                    {filtered.map((r) => (
                      <th key={r.invitation_id} className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        {r.hotel_name || 'Unknown'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rfp.meeting_rooms.map((mr) => (
                    <React.Fragment key={mr.id}>
                      <tr className="bg-gray-50">
                        <td rowSpan={2} className="px-4 py-3 text-sm font-medium text-gray-900">
                          <div>{mr.title}</div>
                          <div className="text-xs text-gray-500">
                            {parseLocalDate(mr.date).toLocaleDateString()} | {mr.num_people} people
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">Location</td>
                        {filtered.map((r) => {
                          const resp = r.meeting_room_responses.find((x) => x.meeting_room_id === mr.id);
                          return (
                            <td key={r.invitation_id} className="px-4 py-3 text-sm">
                              {resp?.suggested_location || '-'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-900">Setup Fee (per person)</td>
                        {filtered.map((r) => {
                          const resp = r.meeting_room_responses.find((x) => x.meeting_room_id === mr.id);
                          return (
                            <td key={r.invitation_id} className="px-4 py-3 text-sm">
                              {resp?.setup_fee_per_person ? `$${resp.setup_fee_per_person.toFixed(2)}` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Custom questions */}
          {rfp.custom_questions.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold">Custom Questions</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Question</th>
                    {filtered.map((r) => (
                      <th key={r.invitation_id} className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        {r.hotel_name || 'Unknown'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rfp.custom_questions.map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {q.question_text}
                        {q.is_required && <span className="text-red-500 ml-1">*</span>}
                      </td>
                      {filtered.map((r) => {
                        const resp = r.custom_question_responses.find((x) => x.custom_question_id === q.id);
                        return (
                          <td key={r.invitation_id} className="px-4 py-3 text-sm">
                            {resp?.answer_list ? resp.answer_list.join(', ') : resp?.answer || '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Comments */}
          <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
            <div className="p-4 border-b">
              <h2 className="text-xl font-semibold">Additional Comments</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {filtered.map((r) => (
                    <th key={r.invitation_id} className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                      {r.hotel_name || 'Unknown'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {filtered.map((r) => (
                    <td key={r.invitation_id} className="px-4 py-3 text-sm align-top">
                      {r.comments || <span className="text-gray-400">No comments</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default ResponseComparison;
