// RFP Types
export interface RFP {
  id: number;
  client_name: string;
  start_date: string;
  end_date: string;
  dates_fixed: boolean;
  rfp_type: string;
  instructions?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface RFPCreate {
  client_name: string;
  start_date: string;
  end_date: string;
  dates_fixed: boolean;
  rfp_type: string;
  instructions?: string;
}

export interface RoomNight {
  id: number;
  rfp_id: number;
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
  id: number;
  rfp_id: number;
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

export interface CustomQuestion {
  id: number;
  rfp_id: number;
  question_text: string;
  is_required: boolean;
  question_type: 'textarea' | 'textfield' | 'yes_no' | 'select' | 'multiselect';
  options?: string[];
  order_index: number;
}

export interface CustomQuestionCreate {
  question_text: string;
  is_required: boolean;
  question_type: 'textarea' | 'textfield' | 'yes_no' | 'select' | 'multiselect';
  options?: string[];
}

export interface RFPWithDetails extends RFP {
  room_nights: RoomNight[];
  meeting_rooms: MeetingRoom[];
  custom_questions: CustomQuestion[];
}

// Hotel Invitation Types
export interface HotelInvitation {
  id: number;
  rfp_id: number;
  hotel_name: string;
  contact_name: string;
  contact_email: string;
  guid: string;
  created_at: string;
  first_viewed_at?: string;
  view_count: number;
  completed_at?: string;
  last_updated_at?: string;
}

export interface HotelInvitationCreate {
  hotel_name: string;
  contact_name: string;
  contact_email: string;
}

export interface HotelInvitationWithStats extends HotelInvitation {
  response_status: 'not_started' | 'in_progress' | 'completed';
}

// Hotel Response Types
export interface RoomNightResponse {
  id: number;
  hotel_invitation_id: number;
  room_night_id: number;
  single_rate?: number;
  double_rate?: number;
}

export interface RoomNightResponseCreate {
  room_night_id: number;
  single_rate?: number;
  double_rate?: number;
}

export interface MeetingRoomResponse {
  id: number;
  hotel_invitation_id: number;
  meeting_room_id: number;
  suggested_location?: string;
  setup_fee_per_person?: number;
}

export interface MeetingRoomResponseCreate {
  meeting_room_id: number;
  suggested_location?: string;
  setup_fee_per_person?: number;
}

export interface CustomQuestionResponse {
  id: number;
  hotel_invitation_id: number;
  custom_question_id: number;
  answer?: string;
  answer_list?: string[];
}

export interface CustomQuestionResponseCreate {
  custom_question_id: number;
  answer?: string;
  answer_list?: string[];
}

export interface HotelResponseView {
  invitation: HotelInvitation;
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
