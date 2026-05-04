-- Director's Notes: in-app player feedback
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('works_well', 'improvement', 'bug', 'idea')),
  note        text not null check (char_length(note) between 1 and 1000),
  email       text,
  user_id     uuid references auth.users(id) on delete set null,
  app_version text,
  platform    text check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_category_idx   on public.feedback (category);

alter table public.feedback enable row level security;

-- Anyone (signed-in or anon) can submit feedback. Reads are restricted (service role only).
drop policy if exists "feedback_insert_all" on public.feedback;
create policy "feedback_insert_all" on public.feedback
  for insert
  to anon, authenticated
  with check (true);
