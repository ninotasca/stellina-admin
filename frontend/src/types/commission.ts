export type BookingStatus = 'prospect' | 'tentative' | 'definite' | 'on_hold' | 'cancelled' | 'lost';
export type LineType = 'hotel' | 'dmc' | 'air' | 'other';
export type ConsiderationType = 'hotel' | 'dmc' | 'air' | 'other';
export type PaymentStatus = 'pending_booking' | 'upcoming' | 'invoiced' | 'paid' | 'on_hold' | 'cancelled';
export type NoteParentType = 'event' | 'line_item';

export type HotelStatus = 'considered' | 'no_longer_considered' | 'winner';

export interface HotelConsidered {
  id: string;
  event_id: string;
  name: string;
  is_selected: boolean;
  status: HotelStatus;
  notes: string | null;
  primary_contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
}

export interface HotelConsideredCreate {
  name: string;
  is_selected?: boolean;
  status?: HotelStatus;
  notes?: string | null;
  primary_contact_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export interface HotelConsideredUpdate {
  name?: string;
  is_selected?: boolean;
  status?: HotelStatus;
  notes?: string | null;
  primary_contact_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export interface CommissionNote {
  id: string;
  parent_type: NoteParentType;
  parent_id: string;
  body: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

export interface CommissionLineItem {
  id: string;
  event_id: string;
  line_type: LineType;
  company_name: string;
  resort_hotel: string | null;
  arrival_date: string | null;
  depart_date: string | null;
  revenue: string | null;
  commission_pct: string | null;
  commission_amount: string | null;
  payment_status: PaymentStatus;
  invoice_sent_date: string | null;
  paid_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionLineItemCreate {
  line_type: LineType;
  company_name: string;
  resort_hotel?: string | null;
  arrival_date?: string | null;
  depart_date?: string | null;
  revenue?: string | null;
  commission_pct?: string | null;
  commission_amount?: string | null;
  payment_status?: PaymentStatus;
  invoice_sent_date?: string | null;
  paid_date?: string | null;
}

export interface CommissionEvent {
  id: string;
  meeting_name: string;
  booking_status: BookingStatus;
  destination: string | null;
  destinations: string[];
  notes: string | null;
  client_company_id?: string | null;
  client_company_name?: string | null;
  primary_contact_id?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  arrival_date: string | null;
  depart_date: string | null;
  dates_flexible: boolean;
  considerations: ConsiderationType[];
  peak_rooms: number | null;
  total_room_nights: number | null;
  can_earn_points: boolean;
  booked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionPoints {
  id: string;
  event_id: string;
  point_type: string;
  points: number | null;
  received: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommissionPointsCreate {
  point_type?: string;
  points?: number | null;
  received?: boolean;
}

export interface CommissionPointsUpdate {
  point_type?: string;
  points?: number | null;
  received?: boolean;
}

export interface CommissionPointsRow extends CommissionPoints {
  event_meeting_name: string;
  event_arrival_date: string | null;
  event_depart_date: string | null;
}

export interface CommissionEventWithLineItems extends CommissionEvent {
  line_items: CommissionLineItem[];
  hotels_considered: HotelConsidered[];
  event_notes: CommissionNote[];
  points: CommissionPoints[];
}

export interface CommissionEventCreate {
  meeting_name: string;
  booking_status?: BookingStatus;
  destination?: string | null;
  destinations?: string[];
  notes?: string | null;
  client_company_id?: string | null;
  client_company_name?: string | null;
  primary_contact_id?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  arrival_date?: string | null;
  depart_date?: string | null;
  dates_flexible?: boolean;
  considerations?: ConsiderationType[];
  peak_rooms?: number | null;
  total_room_nights?: number | null;
  can_earn_points?: boolean;
  line_items?: CommissionLineItemCreate[];
}

export interface CommissionEventUpdate {
  meeting_name?: string;
  booking_status?: BookingStatus;
  destination?: string | null;
  destinations?: string[];
  notes?: string | null;
  client_company_id?: string | null;
  client_company_name?: string | null;
  primary_contact_id?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  arrival_date?: string | null;
  depart_date?: string | null;
  dates_flexible?: boolean;
  considerations?: ConsiderationType[];
  peak_rooms?: number | null;
  total_room_nights?: number | null;
  can_earn_points?: boolean;
}

export interface ProjectionBucket {
  period: string;
  revenue_total: string;
  revenue_weighted: string;
  commission_total: string;
  commission_weighted: string;
  paid_total: string;
  outstanding_total: string;
  line_item_count: number;
}

export interface ProjectionSummary {
  grouping: 'quarter' | 'month' | 'year';
  weights: Record<string, number>;
  statuses_included: BookingStatus[];
  buckets: ProjectionBucket[];
  grand_total: ProjectionBucket;
}
