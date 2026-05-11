// LLM fallback for voice-input parsing via Groq (server-side Edge Function).
// Only responsible for extracting verbatim text segments from the transcript.
// Phonetic correction against known values is handled separately in JS.

import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/llm-parse`;

// Stop words that carry no identifying information.
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'it', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'but', 'my', 'this', 'that', 'its', 'by', 'was', 'are',
  'movie', 'film', 'director', 'called', 'said', 'think', 'know', 'name',
]);

// Returns false if the transcript has no content words — skips the LLM for
// phrases like "the movie is" or "i think".
function hasContentWords(transcript: string): boolean {
  const words = transcript.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  return words.some(w => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Parse the transcript and return the verbatim words the player used as the
 * movie title and director name. Does NOT use movie knowledge — purely structural
 * sentence parsing. Phonetic correction happens separately via phoneticMatch().
 */
export async function llmExtractGuess(
  transcript: string,
): Promise<{ title: string | null; director: string | null }> {
  const empty = { title: null, director: null };
  if (!hasContentWords(transcript)) return empty;

  const { data: { session } } = await supabase.auth.getSession();

  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ transcript }),
    });

    if (!res.ok) return empty;

    const data = await res.json();
    return {
      title: data.title ?? null,
      director: data.director ?? null,
    };
  } catch (e) {
    Sentry.captureException(e);
    return empty;
  }
}
