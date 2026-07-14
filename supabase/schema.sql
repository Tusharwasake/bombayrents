-- Bombay Rent — Supabase schema (v2)
-- Run this whole file in the Supabase SQL editor. It is idempotent.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Rent pins: anonymous crowdsourced "what I actually pay" data
-- ---------------------------------------------------------------------------
create table if not exists rent_pins (
  id           uuid primary key default gen_random_uuid(),
  lat          double precision not null check (lat between 18.5 and 19.6),
  lng          double precision not null check (lng between 72.5 and 73.5),
  rent         integer not null check (rent between 1000 and 2000000),
  deposit      integer check (deposit between 0 and 100000000),
  bhk          text not null check (bhk in ('1RK','1BHK','2BHK','3BHK','4BHK+')),
  housing_type text not null check (housing_type in
                 ('Society','Standalone building','Chawl','Gaothan/Village')),
  hidden       boolean not null default false,
  report_count integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists rent_pins_geo_idx
  on rent_pins using gist (st_makepoint(lng, lat));

alter table rent_pins enable row level security;

drop policy if exists "anyone can read visible pins" on rent_pins;
create policy "anyone can read visible pins"
  on rent_pins for select using (hidden = false);

drop policy if exists "anyone can insert pins" on rent_pins;
create policy "anyone can insert pins"
  on rent_pins for insert with check (true);

-- Community moderation: 3 reports auto-hide a pin. Runs as security definer so
-- anonymous visitors can report without having update rights on the table.
create or replace function report_pin(pin_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update rent_pins
  set report_count = report_count + 1,
      hidden = (report_count + 1) >= 3
  where id = pin_id;
$$;

grant execute on function report_pin(uuid) to anon;

-- ---------------------------------------------------------------------------
-- Listings (owners) & seekers (flat-hunters)
-- Write-only for the public: anon key can INSERT but never SELECT, so contact
-- emails are unreadable through the public API. Matching runs server-side.
-- ---------------------------------------------------------------------------
create table if not exists listings (
  id            uuid primary key default gen_random_uuid(),
  lat           double precision not null check (lat between 18.5 and 19.6),
  lng           double precision not null check (lng between 72.5 and 73.5),
  rent          integer not null check (rent between 1000 and 2000000),
  deposit       integer check (deposit between 0 and 100000000),
  bhk           text not null check (bhk in ('1RK','1BHK','2BHK','3BHK','4BHK+')),
  furnishing    text not null default 'Unfurnished'
                  check (furnishing in ('Unfurnished','Semi-furnished','Fully furnished')),
  whole_flat    boolean not null default true,   -- false = room in a shared flat
  veg_only      boolean not null default false,
  smoking_ok    boolean not null default true,
  parking       boolean not null default false,
  contact_email text not null,
  contact_phone text,
  hidden        boolean not null default false,
  active_until  timestamptz not null default now() + interval '45 days',
  created_at    timestamptz not null default now()
);

create index if not exists listings_geo_idx
  on listings using gist (st_makepoint(lng, lat));

create table if not exists seekers (
  id            uuid primary key default gen_random_uuid(),
  lat           double precision not null check (lat between 18.5 and 19.6),
  lng           double precision not null check (lng between 72.5 and 73.5),
  budget_max    integer not null check (budget_max between 1000 and 2000000),
  bhk           text not null check (bhk in ('1RK','1BHK','2BHK','3BHK','4BHK+')),
  room_ok       boolean not null default false,  -- open to a room in a shared flat
  veg           boolean not null default false,
  smoker        boolean not null default false,
  contact_email text not null,
  contact_phone text,
  active_until  timestamptz not null default now() + interval '30 days',
  created_at    timestamptz not null default now()
);

create index if not exists seekers_geo_idx
  on seekers using gist (st_makepoint(lng, lat));

create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  seeker_id  uuid not null references seekers (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  emailed_at timestamptz not null default now(),
  unique (seeker_id, listing_id)
);

-- Migration from schema v1 (tables created without these columns):
alter table listings add column if not exists furnishing text not null default 'Unfurnished';
alter table listings add column if not exists veg_only boolean not null default false;
alter table listings add column if not exists smoking_ok boolean not null default true;
alter table listings add column if not exists parking boolean not null default false;
alter table listings add column if not exists contact_phone text;
alter table listings add column if not exists hidden boolean not null default false;
alter table seekers add column if not exists room_ok boolean not null default false;
alter table seekers add column if not exists veg boolean not null default false;
alter table seekers add column if not exists contact_phone text;

alter table listings enable row level security;
alter table seekers enable row level security;
alter table matches enable row level security;

drop policy if exists "anyone can create a listing" on listings;
create policy "anyone can create a listing"
  on listings for insert with check (true);

drop policy if exists "anyone can register as seeker" on seekers;
create policy "anyone can register as seeker"
  on seekers for insert with check (true);
-- No select policies: contacts stay server-side. Matching uses the service key.

-- ---------------------------------------------------------------------------
-- Instant match preview (better than the daily-email-only original):
-- a seeker sees how many live listings fit them RIGHT NOW, plus anonymized
-- dots on the map. Security definer + explicit column list = no contact leak.
-- ---------------------------------------------------------------------------
create or replace function match_preview(
  p_lat double precision,
  p_lng double precision,
  p_budget integer,
  p_bhk text,
  p_room_ok boolean default false
)
returns table (lat double precision, lng double precision, rent integer,
               bhk text, furnishing text, whole_flat boolean)
language sql
stable
security definer
set search_path = public
as $$
  select round(l.lat::numeric, 3)::double precision,
         round(l.lng::numeric, 3)::double precision,
         l.rent, l.bhk, l.furnishing, l.whole_flat
  from listings l
  where l.hidden = false
    and l.active_until > now()
    and l.rent <= p_budget
    and (l.bhk = p_bhk or (p_room_ok and l.whole_flat = false))
    and st_dwithin(
          st_makepoint(l.lng, l.lat)::geography,
          st_makepoint(p_lng, p_lat)::geography,
          2500)
  limit 200;
$$;

grant execute on function match_preview(double precision, double precision, integer, text, boolean) to anon;

-- ---------------------------------------------------------------------------
-- Daily matcher (called by the /api/match route with the service role key):
-- returns fresh seeker↔listing pairs that haven't been emailed yet.
-- ---------------------------------------------------------------------------
create or replace function find_new_matches()
returns table (seeker_id uuid, listing_id uuid,
               seeker_email text, seeker_phone text,
               listing_email text, listing_phone text,
               listing_rent integer, listing_bhk text, listing_furnishing text,
               listing_whole_flat boolean, listing_lat double precision,
               listing_lng double precision)
language sql
stable
set search_path = public
as $$
  select s.id, l.id, s.contact_email, s.contact_phone,
         l.contact_email, l.contact_phone,
         l.rent, l.bhk, l.furnishing, l.whole_flat,
         round(l.lat::numeric, 3)::double precision,
         round(l.lng::numeric, 3)::double precision
  from seekers s
  join listings l
    on l.hidden = false
   and l.active_until > now()
   and s.active_until > now()
   and l.rent <= s.budget_max
   and (l.bhk = s.bhk or (s.room_ok and l.whole_flat = false))
   and (l.smoking_ok or not s.smoker)
   and (not l.veg_only or s.veg)
   and st_dwithin(
         st_makepoint(l.lng, l.lat)::geography,
         st_makepoint(s.lng, s.lat)::geography,
         2500)
  left join matches m on m.seeker_id = s.id and m.listing_id = l.id
  where m.id is null
  limit 500;
$$;
-- Not granted to anon on purpose — service role only.

-- ---------------------------------------------------------------------------
-- v3: richer pins, community ratings & comments, 1-km alerts, To-Let spotting
-- ---------------------------------------------------------------------------

alter table rent_pins add column if not exists furnishing text
  check (furnishing in ('Furnished','Unfurnished'));
alter table rent_pins add column if not exists maintenance_included boolean;
alter table rent_pins add column if not exists gated boolean;
alter table rent_pins add column if not exists tenant_type text
  check (tenant_type in ('Family','Bachelor'));
alter table rent_pins add column if not exists pets text
  check (pets in ('Yes','No','Not sure'));
alter table rent_pins add column if not exists parking_count integer
  check (parking_count between 0 and 20);
alter table rent_pins add column if not exists sqft integer
  check (sqft between 50 and 20000);
alter table rent_pins add column if not exists society text
  check (char_length(society) <= 80);
alter table rent_pins add column if not exists note text
  check (char_length(note) <= 140);

-- Community rating (1–5 stars) on a pin. Anonymous, append-only.
create table if not exists pin_ratings (
  id         uuid primary key default gen_random_uuid(),
  pin_id     uuid not null references rent_pins (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists pin_ratings_pin_idx on pin_ratings (pin_id);
alter table pin_ratings enable row level security;
drop policy if exists "anyone can read ratings" on pin_ratings;
create policy "anyone can read ratings" on pin_ratings for select using (true);
drop policy if exists "anyone can rate" on pin_ratings;
create policy "anyone can rate" on pin_ratings for insert with check (true);

-- Comments on a pin. Anonymous, capped at 280 chars.
create table if not exists pin_comments (
  id         uuid primary key default gen_random_uuid(),
  pin_id     uuid not null references rent_pins (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 280),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pin_comments_pin_idx on pin_comments (pin_id);
alter table pin_comments enable row level security;
drop policy if exists "anyone can read visible comments" on pin_comments;
create policy "anyone can read visible comments"
  on pin_comments for select using (hidden = false);
drop policy if exists "anyone can comment" on pin_comments;
create policy "anyone can comment" on pin_comments for insert with check (true);

-- "Be the first to know when a flat opens here" — 1-km email alert.
-- Write-only: no select policy, so emails can never be read via the anon API.
create table if not exists area_alerts (
  id         uuid primary key default gen_random_uuid(),
  lat        double precision not null check (lat between 18.5 and 19.6),
  lng        double precision not null check (lng between 72.5 and 73.5),
  email      text not null,
  created_at timestamptz not null default now()
);
alter table area_alerts enable row level security;
drop policy if exists "anyone can subscribe" on area_alerts;
create policy "anyone can subscribe" on area_alerts for insert with check (true);

-- Spotted To-Let boards: crowd-sourced photos of boards on the street.
create table if not exists tolet_spots (
  id           uuid primary key default gen_random_uuid(),
  lat          double precision not null check (lat between 18.5 and 19.6),
  lng          double precision not null check (lng between 72.5 and 73.5),
  photo_url    text,
  spotter_name text check (char_length(spotter_name) <= 40),
  message      text check (char_length(message) <= 140),
  hidden       boolean not null default false,
  report_count integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table tolet_spots enable row level security;
drop policy if exists "anyone can read visible tolet spots" on tolet_spots;
create policy "anyone can read visible tolet spots"
  on tolet_spots for select using (hidden = false);
drop policy if exists "anyone can spot a tolet" on tolet_spots;
create policy "anyone can spot a tolet" on tolet_spots for insert with check (true);

create or replace function report_tolet(spot_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update tolet_spots
  set report_count = report_count + 1,
      hidden = (report_count + 1) >= 3
  where id = spot_id;
$$;
grant execute on function report_tolet(uuid) to anon;

-- Anonymized "available flats" layer: rounded coords, no contact info.
create or replace function available_flats()
returns table (lat double precision, lng double precision, rent integer,
               bhk text, furnishing text, whole_flat boolean)
language sql
stable
security definer
set search_path = public
as $$
  select round(l.lat::numeric, 3)::double precision,
         round(l.lng::numeric, 3)::double precision,
         l.rent, l.bhk, l.furnishing, l.whole_flat
  from listings l
  where l.hidden = false and l.active_until > now()
  limit 500;
$$;
grant execute on function available_flats() to anon;

-- Public bucket for To-Let board photos (client downsizes before upload).
insert into storage.buckets (id, name, public)
values ('tolet-photos', 'tolet-photos', true)
on conflict (id) do nothing;
drop policy if exists "anon can upload tolet photos" on storage.objects;
create policy "anon can upload tolet photos"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'tolet-photos');
drop policy if exists "public can view tolet photos" on storage.objects;
create policy "public can view tolet photos"
  on storage.objects for select using (bucket_id = 'tolet-photos');

-- ---------------------------------------------------------------------------
-- v3.1: rating aggregates cached on the pin row, so the map can label every
-- dot ("2BHK · 30K ★4.2") from the single pins query.
-- ---------------------------------------------------------------------------

alter table rent_pins add column if not exists rating_sum integer not null default 0;
alter table rent_pins add column if not exists rating_count integer not null default 0;

create or replace function bump_pin_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update rent_pins
  set rating_sum = rating_sum + new.rating,
      rating_count = rating_count + 1
  where id = new.pin_id;
  return new;
end;
$$;

drop trigger if exists pin_rating_bump on pin_ratings;
create trigger pin_rating_bump
  after insert on pin_ratings
  for each row execute function bump_pin_rating();

-- Backfill aggregates from any ratings that predate the trigger.
update rent_pins p
set rating_sum = s.total, rating_count = s.cnt
from (
  select pin_id, sum(rating) as total, count(*) as cnt
  from pin_ratings group by pin_id
) s
where s.pin_id = p.id;

-- ---------------------------------------------------------------------------
-- v3.2: 1-km alert delivery + abuse hardening
-- ---------------------------------------------------------------------------

-- Each subscription gets exactly one email ("be the FIRST to know"), tracked
-- here. Dedupe existing rows before enforcing uniqueness.
alter table area_alerts add column if not exists notified_at timestamptz;
delete from area_alerts a using area_alerts b
  where a.id > b.id and a.email = b.email and a.lat = b.lat and a.lng = b.lng;
create unique index if not exists area_alerts_unique
  on area_alerts (email, lat, lng);

-- New listings within 1 km of an un-notified alert, one listing per alert.
-- Only listings created AFTER the subscription count ("when a flat opens").
-- Service-role only — returns subscriber emails.
create or replace function find_new_area_alerts()
returns table (alert_id uuid, email text, listing_rent integer,
               listing_bhk text, listing_furnishing text,
               listing_whole_flat boolean,
               listing_lat double precision, listing_lng double precision)
language sql
stable
set search_path = public
as $$
  select a.id, a.email, l.rent, l.bhk, l.furnishing, l.whole_flat,
         round(l.lat::numeric, 3)::double precision,
         round(l.lng::numeric, 3)::double precision
  from area_alerts a
  join lateral (
    select * from listings l
    where l.hidden = false
      and l.active_until > now()
      and l.created_at > a.created_at
      and st_dwithin(
            st_makepoint(l.lng, l.lat)::geography,
            st_makepoint(a.lng, a.lat)::geography,
            1000)
    order by l.created_at asc
    limit 1
  ) l on true
  where a.notified_at is null
  limit 200;
$$;
-- Not granted to anon on purpose — service role only.

-- Cap direct uploads to the photo bucket (client already downsizes to ≤1000px
-- JPEG; this stops anyone bypassing the client with the anon key).
update storage.buckets
set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg']
where id = 'tolet-photos';

-- ---------------------------------------------------------------------------
-- v4: abuse protection. All writes now go through /api/submit (service role),
-- which rate-limits per IP and optionally verifies Cloudflare Turnstile.
-- Direct anonymous writes are revoked below.
-- ---------------------------------------------------------------------------

create table if not exists write_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  action     text not null,
  created_at timestamptz not null default now()
);
create index if not exists write_log_idx
  on write_log (ip_hash, action, created_at);
alter table write_log enable row level security; -- no policies: service role only

-- Atomically counts recent writes from this IP for this action and records the
-- new one. Returns false (and records nothing) when the limit is hit.
create or replace function consume_rate_limit(
  p_ip text, p_action text, p_max integer, p_window_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare cnt integer;
begin
  select count(*) into cnt from write_log
  where ip_hash = p_ip and action = p_action
    and created_at > now() - make_interval(mins => p_window_minutes);
  if cnt >= p_max then
    return false;
  end if;
  insert into write_log (ip_hash, action) values (p_ip, p_action);
  return true;
end;
$$;
-- Not granted to anon on purpose — service role only.

-- Close the direct write path: the anon key can now only READ. (These policies
-- are created earlier in this file, so a full rerun still ends locked down.)
drop policy if exists "anyone can insert pins" on rent_pins;
drop policy if exists "anyone can create a listing" on listings;
drop policy if exists "anyone can register as seeker" on seekers;
drop policy if exists "anyone can rate" on pin_ratings;
drop policy if exists "anyone can comment" on pin_comments;
drop policy if exists "anyone can subscribe" on area_alerts;
drop policy if exists "anyone can spot a tolet" on tolet_spots;
revoke execute on function report_pin(uuid) from anon;
revoke execute on function report_tolet(uuid) from anon;
-- Photo uploads stay direct-to-storage (bucket enforces ≤2MB jpeg); the spot
-- row itself goes through /api/submit, so orphan uploads never reach the map.

-- ---------------------------------------------------------------------------
-- v4.1: Postgres gives PUBLIC execute on functions by default, so revoking
-- only from anon isn't enough — an anonymous PostgREST call could still reach
-- internal functions (find_new_matches returns contact emails!). Lock every
-- internal function down and re-grant only to service_role.
-- ---------------------------------------------------------------------------

revoke execute on function report_pin(uuid) from public, anon, authenticated;
revoke execute on function report_tolet(uuid) from public, anon, authenticated;
revoke execute on function consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function find_new_matches() from public, anon, authenticated;
revoke execute on function find_new_area_alerts() from public, anon, authenticated;
revoke execute on function bump_pin_rating() from public, anon, authenticated;

grant execute on function report_pin(uuid) to service_role;
grant execute on function report_tolet(uuid) to service_role;
grant execute on function consume_rate_limit(text, text, integer, integer) to service_role;
grant execute on function find_new_matches() to service_role;
grant execute on function find_new_area_alerts() to service_role;
grant execute on function bump_pin_rating() to service_role;

-- match_preview() and available_flats() keep their explicit anon grants:
-- read-only, anonymized, and meant for the browser.

notify pgrst, 'reload schema';
