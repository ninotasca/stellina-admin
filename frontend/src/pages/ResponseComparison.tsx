import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rfpApi, hotelInvitationApi } from '../services/rfpApi';
import type { HotelResponseView, RFPWithDetails } from '../types/rfp';

const ResponseComparison: React.FC = () => {
  const { rfpId } = useParams<{ rfpId: string }>();
  const navigate = useNavigate();
  const [rfp, setRfp] = useState<RFPWithDetails | null>(null);
  const [responses, setResponses] = useState<HotelResponseView[]>([]);
  const [selectedHotels, setSelectedHotels] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (rfpId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfpId]);

  const loadData = async () => {
    if (!rfpId) return;

    try {
      setLoading(true);
      const [rfpData, responsesData] = await Promise.all([
        rfpApi.getRFP(parseInt(rfpId)),
        hotelInvitationApi.getAllResponses(parseInt(rfpId)),
      ]);

      setRfp(rfpData);
      setResponses(responsesData.filter((r) => r.invitation.completed_at));
      
      // Select all hotels by default
      setSelectedHotels(
        new Set(responsesData.filter((r) => r.invitation.completed_at).map((r) => r.invitation.id))
      );
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleHotel = (hotelId: number) => {
    const newSelected = new Set(selectedHotels);
    if (newSelected.has(hotelId)) {
      newSelected.delete(hotelId);
    } else {
      newSelected.add(hotelId);
    }
    setSelectedHotels(newSelected);
  };

  const exportToCSV = () => {
    if (!rfp) return;

    const filteredResponses = responses.filter((r) =>
      selectedHotels.has(r.invitation.id)
    );

    if (filteredResponses.length === 0) {
      alert('No hotels selected for export');
      return;
    }

    // Build CSV
    let csv = '';

    // Header row
    csv += 'Category,Item,' + filteredResponses.map((r) => r.invitation.hotel_name).join(',') + '\n';

    // Room nights
    rfp.room_nights.forEach((rn) => {
      const date = new Date(rn.date).toLocaleDateString();
      
      // Single rates
      csv += `Room Nights,${date} - Single (${rn.single_occupancy} rooms),`;
      csv += filteredResponses
        .map((r) => {
          const resp = r.room_night_responses.find((rnr) => rnr.room_night_id === rn.id);
          return resp?.single_rate || '';
        })
        .join(',');
      csv += '\n';

      // Double rates
      csv += `Room Nights,${date} - Double (${rn.double_occupancy} rooms),`;
      csv += filteredResponses
        .map((r) => {
          const resp = r.room_night_responses.find((rnr) => rnr.room_night_id === rn.id);
          return resp?.double_rate || '';
        })
        .join(',');
      csv += '\n';
    });

    // Meeting rooms
    rfp.meeting_rooms.forEach((mr) => {
      const date = new Date(mr.date).toLocaleDateString();
      
      // Location
      csv += `Meeting Rooms,"${mr.title} (${date}) - Location",`;
      csv += filteredResponses
        .map((r) => {
          const resp = r.meeting_room_responses.find((mrr) => mrr.meeting_room_id === mr.id);
          return `"${resp?.suggested_location || ''}"`;
        })
        .join(',');
      csv += '\n';

      // Setup fee
      csv += `Meeting Rooms,"${mr.title} (${date}) - Setup Fee",`;
      csv += filteredResponses
        .map((r) => {
          const resp = r.meeting_room_responses.find((mrr) => mrr.meeting_room_id === mr.id);
          return resp?.setup_fee_per_person || '';
        })
        .join(',');
      csv += '\n';
    });

    // Custom questions
    rfp.custom_questions.forEach((q) => {
      csv += `Custom Questions,"${q.question_text.replace(/"/g, '""')}",`;
      csv += filteredResponses
        .map((r) => {
          const resp = r.custom_question_responses.find((qr) => qr.custom_question_id === q.id);
          if (resp?.answer_list) {
            return `"${resp.answer_list.join('; ')}"`;
          }
          return `"${resp?.answer || ''}"`;
        })
        .join(',');
      csv += '\n';
    });

    // Comments
    csv += 'Comments,Additional Comments,';
    csv += filteredResponses
      .map((r) => `"${r.comments || ''}"`)
      .join(',');
    csv += '\n';

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rfp-comparison-${rfp.client_name}-${Date.now()}.csv`;
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

  if (!rfp) {
    return (
      <div className="max-w-full mx-auto p-6">
        <div className="text-center">RFP not found</div>
      </div>
    );
  }

  const filteredResponses = responses.filter((r) => selectedHotels.has(r.invitation.id));

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
              {rfp.client_name} - {new Date(rfp.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - {new Date(rfp.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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

      {/* Hotel Selection */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Select Hotels to Compare</h2>
        <div className="flex flex-wrap gap-3">
          {responses.map((r) => (
            <label key={r.invitation.id} className="flex items-center">
              <input
                type="checkbox"
                checked={selectedHotels.has(r.invitation.id)}
                onChange={() => toggleHotel(r.invitation.id)}
                className="mr-2"
              />
              <span className="text-sm font-medium">{r.invitation.hotel_name}</span>
            </label>
          ))}
        </div>
      </div>

      {filteredResponses.length === 0 ? (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          No hotels selected or no completed responses available.
        </div>
      ) : (
        <>
          {/* Room Nights Comparison */}
          {rfp.room_nights.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold">Room Night Rates</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                      Type
                    </th>
                    {filteredResponses.map((r) => (
                      <th
                        key={r.invitation.id}
                        className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                      >
                        {r.invitation.hotel_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rfp.room_nights.map((rn) => (
                    <React.Fragment key={rn.id}>
                      <tr className="bg-gray-50">
                        <td
                          rowSpan={2}
                          className="px-4 py-3 text-sm font-medium text-gray-900"
                        >
                          {new Date(rn.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Single ({rn.single_occupancy} rooms)
                        </td>
                        {filteredResponses.map((r) => {
                          const resp = r.room_night_responses.find(
                            (rnr) => rnr.room_night_id === rn.id
                          );
                          return (
                            <td key={r.invitation.id} className="px-4 py-3 text-sm">
                              {resp?.single_rate
                                ? `$${resp.single_rate.toFixed(2)}`
                                : '-'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Double ({rn.double_occupancy} rooms)
                        </td>
                        {filteredResponses.map((r) => {
                          const resp = r.room_night_responses.find(
                            (rnr) => rnr.room_night_id === rn.id
                          );
                          return (
                            <td key={r.invitation.id} className="px-4 py-3 text-sm">
                              {resp?.double_rate
                                ? `$${resp.double_rate.toFixed(2)}`
                                : '-'}
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

          {/* Meeting Rooms Comparison */}
          {rfp.meeting_rooms.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold">Meeting Rooms</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                      Meeting
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                      Info
                    </th>
                    {filteredResponses.map((r) => (
                      <th
                        key={r.invitation.id}
                        className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                      >
                        {r.invitation.hotel_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rfp.meeting_rooms.map((mr) => (
                    <React.Fragment key={mr.id}>
                      <tr className="bg-gray-50">
                        <td
                          rowSpan={2}
                          className="px-4 py-3 text-sm font-medium text-gray-900"
                        >
                          <div>{mr.title}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(mr.date).toLocaleDateString()} | {mr.num_people}{' '}
                            people
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">Location</td>
                        {filteredResponses.map((r) => {
                          const resp = r.meeting_room_responses.find(
                            (mrr) => mrr.meeting_room_id === mr.id
                          );
                          return (
                            <td key={r.invitation.id} className="px-4 py-3 text-sm">
                              {resp?.suggested_location || '-'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Setup Fee (per person)
                        </td>
                        {filteredResponses.map((r) => {
                          const resp = r.meeting_room_responses.find(
                            (mrr) => mrr.meeting_room_id === mr.id
                          );
                          return (
                            <td key={r.invitation.id} className="px-4 py-3 text-sm">
                              {resp?.setup_fee_per_person
                                ? `$${resp.setup_fee_per_person.toFixed(2)}`
                                : '-'}
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

          {/* Custom Questions Comparison */}
          {rfp.custom_questions.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold">Custom Questions</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                      Question
                    </th>
                    {filteredResponses.map((r) => (
                      <th
                        key={r.invitation.id}
                        className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                      >
                        {r.invitation.hotel_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rfp.custom_questions.map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {q.question_text}
                        {q.is_required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </td>
                      {filteredResponses.map((r) => {
                        const resp = r.custom_question_responses.find(
                          (qr) => qr.custom_question_id === q.id
                        );
                        return (
                          <td key={r.invitation.id} className="px-4 py-3 text-sm">
                            {resp?.answer_list
                              ? resp.answer_list.join(', ')
                              : resp?.answer || '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Comments Comparison */}
          <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
            <div className="p-4 border-b">
              <h2 className="text-xl font-semibold">Additional Comments</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {filteredResponses.map((r) => (
                    <th
                      key={r.invitation.id}
                      className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                    >
                      {r.invitation.hotel_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {filteredResponses.map((r) => (
                    <td
                      key={r.invitation.id}
                      className="px-4 py-3 text-sm align-top"
                    >
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
