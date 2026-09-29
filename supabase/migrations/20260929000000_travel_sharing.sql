-- ============================================================
-- TRAVEL APP — trip ownership, sharing, and API keys
-- ============================================================
-- Trips belong to a profile (owner_id). Sharing is via
-- travel_trip_members. API keys allow script/JSON access without
-- an interactive login (X-API-Key header).
-- Trips with owner_id NULL are legacy: visible to any
-- authenticated user until claimed via POST /trips/{id}/claim.
-- ============================================================

alter table travel_trips
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

create table if not exists travel_trip_members (
  trip_id uuid not null references travel_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists travel_trip_members_user_id_idx
  on travel_trip_members(user_id);

create table if not exists travel_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists travel_api_keys_user_id_idx
  on travel_api_keys(user_id);

alter table travel_trip_members enable row level security;
alter table travel_api_keys enable row level security;

-- Same pattern as the other travel_* tables: the backend uses the
-- secret key (bypasses RLS); per-user scoping is enforced in the API.
drop policy if exists "authenticated_all" on travel_trip_members;
create policy "authenticated_all" on travel_trip_members
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_all" on travel_api_keys;
create policy "authenticated_all" on travel_api_keys
  for all to authenticated using (true) with check (true);

grant all on travel_trip_members, travel_api_keys to authenticated;
grant all on travel_trip_members, travel_api_keys to service_role;
