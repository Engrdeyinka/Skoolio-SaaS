// Supabase Edge Function: flutterwave-verify
// Handles Flutterwave account verification.
//
// Secrets needed:
//   supabase secrets set FLUTTERWAVE_SECRET_KEY=FLWSECK_xxx

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, accountNumber, bankCode } = await req.json();

    const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!secretKey) {
      return new Response(JSON.stringify({ success: false, error: 'Flutterwave not configured. Please contact the administrator.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'verify') {
      if (!accountNumber || !bankCode) {
        return new Response(JSON.stringify({ success: false, error: 'accountNumber and bankCode are required.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const response = await fetch('https://api.flutterwave.com/v3/accounts/resolve', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_number: accountNumber,
          account_bank: bankCode,
        }),
      });

      const data = await response.json();
      console.log('Flutterwave verify response:', response.status, JSON.stringify(data));

      if (!response.ok || data.status !== 'success') {
        const errMsg = data.message || `Verification failed (${response.status})`;
        return new Response(JSON.stringify({ success: false, error: errMsg }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: {
          account_number: data.data.account_number,
          account_name: data.data.account_name,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (err: any) {
    console.error('flutterwave-verify error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal server error.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
