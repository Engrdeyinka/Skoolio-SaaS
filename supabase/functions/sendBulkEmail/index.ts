// Supabase Edge Function: sendBulkEmail
// Calls Brevo REST API v3 — no external dependencies.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload  = await req.json();
    const emails: string[] = payload.emails   || [];
    const subject: string  = payload.subject  || '';
    const msgBody: string  = payload.body     || '';

    if (!emails.length)        return err(400, 'No recipient emails provided.');
    if (!subject || !msgBody)  return err(400, 'Subject and body are required.');

    // xsmtpsib- keys work for both SMTP and the REST API
    const apiKey   = (Deno.env.get('BREVO_API_KEY')      || '').trim();
    const fromAddr = (Deno.env.get('BREVO_SENDER_EMAIL') || '').trim();
    const fromName = (Deno.env.get('BREVO_SENDER_NAME')  || 'Tunmise Overcomer School').trim();

    console.log('apiKey length:', apiKey.length, '| first 10:', apiKey.substring(0, 10));
    console.log('fromAddr:', fromAddr);
    console.log('recipients:', emails.length);

    if (!apiKey || !fromAddr) {
      return err(503, 'Missing BREVO_API_KEY or BREVO_SENDER_EMAIL secret.');
    }

    const html = buildHtml(msgBody, fromName);

    // Deduplicate
    const unique = [...new Set(emails.map((e: string) => e.trim().toLowerCase()).filter(Boolean))];

    let sent = 0;
    let lastError = '';

    // Brevo allows up to 50 recipients in the `to` array per call
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const toList = chunk.map((email: string) => ({ email }));

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: fromAddr, name: fromName },
          to: toList,
          subject,
          htmlContent: html,
        }),
      });

      const resText = await res.text();
      console.log(`Batch ${Math.floor(i/50)+1} — status: ${res.status} — body: ${resText}`);

      if (res.ok) {
        sent += chunk.length;
      } else {
        let msg = `Brevo error ${res.status}`;
        try { msg = JSON.parse(resText)?.message || msg; } catch (_) {}
        lastError = msg;
      }
    }

    if (sent === 0) return err(500, lastError || 'All email batches failed.');

    return new Response(
      JSON.stringify({ success: true, message: `Email sent to ${sent} recipient${sent!==1?'s':''}.`, sent, failed: unique.length - sent }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e: any) {
    console.error('Unhandled:', e?.message);
    return err(500, e?.message || 'Internal error');
  }
});

function err(status: number, error: string) {
  return new Response(
    JSON.stringify({ success: false, error }),
    { status, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
  );
}

function buildHtml(body: string, name: string): string {
  const safe = body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;padding:24px 0">
  <div style="background:#1e40af;padding:20px 28px;border-radius:10px 10px 0 0">
    <h2 style="color:white;margin:0;font-size:20px">${name}</h2>
  </div>
  <div style="background:white;padding:28px;border:1px solid #e2e8f0;border-radius:0 0 10px 10px">
    <p style="color:#334155;line-height:1.7;font-size:15px;white-space:pre-wrap;margin:0">${safe}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Sent by ${name}. Please do not reply.</p>
  </div>
</div></body></html>`;
}
