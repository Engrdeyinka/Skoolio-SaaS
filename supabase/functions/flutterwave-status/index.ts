// Supabase Edge Function: flutterwave-status
// Polls transfer status by reference for one or more transfers.
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
    const { references } = await req.json();

    if (!references || !Array.isArray(references) || references.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'references array is required.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!secretKey) {
      return new Response(JSON.stringify({ success: false, error: 'Flutterwave not configured.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const reference of references) {
      try {
        const response = await fetch(
          `https://api.flutterwave.com/v3/transfers?reference=${encodeURIComponent(reference)}`,
          {
            headers: {
              'Authorization': `Bearer ${secretKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();
        console.log(`Status check for ${reference}:`, response.status, JSON.stringify(data));

        if (data.status === 'success' && data.data?.length > 0) {
          results.push({
            reference,
            status: data.data[0].status,
            id: data.data[0].id,
            complete_message: data.data[0].complete_message || '',
          });
        } else {
          results.push({ reference, status: 'UNKNOWN', error: data.message || 'Not found' });
        }
      } catch (e: any) {
        results.push({ reference, status: 'UNKNOWN', error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('flutterwave-status error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal server error.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
