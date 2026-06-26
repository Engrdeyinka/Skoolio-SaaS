// Supabase Edge Function: sendWhatsApp
// Sends WhatsApp messages via Termii API.
//
// Secrets needed (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   TERMII_API_KEY   — your Termii API key (required)
//   TERMII_WA_FROM   — your Termii WhatsApp sender number e.g. 2348012345678 (optional)
//
// Get your API key at: https://accounts.termii.com/#/signup
// WhatsApp channel must be activated on your Termii account.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { phoneNumbers, message } = await req.json();

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No phone numbers provided.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!message || !message.trim()) {
      return new Response(JSON.stringify({ success: false, error: 'Message cannot be empty.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('TERMII_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'WhatsApp service not configured. Add TERMII_API_KEY in Supabase → Settings → Edge Functions → Secrets.',
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Required: the WhatsApp Business number registered on your Termii account
    const waFromRaw = Deno.env.get('TERMII_WA_FROM') || '';
    const waFrom = waFromRaw.replace(/\D/g, '');
    if (!waFrom) {
      return new Response(JSON.stringify({
        success: false,
        error: 'WhatsApp sender number not configured. Add TERMII_WA_FROM (your Termii WhatsApp number e.g. 2348012345678) in Supabase → Settings → Edge Functions → Secrets.',
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const normalized = [...new Set(
      phoneNumbers.map((p: string) => normalizePhone(String(p))).filter(Boolean)
    )] as string[];

    if (normalized.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No valid phone numbers found.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalSent = 0;
    const errors: string[] = [];

    for (const phone of normalized) {
      try {
        const payload: Record<string, string> = {
          to:      phone,
          from:    waFrom,
          sms:     message.trim(),
          type:    'plain',
          channel: 'whatsapp',
          api_key: apiKey,
        };

        const res = await fetch('https://api.ng.termii.com/api/sms/send', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });

        const raw = await res.text();
        let data: any = {};
        try { data = JSON.parse(raw); } catch { data = { raw }; }

        console.log(`Termii WA [${phone}] ${res.status}:`, JSON.stringify(data));

        // Termii success: HTTP 200 + no error field + message_id present
        const isOk = res.ok && !data.error && data.code !== 'error';
        if (isOk) {
          totalSent += 1;
        } else {
          // Surface the actual Termii error message (may be string or nested object)
          const rawDetail = data.message || data.error || data.description
            || (data.raw ? data.raw.slice(0, 300) : `HTTP ${res.status}`);
          const detail = typeof rawDetail === 'string'
            ? rawDetail
            : JSON.stringify(rawDetail);
          const friendlyDetail = /device not found/i.test(detail)
            ? `Termii could not find the configured WhatsApp sender device (${waFrom}). Confirm TERMII_WA_FROM is the WhatsApp device number approved on your Termii account.`
            : detail;
          errors.push(`Recipient ${phone}: ${friendlyDetail}`);
          console.error('Termii WA error:', detail);
        }
      } catch (e: any) {
        errors.push(`Recipient ${phone}: ${e.message}`);
      }
    }

    if (totalSent === 0 && errors.length > 0) {
      return new Response(JSON.stringify({ success: false, error: errors[0], errors }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: totalSent > 0,
      message: totalSent > 0
        ? `WhatsApp message sent to ${totalSent} recipient${totalSent !== 1 ? 's' : ''} successfully.`
        : `WhatsApp could not be sent. ${errors[0] || ''}`,
      sent:   totalSent,
      failed: normalized.length - totalSent,
      errors,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('sendWhatsApp fatal:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Internal server error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
