-- Single-player "Who wants to be a cinephile" trivia question bank.
-- Written by the offline cinescenes-trivia-pipeline (service role); the app only reads.

create table if not exists trivia_questions (
  id               uuid primary key default gen_random_uuid(),
  movie_id         uuid not null references movies (id) on delete cascade,
  category         text not null,          -- director|genre|awards|production|...
  question         text not null,
  options          text[] not null,        -- exactly 4 (enforced below)
  correct_index    int  not null check (correct_index between 0 and 3),
  difficulty_band  text check (difficulty_band in ('easy','medium','hard')),
  difficulty_score real,                    -- 0..1, seeds ladder ordering; recalibrated from stats
  source           text not null,           -- wikipedia|wikidata|tmdb|oscar_data
  source_ref       text,
  source_sentence  text,                    -- grounding sentence (audit; not shown to players)
  generator_key    text,
  verified         boolean not null default false,
  -- Calibration: recompute difficulty from real play (Phase C, via an RPC).
  times_shown      int not null default 0,
  times_correct    int not null default 0,
  created_at       timestamptz not null default now(),
  constraint trivia_questions_four_options check (array_length(options, 1) = 4)
);

create index if not exists trivia_questions_movie_id_idx  on trivia_questions (movie_id);
create index if not exists trivia_questions_difficulty_idx on trivia_questions (difficulty_band);

-- RLS: public read (like movies). Writes are pipeline-only via the service role,
-- which bypasses RLS — so no client insert/update policy is granted here.
-- (Client-side calibration increments will land in Phase C as a dedicated RPC.)
alter table trivia_questions enable row level security;

create policy "trivia_questions_public_read"
  on trivia_questions for select
  using (true);
