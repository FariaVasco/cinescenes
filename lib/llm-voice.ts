// LLM fallback for voice-input parsing via Groq.
// Only responsible for extracting verbatim text segments from the transcript.
// Phonetic correction against known values is handled separately in JS.

const GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
  if (!GROQ_KEY) return empty;
  if (!hasContentWords(transcript)) return empty;

  const systemPrompt =
    `You are a sentence parser. Identify which words in the input are being used as a movie title and which as a person's name (the director). ` +
    `Copy those words VERBATIM from the input — do not correct, normalise, or replace them with any names from your own knowledge. ` +
    `Reply with exactly two lines: TITLE: <verbatim words or NONE> and DIRECTOR: <verbatim words or NONE>.`;

  const userPrompt = `Sentence: "${transcript}"`;

  console.log(`[llm-voice] calling Groq — transcript: "${transcript}"`);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 30,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    console.log(`[llm-voice] response: "${content.trim()}"`);

    const lines = content.split('\n');
    const titleLine = lines.find(l => l.toUpperCase().startsWith('TITLE:'));
    const directorLine = lines.find(l => l.toUpperCase().startsWith('DIRECTOR:'));
    const title = titleLine?.replace(/^title:\s*/i, '').trim() ?? '';
    const director = directorLine?.replace(/^director:\s*/i, '').trim() ?? '';

    return {
      title: title && title.toUpperCase() !== 'NONE' ? title : null,
      director: director && director.toUpperCase() !== 'NONE' ? director : null,
    };
  } catch {
    return empty;
  }
}
