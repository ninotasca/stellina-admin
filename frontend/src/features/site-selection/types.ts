export type SiteSelectionQuestionType = 'textfield' | 'textarea' | 'yes_no' | 'select' | 'multiselect';

export interface SiteSelectionQuestion {
  id: string;
  form_id: string;
  section?: string | null;
  question_text: string;
  help_text?: string | null;
  question_type: SiteSelectionQuestionType;
  is_required: boolean;
  options?: string[] | null;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export interface SiteSelectionQuestionUpsert {
  id?: string;
  section?: string | null;
  question_text: string;
  help_text?: string | null;
  question_type: SiteSelectionQuestionType;
  is_required: boolean;
  options?: string[] | null;
  order_index: number;
}

export interface SiteSelectionAnswer {
  id: string;
  form_id: string;
  question_id: string;
  answer?: string | null;
  answer_list?: string[] | null;
  updated_at: string;
}

export interface SiteSelectionFormSummary {
  id: string;
  event_id: string;
  event_hotel_id?: string | null;
  title: string;
  intro_text?: string | null;
  guid: string;
  created_by?: string | null;
  submitted_at?: string | null;
  created_at: string;
  updated_at: string;
  event_meeting_name?: string | null;
  event_client_company_name?: string | null;
  event_arrival_date?: string | null;
  event_depart_date?: string | null;
  hotel_name?: string | null;
}

export interface SiteSelectionFormDetails extends SiteSelectionFormSummary {
  questions: SiteSelectionQuestion[];
  answers: SiteSelectionAnswer[];
}

export interface SiteSelectionFormCreate {
  event_id: string;
  event_hotel_id?: string | null;
  title: string;
  intro_text?: string | null;
  questions?: SiteSelectionQuestionUpsert[];
}

export interface SiteSelectionFormUpdate {
  event_hotel_id?: string | null;
  title: string;
  intro_text?: string | null;
  questions: SiteSelectionQuestionUpsert[];
}

export interface SiteSelectionSubmitAnswer {
  question_id: string;
  answer?: string | null;
  answer_list?: string[] | null;
}

export interface SiteSelectionSubmit {
  answers: SiteSelectionSubmitAnswer[];
}
