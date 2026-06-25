import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicSiteSelectionApi } from '../services/siteSelectionApi';
import type {
  SiteSelectionFormDetails,
  SiteSelectionQuestion,
  SiteSelectionSubmitAnswer,
} from '../types/siteSelection';
import { parseLocalDate } from '../utils/date';

type AnswerState = Record<string, string | string[]>;

const fmtDateRange = (start?: string | null, end?: string | null): string => {
  if (!start && !end) return '';
  const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
  const s = start ? parseLocalDate(start).toLocaleDateString('en-US', options) : '';
  const e = end ? parseLocalDate(end).toLocaleDateString('en-US', options) : '';
  return [s, e].filter(Boolean).join(' - ');
};

const sectionedQuestions = (questions: SiteSelectionQuestion[]) => {
  const sections: Array<{ section: string; questions: SiteSelectionQuestion[] }> = [];
  for (const question of questions) {
    const section = question.section || 'Questions';
    const existing = sections.find((item) => item.section === section);
    if (existing) {
      existing.questions.push(question);
    } else {
      sections.push({ section, questions: [question] });
    }
  }
  return sections;
};

const PublicSiteSelectionForm: React.FC = () => {
  const { guid } = useParams<{ guid: string }>();
  const [form, setForm] = useState<SiteSelectionFormDetails | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!guid) return;
      try {
        setLoading(true);
        setError(null);
        const loaded = await publicSiteSelectionApi.getForm(guid);
        if (cancelled) return;
        const nextAnswers: AnswerState = {};
        for (const answer of loaded.answers) {
          nextAnswers[answer.question_id] = answer.answer_list || answer.answer || '';
        }
        setForm(loaded);
        setAnswers(nextAnswers);
        setSubmitted(Boolean(loaded.submitted_at));
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || 'This form is not available.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [guid]);

  const sections = useMemo(() => sectionedQuestions(form?.questions || []), [form]);

  const setAnswer = (questionId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMulti = (questionId: string, option: string) => {
    const current = answers[questionId];
    const list = Array.isArray(current) ? current : [];
    setAnswer(
      questionId,
      list.includes(option) ? list.filter((item) => item !== option) : [...list, option],
    );
  };

  const submit = async () => {
    if (!guid || !form) return;
    const missing = form.questions.find((question) => {
      if (!question.is_required) return false;
      const value = answers[question.id];
      return Array.isArray(value) ? value.length === 0 : !String(value || '').trim();
    });
    if (missing) {
      setError(`Please answer: ${missing.question_text}`);
      return;
    }
    const payload: SiteSelectionSubmitAnswer[] = form.questions.map((question) => {
      const value = answers[question.id];
      if (Array.isArray(value)) {
        return { question_id: question.id, answer_list: value };
      }
      return { question_id: question.id, answer: String(value || '') };
    });
    try {
      setSubmitting(true);
      setError(null);
      await publicSiteSelectionApi.submitForm(guid, { answers: payload });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  const renderInput = (question: SiteSelectionQuestion) => {
    const value = answers[question.id];
    const baseInput = 'mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900';
    if (question.question_type === 'textfield') {
      return <input value={String(value || '')} onChange={(e) => setAnswer(question.id, e.target.value)} className={baseInput} />;
    }
    if (question.question_type === 'yes_no') {
      return (
        <div className="mt-2 flex gap-4">
          {['Yes', 'No'].map((option) => (
            <label key={option} className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name={question.id} checked={value === option} onChange={() => setAnswer(question.id, option)} />
              {option}
            </label>
          ))}
        </div>
      );
    }
    if (question.question_type === 'select') {
      return (
        <select value={String(value || '')} onChange={(e) => setAnswer(question.id, e.target.value)} className={`${baseInput} bg-white`}>
          <option value="">Select...</option>
          {(question.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }
    if (question.question_type === 'multiselect') {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="mt-2 space-y-2">
          {(question.options || []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => toggleMulti(question.id, option)} />
              {option}
            </label>
          ))}
        </div>
      );
    }
    return <textarea value={String(value || '')} onChange={(e) => setAnswer(question.id, e.target.value)} rows={3} className={baseInput} />;
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">Loading...</div>;
  }

  if (!form) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-700">{error || 'Form not found'}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <header className="bg-gray-800 text-white border border-gray-900 rounded-t-lg p-5 text-center">
          <h1 className="text-2xl font-bold uppercase tracking-wide">{form.title}</h1>
          {form.intro_text && <p className="mt-2 text-gray-100 font-medium">{form.intro_text}</p>}
        </header>

        <div className="bg-white border-x border-b border-gray-200 rounded-b-lg shadow-sm p-6 space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <div className="text-sm font-semibold text-gray-900">{form.event_meeting_name || 'Your Booking'}</div>
            <div className="text-sm text-gray-600">
              {[form.event_client_company_name, form.hotel_name, fmtDateRange(form.event_arrival_date, form.event_depart_date)]
                .filter(Boolean)
                .join(' | ')}
            </div>
          </div>

          {submitted && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-sm">
              Thank you. Your site selection form has been submitted.
            </div>
          )}

          {error && <div className="p-4 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}

          {sections.map((section) => (
            <section key={section.section} className="space-y-4">
              <h2 className="bg-gray-200 text-gray-900 px-3 py-2 rounded text-sm font-bold uppercase tracking-wide">
                {section.section}
              </h2>
              <div className="space-y-5">
                {section.questions.map((question) => (
                  <label key={question.id} className="block">
                    <span className="text-sm font-medium text-gray-900">
                      {question.question_text}
                      {question.is_required && <span className="text-red-600"> *</span>}
                    </span>
                    {question.help_text && <span className="block text-xs text-gray-500 mt-1">{question.help_text}</span>}
                    {renderInput(question)}
                  </label>
                ))}
              </div>
            </section>
          ))}

          <div className="pt-2 flex justify-end">
            <button
              onClick={submit}
              disabled={submitting}
              className="px-5 py-2.5 rounded-md bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:bg-gray-400"
            >
              {submitting ? 'Submitting...' : submitted ? 'Update Submission' : 'Submit'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PublicSiteSelectionForm;
