-- Hand-authored trivia seed batch for well-known classics in the deck.
-- Rules: never reveal the film's title, release year, or director in the question/options
-- (the player identifies the film from its trailer). Correct answer is listed FIRST; the app
-- reshuffles option order at display time, so positional bias is not an issue.
--
-- Idempotent: clears its own prior batch, then re-inserts. Each insert only fires for a movie
-- that exists AND has a playable trailer (youtube_id), so we never create trailer-less questions.
-- verified=false — these are hand-authored, not eval-checked (unlike pipeline output).

delete from trivia_questions where generator_key = 'manual-claude-classics';

insert into trivia_questions
  (movie_id, category, question, options, correct_index, difficulty_band, difficulty_score, source, generator_key, verified)
select m.id, v.category, v.question, v.options, 0, v.band, v.score, 'manual', 'manual-claude-classics', false
from (values
  -- ── Star Wars (1977) ──────────────────────────────────────────────────────
  ('Star Wars', 1977,
   'production', 'The visual-effects company founded to make this film later became known as what?',
   array['Industrial Light & Magic','Weta Workshop','Pixar','Amblin Entertainment'], 'medium', 0.55),
  ('Star Wars', 1977,
   'casting', 'Which actor was reportedly offered the role of the roguish smuggler but turned it down?',
   array['Al Pacino','Robert Redford','Jack Nicholson','Warren Beatty'], 'hard', 0.8),

  -- ── The Empire Strikes Back (1980) ────────────────────────────────────────
  ('The Empire Strikes Back', 1980,
   'quote', 'To keep its big twist secret, the cast were often given a fake line of dialogue. What was it?',
   array['"Obi-Wan killed your father."','"The Emperor is your master."','"You will never win."','"Your sister still lives."'], 'hard', 0.82),
  ('The Empire Strikes Back', 1980,
   'production', 'This installment had a new director, who had earlier been the first film''s director''s teacher at which university?',
   array['USC','NYU','UCLA','Juilliard'], 'hard', 0.85),

  -- ── Alien (1979) ──────────────────────────────────────────────────────────
  ('Alien', 1979,
   'quote', 'What is this film''s famous tagline?',
   array['"In space, no one can hear you scream."','"Be afraid. Be very afraid."','"We are not alone."','"Just when you thought it was safe."'], 'easy', 0.25),
  ('Alien', 1979,
   'production', 'The creature was designed by which surrealist artist?',
   array['H. R. Giger','Salvador Dalí','Ralph McQuarrie','Rick Baker'], 'medium', 0.55),

  -- ── Blade Runner (1982) ───────────────────────────────────────────────────
  ('Blade Runner', 1982,
   'production', 'This film was adapted from a novel by which science-fiction author?',
   array['Philip K. Dick','Isaac Asimov','Arthur C. Clarke','Ray Bradbury'], 'medium', 0.5),
  ('Blade Runner', 1982,
   'production', 'The test used to tell replicants from humans is called the what test?',
   array['Voight-Kampff','Turing','Rorschach','Pavlov'], 'medium', 0.55),

  -- ── E.T. the Extra-Terrestrial (1982) ─────────────────────────────────────
  ('E.T. the Extra-Terrestrial', 1982,
   'production', 'Which candy, used to lure the alien, saw a big sales boost after the film?',
   array['Reese''s Pieces','M&M''s','Skittles','Milk Duds'], 'easy', 0.3),

  -- ── Raiders of the Lost Ark (1981) ────────────────────────────────────────
  ('Raiders of the Lost Ark', 1981,
   'production', 'The story was conceived by which other famous filmmaker, who co-produced it?',
   array['George Lucas','Francis Ford Coppola','Brian De Palma','John Milius'], 'medium', 0.6),

  -- ── The Shining (1980) ────────────────────────────────────────────────────
  ('The Shining', 1980,
   'production', 'This film was based on a novel by which author, who publicly disliked the adaptation?',
   array['Stephen King','Dean Koontz','Peter Straub','Clive Barker'], 'easy', 0.35),
  ('The Shining', 1980,
   'quote', 'Which chilling line did the lead actor improvise, borrowing from a TV show''s intro?',
   array['"Here''s Johnny!"','"Redrum."','"All work and no play."','"Come play with us."'], 'medium', 0.5),

  -- ── Rocky (1976) ──────────────────────────────────────────────────────────
  ('Rocky', 1976,
   'production', 'Besides starring, what other key job did the lead actor take on for this film?',
   array['Screenwriter','Director','Composer','Editor'], 'medium', 0.5),
  ('Rocky', 1976,
   'awards', 'Which Academy Award did this film win?',
   array['Best Picture','Best Actor','Best Original Screenplay','Best Cinematography'], 'easy', 0.35),

  -- ── Apocalypse Now (1979) ─────────────────────────────────────────────────
  ('Apocalypse Now', 1979,
   'production', 'This film''s notoriously troubled shoot was chronicled in which making-of documentary?',
   array['Hearts of Darkness','Burden of Dreams','Lost in La Mancha','The Kid Stays in the Picture'], 'hard', 0.8),
  ('Apocalypse Now', 1979,
   'quote', 'A character famously declares he loves the smell of what "in the morning"?',
   array['Napalm','Gunpowder','Victory','Rain'], 'easy', 0.3),

  -- ── Ghostbusters (1984) ───────────────────────────────────────────────────
  ('Ghostbusters', 1984,
   'production', 'The film''s hit theme song repeatedly asks which question?',
   array['"Who you gonna call?"','"Are you ready?"','"Can you feel it?"','"Who''s afraid?"'], 'easy', 0.2),
  ('Ghostbusters', 1984,
   'production', 'The giant figure that rampages in the finale is the ___ Man.',
   array['Stay Puft','Pillsbury','Michelin','Frosty'], 'medium', 0.5),

  -- ── Amadeus (1984) ────────────────────────────────────────────────────────
  ('Amadeus', 1984,
   'awards', 'Roughly how many Academy Awards did this film win?',
   array['8','4','2','11'], 'medium', 0.6),

  -- ── Taxi Driver (1976) ────────────────────────────────────────────────────
  ('Taxi Driver', 1976,
   'quote', 'Which line did the lead actor improvise while facing a mirror?',
   array['"You talkin'' to me?"','"Are you looking at me?"','"What do you want?"','"Who''s there?"'], 'easy', 0.35),
  ('Taxi Driver', 1976,
   'production', 'This film''s haunting score was the final work of which composer, who died just after finishing it?',
   array['Bernard Herrmann','Ennio Morricone','John Williams','Jerry Goldsmith'], 'hard', 0.82),

  -- ── Halloween (1978) ──────────────────────────────────────────────────────
  ('Halloween', 1978,
   'production', 'The killer''s white mask was famously a modified mask of which character?',
   array['Captain Kirk','A hockey goalie','A circus clown','A ghost'], 'medium', 0.55),

  -- ── The Thing (1982) ──────────────────────────────────────────────────────
  ('The Thing', 1982,
   'production', 'On which continent is this film''s isolated research station located?',
   array['Antarctica','The Arctic','Greenland','Siberia'], 'medium', 0.5),

  -- ── Grease (1978) ─────────────────────────────────────────────────────────
  ('Grease', 1978,
   'production', 'In which decade is this musical set?',
   array['The 1950s','The 1940s','The 1960s','The 1970s'], 'easy', 0.3),

  -- ── Airplane! (1980) ──────────────────────────────────────────────────────
  ('Airplane!', 1980,
   'quote', 'To the line "Surely you can''t be serious," the reply is: "I am serious — and don''t call me ___."',
   array['Shirley','Sir','Roger','Ted'], 'easy', 0.35),

  -- ── Superman (1978) ───────────────────────────────────────────────────────
  ('Superman', 1978,
   'quote', 'The film''s poster promised: "You''ll believe a man can ___."',
   array['fly','change the world','live forever','save us all'], 'easy', 0.3),

  -- ── Scarface (1983) ───────────────────────────────────────────────────────
  ('Scarface', 1983,
   'quote', 'The lead character delivers the line: "Say hello to my little ___."',
   array['friend','brother','gun','world'], 'easy', 0.25),
  ('Scarface', 1983,
   'production', 'Which director-screenwriter, later known for war and gangster films, wrote this screenplay?',
   array['Oliver Stone','Michael Mann','David Mamet','William Friedkin'], 'hard', 0.78),

  -- ── Close Encounters of the Third Kind (1977) ─────────────────────────────
  ('Close Encounters of the Third Kind', 1977,
   'production', 'Communication with the visitors is established through a sequence of five musical what?',
   array['notes','colors','words','lights'], 'medium', 0.5),

  -- ── Raging Bull (1980) ────────────────────────────────────────────────────
  ('Raging Bull', 1980,
   'production', 'The lead actor gained roughly how many pounds to play the boxer in his later years?',
   array['60','20','35','100'], 'medium', 0.6),
  ('Raging Bull', 1980,
   'production', 'This film was shot in which visual style?',
   array['Black and white','Technicolor','Sepia tone','3D'], 'easy', 0.35)
) as v(title, year, category, question, options, band, score)
join movies m on m.title = v.title and m.year = v.year and m.youtube_id is not null;
