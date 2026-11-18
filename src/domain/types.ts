// Shapes returned by the database (see supabase/migrations). Nullable = unknown.

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7 // ISO, 1 = Monday
export type Registration = 'required' | 'recommended' | 'not_required' | 'unknown'
export type Verification = 'provider_verified' | 'secondary_source' | 'unverified'
export type Audience = 'child_with_caregiver' | 'caregiver_with_childcare' | 'family' | null

export interface TemplateSlot {
  id: string
  weekday: Weekday
  start: string | null // 'HH:MM:SS'
  end: string | null
  recurrence: 'weekly' | 'selected_dates'
  note: string | null
}

export interface Occurrence {
  id: string
  date: string // 'YYYY-MM-DD'
  start: string | null
  end: string | null
  status: 'listed' | 'confirmed' | 'cancelled'
}

export interface ActivityCard {
  id: string
  title: string
  activity_type: string | null
  category: string | null
  audience: Audience
  childcare_mode: string | null
  age_text: string | null
  age_min_months: number | null
  age_max_months: number | null
  age_numbers_from: 'source_structured' | 'source_text' | null
  price_text: string | null
  is_free: boolean | null
  registration: Registration
  registration_text: string | null
  schedule_notes: string | null
  content_language: string | null
  verification: Verification
  last_checked_on: string | null
  status?: 'draft' | 'published' | 'archived'
  venue_id: string | null
  venue_name: string | null
  venue_kind: string | null
  address: string | null
  quartier: string | null
  district_number: number | null
  city_id: string | null
  templates: TemplateSlot[]
  upcoming: Occurrence[]
  organiser_url: string | null
  booking_url: string | null
  // added with the feed data (migration 3)
  location_text: string | null
  data_origin: string | null
  listing_url: string | null
  district_basis: 'postal_code' | null
}

export interface CareBlock {
  id: string
  caregiver_id: string
  weekday: Weekday
  start_time: string
  end_time: string
}

export interface Caregiver {
  id: string
  label: string
  color: string
  sort_order: number
}
