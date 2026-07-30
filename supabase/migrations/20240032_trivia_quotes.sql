-- Give famous movie quotes/taglines their own 'quote' category instead of being
-- lumped into 'production'. Two parts:
--   1) Reclassify existing quote-style questions that were tagged 'production'.
--   2) Seed a new hand-authored batch of quote questions for movies that didn't
--      have one yet.
-- Same rules as the classics seed: never reveal the film's title, release year, or
-- director; correct answer listed FIRST (the app reshuffles at display time);
-- verified=false — hand-authored, not eval-checked (unlike pipeline output).

-- ── 1) Reclassify existing quote/tagline questions (were 'production') ──────────
-- Matched by exact question text — safe within this small table, and idempotent
-- (a re-run just re-applies the same no-op update).
update trivia_questions set category = 'quote'
  where question = 'This film''s tagline was ''In space, no one can hear you ___.''';
update trivia_questions set category = 'quote'
  where question = 'What is this film''s famous tagline?';
update trivia_questions set category = 'quote'
  where question = 'The film''s poster promised: "You''ll believe a man can ___."';
update trivia_questions set category = 'quote'
  where question = 'A character famously declares he loves the smell of what "in the morning"?';
update trivia_questions set category = 'quote'
  where question = 'To the line "Surely you can''t be serious," the reply is: "I am serious — and don''t call me ___."';
update trivia_questions set category = 'quote'
  where question = 'The lead character delivers the line: "Say hello to my little ___."';
update trivia_questions set category = 'quote'
  where question = 'Which line did the lead actor improvise while facing a mirror?';
update trivia_questions set category = 'quote'
  where question = 'Which chilling line did the lead actor improvise, borrowing from a TV show''s intro?';
update trivia_questions set category = 'quote'
  where question = 'To keep its big twist secret, the cast were often given a fake line of dialogue. What was it?';

-- ── 2) New quote questions for movies not yet covered ───────────────────────────
delete from trivia_questions where generator_key = 'manual-claude-quotes';

insert into trivia_questions
  (movie_id, category, question, options, correct_index, difficulty_band, difficulty_score, source, generator_key, verified)
select m.id, v.category, v.question, v.options, 0, v.band, v.score, 'manual', 'manual-claude-quotes', false
from (values
  ('The Godfather', 1972,
   'quote', 'Complete the line: "I''m gonna make him an offer he can''t ___."',
   array['refuse','accept','ignore','believe'], 'easy', 0.22),

  ('The Terminator', 1984,
   'quote', 'Complete the line: "I''ll be ___."',
   array['back','gone','done','there'], 'easy', 0.2),

  ('Top Gun', 1986,
   'quote', 'Complete the line: "I feel the need... the need for ___."',
   array['speed','power','glory','flight'], 'easy', 0.22),

  ('The Princess Bride', 1987,
   'quote', 'Complete the line: "Hello. My name is Inigo Montoya. You killed my father. Prepare to ___."',
   array['die','fight','run','kneel'], 'easy', 0.25),

  ('Wall Street', 1987,
   'quote', 'Complete the line: "Greed, for lack of a better word, is ___."',
   array['good','power','freedom','necessary'], 'easy', 0.28),

  ('When Harry Met Sally', 1989,
   'quote', 'Complete the line: "I''ll have what she''s ___."',
   array['having','eating','drinking','ordering'], 'easy', 0.28),

  ('Field of Dreams', 1989,
   'quote', 'Complete the line: "If you build it, ___ will come."',
   array['he','they','we','it'], 'easy', 0.3),

  ('Home Alone', 1990,
   'quote', 'Complete the line: "Keep the change, ya filthy ___!"',
   array['animal','rat','pig','thief'], 'easy', 0.22),

  ('Terminator 2: Judgment Day', 1991,
   'quote', 'Complete the line: "Hasta la vista, ___."',
   array['baby','amigo','buddy','partner'], 'easy', 0.2),

  ('A Few Good Men', 1992,
   'quote', 'Complete the line: "You can''t handle the ___!"',
   array['truth','pressure','facts','evidence'], 'easy', 0.22),

  ('Jurassic Park', 1993,
   'quote', 'Complete the line: "Life, uh, finds a ___."',
   array['way','path','means','chance'], 'easy', 0.25),

  ('Forrest Gump', 1994,
   'quote', 'Complete the line: "...you never know what you''re gonna ___."',
   array['get','find','taste','choose'], 'easy', 0.22),

  ('Pulp Fiction', 1994,
   'quote', 'Complete the line: "Royale with ___."',
   array['cheese','fries','sauce','mustard'], 'easy', 0.3),

  ('Braveheart', 1995,
   'quote', 'Complete the line: "...they''ll never take our ___!"',
   array['freedom','country','honor','spirit'], 'easy', 0.25),

  ('The Big Lebowski', 1998,
   'quote', 'Complete the line: "...that''s just, like, your opinion, ___."',
   array['man','dude','friend','pal'], 'easy', 0.3),

  ('The Matrix', 1999,
   'quote', 'Complete the line: "There is no ___."',
   array['spoon','truth','escape','choice'], 'easy', 0.25),

  ('Titanic', 1997,
   'quote', 'Complete the line: "I''m the king of the ___!"',
   array['world','ship','ocean','seas'], 'easy', 0.2)
) as v(title, year, category, question, options, band, score)
join movies m on m.title = v.title and m.year = v.year and m.youtube_id is not null;
