import { getApiErrorMessage } from '../services/http';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rfpApi } from '../services/rfpApi';
import { commissionApi } from '../services/commissionApi';
import RichTextInput from '../components/RichTextInput';
import type {
  CustomQuestionCreate,
  CustomQuestionType,
  MeetingRoomCreate,
  RFPCreate,
  RoomNightCreate,
} from '../types/rfp';
import type { CommissionEventWithLineItems } from '../types/commission';

interface AttachmentRow {
  id: string;
  filename: string;
  size_bytes: number;
}

interface RoomNightRow {
  id?: string;
  date: string;
  single: string;
  double: string;
}

interface MeetingRoomRow {
  id?: string;
  date: string;
  title: string;
  description: string;
  numPeople: string;
}

interface CustomQuestionRow {
  id?: string;
  questionText: string;
  isRequired: boolean;
  questionType: CustomQuestionType;
  options: string[];
}

import { parseLocalDate } from '../utils/date';

const fmtDate = (v?: string | null) =>
  v ? parseLocalDate(v).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const RFPForm: React.FC = () => {
  const navigate = useNavigate();
  // Two entry points:
  //   /commissions/:eventId/rfps/new   -> create
  //   /rfps/:id/edit                   -> edit
  const { id: rfpIdParam, eventId: eventIdParam } = useParams<{ id?: string; eventId?: string }>();
  const isEditMode = !!rfpIdParam;

  const [event, setEvent] = useState<CommissionEventWithLineItems | null>(null);
  const [eventId, setEventId] = useState<string | null>(eventIdParam ?? null);

  const [rfpType, setRfpType] = useState('All Inclusive - Standard');
  const [instructions, setInstructions] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [displayCompanyName, setDisplayCompanyName] = useState('');
  const [hideCompany, setHideCompany] = useState(false);
  const [roomNights, setRoomNights] = useState<RoomNightRow[]>([]);
  const [meetingRooms, setMeetingRooms] = useState<MeetingRoomRow[]>([]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestionRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        if (isEditMode && rfpIdParam) {
          const rfp = await rfpApi.getRFP(rfpIdParam);
          if (cancelled) return;
          setEventId(rfp.event_id);
          setRfpType(rfp.rfp_type);
          setInstructions(rfp.instructions || '');
          setDisplayName(rfp.display_name || '');
          setDisplayCompanyName(rfp.display_company_name || '');
          setHideCompany(!!rfp.hide_company);
          // Load existing attachments
          try {
            const att = await rfpApi.listAttachments(rfpIdParam);
            if (!cancelled) setAttachments(att.map((a) => ({ id: a.id, filename: a.filename, size_bytes: a.size_bytes })));
          } catch { /* table may not exist yet */ }
          setRoomNights(
            rfp.room_nights.map((rn) => ({
              id: rn.id,
              date: rn.date,
              single: rn.single_occupancy.toString(),
              double: rn.double_occupancy.toString(),
            }))
          );
          setMeetingRooms(
            rfp.meeting_rooms.map((mr) => ({
              id: mr.id,
              date: mr.date,
              title: mr.title,
              description: mr.description || '',
              numPeople: mr.num_people.toString(),
            }))
          );
          setCustomQuestions(
            rfp.custom_questions.map((q) => ({
              id: q.id,
              questionText: q.question_text,
              isRequired: q.is_required,
              questionType: q.question_type,
              options: q.options || [],
            }))
          );
          const ev = await commissionApi.getEvent(rfp.event_id);
          if (!cancelled) setEvent(ev);
        } else if (eventIdParam) {
          const ev = await commissionApi.getEvent(eventIdParam);
          if (cancelled) return;
          setEvent(ev);
          // Default the display fields from the event for new RFPs
          setDisplayName(ev.meeting_name || '');
          setDisplayCompanyName(ev.client_company_name || '');
          // Auto-generate room nights for each day of the trip
          if (ev.arrival_date && ev.depart_date) {
            const start = new Date(ev.arrival_date);
            const end = new Date(ev.depart_date);
            const nights: RoomNightRow[] = [];
            const cur = new Date(start);
            while (cur <= end) {
              nights.push({
                date: cur.toISOString().split('T')[0],
                single: '',
                double: '',
              });
              cur.setDate(cur.getDate() + 1);
            }
            setRoomNights(nights);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isEditMode, rfpIdParam, eventIdParam]);

  const handleSave = async () => {
    if (!eventId) {
      setError('Missing booking reference');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      if (!displayName.trim()) {
        setError('RFP name (shown to hoteliers) is required.');
        setLoading(false);
        return;
      }

      const rfpData: RFPCreate = {
        rfp_type: rfpType,
        instructions: instructions || undefined,
        display_name: displayName.trim(),
        display_company_name: displayCompanyName.trim() || null,
        hide_company: hideCompany,
      };

      let rfpId: string;
      if (isEditMode && rfpIdParam) {
        await rfpApi.updateRFP(rfpIdParam, rfpData);
        rfpId = rfpIdParam;
      } else {
        const newRfp = await rfpApi.createRFPForEvent(eventId, rfpData);
        rfpId = newRfp.id;
      }

      for (const rn of roomNights) {
        if (!rn.date) continue;
        const data: RoomNightCreate = {
          date: rn.date,
          single_occupancy: parseInt(rn.single) || 0,
          double_occupancy: parseInt(rn.double) || 0,
        };
        if (rn.id) {
          await rfpApi.updateRoomNight(rn.id, data);
        } else {
          await rfpApi.addRoomNight(rfpId, data);
        }
      }

      for (const mr of meetingRooms) {
        if (!mr.title) continue;
        const data: MeetingRoomCreate = {
          date: mr.date,
          title: mr.title,
          description: mr.description || undefined,
          num_people: parseInt(mr.numPeople) || 0,
        };
        if (mr.id) {
          await rfpApi.updateMeetingRoom(mr.id, data);
        } else {
          await rfpApi.addMeetingRoom(rfpId, data);
        }
      }

      for (let i = 0; i < customQuestions.length; i++) {
        const q = customQuestions[i];
        if (!q.questionText) continue;
        const data: CustomQuestionCreate = {
          question_text: q.questionText,
          is_required: q.isRequired,
          question_type: q.questionType,
          options:
            q.questionType === 'select' || q.questionType === 'multiselect'
              ? q.options
              : undefined,
        };
        if (q.id) {
          await rfpApi.updateCustomQuestion(q.id, data);
        } else {
          await rfpApi.addCustomQuestion(rfpId, data, i);
        }
      }

      navigate(`/commissions/${eventId}`);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to save RFP'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addRoomNight = () =>
    setRoomNights([...roomNights, { date: '', single: '', double: '' }]);
  const removeRoomNight = (index: number) =>
    setRoomNights(roomNights.filter((_, i) => i !== index));

  const addMeetingRoom = () =>
    setMeetingRooms([
      ...meetingRooms,
      { date: event?.arrival_date || '', title: '', description: '', numPeople: '' },
    ]);
  const removeMeetingRoom = (index: number) =>
    setMeetingRooms(meetingRooms.filter((_, i) => i !== index));

  const addCustomQuestion = () =>
    setCustomQuestions([
      ...customQuestions,
      { questionText: '', isRequired: false, questionType: 'textfield', options: [] },
    ]);
  const removeCustomQuestion = (index: number) =>
    setCustomQuestions(customQuestions.filter((_, i) => i !== index));

  if (loading && isEditMode && !event) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(eventId ? `/commissions/${eventId}` : '/rfps')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {isEditMode ? 'Edit RFP' : 'New RFP'}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>
      )}

      {/* Event context (read-only) */}
      {event && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Commission Booking</div>
          <div className="text-lg font-semibold text-gray-900">{event.meeting_name}</div>
          <div className="text-sm text-gray-700 mt-1">
            {event.client_company_name || <em className="text-gray-400">No client</em>}
            {' · '}
            {fmtDate(event.arrival_date)} – {fmtDate(event.depart_date)}
            {event.dates_flexible && <span className="ml-1 text-xs text-gray-500">(flexible)</span>}
          </div>
        </div>
      )}

      {/* Basic Information */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RFP Type *</label>
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
              RFP Name (shown to hoteliers) *
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., 2026 Annual Sales Kick-off"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">Defaults to the booking meeting name. Edit to refine what hoteliers see.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name (shown to hoteliers)
            </label>
            <input
              type="text"
              value={displayCompanyName}
              onChange={(e) => setDisplayCompanyName(e.target.value)}
              disabled={hideCompany}
              placeholder="Defaults to the booking client company"
              className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 disabled:text-gray-400"
            />
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={hideCompany}
                onChange={(e) => setHideCompany(e.target.checked)}
                className="rounded border-gray-300"
              />
              Don't show company name to hoteliers
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instructions for Hoteliers
            </label>
            <RichTextInput
              value={instructions}
              onChange={setInstructions}
              placeholder="Provide context, deadlines, key constraints…"
            />
            <p className="mt-1 text-xs text-gray-500">Renders to hoteliers exactly as it looks here.</p>
          </div>

          {/* RFP attachments — admin-uploaded docs hoteliers download */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RFP Attachments</label>
            <p className="text-xs text-gray-500 mb-2">
              Upload your physical RFP, floor-plan requirements, or any supplementary docs.
              Hoteliers will see these as downloadable links.
            </p>
            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <span className="text-sm text-gray-600">
                {uploadingAttachment ? 'Uploading…' : isEditMode ? 'Click to add a file' : 'Save the RFP first to enable uploads'}
              </span>
              <input
                type="file"
                className="hidden"
                disabled={!isEditMode || uploadingAttachment}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f || !rfpIdParam) return;
                  setUploadingAttachment(true);
                  try {
                    await rfpApi.uploadAttachment(rfpIdParam, f);
                    const att = await rfpApi.listAttachments(rfpIdParam);
                    setAttachments(att.map((a) => ({ id: a.id, filename: a.filename, size_bytes: a.size_bytes })));
                  } catch (err: any) {
                    alert(`Upload failed: ${getApiErrorMessage(err, '')}`);
                  } finally {
                    setUploadingAttachment(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            {attachments.length > 0 && (
              <ul className="mt-2 divide-y divide-gray-100 ring-1 ring-gray-200 rounded-md">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate" title={a.filename}>{a.filename}</div>
                      <div className="text-[11px] text-gray-500">{(a.size_bytes / 1024).toFixed(1)} KB</div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${a.filename}?`)) return;
                        await rfpApi.deleteAttachment(a.id);
                        setAttachments((p) => p.filter((x) => x.id !== a.id));
                      }}
                      className="text-xs text-red-600 hover:underline shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={rn.date}
                  onChange={(e) => {
                    const next = [...roomNights];
                    next[index].date = e.target.value;
                    setRoomNights(next);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Single Occupancy</label>
                <input
                  type="text"
                  value={rn.single}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d+$/.test(v)) {
                      const next = [...roomNights];
                      next[index].single = v;
                      setRoomNights(next);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Double Occupancy</label>
                <input
                  type="text"
                  value={rn.double}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d+$/.test(v)) {
                      const next = [...roomNights];
                      next[index].double = v;
                      setRoomNights(next);
                    }
                  }}
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={mr.date}
                  onChange={(e) => {
                    const next = [...meetingRooms];
                    next[index].date = e.target.value;
                    setMeetingRooms(next);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={mr.title}
                  onChange={(e) => {
                    const next = [...meetingRooms];
                    next[index].title = e.target.value;
                    setMeetingRooms(next);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of People</label>
                <input
                  type="text"
                  value={mr.numPeople}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d+$/.test(v)) {
                      const next = [...meetingRooms];
                      next[index].numPeople = v;
                      setMeetingRooms(next);
                    }
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
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={mr.description}
                onChange={(e) => {
                  const next = [...meetingRooms];
                  next[index].description = e.target.value;
                  setMeetingRooms(next);
                }}
                rows={2}
                placeholder="Layout, A/V needs, F&B notes…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                <input
                  type="text"
                  value={q.questionText}
                  onChange={(e) => {
                    const next = [...customQuestions];
                    next[index].questionText = e.target.value;
                    setCustomQuestions(next);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Question Type</label>
                  <select
                    value={q.questionType}
                    onChange={(e) => {
                      const next = [...customQuestions];
                      next[index].questionType = e.target.value as CustomQuestionType;
                      setCustomQuestions(next);
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
                        const next = [...customQuestions];
                        next[index].isRequired = e.target.checked;
                        setCustomQuestions(next);
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Required</span>
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
                      const next = [...customQuestions];
                      next[index].options = e.target.value
                        .split(',')
                        .map((o) => o.trim())
                        .filter((o) => o);
                      setCustomQuestions(next);
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
          disabled={loading || !eventId}
          className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
        >
          {loading ? 'Saving...' : isEditMode ? 'Update RFP' : 'Create RFP'}
        </button>
        <button
          onClick={() => navigate(eventId ? `/commissions/${eventId}` : '/rfps')}
          className="px-6 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default RFPForm;
