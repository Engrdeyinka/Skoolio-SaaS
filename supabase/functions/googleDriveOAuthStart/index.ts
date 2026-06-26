import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

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

    const { clientId } = await req.json().catch(() => ({}));
    const cleanClientId = String(clientId || '').trim();
    if (!cleanClientId) return json({ error: 'Google Client ID is required.' }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const state = crypto.randomUUID();
    const { error: upsertError } = await adminClient
      .from('vault_google_drive_tokens')
      .upsert({ id: true, oauth_state: state, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    const redirectUri = `${supabaseUrl}/functions/v1/googleDriveOAuthCallback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', cleanClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', DRIVE_SCOPE);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('include_granted_scopes', 'true');

    return json({ authUrl: authUrl.toString(), redirectUri });
  } catch (error) {
    console.error('googleDriveOAuthStart error:', error);
    return json({ error: error instanceof Error ? error.message : 'Failed to start Google Drive connection.' }, 500);
  }
});
