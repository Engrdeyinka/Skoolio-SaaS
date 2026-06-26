import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { emails, subject, body } = await req.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return Response.json({ success: false, error: "A non-empty emails array is required" }, { status: 400, headers: corsHeaders });
    }
    if (!subject || !body) {
      return Response.json({ success: false, error: "Subject and body are required" }, { status: 400, headers: corsHeaders });
    }

    // Load Brevo credentials from Supabase secrets
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    const SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@tunmiseovercomerschool.com";
    const SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") || "Tunmise Overcomer School";

    if (!BREVO_API_KEY) {
      return Response.json(
        { success: false, error: "Email service is not configured. Please set BREVO_API_KEY in Supabase secrets." },
        { status: 500, headers: corsHeaders }
      );
    }

    // Convert plain text body to HTML (preserve line breaks)
    const htmlContent = `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">
      ${body.replace(/\n/g, "<br/>")}
      <br/><br/>
      <hr style="border: none; border-top: 1px solid #eee;"/>
      <p style="font-size: 12px; color: #999;">This message was sent from ${SENDER_NAME}.</p>
    </div>`;

    // Send emails in batches of 50 to stay within Brevo limits
    const BATCH_SIZE = 50;
    let successCount = 0;
    let failureCount = 0;
    const errors: { email: string; error: string }[] = [];

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const toList = batch.map((email: string) => ({ email }));

      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: SENDER_NAME, email: SENDER_EMAIL },
            to: toList,
            subject,
            htmlContent,
          }),
        });

        if (response.ok) {
          successCount += batch.length;
        } else {
          const err = await response.json().catch(() => ({}));
          const errMsg = err.message || `HTTP ${response.status}`;
          // Record each email in batch as failed
          batch.forEach((email: string) => errors.push({ email, error: errMsg }));
          failureCount += batch.length;
        }
      } catch (e: any) {
        batch.forEach((email: string) => errors.push({ email, error: e.message }));
        failureCount += batch.length;
      }
    }

    const allFailed = successCount === 0 && failureCount > 0;
    return Response.json(
      {
        success: !allFailed,
        message: `${successCount} email(s) sent successfully${failureCount > 0 ? `, ${failureCount} failed` : ""}.`,
        successCount,
        failureCount,
        errors: errors.length > 0 ? errors : undefined,
      },
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("sendBulkEmail error:", error);
    return Response.json(
      { success: false, error: "Unexpected error", details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
});
