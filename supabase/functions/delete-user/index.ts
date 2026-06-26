// Supabase Edge Function: delete-user
// Deletes a Supabase Auth user entirely (requires service_role key).
// Only callable by super_admin users.
//
// Deploy with:  npx supabase functions deploy delete-user
// Set secret:   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the calling user is a super_admin using their JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a client with the caller's JWT to check their role
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await callerClient
      .from('profiles').select('school_role').eq('id', callerUser.id).single();

    if (callerProfile?.school_role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: super_admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse target user ID from request body
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent deleting yourself
    if (userId === callerUser.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role client to actually delete the auth user
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    // Also remove the profile row (cascade may handle this, but be explicit)
    await adminClient.from('profiles').delete().eq('id', userId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
