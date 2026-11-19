// RFP Types — anchored to a commission_event.
// IDs are UUID strings (Supabase gen_random_uuid()).

export interface RFP {
  id: string;
  event_id: string;
  rfp_type: string;
  instructions?: string; // HTML from the rich-text editor
  display_name?: string | null;
  display_company_name?: string | null;
  hide_company?: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface RFPCreate {
  rfp_type: string;
  instructions?: string;
  display_name?: string | null;
  display_company_name?: string | null;
  hide_company?: boolean;
}

export interface RFPAttachment {
  id: string;
  rfp_id: string;
  filename: string;
  size_bytes: number;
  content_type?: string | null;
  uploaded_at: string;
  url?: string | null; // present on the public listing only
}

export interface RoomNight {
  id: string;
  rfp_id: string;
  date: string;
  single_occupancy: number;
  double_occupancy: number;
}

export interface RoomNightCreate {
  date: string;
  single_occupancy: number;
  double_occupancy: number;
}

export interface MeetingRoom {
  id: string;
  rfp_id: string;
  date: string;
  title: string;
  description?: string;
  num_people: number;
}

export interface MeetingRoomCreate {
  date: string;
  title: string;
  description?: string;
  num_people: number;
}

export type CustomQuestionType = 'textarea' | 'textfield' | 'yes_no' | 'select' | 'multiselect';

export interface CustomQuestion {
  id: string;
  rfp_id: string;
  question_text: string;
  is_required: boolean;
  question_type: CustomQuestionType;
  options?: string[];
  order_index: number;
}

export interface CustomQuestionCreate {
  question_text: string;
  is_required: boolean;
  question_type: CustomQuestionType;
  options?: string[];
}

export interface RFPWithDetails extends RFP {
  room_nights: RoomNight[];
  meeting_rooms: MeetingRoom[];
  custom_questions: CustomQuestion[];
}

// Cross-event listing (top-nav RFPs page)
export interface RFPWithEventSummary extends RFP {
  event_meeting_name?: string;
  event_client_company_name?: string;
  event_arrival_date?: string;
  event_depart_date?: string;
  invitation_count: number;
  completed_count: number;
}

// Hotel Invitation Types — invitation references a candidate hotel via event_hotel_id.
export interface HotelInvitation {
  id: string;
  rfp_id: string;
  event_hotel_id?: string;
  guid: string;
  created_at: string;
  first_viewed_at?: string;
  view_count: number;
  completed_at?: string;
  last_updated_at?: string;
}

export interface HotelInvitationCreate {
  event_hotel_id: string;
}

export interface HotelInvitationWithStats extends HotelInvitation {
  hotel_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  response_status: 'not_started' | 'in_progress' | 'completed';
}

// Hotel Response Types
export interface RoomNightResponse {
  id: string;
  invitation_id: string;
  room_night_id: string;
  single_rate?: number;
  double_rate?: number;
  updated_at: string;
}

export interface RoomNightResponseCreate {
  room_night_id: string;
  single_rate?: number;
  double_rate?: number;
}

export interface MeetingRoomResponse {
  id: string;
  invitation_id: string;
  meeting_room_id: string;
  suggested_location?: string;
  setup_fee_per_person?: number;
  updated_at: string;
}

export interface MeetingRoomResponseCreate {
  meeting_room_id: string;
  suggested_location?: string;
  setup_fee_per_person?: number;
}

export interface CustomQuestionResponse {
  id: string;
  invitation_id: string;
  custom_question_id: string;
  answer?: string;
  answer_list?: string[];
  updated_at: string;
}

export interface CustomQuestionResponseCreate {
  custom_question_id: string;
  answer?: string;
  answer_list?: string[];
}

export interface HotelResponseView {
  invitation_id: string;
  rfp_id: string;
  event_hotel_id?: string;
  hotel_name?: string;
  contact_name?: string;
  contact_email?: string;
  completed_at?: string;
  last_updated_at?: string;
  room_night_responses: RoomNightResponse[];
  meeting_room_responses: MeetingRoomResponse[];
  custom_question_responses: CustomQuestionResponse[];
  comments?: string;
}

// Comparison Grid Types
export interface ComparisonGridRow {
  field: string;
  type: 'room_night' | 'meeting_room' | 'custom_question';
  [hotelId: string]: any;
}
