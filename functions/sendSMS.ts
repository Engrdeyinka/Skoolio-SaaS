import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Convert a Nigerian phone number to international format (234XXXXXXXXXX) */
function formatNigerianPhone(phone: string): string | null {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("234") && digits.length === 13) return digits;          // Already 2348012345678
  if (digits.startsWith("0") && digits.length === 11) return "234" + digits.slice(1); // 08012345678 → 2348012345678
  if (digits.length === 10) return "234" + digits;                               // 8012345678 → 2348012345678

  // International format from another country — pass through unchanged
  if (digits.length >= 10) return digits;

  return null; // Unrecognisable — skip
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated via Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    // Parse request body
    const { phoneNumbers, message } = await req.json();

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return Response.json({ success: false, error: "A non-empty phoneNumbers array is required" }, { status: 400, headers: corsHeaders });
    }
    if (!message) {
      return Response.json({ success: false, error: "Message is required" }, { status: 400, headers: corsHeaders });
    }

    // Load Termii credentials from Supabase secrets
    const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY");
    const TERMII_SENDER_ID = Deno.env.get("TERMII_SENDER_ID") || "N-Alert";

    if (!TERMII_API_KEY) {
      return Response.json(
        { success: false, error: "SMS service is not configured. Please set TERMII_API_KEY in Supabase secrets." },
        { status: 500, headers: corsHeaders }
      );
    }

    // Format phone numbers and filter out invalid ones
    const formatted: string[] = [];
    const skipped: string[] = [];

    for (const phone of phoneNumbers) {
      const f = formatNigerianPhone(String(phone));
      if (f) {
        formatted.push(f);
      } else {
        skipped.push(phone);
        console.warn(`Skipping unrecognisable phone number: ${phone}`);
      }
    }

    if (formatted.length === 0) {
      return Response.json(
        { success: false, error: "No valid phone numbers found after formatting.", skipped },
        { status: 400, headers: corsHeaders }
      );
    }

    // Call Termii bulk SMS endpoint
    const termiiResponse = await fetch("https://api.ng.termii.com/api/sms/send/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TERMII_API_KEY,
        to: formatted,
        from: TERMII_SENDER_ID,
        sms: message,
        type: "plain",
        channel: "generic",
      }),
    });

    const termiiResult = await termiiResponse.json().catch(() => ({}));

    if (!termiiResponse.ok) {
      const errMsg = termiiResult?.message || termiiResult?.error || `Termii HTTP ${termiiResponse.status}`;
      return Response.json(
        { success: false, error: errMsg, details: termiiResult },
        { status: 502, headers: corsHeaders }
      );
    }

    return Response.json(
      {
        success: true,
        message: `SMS sent to ${formatted.length} recipient(s)${skipped.length > 0 ? `. ${skipped.length} number(s) skipped (invalid format)` : ""}.`,
        successCount: formatted.length,
        failureCount: 0,
        skipped: skipped.length > 0 ? skipped : undefined,
        termii: termiiResult,
      },
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("sendSMS error:", error);
    return Response.json(
      { success: false, error: "Unexpected error", details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
});
