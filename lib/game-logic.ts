// Pure game logic — no React, no Supabase. Extracted for testability.

// ── Voice input parsing ────────────────────────────────────────────────────

// Parse "Movie Title by Director Name" from a voice transcript.
export function parseTranscript(transcript: string): { movie: string; director: string } | null {
  const match = transcript.match(/^(.+?)\s+(?:directed by|by)\s+(.+)$/i);
  if (match) return { movie: match[1].trim(), director: match[2].trim() };
  return null;
}

// Scan a transcript for a known movie title and director via sliding window + fuzzy.
// Returns which fields were found (canonical DB values).
export function scanTranscript(
  transcript: string,
  movie: { title: string; director: string },
): { title: string | null; director: string | null } {
  return {
    title: transcriptContains(transcript, movie.title) ? movie.title : null,
    director: transcriptContains(transcript, movie.director) ? movie.director : null,
  };
}

function transcriptContains(transcript: string, phrase: string): boolean {
  const tWords = normalize(transcript).split(' ').filter(Boolean);
  const pWords = normalize(phrase).split(' ').filter(Boolean);
  if (pWords.length === 0) return false;
  // Try windows from full phrase down to just the last word (suffix / last-name match)
  for (let len = pWords.length; len >= 1; len--) {
    const target = pWords.slice(pWords.length - len).join(' ');
    if (target.length < 3) continue;
    for (let i = 0; i <= tWords.length - len; i++) {
      const window = tWords.slice(i, i + len).join(' ');
      if (levenshtein(window, target) <= Math.floor(target.length / 6)) return true;
    }
  }
  return false;
}

// Relaxed phonetic match — uses floor(maxLen/4) edit distance, suitable for
// comparing STT-mangled text against canonical names (e.g. "guillermud al toro" ≈ "Guillermo del Toro").
export function phoneticMatch(a: string, b: string): boolean {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen < 4) return false;
  return levenshtein(na, nb) <= Math.floor(maxLen / 4);
}

// ── Fuzzy matching ─────────────────────────────────────────────────────────

// Normalize for fuzzy comparison: lowercase, strip leading article, strip punctuation.
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// Fuzzy match: handles articles, small typos (≤2), and last-name-only for directors.
export function fuzzyMatch(input: string, target: string): boolean {
  if (!input.trim()) return false;
  const a = normalize(input), b = normalize(target);
  if (a === b) return true;
  if (levenshtein(a, b) <= 2) return true;
  // "Kubrick" matches "Stanley Kubrick" — input equals the trailing words of target
  const bWords = b.split(' '), aWords = a.split(' ');
  if (bWords.length > aWords.length) {
    const suffix = bWords.slice(bWords.length - aWords.length).join(' ');
    if (suffix === a || levenshtein(suffix, a) <= 1) return true;
  }
  return false;
}

// ── Timeline interval logic ────────────────────────────────────────────────

// Returns the single correct interval index for a year in a sorted timeline.
export function computeCorrectInterval(year: number, timeline: number[]): number {
  const sorted = [...timeline].sort((a, b) => a - b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] < year) idx++;
  return idx;
}

// When the placed year already exists in the timeline, ALL intervals spanning
// the run of same-year cards are valid (before the first, between any two,
// or after the last duplicate).
export function computeValidIntervals(year: number, timeline: number[]): number[] {
  const sorted = [...timeline].sort((a, b) => a - b);
  const firstDupIdx = sorted.indexOf(year);
  if (firstDupIdx !== -1) {
    const lastDupIdx = sorted.lastIndexOf(year);
    return Array.from({ length: lastDupIdx - firstDupIdx + 2 }, (_, k) => firstDupIdx + k);
  }
  return [computeCorrectInterval(year, timeline)];
}

// ── Sequential challenge state ─────────────────────────────────────────────

interface ChallengeSlim {
  id: string;
  challenger_id: string;
  interval_index: number;
  created_at: string;
}

export function computeSeqChallengeState(
  challenges: ChallengeSlim[],
  myPlayerId: string | null,
  observers: { id: string }[],
) {
  const allDecided = observers.length > 0 && challenges.length >= observers.length;

  // Sorted by challenge time; passes (-2) excluded so only active challengers remain.
  const seqChallengers = [...challenges]
    .filter(c => c.interval_index !== -2)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const currentPickerChallenge = seqChallengers.find(c => c.interval_index === -1) ?? null;
  const amFirstChallenger = seqChallengers[0]?.challenger_id === myPlayerId;
  const isMyTurnToPick = currentPickerChallenge?.challenger_id === myPlayerId;
  const inSeqPhase = allDecided && seqChallengers.length > 0;

  return { allDecided, seqChallengers, currentPickerChallenge, amFirstChallenger, isMyTurnToPick, inSeqPhase };
}
