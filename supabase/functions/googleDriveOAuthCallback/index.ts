import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function html(message: string, status = 200) {
  return new Response(`<!doctype html><html><body style="font-family:Arial,sans-serif;padding:32px"><h2>${message}</h2></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams();
  body.set('code', params.code);
  body.set('client_id', params.clientId);
  body.set('client_secret', params.clientSecret);
  body.set('redirect_uri', params.redirectUri);
  body.set('grant_type', 'authorization_code');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Google token exchange failed.');
  }
  return data;
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const googleError = url.searchParams.get('error');
    const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://tunmiseapp.vercel.app';

    if (googleError) return Response.redirect(`${appOrigin}/SchoolVault?drive=cancelled`, 302);
    if (!code || !state) return html('Missing Google authorization details.', 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!serviceRoleKey) return html('Service role key is not configured.', 503);
    if (!clientSecret) return html('GOOGLE_CLIENT_SECRET is not configured in Supabase Edge Function secrets.', 503);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokenRow, error: tokenRowError } = await adminClient
      .from('vault_google_drive_tokens')
      .select('oauth_state')
      .eq('id', true)
      .maybeSingle();
    if (tokenRowError) throw tokenRowError;
    if (!tokenRow?.oauth_state || tokenRow.oauth_state !== state) {
      return html('Google Drive connection expired or invalid. Please start again from School Vault.', 400);
    }

    const { data: cfg, error: cfgError } = await adminClient
      .from('vault_drive_config')
      .select('google_client_id')
      .limit(1)
      .maybeSingle();
    if (cfgError) throw cfgError;
    const clientId = cfg?.google_client_id;
    if (!clientId) return html('Google Client ID is not saved in School Vault.', 400);

    const redirectUri = `${supabaseUrl}/functions/v1/googleDriveOAuthCallback`;
    const tokenData = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
    if (!tokenData.refresh_token) {
      return html('Google did not return a refresh token. Click Connect again and approve access.', 400);
    }

    let email = null;
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoResponse.json();
      email = userInfo?.email || null;
    } catch {
      email = null;
    }

    const { error: saveError } = await adminClient
      .from('vault_google_drive_tokens')
      .upsert({
        id: true,
        oauth_state: null,
        refresh_token: tokenData.refresh_token,
        connected_email: email,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    if (saveError) throw saveError;

    return Response.redirect(`${appOrigin}/SchoolVault?drive=connected`, 302);
  } catch (error) {
    console.error('googleDriveOAuthCallback error:', error);
    return html(error instanceof Error ? error.message : 'Google Drive connection failed.', 500);
  }
});
