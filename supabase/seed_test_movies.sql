-- ============================================================
-- Cinescenes — Test Movie Seed (15 movies, active = true)
-- These movies have hand-verified youtube_id + safe timestamps.
-- Run AFTER schema.sql.
--
-- HOW TO FIND SAFE TIMESTAMPS:
--   1. Watch the official YouTube trailer
--   2. Find a 30-60s window with no title card, year text, or
--      spoken movie name / director name
--   3. Set safe_start / safe_end to those second values
--   4. Set active = true
--
-- The youtube_id values below are placeholders — replace them
-- with the real official trailer YouTube IDs before use.
-- ============================================================

insert into movies (title, year, director, youtube_id, safe_start, safe_end, active) values
  ('The Godfather',          1972, 'Francis Ford Coppola', 'sY1S34973zA', 8, 57,  true),
  ('Groundhog Day',          1993, 'Harold Ramis',         'GncQtURdcE4', 7,  37,  true),
  ('Star Wars',              1977, 'George Lucas',         'vZ734NWnAHA', 15, 45,  true),
  ('Alien',                  1979, 'Ridley Scott',         'jQ5lPt9edzQ', 43, 100,  true),
  ('Raiders of the Lost Ark',1981, 'Steven Spielberg',     '0xQSIdSRlAk', 34, 70,  true),
  ('E.T. the Extra-Terrestrial', 1982, 'Steven Spielberg', 'FkT-LM8JxCs', 1, 39,  true),
  ('Back to the Future',     1985, 'Robert Zemeckis',      'ez6WQ7IX72U', 1,  32,  true),
  ('Die Hard',               1988, 'John McTiernan',       'jaJuwKCmJtY', 10,  47,  true),
  ('The Silence of the Lambs',1991,'Jonathan Demme',       'RuX2MQeb8UM', 29, 60,  true),
  ('Schindler''s List',      1993, 'Steven Spielberg',     'gG22XNhtnoY', 20, 80,  true),
  ('Pulp Fiction',           1994, 'Quentin Tarantino',    's7EdQ4FqbhY', 35, 87,  true),
  ('The Matrix',             1999, 'Lana & Lilly Wachowski','vKQi3bBA1y8', 45, 93,  true),
  ('Gladiator',              2000, 'Ridley Scott',         'owK1qxDselE', 62,  86,  true),
  ('The Dark Knight',        2008, 'Christopher Nolan',    'EXeTwQWrcwY', 20, 94,  true),
  ('Inception',              2010, 'Christopher Nolan',    'YoHD9XEInc0', 30, 60,  true)
on conflict do nothing;
