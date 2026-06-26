// Supabase Edge Function: sendSMS
// Sends bulk SMS via BulkSMSNigeria API.
//
// Secrets needed:
//   supabase secrets set BSNG_API_TOKEN=your_token
//   supabase secrets set BSNG_SENDER_ID=TunmiseSch

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Normalizes Nigerian phone numbers to international format (2348012345678).
 */
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return null;

  if (digits.startsWith('234') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
  if (digits.length === 10) return '234' + digits;
  if (digits.length >= 11) return digits;

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phoneNumbers, message, senderId: reqSenderId } = await req.json();

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No phone numbers provided.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!message || message.trim().length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Message cannot be empty.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiToken = Deno.env.get('BSNG_API_TOKEN');
    // Use sender ID from request body first, fall back to env var, then default
    const senderId = (reqSenderId && reqSenderId.trim()) || Deno.env.get('BSNG_SENDER_ID') || 'TunmiseSch';

    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'SMS service not configured. Please contact the administrator.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize and deduplicate phone numbers
    const normalized = [...new Set(
      phoneNumbers
        .map((p: string) => normalizePhone(String(p)))
        .filter(Boolean)
    )];

    if (normalized.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No valid Nigerian phone numbers found.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send in chunks of 100
    let totalSent = 0;
    const errors: string[] = [];

    for (let i = 0; i < normalized.length; i += 100) {
      const chunk = normalized.slice(i, i + 100);

      const response = await fetch('https://www.bulksmsnigeria.com/api/v2/sms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          from:       senderId,
          to:         chunk.join(','),
          body:       message.trim(),
          dnd:        2,
        }),
      });

      const responseText = await response.text();
      let data: any = {};
      try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }

      console.log('BulkSMSNigeria response:', response.status, JSON.stringify(data));

      // Accept any 2xx response or a response with data/status=success
      if (response.ok) {
        // Try to detect failure inside a 200 response
        if (data.success === false || data.status === 'failed' || data.error) {
          const errMsg = data.message || data.error || `API returned failure in 200 response`;
          errors.push(errMsg);
          console.error('BulkSMSNigeria reported failure:', errMsg);
        } else {
          totalSent += chunk.length;
        }
      } else {
        const errMsg = data.message || data.error || `API error (${response.status}): ${responseText.slice(0, 200)}`;
        errors.push(errMsg);
        console.error('BulkSMSNigeria error:', errMsg);
      }
    }

    if (totalSent === 0 && errors.length > 0) {
      return new Response(JSON.stringify({ success: false, error: errors[0] }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: totalSent > 0,
      message: totalSent > 0
        ? `SMS sent to ${totalSent} recipient${totalSent !== 1 ? 's' : ''} successfully.`
        : `SMS could not be sent. ${errors[0] || ''}`,
      sent: totalSent,
      failed: normalized.length - totalSent,
      errors,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('sendSMS error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal server error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
