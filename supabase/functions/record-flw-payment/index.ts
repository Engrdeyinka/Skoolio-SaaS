// Supabase Edge Function: record-flw-payment
// 1. Verifies a Flutterwave transaction using the secret key
// 2. Records the payment in the DB using the service role (bypasses student RLS)
//
// Secrets needed:
//   FLUTTERWAVE_SECRET_KEY  — your Flw secret key (FLW_SK_TEST-... or FLW_SK-...)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      transaction_id,
      tx_ref,
      student_id,
      term,
      academic_year,
    } = await req.json();

    if (!transaction_id || !student_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const flwSecret = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!flwSecret) {
      return new Response(JSON.stringify({ success: false, error: "Payment verification not configured." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Verify with Flutterwave
    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${flwSecret}` },
    });

    const verifyData = await verifyRes.json();
    console.log("Flutterwave verify:", JSON.stringify(verifyData));

    if (!verifyRes.ok || verifyData.status !== "success") {
      return new Response(JSON.stringify({ success: false, error: "Could not verify payment with Flutterwave." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txData = verifyData.data;

    // 2. Confirm it was actually successful and matches our ref
    if (txData.status !== "successful" && txData.status !== "completed") {
      return new Response(JSON.stringify({ success: false, error: `Payment status is '${txData.status}', not successful.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (txData.tx_ref !== tx_ref) {
      return new Response(JSON.stringify({ success: false, error: "Transaction reference mismatch." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Check for duplicate — don't record the same transaction twice
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .ilike("notes", `%${transaction_id}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ success: true, message: "Payment already recorded.", already_recorded: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Insert the payment record using service role (bypasses RLS)
    const { error: insertError } = await supabase.from("payments").insert({
      student_id,
      amount:          txData.amount,
      payment_method:  "online",
      payment_status:  "paid",
      payment_date:    new Date().toISOString().split("T")[0],
      term:            term || "",
      academic_year:   academic_year || "",
      notes:           `Flutterwave ref: ${transaction_id} | tx_ref: ${tx_ref}`,
    });

    if (insertError) {
      console.error("DB insert error:", insertError);
      return new Response(JSON.stringify({ success: false, error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Payment of ₦${txData.amount.toLocaleString()} recorded successfully.`,
      amount:  txData.amount,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("record-flw-payment error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message || "Internal server error." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
