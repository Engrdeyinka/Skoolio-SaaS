// Supabase Edge Function: parse-school-calendar
// Accepts a Supabase Storage PDF URL, downloads it, sends to Anthropic API,
// and returns structured school calendar events.
//
// Secrets needed:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pdfUrl } = await req.json();

    if (!pdfUrl) {
      return new Response(JSON.stringify({ success: false, error: 'pdfUrl is required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Anthropic API key not configured. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download PDF from storage
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      return new Response(JSON.stringify({ success: false, error: `Failed to download PDF: ${pdfRes.statusText}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

    // Base64 encode
    let binary = '';
    for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
    const pdfBase64 = btoa(binary);

    // Call Anthropic API
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
              },
              {
                type: 'text',
                text: `Extract all school calendar events from this PDF document and return them as a JSON array.

Each event object must have exactly these fields:
- "title": descriptive name (e.g. "First Term Resumption", "Mid Term Break", "Independence Day")
- "event_date": ISO date string "YYYY-MM-DD" (use the START date for ranges)
- "end_date": ISO date string "YYYY-MM-DD" or null (for single-day events)
- "event_type": one of: "term_start" | "term_end" | "mid_term" | "open_day" | "holiday" | "vacation" | "celebration"
- "term": "First Term" | "Second Term" | "Third Term"
- "academic_year": the session year e.g. "2024/2025"
- "description": brief additional context (can be empty string)

Extract ALL events including:
- Term resumption (term_start) and end dates (term_end)
- Open Days for primary and secondary schools (open_day)
- Mid-term breaks (mid_term)
- Term vacations (vacation)
- Public holidays and celebrations (holiday or celebration)

Return ONLY a valid JSON array. No markdown, no explanation, just the raw JSON array starting with [ and ending with ].`,
              },
            ],
          },
        ],
      }),
    });

    const claudeData = await anthropicRes.json();

    if (!anthropicRes.ok) {
      const errMsg = claudeData?.error?.message || JSON.stringify(claudeData);
      return new Response(JSON.stringify({ success: false, error: `Anthropic API error: ${errMsg}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawText = claudeData?.content?.[0]?.text || '[]';

    // Extract JSON array from response
    let events: any[] = [];
    try {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        events = JSON.parse(match[0]);
      }
    } catch (parseErr) {
      return new Response(JSON.stringify({ success: false, error: `Failed to parse AI response as JSON: ${parseErr}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, events }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Unknown error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
