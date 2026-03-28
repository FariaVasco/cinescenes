// Audio transcription via Groq Whisper.
// Sends a recorded audio file to the Whisper API and returns the transcript.

const GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

export async function transcribeAudio(uri: string): Promise<string> {
  if (!GROQ_KEY) throw new Error('No Groq API key configured');

  const formData = new FormData();
  formData.append('file', { uri, type: 'audio/m4a', name: 'audio.m4a' } as any);
  formData.append('model', 'whisper-large-v3-turbo');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Whisper API ${response.status}: ${text}`);
  }

  const data = await response.json();
  return (data.text ?? '').trim();
}
