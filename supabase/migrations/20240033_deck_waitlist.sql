-- Physical deck waitlist: gauges interest in the printed Cinescenes deck.
-- 'tap' rows log every press of the USE DECK tile (no email); 'signup' rows
-- carry the email someone left to be notified at launch. device_id is an
-- anonymous per-install id, so taps can be counted per person.
create table if not exists public.deck_waitlist (
  id          uuid primary key default gen_random_uuid(),
  event       text not null check (event in ('tap', 'signup')),
  email       text check (email is null or char_length(email) between 3 and 254),
  user_id     uuid references auth.users(id) on delete set null,
  app_version text,
  platform    text check (platform in ('ios', 'android', 'web')),
  locale      text,
  device_id   text,
  created_at  timestamptz not null default now(),
  constraint deck_waitlist_signup_has_email check (event <> 'signup' or email is not null)
);

-- One signup per email (case-insensitive); repeat joins surface as 23505.
create unique index if not exists deck_waitlist_signup_email_idx
  on public.deck_waitlist (lower(email)) where event = 'signup';
create index if not exists deck_waitlist_created_at_idx on public.deck_waitlist (created_at desc);

alter table public.deck_waitlist enable row level security;

-- Anyone (signed-in or anon) can add a row. Reads are restricted (service role only).
drop policy if exists "deck_waitlist_insert_all" on public.deck_waitlist;
create policy "deck_waitlist_insert_all" on public.deck_waitlist
  for insert
  to anon, authenticated
  with check (true);
