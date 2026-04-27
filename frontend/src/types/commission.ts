export type BookingStatus = 'prospect' | 'tentative' | 'definite' | 'lost';
export type LineType = 'hotel' | 'dmc' | 'air' | 'other';
export type PaymentStatus = 'upcoming' | 'invoiced' | 'paid' | 'on_hold' | 'cancelled';

export interface CommissionLineItem {
  id: string;
  event_id: string;
  line_type: LineType;
  company_name: string;
  resort_hotel: string | null;
  arrival_date: string | null;
  depart_date: string | null;
  peak_rooms: number | null;
  total_room_nights: number | null;
  revenue: string | null;
  commission_pct: string | null;
  commission_amount: string | null;
  payment_status: PaymentStatus;
  invoice_sent_date: string | null;
  paid_date: string | null;
  my_points: string | null;
  cash_forward: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionLineItemCreate {
  line_type: LineType;
  company_name: string;
  resort_hotel?: string | null;
  arrival_date?: string | null;
  depart_date?: string | null;
  peak_rooms?: number | null;
  total_room_nights?: number | null;
  revenue?: string | null;
  commission_pct?: string | null;
  commission_amount?: string | null;
  payment_status?: PaymentStatus;
  invoice_sent_date?: string | null;
  paid_date?: string | null;
  my_points?: string | null;
  cash_forward?: string | null;
  notes?: string | null;
}

export interface CommissionEvent {
  id: string;
  meeting_name: string;
  booking_status: BookingStatus;
  destination: string | null;
  notes: string | null;
  client_company_id?: string | null;
  client_company_name?: string | null;
  primary_contact_id?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionEventWithLineItems extends CommissionEvent {
  line_items: CommissionLineItem[];
}

export interface CommissionEventCreate {
  meeting_name: string;
  booking_status?: BookingStatus;
  destination?: string | null;
  notes?: string | null;
  client_company_id?: string | null;
  client_company_name?: string | null;
  primary_contact_id?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  line_items?: CommissionLineItemCreate[];
}

export interface CommissionEventUpdate {
  meeting_name?: string;
  booking_status?: BookingStatus;
  destination?: string | null;
  notes?: string | null;
  client_company_id?: string | null;
  client_company_name?: string | null;
  primary_contact_id?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
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
