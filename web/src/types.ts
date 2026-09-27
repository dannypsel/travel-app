// Types mirroring the backend API contract (travel_trips, travel_bookings,
// travel_expenses, travel_budgets). Field names match the backend JSON exactly.

export type BookingKind = 'flight' | 'hotel' | 'event'
export type Category = 'flight' | 'food' | 'hotel' | 'fun' | 'transport' | 'other'

export interface Trip {
  id: string
  name: string
  destination: string
  destination_tz: string
  home_tz: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  notes: string | null
  created_at: string
}

export interface Booking {
  id: string
  trip_id: string
  kind: BookingKind
  category: Category
  title: string
  // flight fields
  airline: string | null
  flight_number: string | null
  origin: string | null
  destination: string | null
  depart_at: string | null
  arrive_at: string | null
  points_cost: number | null
  point_currency: string | null
  cash_paid: number | null
  cash_currency: string | null
  booking_account: string | null
  confirmation_number: string | null
  ticket_number: string | null
  seat: string | null
  checked_bags: number | null
  change_cancel_deadline: string | null
  cents_per_point: number | null
  // hotel fields
  hotel_name: string | null
  address: string | null
  check_in: string | null
  check_out: string | null
  room_type: string | null
  free_night_certs: number | null
  resort_fees: number | null
  cancellation_deadline: string | null
  // event fields
  location: string | null
  maps_url: string | null // optional override for the auto-generated Google Maps link
  start_at: string | null
  end_at: string | null
  cost: number | null
  notes: string | null
  created_at: string
}

export interface Expense {
  id: string
  trip_id: string
  date: string // YYYY-MM-DD
  amount: number
  currency: string
  category: Category | string
  note: string | null
  source: 'manual' | 'auto'
  created_at: string
}

export interface PacingDay {
  date: string // YYYY-MM-DD
  spent: number
  allowance: number
  status: 'over' | 'under' | 'even'
}

export interface TripBudgetResponse {
  budget: { id: string; trip_id: string; total_budget: number; currency: string } | null
  pacing: {
    daily_allowance: number
    days: PacingDay[]
    total_spent: number
    remaining: number
  } | null
}

export interface ImportDraft {
  id: string
  trip_id: string | null
  status: 'draft' | 'confirmed' | 'discarded'
  raw_subject: string | null
  raw_from: string | null
  parsed_json: Record<string, unknown>
  missing_fields: string[]
  created_at: string
  reviewed_at: string | null
}

export const CATEGORY_EMOJI: Record<string, string> = {
  flight: '✈️',
  food: '🍽️',
  hotel: '🏨',
  fun: '🎉',
  transport: '🚗',
  other: '📌',
}

export const DEFAULT_HOME_TZ = 'America/Los_Angeles'
