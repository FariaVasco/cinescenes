-- ============================================================
-- Cinescenes — Full Database Schema
-- Run this in your Supabase SQL editor to initialise the DB.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- MOVIES
-- ============================================================
create table if not exists movies (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  year        int  not null,
  director    text not null,
  youtube_id  text,
  safe_start  int,   -- seconds into trailer where safe window begins
  safe_end    int,   -- seconds into trailer where safe window ends
  poster_url  text,
  flagged     boolean not null default false,
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists movies_active_idx on movies (active);
create index if not exists movies_year_idx   on movies (year);

-- ============================================================
-- GAMES
-- ============================================================
create table if not exists games (
  id               uuid primary key default uuid_generate_v4(),
  name             text,
  mode             text not null default 'digital' check (mode in ('digital', 'physical')),
  multiplayer_type text not null default 'local'   check (multiplayer_type in ('local', 'online')),
  status           text not null default 'lobby'   check (status in ('lobby', 'active', 'finished')),
  game_code        char(6) not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists games_code_idx   on games (game_code);
create index if not exists games_status_idx on games (status);

-- ============================================================
-- PLAYERS
-- ============================================================
create table if not exists players (
  id           uuid primary key default uuid_generate_v4(),
  game_id      uuid not null references games (id) on delete cascade,
  user_id      uuid,  -- null = anonymous local player
  display_name text not null,
  coins        int  not null default 2,
  timeline     int[] not null default '{}',  -- ordered array of movie years (for ordering)
  created_at   timestamptz not null default now()
);

create index if not exists players_game_id_idx on players (game_id);

-- ============================================================
-- TURNS
-- ============================================================
create table if not exists turns (
  id                uuid primary key default uuid_generate_v4(),
  game_id           uuid not null references games (id) on delete cascade,
  active_player_id  uuid not null references players (id),
  movie_id          uuid not null references movies (id),
  placed_interval   int,  -- index into active player's timeline
  status            text not null default 'drawing'
                    check (status in ('drawing', 'placing', 'challenging', 'revealing', 'complete')),
  created_at        timestamptz not null default now()
);

create index if not exists turns_game_id_idx on turns (game_id);

-- ============================================================
-- CHALLENGES
-- ============================================================
create table if not exists challenges (
  id              uuid primary key default uuid_generate_v4(),
  turn_id         uuid not null references turns (id) on delete cascade,
  challenger_id   uuid not null references players (id),
  interval_index  int  not null,
  resolved_at     timestamptz
);

create index if not exists challenges_turn_id_idx on challenges (turn_id);

-- ============================================================
-- REPORTS
-- ============================================================
create table if not exists reports (
  id           uuid primary key default uuid_generate_v4(),
  movie_id     uuid not null references movies (id) on delete cascade,
  reported_by  uuid,  -- user id or null if anonymous
  reason       text,
  created_at   timestamptz not null default now()
);

create index if not exists reports_movie_id_idx on reports (movie_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table movies     enable row level security;
alter table games      enable row level security;
alter table players    enable row level security;
alter table turns      enable row level security;
alter table challenges enable row level security;
alter table reports    enable row level security;

-- movies: public read for active movies; no client writes
create policy "movies_public_read"
  on movies for select
  using (active = true);

-- games: anyone can read; authenticated or anon can insert/update their own
create policy "games_public_read"
  on games for select
  using (true);

create policy "games_insert"
  on games for insert
  with check (true);

create policy "games_update"
  on games for update
  using (true);

-- players: anyone can read; anyone can insert (anonymous sessions allowed)
create policy "players_public_read"
  on players for select
  using (true);

create policy "players_insert"
  on players for insert
  with check (true);

create policy "players_update_own"
  on players for update
  using (true);

-- turns: public read; anyone can insert/update (game host manages turns)
create policy "turns_public_read"
  on turns for select
  using (true);

create policy "turns_insert"
  on turns for insert
  with check (true);

create policy "turns_update"
  on turns for update
  using (true);

-- challenges: same as turns
create policy "challenges_public_read"
  on challenges for select
  using (true);

create policy "challenges_insert"
  on challenges for insert
  with check (true);

create policy "challenges_update"
  on challenges for update
  using (true);

-- reports: anyone can insert; no client reads (reviewed in dashboard)
create policy "reports_insert"
  on reports for insert
  with check (true);
