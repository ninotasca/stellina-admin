import { getApiErrorMessage } from '../services/http';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { commissionApi } from '../services/commissionApi';
import { siteSelectionApi } from '../services/siteSelectionApi';
import type { CommissionEventWithLineItems } from '../types/commission';
import type {
  SiteSelectionFormDetails,
  SiteSelectionQuestionType,
  SiteSelectionQuestionUpsert,
} from '../types/siteSelection';

const DEFAULT_QUESTIONS: SiteSelectionQuestionUpsert[] = [
  { section: 'Contact Information', question_text: 'Name', question_type: 'textfield', is_required: true, order_index: 0 },
  { section: 'Contact Information', question_text: 'Title', question_type: 'textfield', is_required: false, order_index: 1 },
  { section: 'Contact Information', question_text: 'Company/Organization', question_type: 'textfield', is_required: false, order_index: 2 },
  { section: 'Contact Information', question_text: 'Email Address', question_type: 'textfield', is_required: true, order_index: 3 },
  { section: 'Contact Information', question_text: 'Phone Number', question_type: 'textfield', is_required: false, order_index: 4 },
  { section: 'Your Favorites', question_text: 'Alcohol beverage preference?', question_type: 'textarea', is_required: false, order_index: 5 },
  { section: 'Your Favorites', question_text: 'Non-alcohol beverage', question_type: 'textarea', is_required: false, order_index: 6 },
  { section: 'Your Favorites', question_text: 'Snack / Food', question_type: 'textarea', is_required: false, order_index: 7 },
  { section: 'Your Favorites', question_text: 'Hotel Room Preference (i.e. king, non-smoking near elevators, etc.)', question_type: 'textarea', is_required: false, order_index: 8 },
  { section: 'Your Favorites', question_text: 'Hobbies', question_type: 'textarea', is_required: false, order_index: 9 },
  { section: 'Your Favorites', question_text: 'Allergies (i.e. aspirin, nuts, feathers, shellfish, etc.)', question_type: 'textarea', is_required: false, order_index: 10 },
  { section: 'Your Favorites', question_text: 'Major food dislikes (i.e. mushrooms, peas, shellfish)', question_type: 'textarea', is_required: false, order_index: 11 },
  { section: 'Your Favorites', question_text: 'Favorite Spa Treatment (body wraps, deep tissue massage, facial, etc.)', question_type: 'textarea', is_required: false, order_index: 12 },
  { section: 'Your Favorites', question_text: 'What has worked well at past conferences? Any hot buttons?', question_type: 'textarea', is_required: false, order_index: 13 },
  { section: 'Your Favorites', question_text: 'Are there any specific things you wish to see, focus on, or people you would like to meet?', question_type: 'textarea', is_required: false, order_index: 14 },
  { section: 'Emergency Contact', question_text: 'Emergency Contact Name', question_type: 'textfield', is_required: false, order_index: 15 },
  { section: 'Emergency Contact', question_text: 'Emergency Contact Relationship', question_type: 'textfield', is_required: false, order_index: 16 },
  { section: 'Emergency Contact', question_text: 'Emergency Contact Phone Number', question_type: 'textfield', is_required: false, order_index: 17 },
];

const questionTypeOptions: Array<{ value: SiteSelectionQuestionType; label: string }> = [
  { value: 'textfield', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'select', label: 'Single choice' },
  { value: 'multiselect', label: 'Multiple choice' },
];

const publicUrl = (guid: string) => `${window.location.origin}/site-selection/${guid}`;

const normalizeQuestions = (questions: SiteSelectionQuestionUpsert[]) =>
  questions.map((q, index) => ({ ...q, order_index: index }));

const SiteSelectionFormBuilder: React.FC = () => {
  const navigate = useNavigate();
  const { id: formId, eventId } = useParams<{ id?: string; eventId?: string }>();
  const isEditMode = Boolean(formId);

  const [event, setEvent] = useState<CommissionEventWithLineItems | null>(null);
  const [form, setForm] = useState<SiteSelectionFormDetails | null>(null);
  const [title, setTitle] = useState('Site Selection Form');
  const [introText, setIntroText] = useState('As much as you wish to provide is helpful for the hotel to maximize and personalize your visit.');
  const [selectedHotelId, setSelectedHotelId] = useState<string>('');
  const [questions, setQuestions] = useState<SiteSelectionQuestionUpsert[]>(DEFAULT_QUESTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        if (isEditMode && formId) {
          const loadedForm = await siteSelectionApi.getForm(formId);
          if (cancelled) return;
          setForm(loadedForm);
          setTitle(loadedForm.title);
          setIntroText(loadedForm.intro_text || '');
          setSelectedHotelId(loadedForm.event_hotel_id || '');
          setQuestions(
            loadedForm.questions.map((q) => ({
              id: q.id,
              section: q.section || '',
              question_text: q.question_text,
              help_text: q.help_text || '',
              question_type: q.question_type,
              is_required: q.is_required,
              options: q.options || [],
              order_index: q.order_index,
            })),
          );
          setEvent(await commissionApi.getEvent(loadedForm.event_id));
        } else if (eventId) {
          const loadedEvent = await commissionApi.getEvent(eventId);
          if (cancelled) return;
          setEvent(loadedEvent);
          setTitle(`${loadedEvent.meeting_name || 'Booking'} Site Selection Form`);
        } else {
          setError('Missing booking reference.');
        }
      } catch (err: any) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load site selection form'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, formId, isEditMode]);

  const answerMap = useMemo(() => {
    const pairs = form?.answers.map((answer) => [answer.question_id, answer] as const) || [];
    return Object.fromEntries(pairs);
  }, [form]);

  const updateQuestion = (index: number, patch: Partial<SiteSelectionQuestionUpsert>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        section: prev.at(-1)?.section || 'Custom Questions',
        question_text: '',
        question_type: 'textarea',
        is_required: false,
        options: [],
        order_index: prev.length,
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const current = next[index];
      next[index] = next[target];
      next[target] = current;
      return next;
    });
  };

  const save = async () => {
    if (!event) return;
    const cleanedQuestions = normalizeQuestions(
      questions
        .map((q) => ({
          ...q,
          section: q.section?.trim() || null,
          question_text: q.question_text.trim(),
          help_text: q.help_text?.trim() || null,
          options:
            q.question_type === 'select' || q.question_type === 'multiselect'
              ? (q.options || []).map((option) => option.trim()).filter(Boolean)
              : null,
        }))
        .filter((q) => q.question_text),
    );
    if (!title.trim()) {
      setError('Form title is required.');
      return;
    }
    if (cleanedQuestions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (isEditMode && formId) {
        const updated = await siteSelectionApi.updateForm(formId, {
          event_hotel_id: selectedHotelId || null,
          title: title.trim(),
          intro_text: introText.trim() || null,
          questions: cleanedQuestions,
        });
        setForm(updated);
        setQuestions(updated.questions.map((q) => ({ ...q, options: q.options || [] })));
      } else {
        const created = await siteSelectionApi.createForm({
          event_id: event.id,
          event_hotel_id: selectedHotelId || null,
          title: title.trim(),
          intro_text: introText.trim() || null,
          questions: cleanedQuestions,
        });
        navigate(`/site-selection/${created.id}/edit`);
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to save site selection form'));
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!form) return;
    await navigator.clipboard.writeText(publicUrl(form.guid));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto p-6 text-center">Loading...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{isEditMode ? 'Edit Site Selection Form' : 'New Site Selection Form'}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {event?.meeting_name || 'Booking'}{event?.client_company_name ? ` - ${event.client_company_name}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {form && (
            <button onClick={copyLink} className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
              {copied ? 'Copied' : 'Copy Client Link'}
            </button>
          )}
          <button onClick={() => navigate(event ? `/commissions/${event.id}` : '/site-selection')} className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
            Done
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Form title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Attach to hotel</span>
            <select value={selectedHotelId} onChange={(e) => setSelectedHotelId(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
              <option value="">Booking only</option>
              {event?.hotels_considered.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Intro text shown to client</span>
          <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={3} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </label>
      </section>

      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Questions</h2>
          <button onClick={addQuestion} className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-800">Add Question</button>
        </div>

        <div className="space-y-3">
          {questions.map((question, index) => {
            const answer = question.id ? answerMap[question.id] : undefined;
            return (
              <div key={question.id || `new-${index}`} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_160px] gap-3">
                  <input
                    value={question.section || ''}
                    onChange={(e) => updateQuestion(index, { section: e.target.value })}
                    placeholder="Section"
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <input
                    value={question.question_text}
                    onChange={(e) => updateQuestion(index, { question_text: e.target.value })}
                    placeholder="Question"
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <select
                    value={question.question_type}
                    onChange={(e) => updateQuestion(index, { question_type: e.target.value as SiteSelectionQuestionType })}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {questionTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
                  <input
                    value={question.help_text || ''}
                    onChange={(e) => updateQuestion(index, { help_text: e.target.value })}
                    placeholder="Optional helper text"
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={question.is_required} onChange={(e) => updateQuestion(index, { is_required: e.target.checked })} />
                    Required
                  </label>
                </div>
                {(question.question_type === 'select' || question.question_type === 'multiselect') && (
                  <input
                    value={(question.options || []).join(', ')}
                    onChange={(e) => updateQuestion(index, { options: e.target.value.split(',') })}
                    placeholder="Options separated by commas"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                )}
                {answer && (
                  <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-900">
                    Client answer: {answer.answer_list?.join(', ') || answer.answer || '-'}
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <div className="flex gap-3">
                    <button onClick={() => moveQuestion(index, -1)} disabled={index === 0} className="text-gray-600 disabled:text-gray-300">Move Up</button>
                    <button onClick={() => moveQuestion(index, 1)} disabled={index === questions.length - 1} className="text-gray-600 disabled:text-gray-300">Move Down</button>
                  </div>
                  <button onClick={() => removeQuestion(index)} className="text-red-600">Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <button onClick={() => navigate(event ? `/commissions/${event.id}` : '/site-selection')} className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300">
          {saving ? 'Saving...' : 'Save Form'}
        </button>
      </div>
    </div>
  );
};

export default SiteSelectionFormBuilder;
