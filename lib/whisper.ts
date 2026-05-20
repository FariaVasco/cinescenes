import { supabase } from '@/lib/supabase';

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/transcribe`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function transcribeAudio(uri: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();

  const formData = new FormData();
  formData.append('file', { uri, type: 'audio/m4a', name: 'audio.m4a' } as any);

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token ?? ANON_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Transcription failed ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.text ?? '';
}
