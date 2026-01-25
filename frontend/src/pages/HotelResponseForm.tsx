import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { publicHotelApi } from '../services/rfpApi';
import type {
  RFPWithDetails,
  RoomNightResponseCreate,
  MeetingRoomResponseCreate,
  CustomQuestionResponseCreate,
  HotelResponseView,
} from '../types/rfp';

const HotelResponseForm: React.FC = () => {
  const { guid } = useParams<{ guid: string }>();
  const [rfp, setRfp] = useState<RFPWithDetails | null>(null);
  const [hotelInfo, setHotelInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Response state
  const [roomNightRates, setRoomNightRates] = useState<{
    [key: number]: { single?: number; double?: number };
  }>({});
  const [meetingRoomResponses, setMeetingRoomResponses] = useState<{
    [key: number]: { location?: string; fee?: number };
  }>({});
  const [questionAnswers, setQuestionAnswers] = useState<{
    [key: number]: { answer?: string; answerList?: string[] };
  }>({});
  const [comments, setComments] = useState('');

  const loadData = async () => {
    if (!guid) return;

    try {
      setLoading(true);
      const [rfpData, hotelData, responseData] = await Promise.all([
        publicHotelApi.getRFPByGuid(guid),
        publicHotelApi.getInvitationInfo(guid),
        publicHotelApi.getMyResponse(guid).catch(() => null),
      ]);

      setRfp(rfpData);
      setHotelInfo(hotelData);

      if (hotelData.is_completed) {
        setSubmitted(true);
      }

      // Pre-fill with existing responses
      if (responseData) {
        const roomRates: any = {};
        responseData.room_night_responses.forEach((r) => {
          roomRates[r.room_night_id] = {
            single: r.single_rate,
            double: r.double_rate,
          };
        });
        setRoomNightRates(roomRates);

        const meetingRooms: any = {};
        responseData.meeting_room_responses.forEach((r) => {
          meetingRooms[r.meeting_room_id] = {
            location: r.suggested_location,
            fee: r.setup_fee_per_person,
          };
        });
        setMeetingRoomResponses(meetingRooms);

        const answers: any = {};
        responseData.custom_question_responses.forEach((r) => {
          answers[r.custom_question_id] = {
            answer: r.answer,
            answerList: r.answer_list,
          };
        });
        setQuestionAnswers(answers);

        setComments(responseData.comments || '');
      }
    } catch (err) {
      console.error('Failed to load data', err);
      alert('Failed to load RFP. Please check your link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (guid) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guid]);

  const handleSave = async () => {
    if (!guid) return;

    try {
      setSaving(true);

      // Save room night responses
      for (const [roomNightId, rates] of Object.entries(roomNightRates)) {
        const response: RoomNightResponseCreate = {
          room_night_id: parseInt(roomNightId),
          single_rate: rates.single,
          double_rate: rates.double,
        };
        await publicHotelApi.saveRoomNightResponse(guid, response);
      }

      // Save meeting room responses
      for (const [meetingRoomId, data] of Object.entries(meetingRoomResponses)) {
        const response: MeetingRoomResponseCreate = {
          meeting_room_id: parseInt(meetingRoomId),
          suggested_location: data.location,
          setup_fee_per_person: data.fee,
        };
        await publicHotelApi.saveMeetingRoomResponse(guid, response);
      }

      // Save custom question responses
      for (const [questionId, data] of Object.entries(questionAnswers)) {
        const response: CustomQuestionResponseCreate = {
          custom_question_id: parseInt(questionId),
          answer: data.answer,
          answer_list: data.answerList,
        };
        await publicHotelApi.saveCustomQuestionResponse(guid, response);
      }

      // Save comments
      await publicHotelApi.saveComments(guid, comments);

      alert('Progress saved successfully!');
    } catch (err) {
      console.error('Failed to save', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!guid) return;

    // Validate required questions
    if (rfp?.custom_questions) {
      for (const q of rfp.custom_questions) {
        if (q.is_required) {
          const answer = questionAnswers[q.id];
          if (!answer?.answer && !answer?.answerList?.length) {
            alert(`Please answer the required question: ${q.question_text}`);
            return;
          }
        }
      }
    }

    if (!window.confirm('Are you sure you want to submit? You cannot edit after submission.')) {
      return;
    }

    try {
      setSaving(true);
      await handleSave(); // Save all changes first
      await publicHotelApi.submitResponse(guid);
      setSubmitted(true);
      alert('Response submitted successfully!');
    } catch (err) {
      console.error('Failed to submit', err);
      alert('Failed to submit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!rfp || !hotelInfo) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center text-red-600">Invalid or expired link</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
          <strong>Thank you!</strong> Your response has been submitted successfully.
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Response Summary</h2>
          <p>Your response for <strong>{rfp.client_name}</strong> has been recorded.</p>
          <p className="mt-2 text-gray-600">
            If you need to make changes, please contact the RFP organizer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">RFP Response Form</h1>
        <p className="text-gray-600 mt-2">
          <strong>Hotel:</strong> {hotelInfo.hotel_name} | <strong>Contact:</strong>{' '}
          {hotelInfo.contact_name}
        </p>
        <p className="text-gray-600">
          <strong>Client:</strong> {rfp.client_name} | <strong>Event Dates:</strong>{' '}
          {new Date(rfp.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - {new Date(rfp.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        {rfp.instructions && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="font-semibold text-blue-900 mb-2">Instructions for Hoteliers</h3>
            <p className="text-blue-800 whitespace-pre-line">{rfp.instructions}</p>
          </div>
        )}
      </div>

      {/* Room Nights */}
      {rfp.room_nights.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Room Night Rates</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Single Rooms Needed
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Single Rate ($)
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Double Rooms Needed
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Double Rate ($)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rfp.room_nights.map((rn) => (
                  <tr key={rn.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {new Date(rn.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">{rn.single_occupancy}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={roomNightRates[rn.id]?.single || ''}
                        onChange={(e) =>
                          setRoomNightRates({
                            ...roomNightRates,
                            [rn.id]: {
                              ...roomNightRates[rn.id],
                              single: parseFloat(e.target.value) || undefined,
                            },
                          })
                        }
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">{rn.double_occupancy}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={roomNightRates[rn.id]?.double || ''}
                        onChange={(e) =>
                          setRoomNightRates({
                            ...roomNightRates,
                            [rn.id]: {
                              ...roomNightRates[rn.id],
                              double: parseFloat(e.target.value) || undefined,
                            },
                          })
                        }
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Meeting Rooms */}
      {rfp.meeting_rooms.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Meeting Rooms</h2>
          {rfp.meeting_rooms.map((mr) => (
            <div key={mr.id} className="border-b pb-4 mb-4 last:border-b-0">
              <div className="mb-2">
                <h3 className="font-medium text-lg">{mr.title}</h3>
                <p className="text-sm text-gray-600">
                  Date: {new Date(mr.date).toLocaleDateString()} | Attendees:{' '}
                  {mr.num_people}
                </p>
                {mr.description && (
                  <p className="text-sm text-gray-600 mt-1">{mr.description}</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Suggested Location
                  </label>
                  <input
                    type="text"
                    value={meetingRoomResponses[mr.id]?.location || ''}
                    onChange={(e) =>
                      setMeetingRoomResponses({
                        ...meetingRoomResponses,
                        [mr.id]: {
                          ...meetingRoomResponses[mr.id],
                          location: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="e.g., Grand Ballroom"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Setup Fee (per person) ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={meetingRoomResponses[mr.id]?.fee || ''}
                    onChange={(e) =>
                      setMeetingRoomResponses({
                        ...meetingRoomResponses,
                        [mr.id]: {
                          ...meetingRoomResponses[mr.id],
                          fee: parseFloat(e.target.value) || undefined,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom Questions */}
      {rfp.custom_questions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Additional Questions</h2>
          {rfp.custom_questions.map((q) => (
            <div key={q.id} className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {q.question_text}
                {q.is_required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {q.question_type === 'textfield' && (
                <input
                  type="text"
                  value={questionAnswers[q.id]?.answer || ''}
                  onChange={(e) =>
                    setQuestionAnswers({
                      ...questionAnswers,
                      [q.id]: { answer: e.target.value },
                    })
                  }
                  required={q.is_required}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              )}

              {q.question_type === 'textarea' && (
                <textarea
                  value={questionAnswers[q.id]?.answer || ''}
                  onChange={(e) =>
                    setQuestionAnswers({
                      ...questionAnswers,
                      [q.id]: { answer: e.target.value },
                    })
                  }
                  required={q.is_required}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              )}

              {q.question_type === 'yes_no' && (
                <select
                  value={questionAnswers[q.id]?.answer || ''}
                  onChange={(e) =>
                    setQuestionAnswers({
                      ...questionAnswers,
                      [q.id]: { answer: e.target.value },
                    })
                  }
                  required={q.is_required}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              )}

              {q.question_type === 'select' && (
                <select
                  value={questionAnswers[q.id]?.answer || ''}
                  onChange={(e) =>
                    setQuestionAnswers({
                      ...questionAnswers,
                      [q.id]: { answer: e.target.value },
                    })
                  }
                  required={q.is_required}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select...</option>
                  {q.options?.map((opt, idx) => (
                    <option key={idx} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}

              {q.question_type === 'multiselect' && (
                <div className="space-y-2">
                  {q.options?.map((opt, idx) => (
                    <label key={idx} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={
                          questionAnswers[q.id]?.answerList?.includes(opt) || false
                        }
                        onChange={(e) => {
                          const current = questionAnswers[q.id]?.answerList || [];
                          const newList = e.target.checked
                            ? [...current, opt]
                            : current.filter((o) => o !== opt);
                          setQuestionAnswers({
                            ...questionAnswers,
                            [q.id]: { answerList: newList },
                          });
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Comments */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Additional Comments</h2>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Any additional information or comments..."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {saving ? 'Saving...' : 'Save Progress'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
        >
          {saving ? 'Submitting...' : 'Submit Final Response'}
        </button>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        <p>
          <strong>Note:</strong> You can save your progress and return to this form later.
          Once you submit your final response, you will not be able to make further changes.
        </p>
      </div>
    </div>
  );
};

export default HotelResponseForm;
