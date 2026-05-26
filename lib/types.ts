export type LoadStatus =
  | 'new'
  | 'estimating'
  | 'pending_approval'
  | 'approved'
  | 'submitted'
  | 'skipped'
  | 'expired';

export type BidStatus =
  | 'pending_approval'
  | 'approved'
  | 'submitted'
  | 'error'
  | 'skipped';

export interface Load {
  id: string;
  load_id: string;
  load_number: string;
  equipment_name: string;
  origin: string;
  destination: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  time_remaining: string;
  scraped_at: string;
  status: LoadStatus;
}

export interface Bid {
  id: string;
  load_id: string;
  distance_miles: number;
  trailer_type: string;
  requires_permits: boolean;
  requires_pilot_cars: boolean;
  carrier_rate: number;
  margin_pct: number;
  suggested_bid: number;
  final_bid: number;
  reasoning: string;
  status: BidStatus;
  submitted_at: string | null;
  created_at: string;
  // joined from loads
  load?: Load;
}

export interface LtlQuote {
  id: string;
  origin: string;
  destination: string;
  weight_lbs: number;
  freight_class: string;
  wwex_rate: number;
  markup_pct: number;
  customer_rate: number;
  notes: string;
  created_at: string;
}

export interface EstimateResponse {
  distance_miles: number;
  carrier_rate: number;
  rate_per_mile: number;
  trailer_type: string;
  requires_permits: boolean;
  requires_pilot_cars: boolean;
  reasoning: string;
}
