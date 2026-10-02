import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Use the user's JWT to identify who is making the request
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Use service role for privileged operations
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Anonymise player rows — preserve game history, just unlink the account
  await adminClient
    .from('players')
    .update({ user_id: null })
    .eq('user_id', user.id);

  // Remove deck waitlist rows: everything linked to the account, plus any signup
  // made with the account's email while signed out. Done before deleting the user
  // (whose SET NULL would orphan them) and fatal on error, so a retry can finish it.
  const { error: waitlistError } = await adminClient
    .from('deck_waitlist')
    .delete()
    .eq('user_id', user.id);
  const { error: waitlistEmailError } = user.email
    ? await adminClient
        .from('deck_waitlist')
        .delete()
        .eq('event', 'signup')
        .eq('email', user.email.toLowerCase()) // the app stores signups lowercased
    : { error: null };
  if (waitlistError || waitlistEmailError) {
    return new Response('Failed to delete account', { status: 500 });
  }

  // Delete the auth user — CASCADE handles profiles, SET NULL handles feedback
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response('Failed to delete account', { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
