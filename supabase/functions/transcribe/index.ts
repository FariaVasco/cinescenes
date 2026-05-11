const GROQ_KEY = Deno.env.get('GROQ_API_KEY');

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!GROQ_KEY) {
    return new Response('Transcription service not configured', { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response('Invalid form data', { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return new Response('Missing audio file', { status: 400 });
  }

  const groqForm = new FormData();
  groqForm.append('file', file, 'audio.m4a');
  groqForm.append('model', 'whisper-large-v3-turbo');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: groqForm,
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(`Groq error: ${text}`, { status: response.status });
  }

  const data = await response.json();
  return new Response(JSON.stringify({ text: (data.text ?? '').trim() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
