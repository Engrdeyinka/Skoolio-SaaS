import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    if (!serviceRoleKey) return json({ error: 'Service role key is not configured.' }, 503);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await adminClient
      .from('vault_google_drive_tokens')
      .upsert({
        id: true,
        oauth_state: null,
        refresh_token: null,
        connected_email: null,
        connected_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    if (error) throw error;

    return json({ success: true });
  } catch (error) {
    console.error('googleDriveDisconnect error:', error);
    return json({ error: error instanceof Error ? error.message : 'Could not disconnect Google Drive.' }, 500);
  }
});
