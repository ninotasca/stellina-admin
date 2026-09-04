import { getApiErrorMessage } from '../services/http';
import React, { useState } from 'react';
import type {
  CustomQuestionResponseCreate,
  HotelResponseView,
  MeetingRoomResponseCreate,
  RFPWithDetails,
  RoomNightResponseCreate,
} from '../types/rfp';
import { parseLocalDate } from '../utils/date';

export interface RFPInfo {
  hotel_name: string | null;
  contact_name: string | null;
  is_completed: boolean;
  event_meeting_name: string | null;
  event_client_company_name: string | null;
  event_arrival_date: string | null;
  event_depart_date: string | null;
}

export interface UploadedAttachment {
  id: string;
  filename: string;
  size_bytes: number;
  content_type?: string | null;
  uploaded_at?: string;
}

export interface RFPDocAttachment {
  id: string;
  filename: string;
  size_bytes: number;
  url?: string | null;
}

interface Props {
  rfp: RFPWithDetails;
  info: RFPInfo;
  initialResponse?: HotelResponseView | null;
  attachments?: UploadedAttachment[];
  rfpDocs?: RFPDocAttachment[];
  previewMode?: boolean;
  onSaveRoomNight?: (r: RoomNightResponseCreate) => Promise<void>;
  onSaveMeetingRoom?: (r: MeetingRoomResponseCreate) => Promise<void>;
  onSaveQuestion?: (r: CustomQuestionResponseCreate) => Promise<void>;
  onSaveComments?: (comments: string) => Promise<void>;
  onUploadFile?: (file: File) => Promise<void>;
  onRemoveAttachment?: (attachmentId: string) => Promise<void>;
  onSubmitFinal?: () => Promise<void>;
}

const fmtDate = (v?: string | null) =>
  v ? parseLocalDate(v).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const fmtDateShort = (v?: string | null) =>
  v ? parseLocalDate(v).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const fmtDateBig = (v?: string | null) =>
  v ? parseLocalDate(v).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const RFPResponseFormBody: React.FC<Props> = ({
  rfp, info, initialResponse, attachments: serverAttachments, rfpDocs, previewMode,
  onSaveRoomNight, onSaveMeetingRoom, onSaveQuestion, onSaveComments,
  onUploadFile, onRemoveAttachment, onSubmitFinal,
}) => {
  // Local state, seeded from initialResponse on mount.
  const [roomNightRates, setRoomNightRates] = useState<{ [k: string]: { single?: number; double?: number } }>(() => {
    const m: any = {};
    initialResponse?.room_night_responses?.forEach((r) => { m[r.room_night_id] = { single: r.single_rate, double: r.double_rate }; });
    return m;
  });
  const [meetingRoomResponses, setMeetingRoomResponses] = useState<{ [k: string]: { location?: string; fee?: number } }>(() => {
    const m: any = {};
    initialResponse?.meeting_room_responses?.forEach((r) => { m[r.meeting_room_id] = { location: r.suggested_location, fee: r.setup_fee_per_person }; });
    return m;
  });
  const [questionAnswers, setQuestionAnswers] = useState<{ [k: string]: { answer?: string; answerList?: string[] } }>(() => {
    const m: any = {};
    initialResponse?.custom_question_responses?.forEach((r) => { m[r.custom_question_id] = { answer: r.answer, answerList: r.answer_list }; });
    return m;
  });
  const [comments, setComments] = useState(initialResponse?.comments || '');
  // Preview-mode local-only attachments.
  const [previewFiles, setPreviewFiles] = useState<{ id: string; filename: string; size_bytes: number; content_type?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const attachments = previewMode ? previewFiles : (serverAttachments || []);

  const handleFile = async (file: File) => {
    if (previewMode) {
      setPreviewFiles((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          filename: file.name,
          size_bytes: file.size,
          content_type: file.type,
        },
      ]);
      return;
    }
    if (!onUploadFile) return;
    setUploading(true);
    try {
      await onUploadFile(file);
    } catch (e: any) {
      alert(`Upload failed: ${getApiErrorMessage(e, 'Unknown error')}`);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (id: string) => {
    if (previewMode) {
      setPreviewFiles((prev) => prev.filter((f) => f.id !== id));
      return;
    }
    if (onRemoveAttachment) await onRemoveAttachment(id);
  };

  const saveAll = async () => {
    if (previewMode) {
      alert('Preview mode — nothing was saved.');
      return;
    }
    setBusy(true);
    try {
      for (const [rnId, v] of Object.entries(roomNightRates)) {
        if (onSaveRoomNight) await onSaveRoomNight({ room_night_id: rnId, single_rate: v.single, double_rate: v.double });
      }
      for (const [mrId, v] of Object.entries(meetingRoomResponses)) {
        if (onSaveMeetingRoom) await onSaveMeetingRoom({ meeting_room_id: mrId, suggested_location: v.location, setup_fee_per_person: v.fee });
      }
      for (const [qId, v] of Object.entries(questionAnswers)) {
        if (onSaveQuestion) await onSaveQuestion({ custom_question_id: qId, answer: v.answer, answer_list: v.answerList });
      }
      if (onSaveComments) await onSaveComments(comments);
      alert('Progress saved.');
    } catch (e: any) {
      alert(`Save failed: ${getApiErrorMessage(e, 'Unknown error')}`);
    } finally {
      setBusy(false);
    }
  };

  const submitFinal = async () => {
    if (previewMode) {
      alert('Preview mode — nothing was submitted.');
      return;
    }
    if (rfp.custom_questions) {
      for (const q of rfp.custom_questions) {
        if (q.is_required) {
          const a = questionAnswers[q.id];
          if (!a?.answer && !a?.answerList?.length) {
            alert(`Please answer the required question: ${q.question_text}`);
            return;
          }
        }
      }
    }
    if (!window.confirm('Submit your final response? You won\'t be able to make further changes.')) return;
    setBusy(true);
    try {
      // Save first, then submit
      for (const [rnId, v] of Object.entries(roomNightRates)) {
        if (onSaveRoomNight) await onSaveRoomNight({ room_night_id: rnId, single_rate: v.single, double_rate: v.double });
      }
      for (const [mrId, v] of Object.entries(meetingRoomResponses)) {
        if (onSaveMeetingRoom) await onSaveMeetingRoom({ meeting_room_id: mrId, suggested_location: v.location, setup_fee_per_person: v.fee });
      }
      for (const [qId, v] of Object.entries(questionAnswers)) {
        if (onSaveQuestion) await onSaveQuestion({ custom_question_id: qId, answer: v.answer, answer_list: v.answerList });
      }
      if (onSaveComments) await onSaveComments(comments);
      if (onSubmitFinal) await onSubmitFinal();
    } catch (e: any) {
      alert(`Submit failed: ${getApiErrorMessage(e, 'Unknown error')}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero info card — pretty header. Use the RFP's display fields when set;
          fall back to the underlying event values. */}
      <section className="rounded-2xl shadow-md overflow-hidden ring-1 ring-amber-200">
        <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)' }}>
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-900/70 font-semibold mb-1">
            RFP Response Form
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            {rfp.display_name || info.event_meeting_name || 'Booking'}
          </h1>
          {!rfp.hide_company && (rfp.display_company_name || info.event_client_company_name) && (
            <p className="text-slate-700 text-sm mt-1">
              for {rfp.display_company_name || info.event_client_company_name}
            </p>
          )}
        </div>
        <div className="bg-white px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
          <InfoCell label="Hotel" value={info.hotel_name || '—'} />
          <InfoCell label="Your Contact" value={info.contact_name || '—'} />
          <InfoCell label="Trip Dates" value={`${fmtDate(info.event_arrival_date)} – ${fmtDate(info.event_depart_date)}`} />
        </div>
      </section>

      {rfp.instructions && (
        <section className="rounded-lg bg-blue-50 ring-1 ring-blue-200 p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Instructions for Hoteliers</h3>
          <div
            className="text-sm text-blue-900 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_a]:text-blue-700 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: rfp.instructions }}
          />
        </section>
      )}

      {/* Admin-uploaded RFP documents (e.g., physical RFP PDF) */}
      {rfpDocs && rfpDocs.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">RFP Documents</h2>
            <p className="text-xs text-slate-500 mt-0.5">Reference docs from the planner. Click to download.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {rfpDocs.map((d) => (
              <li key={d.id} className="px-6 py-3 flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate" title={d.filename}>{d.filename}</div>
                  <div className="text-[11px] text-slate-500">{fmtBytes(d.size_bytes)}</div>
                </div>
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-sm text-amber-700 hover:underline font-medium"
                  >
                    Download
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400 italic">Preview only</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Room Night Rates — smart-hide single/double when count is 0 */}
      {rfp.room_nights.length > 0 && (() => {
        const anySingle = rfp.room_nights.some((rn) => rn.single_occupancy > 0);
        const anyDouble = rfp.room_nights.some((rn) => rn.double_occupancy > 0);
        return (
          <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Room Night Rates</h2>
              <p className="text-xs text-slate-500 mt-0.5">Enter your nightly rate for each room type and date.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Date</Th>
                    {anySingle && <><Th>Single rooms</Th><Th>Single rate ($)</Th></>}
                    {anyDouble && <><Th>Double rooms</Th><Th>Double rate ($)</Th></>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {rfp.room_nights.map((rn) => (
                    <tr key={rn.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-900 whitespace-nowrap">
                        {fmtDateShort(rn.date)}
                      </td>
                      {anySingle && (
                        <>
                          <td className="px-4 py-3 text-sm text-slate-700 tabular-nums">
                            {rn.single_occupancy > 0 ? rn.single_occupancy : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {rn.single_occupancy > 0 ? (
                              <input
                                type="number" step="0.01" min="0"
                                value={roomNightRates[rn.id]?.single ?? ''}
                                onChange={(e) => setRoomNightRates((p) => ({ ...p, [rn.id]: { ...p[rn.id], single: parseFloat(e.target.value) || undefined } }))}
                                className="w-32 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                                placeholder="0.00"
                              />
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        </>
                      )}
                      {anyDouble && (
                        <>
                          <td className="px-4 py-3 text-sm text-slate-700 tabular-nums">
                            {rn.double_occupancy > 0 ? rn.double_occupancy : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {rn.double_occupancy > 0 ? (
                              <input
                                type="number" step="0.01" min="0"
                                value={roomNightRates[rn.id]?.double ?? ''}
                                onChange={(e) => setRoomNightRates((p) => ({ ...p, [rn.id]: { ...p[rn.id], double: parseFloat(e.target.value) || undefined } }))}
                                className="w-32 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                                placeholder="0.00"
                              />
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}

      {/* Meeting Rooms */}
      {rfp.meeting_rooms.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Meeting Rooms</h2>
          </div>
          <div className="px-6 py-4 space-y-5">
            {rfp.meeting_rooms.map((mr) => (
              <div key={mr.id} className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="mb-3">
                  <h3 className="font-semibold text-slate-900 text-lg">{mr.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white ring-1 ring-amber-300 rounded-md text-sm font-semibold text-amber-900">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {fmtDateBig(mr.date)}
                    </span>
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white ring-1 ring-blue-300 rounded-md text-sm font-semibold text-blue-900">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {mr.num_people} {mr.num_people === 1 ? 'attendee' : 'attendees'}
                    </span>
                  </div>
                  {mr.description && <p className="text-sm text-slate-700 mt-3">{mr.description}</p>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Suggested Location</label>
                    <input
                      type="text"
                      value={meetingRoomResponses[mr.id]?.location || ''}
                      onChange={(e) => setMeetingRoomResponses((p) => ({ ...p, [mr.id]: { ...p[mr.id], location: e.target.value } }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                      placeholder="e.g., Grand Ballroom"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Setup Fee (per person)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={meetingRoomResponses[mr.id]?.fee ?? ''}
                        onChange={(e) => setMeetingRoomResponses((p) => ({ ...p, [mr.id]: { ...p[mr.id], fee: parseFloat(e.target.value) || undefined } }))}
                        className="w-full pl-6 pr-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Custom Questions */}
      {rfp.custom_questions.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Additional Questions</h2>
          </div>
          <div className="px-6 py-4 space-y-5">
            {rfp.custom_questions.map((q) => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  {q.question_text}
                  {q.is_required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {q.question_type === 'textfield' && (
                  <input
                    type="text"
                    value={questionAnswers[q.id]?.answer || ''}
                    onChange={(e) => setQuestionAnswers((p) => ({ ...p, [q.id]: { answer: e.target.value } }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                )}
                {q.question_type === 'textarea' && (
                  <textarea
                    rows={3}
                    value={questionAnswers[q.id]?.answer || ''}
                    onChange={(e) => setQuestionAnswers((p) => ({ ...p, [q.id]: { answer: e.target.value } }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                )}
                {q.question_type === 'yes_no' && (
                  <div className="flex gap-2">
                    {['Yes', 'No'].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setQuestionAnswers((p) => ({ ...p, [q.id]: { answer: opt } }))}
                        className={`px-4 py-1.5 text-sm rounded-md border ${
                          questionAnswers[q.id]?.answer === opt
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {q.question_type === 'select' && (
                  <select
                    value={questionAnswers[q.id]?.answer || ''}
                    onChange={(e) => setQuestionAnswers((p) => ({ ...p, [q.id]: { answer: e.target.value } }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    <option value="">Select…</option>
                    {q.options?.map((opt, idx) => <option key={idx} value={opt}>{opt}</option>)}
                  </select>
                )}
                {q.question_type === 'multiselect' && (
                  <div className="space-y-1">
                    {q.options?.map((opt, idx) => (
                      <label key={idx} className="flex items-center text-sm">
                        <input
                          type="checkbox"
                          checked={questionAnswers[q.id]?.answerList?.includes(opt) || false}
                          onChange={(e) => {
                            const cur = questionAnswers[q.id]?.answerList || [];
                            const next = e.target.checked ? [...cur, opt] : cur.filter((o) => o !== opt);
                            setQuestionAnswers((p) => ({ ...p, [q.id]: { answerList: next } }));
                          }}
                          className="mr-2"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* File attachments */}
      <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Attachments</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload anything helpful — proposals, floor plans, AV pricing, photos. No file size limit.
          </p>
        </div>
        <div className="px-6 py-4 space-y-3">
          <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm text-slate-600">
              {uploading ? 'Uploading…' : 'Click to add a file or drag one in'}
            </span>
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </label>
          {attachments.length > 0 && (
            <ul className="divide-y divide-slate-100 ring-1 ring-slate-200 rounded-md">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-900 truncate" title={a.filename}>{a.filename}</div>
                    <div className="text-[11px] text-slate-500">{fmtBytes(a.size_bytes)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Comments */}
      <section className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Additional Comments</h2>
        </div>
        <div className="px-6 py-4">
          <textarea
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Anything else we should know?"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3 sticky bottom-0 bg-gradient-to-t from-white to-transparent pt-4 pb-2 z-10">
        <button
          type="button"
          onClick={saveAll}
          disabled={busy}
          className={`px-6 py-3 rounded-lg text-sm font-semibold shadow-sm transition ${
            previewMode ? 'bg-blue-200 text-blue-900 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-60`}
        >
          {busy ? 'Saving…' : 'Save Progress'}
        </button>
        <button
          type="button"
          onClick={submitFinal}
          disabled={busy}
          className={`px-6 py-3 rounded-lg text-sm font-semibold shadow-sm transition ${
            previewMode ? 'bg-emerald-200 text-emerald-900 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
          } disabled:opacity-60`}
        >
          {busy ? 'Submitting…' : 'Submit Final Response'}
        </button>
        <span className="ml-auto text-xs text-slate-500 self-center hidden sm:inline">
          {previewMode
            ? 'Buttons are visual-only in preview mode.'
            : 'You can save and return later. Once submitted, no further edits.'}
        </span>
      </div>
    </div>
  );
};

const InfoCell: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">{label}</div>
    <div className="text-sm font-medium text-slate-900 mt-0.5">{value}</div>
  </div>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">{children}</th>
);

export default RFPResponseFormBody;
