const GROQ_KEY = Deno.env.get('GROQ_API_KEY');

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!GROQ_KEY) {
    return new Response('LLM service not configured', { status: 503 });
  }

  let transcript: string;
  try {
    const body = await req.json();
    transcript = body.transcript;
    if (!transcript || typeof transcript !== 'string') throw new Error();
  } catch {
    return new Response('Missing transcript', { status: 400 });
  }

  const systemPrompt =
    `You are a sentence parser. Identify which words in the input are being used as a movie title and which as a person's name (the director). ` +
    `Copy those words VERBATIM from the input — do not correct, normalise, or replace them with any names from your own knowledge. ` +
    `Reply with exactly two lines: TITLE: <verbatim words or NONE> and DIRECTOR: <verbatim words or NONE>.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
        { role: 'user', content: `Sentence: "${transcript}"` },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(`Groq error: ${text}`, { status: response.status });
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';

  const lines = content.split('\n');
  const titleLine = lines.find((l: string) => l.toUpperCase().startsWith('TITLE:'));
  const directorLine = lines.find((l: string) => l.toUpperCase().startsWith('DIRECTOR:'));
  const title = titleLine?.replace(/^title:\s*/i, '').trim() ?? '';
  const director = directorLine?.replace(/^director:\s*/i, '').trim() ?? '';

  return new Response(JSON.stringify({
    title: title && title.toUpperCase() !== 'NONE' ? title : null,
    director: director && director.toUpperCase() !== 'NONE' ? director : null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
