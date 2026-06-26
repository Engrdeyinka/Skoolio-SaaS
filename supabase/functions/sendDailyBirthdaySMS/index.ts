// Supabase Edge Function: sendDailyBirthdaySMS
// ─────────────────────────────────────────────────────────────────────────────
// Cron-driven daily worker. Finds every active student whose date_of_birth's
// month+day matches today (the function's wall clock — schedule it for
// whatever local time you want, e.g. 0 7 * * * for 7am UTC+1), sends each
// parent the standard birthday SMS, and records the send in birthday_sms_log
// so duplicates are impossible — both with the manual "Send SMS" button in
// the admin dashboard widget and with a re-run of this function itself.
//
// Required secrets (supabase secrets set ...):
//   SUPABASE_URL                – auto-set in Supabase function env
//   SUPABASE_SERVICE_ROLE_KEY   – auto-set; needed for the DB writes that
//                                  bypass RLS for the system-level cron
//   BSNG_API_TOKEN              – already set for sendSMS
//   BSNG_SENDER_ID              – already set for sendSMS
//   SCHOOL_NAME (optional)      – used in the SMS body; falls back to a
//                                  reasonable default
//
// Schedule (one-time setup in Supabase dashboard):
//   Edge Functions → sendDailyBirthdaySMS → Schedules → cron `0 7 * * *`
//   (7am UTC – adjust to your time zone)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TWO_DIGIT = (n: number) => String(n).padStart(2, "0");

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("234") && digits.length === 13) return digits;
  if (digits.startsWith("0")   && digits.length === 11) return "234" + digits.slice(1);
  if (digits.length === 10) return "234" + digits;
  if (digits.length >= 11)  return digits;
  return null;
}

function buildMessage(firstName: string, schoolName: string) {
  const name = (firstName || "Student").trim();
  return `Happy birthday ${name}! Wishing you a wonderful year ahead. From all of us at ${schoolName}.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiToken    = Deno.env.get("BSNG_API_TOKEN");

  if (!apiToken) {
    return new Response(JSON.stringify({ success: false, error: "BSNG_API_TOKEN not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // ── Read sender ID + school name from school_settings so the cron stays in
  // sync with whatever the admin has configured inside the app. Fall back to
  // env vars (for backwards compatibility), then to hard defaults. This is
  // the same precedence the dashboard's manual Send-SMS button uses.
  const { data: settingsRows } = await admin
    .from("school_settings")
    .select("sms_sender_id, school_name, birthday_sms_enabled")
    .limit(1);
  const settings = (settingsRows && settingsRows[0]) || {};

  // Master kill-switch. If the admin has turned birthday SMS off (e.g. while
  // auditing student date-of-birth data), bail without sending or logging
  // anything. Returning 200 + a clear flag so the cron-job.org history makes
  // it obvious why nothing fired.
  if (settings.birthday_sms_enabled === false) {
    return new Response(
      JSON.stringify({ success: true, disabled: true, message: "Birthday SMS is currently disabled in school settings." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const senderId =
    (settings.sms_sender_id && String(settings.sms_sender_id).trim()) ||
    Deno.env.get("BSNG_SENDER_ID") ||
    "TunmiseSch";
  const schoolName =
    (settings.school_name && String(settings.school_name).trim()) ||
    Deno.env.get("SCHOOL_NAME") ||
    "Tunmise Overcomer Private School";

  // ── 1. Compute today's month-day and the iso date used as the log key ──
  const now = new Date();
  const monthDay = `${TWO_DIGIT(now.getMonth() + 1)}-${TWO_DIGIT(now.getDate())}`;
  const todayISO = now.toISOString().slice(0, 10);

  // ── 2. Find every active student whose DOB matches today's MM-DD ──
  //    We can't index on a computed substring cheaply, so we filter client-side
  //    over all active students. Acceptable for typical school sizes (<1000).
  const { data: students, error: studentErr } = await admin
    .from("students")
    .select("id, first_name, last_name, grade, parent_phone, date_of_birth, enrollment_status")
    .eq("enrollment_status", "active");

  if (studentErr) {
    return new Response(JSON.stringify({ success: false, error: studentErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const todaysStudents = (students || []).filter((s: any) => {
    const m = String(s.date_of_birth || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m && `${m[2]}-${m[3]}` === monthDay;
  });

  // ── 3. Skip anyone we've already logged a send for today ──
  const { data: existingLog } = await admin
    .from("birthday_sms_log")
    .select("student_id, status")
    .eq("sent_date", todayISO);
  const alreadyHandled = new Set((existingLog || []).map((r: any) => r.student_id));

  const pending = todaysStudents.filter((s: any) => !alreadyHandled.has(s.id));

  // ── 4. Send + log for each pending student ──
  const results: Array<{ student_id: string; phone: string | null; status: "sent" | "failed" | "skipped"; error?: string }> = [];

  for (const s of pending as any[]) {
    const rawPhone = s.parent_phone || "";
    const phone    = normalizePhone(rawPhone);
    const message  = buildMessage(s.first_name, schoolName);

    if (!phone) {
      // Log the skip so the dashboard widget can show "no phone" — we don't
      // want to silently leave them out and have the admin wonder why.
      await admin.from("birthday_sms_log").insert({
        student_id: s.id,
        sent_date:  todayISO,
        phone:      rawPhone || null,
        message,
        channel:    "sms",
        status:     "failed",
        error:      "No valid phone number on file",
        source:     "cron",
      });
      results.push({ student_id: s.id, phone: rawPhone || null, status: "skipped", error: "no phone" });
      continue;
    }

    // ── Fire the SMS via BulkSMSNigeria directly. We inline this rather than
    //    calling the sendSMS function so a cron tick can never recurse / loop
    //    into another function and so we keep the network surface minimal. ──
    let status: "sent" | "failed" = "sent";
    let errorMsg: string | undefined;
    try {
      const resp = await fetch("https://www.bulksmsnigeria.com/api/v2/sms/create", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Accept":        "application/json",
          "Authorization": `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ from: senderId, to: phone, body: message, dnd: 2 }),
      });
      const text = await resp.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!resp.ok || data?.error || data?.status === "error") {
        status   = "failed";
        errorMsg = data?.error?.message || data?.error || data?.message || `HTTP ${resp.status}`;
      }
    } catch (e) {
      status   = "failed";
      errorMsg = (e as Error)?.message || "fetch failed";
    }

    // Log the outcome. UNIQUE (student_id, sent_date) prevents dupes even
    // under concurrent invocations.
    await admin.from("birthday_sms_log").insert({
      student_id: s.id,
      sent_date:  todayISO,
      phone,
      message,
      channel:    "sms",
      status,
      error:      errorMsg || null,
      source:     "cron",
    });

    results.push({ student_id: s.id, phone, status, error: errorMsg });
  }

  return new Response(
    JSON.stringify({
      success:        true,
      date:           todayISO,
      month_day:      monthDay,
      students_today: todaysStudents.length,
      already_sent:   alreadyHandled.size,
      processed:      results.length,
      sent:           results.filter((r) => r.status === "sent").length,
      failed:         results.filter((r) => r.status === "failed").length,
      skipped:        results.filter((r) => r.status === "skipped").length,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
