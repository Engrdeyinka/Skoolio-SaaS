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
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!serviceRoleKey) return json({ error: 'Service role key is not configured.' }, 503);
    if (!clientSecret) return json({ error: 'GOOGLE_CLIENT_SECRET is not configured.' }, 503);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: cfg, error: cfgError }, { data: tokenRow, error: tokenError }] = await Promise.all([
      adminClient.from('vault_drive_config').select('google_client_id').limit(1).maybeSingle(),
      adminClient.from('vault_google_drive_tokens').select('refresh_token, connected_email').eq('id', true).maybeSingle(),
    ]);
    if (cfgError) throw cfgError;
    if (tokenError) throw tokenError;
    if (!cfg?.google_client_id) return json({ error: 'Google Client ID is not configured.' }, 400);
    if (!tokenRow?.refresh_token) return json({ error: 'Google Drive is not permanently connected yet.' }, 404);

    const body = new URLSearchParams();
    body.set('client_id', cfg.google_client_id);
    body.set('client_secret', clientSecret);
    body.set('refresh_token', tokenRow.refresh_token);
    body.set('grant_type', 'refresh_token');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error_description || data.error || 'Google token refresh failed.');
    }

    return json({
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
      connected_email: tokenRow.connected_email || null,
    });
  } catch (error) {
    console.error('googleDriveAccessToken error:', error);
    return json({ error: error instanceof Error ? error.message : 'Could not refresh Google Drive token.' }, 500);
  }
});
