import { getApiErrorMessage } from '../services/http';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { siteSelectionApi } from '../services/siteSelectionApi';
import type { SiteSelectionAnswer, SiteSelectionFormDetails, SiteSelectionQuestion } from '../types/siteSelection';
import { parseLocalDate } from '../utils/date';

const fmtDateRange = (start?: string | null, end?: string | null): string => {
  if (!start && !end) return '-';
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const s = start ? parseLocalDate(start).toLocaleDateString('en-US', options) : '-';
  const e = end ? parseLocalDate(end).toLocaleDateString('en-US', options) : '-';
  return `${s} - ${e}`;
};

const groupQuestions = (questions: SiteSelectionQuestion[]) => {
  const groups: Array<{ section: string; questions: SiteSelectionQuestion[] }> = [];
  for (const question of questions) {
    const section = question.section || 'Questions';
    const group = groups.find((item) => item.section === section);
    if (group) {
      group.questions.push(question);
    } else {
      groups.push({ section, questions: [question] });
    }
  }
  return groups;
};

const answerText = (answer?: SiteSelectionAnswer): string => {
  if (!answer) return '-';
  if (answer.answer_list?.length) return answer.answer_list.join(', ');
  return answer.answer?.trim() || '-';
};

const SiteSelectionResponses: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<SiteSelectionFormDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const loaded = await siteSelectionApi.getForm(id);
        if (!cancelled) setForm(loaded);
      } catch (err: any) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load answers'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const answersByQuestion = useMemo(() => {
    const pairs = form?.answers.map((answer) => [answer.question_id, answer] as const) || [];
    return Object.fromEntries(pairs);
  }, [form]);

  const groups = useMemo(() => groupQuestions(form?.questions || []), [form]);

  if (loading) {
    return <div className="max-w-5xl mx-auto p-6 text-center">Loading...</div>;
  }

  if (!form) {
    return <div className="max-w-5xl mx-auto p-6 text-red-700">{error || 'Site selection form not found'}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Site Selection Answers</h1>
          <p className="text-sm text-gray-600 mt-1">{form.title}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/site-selection/${form.id}/edit`)}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Edit Form
          </button>
          <button
            onClick={() => navigate(`/commissions/${form.event_id}`)}
            className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
          >
            Open Booking
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Booking</dt>
            <dd className="font-medium text-gray-900">{form.event_meeting_name || '-'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Client</dt>
            <dd className="font-medium text-gray-900">{form.event_client_company_name || '-'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Hotel</dt>
            <dd className="font-medium text-gray-900">{form.hotel_name || 'Booking only'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Trip Dates</dt>
            <dd className="font-medium text-gray-900">{fmtDateRange(form.event_arrival_date, form.event_depart_date)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium text-gray-900">{form.submitted_at ? `Submitted ${new Date(form.submitted_at).toLocaleString()}` : 'Not submitted yet'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Answers</dt>
            <dd className="font-medium text-gray-900">{form.answers.length} saved</dd>
          </div>
        </dl>
      </section>

      {groups.map((group) => (
        <section key={group.section} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <h2 className="bg-gray-100 border-b border-gray-200 px-5 py-3 text-sm font-bold text-gray-800 uppercase tracking-wide">
            {group.section}
          </h2>
          <div className="divide-y divide-gray-100">
            {group.questions.map((question) => (
              <div key={question.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 px-5 py-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">{question.question_text}</div>
                  {question.help_text && <div className="text-xs text-gray-500 mt-1">{question.help_text}</div>}
                </div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">
                  {answerText(answersByQuestion[question.id])}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default SiteSelectionResponses;
