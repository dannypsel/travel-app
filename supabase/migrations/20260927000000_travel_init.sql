-- ============================================================
-- TRAVEL APP — v1 init (shared Supabase project with the budget app;
-- all travel tables prefixed travel_)
-- ============================================================

-- ============================================================
-- TRAVEL_TRIPS
-- ============================================================
create table travel_trips (
  id uuid primary key default gen_random_uuid(),
  name text,
  destination text,
  destination_tz text not null default 'Asia/Tokyo',
  home_tz text not null default 'America/Los_Angeles',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TRAVEL_BOOKINGS (flight / hotel / event in one table)
-- ============================================================
create table travel_bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references travel_trips(id) on delete cascade,
  kind text not null check (kind in ('flight', 'hotel', 'event')),
  category text not null default 'other'
    check (category in ('flight', 'food', 'hotel', 'fun', 'transport', 'other')),
  title text,
  -- flight fields
  airline text,
  flight_number text,
  origin text,
  destination text,
  depart_at timestamptz,
  arrive_at timestamptz,
  points_cost numeric,
  point_currency text,
  cash_paid numeric,
  cash_currency text default 'USD',
  booking_account text,
  confirmation_number text,
  ticket_number text,
  seat text,
  checked_bags int,
  change_cancel_deadline date,
  cents_per_point numeric,
  -- hotel fields
  hotel_name text,
  address text,
  check_in date,
  check_out date,
  room_type text,
  free_night_certs int default 0,
  resort_fees numeric,
  cancellation_deadline date,
  -- event fields
  location text,
  start_at timestamptz,
  end_at timestamptz,
  cost numeric,
  notes text,
  created_at timestamptz not null default now()
);
create index travel_bookings_trip_id_idx on travel_bookings(trip_id);

-- ============================================================
-- TRAVEL_EXPENSES (manual + auto-attributed spend)
-- ============================================================
create table travel_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references travel_trips(id) on delete cascade,
  date date not null,
  amount numeric not null,
  currency text default 'USD',
  category text default 'other',
  note text,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  created_at timestamptz not null default now()
);
create index travel_expenses_trip_id_idx on travel_expenses(trip_id);

-- ============================================================
-- TRAVEL_BUDGETS (one per trip)
-- ============================================================
create table travel_budgets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references travel_trips(id) on delete cascade unique,
  total_budget numeric not null,
  currency text default 'USD',
  created_at timestamptz not null default now()
);

-- ============================================================
-- TRAVEL_IMPORT_QUEUE (email-parse review drafts)
-- ============================================================
create table travel_import_queue (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references travel_trips(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'discarded')),
  raw_subject text,
  raw_from text,
  parsed_json jsonb not null default '{}',
  missing_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index travel_import_queue_status_idx on travel_import_queue(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- NOTE: v1 uses permissive policies; the backend holds the service-role
-- key (which bypasses RLS) and the frontend never talks to Supabase
-- directly. Per-user RLS scoping is a later hardening step.
-- ============================================================
alter table travel_trips enable row level security;
alter table travel_bookings enable row level security;
alter table travel_expenses enable row level security;
alter table travel_budgets enable row level security;
alter table travel_import_queue enable row level security;

create policy "authenticated_all" on travel_trips for all
  to authenticated using (true) with check (true);
create policy "authenticated_all" on travel_bookings for all
  to authenticated using (true) with check (true);
create policy "authenticated_all" on travel_expenses for all
  to authenticated using (true) with check (true);
create policy "authenticated_all" on travel_budgets for all
  to authenticated using (true) with check (true);
create policy "authenticated_all" on travel_import_queue for all
  to authenticated using (true) with check (true);
