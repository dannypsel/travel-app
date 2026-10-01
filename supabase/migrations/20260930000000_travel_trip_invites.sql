-- ============================================================
-- TRAVEL APP — pending trip invites
-- ============================================================
-- Lets an owner invite an email that has no account yet. The
-- invite is stored in travel_trip_invites; the backend redeems
-- it into travel_trip_members automatically the first time a
-- user signs in with that email address.
-- ============================================================

create table if not exists travel_trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (trip_id, email)
);
create index if not exists travel_trip_invites_email_idx
  on travel_trip_invites(lower(email));

alter table travel_trip_invites enable row level security;

-- Same pattern as the other travel_* tables: the backend uses the
-- secret key (bypasses RLS); per-user scoping is enforced in the API.
drop policy if exists "authenticated_all" on travel_trip_invites;
create policy "authenticated_all" on travel_trip_invites
  for all to authenticated using (true) with check (true);

grant all on travel_trip_invites to authenticated;
grant all on travel_trip_invites to service_role;
