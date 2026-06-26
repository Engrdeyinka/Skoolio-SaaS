// Supabase Edge Function: flutterwave-transfer
// Handles salary disbursements via Flutterwave Transfer API.
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
    const { transfers } = await req.json();

    if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'transfers array is required and must not be empty.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!secretKey) {
      return new Response(JSON.stringify({ success: false, error: 'Flutterwave not configured. Please contact the administrator.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate unique references for each transfer
    const timestamp = Date.now();
    const transfersWithRefs = transfers.map((t: any, index: number) => ({
      ...t,
      reference: `FLW-SAL-${timestamp}-${index}`,
    }));

    if (transfers.length === 1) {
      // Single transfer
      const { accountNumber, bankCode, amountNaira, narration, staffName, reference } = transfersWithRefs[0];

      const response = await fetch('https://api.flutterwave.com/v3/transfers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_bank: bankCode,
          account_number: accountNumber,
          amount: Number(amountNaira),
          narration: narration || 'Salary payment',
          currency: 'NGN',
          reference,
          debit_currency: 'NGN',
        }),
      });

      const data = await response.json();
      console.log('Flutterwave single transfer response:', response.status, JSON.stringify(data));

      if (!response.ok || data.status !== 'success') {
        const errMsg = data.message || `Transfer failed (${response.status})`;
        return new Response(JSON.stringify({ success: false, error: errMsg }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const results = [{
        staffName,
        status: data.data?.status,
        reference: data.data?.reference,
        id: data.data?.id,
      }];

      return new Response(JSON.stringify({ success: true, results }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      // Bulk transfer
      const bulk_data = transfersWithRefs.map(({ accountNumber, bankCode, amountNaira, narration, reference }: any) => ({
        bank_code: bankCode,
        account_number: accountNumber,
        amount: Number(amountNaira),
        narration: narration || 'Salary payment',
        currency: 'NGN',
        reference,
        debit_currency: 'NGN',
      }));

      const response = await fetch('https://api.flutterwave.com/v3/bulk-transfers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: narrationTitle(transfersWithRefs),
          bulk_data,
        }),
      });

      const data = await response.json();
      console.log('Flutterwave bulk transfer response:', response.status, JSON.stringify(data));

      if (!response.ok || data.status !== 'success') {
        const errMsg = data.message || `Bulk transfer failed (${response.status})`;
        return new Response(JSON.stringify({ success: false, error: errMsg }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Bulk just queues transfers — return PENDING for all
      const results = transfersWithRefs.map((t: any) => ({
        staffName: t.staffName,
        status: 'PENDING',
        reference: t.reference,
      }));

      return new Response(JSON.stringify({ success: true, results }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (err: any) {
    console.error('flutterwave-transfer error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal server error.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function narrationTitle(transfers: any[]): string {
  const narration = transfers[0]?.narration || '';
  // Extract "Month Year" portion from "Salary - Month Year"
  const match = narration.match(/Salary\s*-\s*(.+)/i);
  return match ? `${match[1].trim()} Salary` : 'Salary Disbursement';
}
