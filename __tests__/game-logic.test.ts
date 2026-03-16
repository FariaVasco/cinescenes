import {
  parseTranscript,
  normalize,
  levenshtein,
  fuzzyMatch,
  computeCorrectInterval,
  computeValidIntervals,
  computeSeqChallengeState,
} from '../lib/game-logic';

// ── parseTranscript ──────────────────────────────────────────────────────────

describe('parseTranscript', () => {
  it('parses "Movie by Director"', () => {
    expect(parseTranscript('Inception by Christopher Nolan')).toEqual({
      movie: 'Inception',
      director: 'Christopher Nolan',
    });
  });

  it('parses "Movie directed by Director"', () => {
    expect(parseTranscript('The Dark Knight directed by Christopher Nolan')).toEqual({
      movie: 'The Dark Knight',
      director: 'Christopher Nolan',
    });
  });

  it('is case-insensitive', () => {
    expect(parseTranscript('Oppenheimer BY Christopher Nolan')).toEqual({
      movie: 'Oppenheimer',
      director: 'Christopher Nolan',
    });
  });

  it('trims whitespace from movie and director', () => {
    expect(parseTranscript('  Alien   by   Ridley Scott  ')).toEqual({
      movie: 'Alien',
      director: 'Ridley Scott',
    });
  });

  it('returns null when no "by" separator', () => {
    expect(parseTranscript('Inception')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTranscript('')).toBeNull();
  });
});

// ── normalize ────────────────────────────────────────────────────────────────

describe('normalize', () => {
  it('lowercases', () => {
    expect(normalize('INCEPTION')).toBe('inception');
  });

  it('strips leading "The"', () => {
    expect(normalize('The Godfather')).toBe('godfather');
  });

  it('strips leading "A"', () => {
    expect(normalize('A Beautiful Mind')).toBe('beautiful mind');
  });

  it('strips leading "An"', () => {
    expect(normalize('An American Werewolf')).toBe('american werewolf');
  });

  it('strips punctuation', () => {
    expect(normalize("Schindler's List")).toBe('schindlers list');
  });

  it('collapses multiple spaces', () => {
    expect(normalize('Star  Wars')).toBe('star wars');
  });
});

// ── levenshtein ──────────────────────────────────────────────────────────────

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('kitten', 'kitten')).toBe(0);
  });

  it('returns correct distance for simple substitution', () => {
    expect(levenshtein('kitten', 'sitten')).toBe(1);
  });

  it('returns length of b for empty a', () => {
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('returns length of a for empty b', () => {
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('handles typical typo', () => {
    expect(levenshtein('kubrik', 'kubrick')).toBe(1);
  });
});

// ── fuzzyMatch ───────────────────────────────────────────────────────────────

describe('fuzzyMatch', () => {
  it('matches exact input', () => {
    expect(fuzzyMatch('Inception', 'Inception')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(fuzzyMatch('inception', 'Inception')).toBe(true);
  });

  it('matches when input omits leading article', () => {
    expect(fuzzyMatch('Godfather', 'The Godfather')).toBe(true);
  });

  it('matches when target omits leading article present in input', () => {
    expect(fuzzyMatch('The Godfather', 'Godfather')).toBe(true);
  });

  it('matches with a 1-char typo', () => {
    expect(fuzzyMatch('Inceptoin', 'Inception')).toBe(true);
  });

  it('matches with a 2-char typo', () => {
    // 'Incepiton' vs 'Inception': swap i↔t at positions 5-6 = 2 substitutions
    expect(fuzzyMatch('Incepiton', 'Inception')).toBe(true);
  });

  it('does not match with a 3-char typo on a short word', () => {
    expect(fuzzyMatch('Incptoin', 'Inception')).toBe(false);
  });

  it('matches last name only for directors', () => {
    expect(fuzzyMatch('Nolan', 'Christopher Nolan')).toBe(true);
  });

  it('matches last name with minor typo', () => {
    expect(fuzzyMatch('Kubrik', 'Stanley Kubrick')).toBe(true);
  });

  it('does not match completely wrong input', () => {
    expect(fuzzyMatch('Avatar', 'Inception')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(fuzzyMatch('', 'Inception')).toBe(false);
  });

  it('returns false for whitespace-only input', () => {
    expect(fuzzyMatch('   ', 'Inception')).toBe(false);
  });
});

// ── computeCorrectInterval ───────────────────────────────────────────────────

describe('computeCorrectInterval', () => {
  it('returns 0 for an empty timeline', () => {
    expect(computeCorrectInterval(2001, [])).toBe(0);
  });

  it('returns 0 when year is before all cards', () => {
    expect(computeCorrectInterval(1990, [1995, 2000, 2005])).toBe(0);
  });

  it('returns timeline.length when year is after all cards', () => {
    expect(computeCorrectInterval(2010, [1995, 2000, 2005])).toBe(3);
  });

  it('returns correct middle index', () => {
    expect(computeCorrectInterval(1998, [1995, 2000, 2005])).toBe(1);
  });

  it('places same year BEFORE existing card of that year', () => {
    // sorted < year stops before equal, so equal year goes at the existing card's position
    expect(computeCorrectInterval(2000, [1995, 2000, 2005])).toBe(1);
  });

  it('is not sensitive to unsorted input', () => {
    expect(computeCorrectInterval(1998, [2005, 1995, 2000])).toBe(1);
  });
});

// ── computeValidIntervals ────────────────────────────────────────────────────

describe('computeValidIntervals', () => {
  it('returns single interval for a unique year', () => {
    expect(computeValidIntervals(2001, [1999, 2003])).toEqual([1]);
  });

  it('returns single interval for an empty timeline', () => {
    expect(computeValidIntervals(2001, [])).toEqual([0]);
  });

  it('returns two intervals when year already exists once', () => {
    // timeline [1999, 2003], new card is 1999 → valid before or after the existing 1999
    expect(computeValidIntervals(1999, [1999, 2003])).toEqual([0, 1]);
  });

  it('returns three intervals when year already exists twice', () => {
    // sorted: [1999, 2003, 2003], new 2003 → [1, 2, 3]
    expect(computeValidIntervals(2003, [1999, 2003, 2003])).toEqual([1, 2, 3]);
  });

  it('returns four intervals when year already exists three times', () => {
    // sorted: [2000, 2000, 2000], new 2000 → [0, 1, 2, 3]
    expect(computeValidIntervals(2000, [2000, 2000, 2000])).toEqual([0, 1, 2, 3]);
  });

  it('returns correct single interval for year after all cards', () => {
    expect(computeValidIntervals(2010, [1990, 2000, 2005])).toEqual([3]);
  });

  it('is not sensitive to unsorted input', () => {
    expect(computeValidIntervals(2001, [2003, 1999])).toEqual([1]);
  });
});

// ── computeSeqChallengeState ─────────────────────────────────────────────────

const t0 = '2024-01-01T10:00:00Z';
const t1 = '2024-01-01T10:00:01Z';
const t2 = '2024-01-01T10:00:02Z';

function mkChallenge(id: string, challenger_id: string, interval_index: number, created_at: string) {
  return { id, challenger_id, interval_index, created_at };
}

const observers = [{ id: 'p2' }, { id: 'p3' }];

describe('computeSeqChallengeState', () => {
  it('allDecided is false when not all observers have a row', () => {
    const challenges = [mkChallenge('c1', 'p2', -1, t0)]; // p3 missing
    const { allDecided } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(allDecided).toBe(false);
  });

  it('allDecided is true when all observers have a row', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -1, t0),
      mkChallenge('c2', 'p3', -2, t1),
    ];
    const { allDecided } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(allDecided).toBe(true);
  });

  it('inSeqPhase is false when all observers passed', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -2, t0),
      mkChallenge('c2', 'p3', -2, t1),
    ];
    const { inSeqPhase } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(inSeqPhase).toBe(false);
  });

  it('inSeqPhase is true when at least one challenger and all decided', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -1, t0),
      mkChallenge('c2', 'p3', -2, t1),
    ];
    const { inSeqPhase } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(inSeqPhase).toBe(true);
  });

  it('first challenger by created_at is currentPicker when unpicked', () => {
    const challenges = [
      mkChallenge('c1', 'p3', -1, t1), // p3 challenged later
      mkChallenge('c2', 'p2', -1, t0), // p2 challenged first
    ];
    const { currentPickerChallenge } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(currentPickerChallenge?.challenger_id).toBe('p2');
  });

  it('isMyTurnToPick is true for the current picker', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -1, t0),
      mkChallenge('c2', 'p3', -2, t1),
    ];
    const { isMyTurnToPick } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(isMyTurnToPick).toBe(true);
  });

  it('isMyTurnToPick is false when a prior challenger has not yet picked', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -1, t0), // p2 goes first but hasn't picked
      mkChallenge('c2', 'p3', -1, t1), // p3 goes second
    ];
    const { isMyTurnToPick } = computeSeqChallengeState(challenges, 'p3', observers);
    expect(isMyTurnToPick).toBe(false);
  });

  it('amFirstChallenger is true for the earliest challenger', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -1, t0),
      mkChallenge('c2', 'p3', -1, t1),
    ];
    const { amFirstChallenger } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(amFirstChallenger).toBe(true);
  });

  it('amFirstChallenger is false for the second challenger', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -1, t0),
      mkChallenge('c2', 'p3', -1, t1),
    ];
    const { amFirstChallenger } = computeSeqChallengeState(challenges, 'p3', observers);
    expect(amFirstChallenger).toBe(false);
  });

  it('advances to next picker after first challenger picks', () => {
    const challenges = [
      mkChallenge('c1', 'p2', 2, t0),  // p2 already picked interval 2
      mkChallenge('c2', 'p3', -1, t1), // p3 is next
    ];
    const { currentPickerChallenge, isMyTurnToPick } = computeSeqChallengeState(
      challenges, 'p3', observers,
    );
    expect(currentPickerChallenge?.challenger_id).toBe('p3');
    expect(isMyTurnToPick).toBe(true);
  });

  it('withdrawn challengers (-3) are excluded from seqChallengers pick ordering', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -3, t0), // p2 withdrew
      mkChallenge('c2', 'p3', -1, t1), // p3 is unpicked
    ];
    const { seqChallengers } = computeSeqChallengeState(challenges, 'p3', observers);
    // -3 is NOT -2, so withdrawn challengers DO stay in seqChallengers (for first-challenger ordering)
    expect(seqChallengers).toHaveLength(2);
  });

  it('no currentPicker when all challengers have settled', () => {
    const challenges = [
      mkChallenge('c1', 'p2', 1, t0),  // picked
      mkChallenge('c2', 'p3', -3, t1), // withdrew
    ];
    const { currentPickerChallenge } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(currentPickerChallenge).toBeNull();
  });

  it('passes (-2) are excluded from seqChallengers entirely', () => {
    const challenges = [
      mkChallenge('c1', 'p2', -2, t0),
      mkChallenge('c2', 'p3', -2, t1),
    ];
    const { seqChallengers } = computeSeqChallengeState(challenges, 'p2', observers);
    expect(seqChallengers).toHaveLength(0);
  });
});
