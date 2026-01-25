import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rfpApi } from '../services/rfpApi';
import type {
  RFPCreate,
  RoomNightCreate,
  MeetingRoomCreate,
  CustomQuestionCreate,
} from '../types/rfp';

const RFPForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // Basic RFP Info
  const [clientName, setClientName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datesFixed, setDatesFixed] = useState(true);
  const [rfpType, setRfpType] = useState('All Inclusive - Standard');
  const [instructions, setInstructions] = useState('');

  // Room Nights
  const [roomNights, setRoomNights] = useState<
    Array<{ date: string; single: string; double: string; id?: number }>
  >([]);

  // Meeting Rooms
  const [meetingRooms, setMeetingRooms] = useState<
    Array<{
      date: string;
      title: string;
      description: string;
      numPeople: string;
      id?: number;
    }>
  >([]);

  // Custom Questions
  const [customQuestions, setCustomQuestions] = useState<
    Array<{
      questionText: string;
      isRequired: boolean;
      questionType: string;
      options: string[];
      id?: number;
    }>
  >([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load RFP if editing
  useEffect(() => {
    if (isEditMode && id) {
      loadRFP(parseInt(id));
    }
  }, [id, isEditMode]);

  const loadRFP = async (rfpId: number) => {
    try {
      setLoading(true);
      const rfp = await rfpApi.getRFP(rfpId);
      setClientName(rfp.client_name);
      setStartDate(rfp.start_date);
      setEndDate(rfp.end_date);
      setDatesFixed(rfp.dates_fixed);
      setRfpType(rfp.rfp_type);
      setInstructions(rfp.instructions || '');

      setRoomNights(
        rfp.room_nights.map((rn) => ({
          date: rn.date,
          single: rn.single_occupancy.toString(),
          double: rn.double_occupancy.toString(),
          id: rn.id,
        }))
      );

      setMeetingRooms(
        rfp.meeting_rooms.map((mr) => ({
          date: mr.date,
          title: mr.title,
          description: mr.description || '',
          numPeople: mr.num_people.toString(),
          id: mr.id,
        }))
      );

      setCustomQuestions(
        rfp.custom_questions.map((q) => ({
          questionText: q.question_text,
          isRequired: q.is_required,
          questionType: q.question_type,
          options: q.options || [],
          id: q.id,
        }))
      );
    } catch (err) {
      setError('Failed to load RFP');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate room nights when dates change
  useEffect(() => {
    if (startDate && endDate && new Date(startDate) <= new Date(endDate)) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const nights = [];
      const current = new Date(start);
      
      while (current <= end) {
        nights.push({
          date: current.toISOString().split('T')[0],
          single: '',
          double: '',
        });
        current.setDate(current.getDate() + 1);
      }
      
      setRoomNights(nights);
    }
  }, [startDate, endDate]);

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const rfpData: RFPCreate = {
        client_name: clientName,
        start_date: startDate,
        end_date: endDate,
        dates_fixed: datesFixed,
        rfp_type: rfpType,
        instructions: instructions || undefined,
      };

      let rfpId: number;

      if (isEditMode && id) {
        // Update RFP
        await rfpApi.updateRFP(parseInt(id), rfpData);
        rfpId = parseInt(id);
      } else {
        // Create RFP
        const newRfp = await rfpApi.createRFP(rfpData);
        rfpId = newRfp.id;
      }

      // Save room nights
      for (const rn of roomNights) {
        if (rn.date) {
          const single = parseInt(rn.single) || 0;
          const double = parseInt(rn.double) || 0;
          
          const roomNightData: RoomNightCreate = {
            date: rn.date,
            single_occupancy: single,
            double_occupancy: double,
          };

          if (rn.id) {
            await rfpApi.updateRoomNight(rn.id, roomNightData);
          } else {
            await rfpApi.addRoomNight(rfpId, roomNightData);
          }
        }
      }

      // Save meeting rooms
      for (const mr of meetingRooms) {
        if (mr.title) {
          const numPeople = parseInt(mr.numPeople) || 0;
          
          const meetingRoomData: MeetingRoomCreate = {
            date: mr.date,
            title: mr.title,
            description: mr.description || undefined,
            num_people: numPeople,
          };

          if (mr.id) {
            await rfpApi.updateMeetingRoom(mr.id, meetingRoomData);
          } else {
            await rfpApi.addMeetingRoom(rfpId, meetingRoomData);
          }
        }
      }

      // Save custom questions
      for (let i = 0; i < customQuestions.length; i++) {
        const q = customQuestions[i];
        if (q.questionText) {
          const questionData: CustomQuestionCreate = {
            question_text: q.questionText,
            is_required: q.isRequired,
            question_type: q.questionType as any,
            options:
              q.questionType === 'select' || q.questionType === 'multiselect'
                ? q.options
                : undefined,
          };

          if (q.id) {
            await rfpApi.updateCustomQuestion(q.id, questionData);
          } else {
            await rfpApi.addCustomQuestion(rfpId, questionData, i);
          }
        }
      }

      navigate('/rfps');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save RFP');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Event Date handlers - removed

  // Room Night handlers - simplified
  const addRoomNight = () =>
    setRoomNights([...roomNights, { date: '', single: '', double: '' }]);
  const removeRoomNight = (index: number) =>
    setRoomNights(roomNights.filter((_, i) => i !== index));

  // Meeting Room handlers
  const addMeetingRoom = () =>
    setMeetingRooms([
      ...meetingRooms,
      { date: startDate || '', title: '', description: '', numPeople: '' },
    ]);
  const removeMeetingRoom = (index: number) =>
    setMeetingRooms(meetingRooms.filter((_, i) => i !== index));

  // Custom Question handlers
  const addCustomQuestion = () =>
    setCustomQuestions([
      ...customQuestions,
      {
        questionText: '',
        isRequired: false,
        questionType: 'textfield',
        options: [],
      },
    ]);
  const removeCustomQuestion = (index: number) =>
    setCustomQuestions(customQuestions.filter((_, i) => i !== index));

  if (loading && isEditMode) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {isEditMode ? 'Edit RFP' : 'Create New RFP'}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>
      )}

      {/* Basic Information */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Basic Information</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Name *
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date *
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Are Event Dates Fixed? *
            </label>
            <select
              value={datesFixed ? 'fixed' : 'negotiable'}
              onChange={(e) => setDatesFixed(e.target.value === 'fixed')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="fixed">Fixed</option>
              <option value="negotiable">Negotiable</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RFP Type *
            </label>
            <select
              value={rfpType}
              onChange={(e) => setRfpType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="All Inclusive - Standard">All Inclusive - Standard</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instructions for Hoteliers
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Room Nights */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Room Nights</h2>
        {roomNights.map((rn, index) => (
          <div key={index} className="border-b pb-4 mb-4 last:border-b-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={rn.date}
                  onChange={(e) => {
                    const newRoomNights = [...roomNights];
                    newRoomNights[index].date = e.target.value;
                    setRoomNights(newRoomNights);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Single Occupancy
                </label>
                <input
                  type="text"
                  value={rn.single}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      const newRoomNights = [...roomNights];
                      newRoomNights[index].single = value;
                      setRoomNights(newRoomNights);
                    }
                  }}
                  placeholder=""
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Double Occupancy
                </label>
                <input
                  type="text"
                  value={rn.double}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      const newRoomNights = [...roomNights];
                      newRoomNights[index].double = value;
                      setRoomNights(newRoomNights);
                    }
                  }}
                  placeholder=""
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => removeRoomNight(index)}
                  className="w-full px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addRoomNight}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Add Room Night
        </button>
      </div>

      {/* Meeting Rooms */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Meeting Rooms</h2>
        {meetingRooms.map((mr, index) => (
          <div key={index} className="border-b pb-4 mb-4 last:border-b-0">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={mr.date}
                  onChange={(e) => {
                    const newMeetingRooms = [...meetingRooms];
                    newMeetingRooms[index].date = e.target.value;
                    setMeetingRooms(newMeetingRooms);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={mr.title}
                  onChange={(e) => {
                    const newMeetingRooms = [...meetingRooms];
                    newMeetingRooms[index].title = e.target.value;
                    setMeetingRooms(newMeetingRooms);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of People
                </label>
                <input
                  type="text"
                  value={mr.numPeople}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      const newMeetingRooms = [...meetingRooms];
                      newMeetingRooms[index].numPeople = value;
                      setMeetingRooms(newMeetingRooms);
                    }
                  }}
                  placeholder=""
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={mr.description}
                  onChange={(e) => {
                    const newMeetingRooms = [...meetingRooms];
                    newMeetingRooms[index].description = e.target.value;
                    setMeetingRooms(newMeetingRooms);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => removeMeetingRoom(index)}
                  className="w-full px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addMeetingRoom}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Add Meeting Room
        </button>
      </div>

      {/* Custom Questions */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Custom Questions</h2>
        {customQuestions.map((q, index) => (
          <div key={index} className="border-b pb-4 mb-4 last:border-b-0">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Question Text
                </label>
                <input
                  type="text"
                  value={q.questionText}
                  onChange={(e) => {
                    const newQuestions = [...customQuestions];
                    newQuestions[index].questionText = e.target.value;
                    setCustomQuestions(newQuestions);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Question Type
                  </label>
                  <select
                    value={q.questionType}
                    onChange={(e) => {
                      const newQuestions = [...customQuestions];
                      newQuestions[index].questionType = e.target.value;
                      setCustomQuestions(newQuestions);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="textfield">Text Field</option>
                    <option value="textarea">Text Area</option>
                    <option value="yes_no">Yes/No</option>
                    <option value="select">Select from List</option>
                    <option value="multiselect">Multi-Select from List</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={q.isRequired}
                      onChange={(e) => {
                        const newQuestions = [...customQuestions];
                        newQuestions[index].isRequired = e.target.checked;
                        setCustomQuestions(newQuestions);
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Required
                    </span>
                  </label>
                </div>
              </div>
              {(q.questionType === 'select' || q.questionType === 'multiselect') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={q.options.join(', ')}
                    onChange={(e) => {
                      const newQuestions = [...customQuestions];
                      newQuestions[index].options = e.target.value
                        .split(',')
                        .map((o) => o.trim())
                        .filter((o) => o);
                      setCustomQuestions(newQuestions);
                    }}
                    placeholder="Option 1, Option 2, Option 3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              )}
            </div>
            <button
              onClick={() => removeCustomQuestion(index)}
              className="mt-2 px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Remove Question
            </button>
          </div>
        ))}
        <button
          onClick={addCustomQuestion}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Add Question
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
        >
          {loading ? 'Saving...' : isEditMode ? 'Update RFP' : 'Create RFP'}
        </button>
        <button
          onClick={() => navigate('/rfps')}
          className="px-6 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default RFPForm;
