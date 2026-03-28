// LLM fallback for voice-input matching via Groq.
// Called when the local fuzzy scan can't identify a title or director field.

const GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Ask the LLM whether `transcript` refers to the given `value` for `field`.
 * Returns true if the model says YES, false otherwise (including on error).
 */
export async function llmMatchField(
  transcript: string,
  field: 'title' | 'director',
  value: string,
): Promise<boolean> {
  if (!GROQ_KEY) return false;
  const label = field === 'title' ? 'movie title' : 'director name';
  const prompt =
    `The correct ${label} is "${value}". A player said: "${transcript}". ` +
    `Is the player referring to this ${label}? Consider phonetic approximations across languages. Reply YES or NO only.`;
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 5,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const answer: string = data.choices?.[0]?.message?.content?.trim().toUpperCase() ?? '';
    return answer.startsWith('YES');
  } catch {
    return false;
  }
}
