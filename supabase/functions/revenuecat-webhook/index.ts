import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await req.json();
  const event = body.event;
  if (!event) return new Response('Bad Request', { status: 400 });

  const appUserId: string | undefined = event.app_user_id;
  if (!appUserId) return new Response('OK', { status: 200 });

  const type: string = event.type;

  if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE'].includes(type)) {
    const expiresAt: string | null = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;
    await supabase.from('profiles').upsert({
      id: appUserId,
      is_premium: true,
      premium_expires_at: expiresAt,
    });
  } else if (['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'].includes(type)) {
    await supabase.from('profiles').upsert({
      id: appUserId,
      is_premium: false,
    });
  }

  return new Response('OK', { status: 200 });
});
