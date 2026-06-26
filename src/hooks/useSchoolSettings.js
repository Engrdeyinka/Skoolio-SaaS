import { useState, useEffect } from "react";
import { SchoolSettings } from "@/entities/all";
import { supabase } from "@/api/supabaseClient";
import { getLagosYear } from "@/lib/timezone";
import { applyTheme } from "@/lib/appTheme";

let _cache = null; // module-level cache so we only fetch once per session

export const DEFAULT_EXPENSE_CATEGORIES = [
  { value: "salary",      label: "Salary"      },
  { value: "utilities",   label: "Utilities"   },
  { value: "maintenance", label: "Maintenance" },
  { value: "supplies",    label: "Supplies"    },
  { value: "transport",   label: "Transport"   },
  { value: "marketing",   label: "Marketing"   },
  { value: "other",       label: "Other"       },
];

export function useSchoolSettings() {
  const [term, setTerm] = useState(_cache?.current_term || "Second Term");
  const [year, setYear] = useState(_cache?.current_year || "2025/2026");
  const [smsSenderId, setSmsSenderId] = useState(_cache?.sms_sender_id || "");
  const [schoolName, setSchoolName] = useState(_cache?.school_name || "");
  const [schoolAddress, setSchoolAddress] = useState(_cache?.school_address || "");
  const [schoolPhone, setSchoolPhone] = useState(_cache?.school_phone || "");
  const [schoolEmail, setSchoolEmail] = useState(_cache?.school_email || "");
  const [schoolLogoUrl, setSchoolLogoUrl] = useState(_cache?.school_logo_url || "");
  const [schoolStampUrl, setSchoolStampUrl] = useState(_cache?.school_stamp_url || "");
  const [principalSignatureUrl, setPrincipalSignatureUrl] = useState(_cache?.principal_signature_url || "");
  const [principalName, setPrincipalName] = useState(_cache?.principal_name || "");
  const [alocApiToken, setAlocApiToken] = useState(_cache?.aloc_api_token || "");
  const [flutterwavePublicKey, setFlutterwavePublicKey] = useState(_cache?.flutterwave_public_key || "");
  const [expenseCategories, setExpenseCategories] = useState(
    _cache?.expense_categories ?? DEFAULT_EXPENSE_CATEGORIES
  );
  const [heroImages, setHeroImages] = useState(_cache?.hero_images || []);
  const [receiptCounter, setReceiptCounter] = useState(_cache?.receipt_counter || 0);
  const [themeColor, setThemeColor] = useState(_cache?.theme_color || "emerald");
  const [themeCustomHex, setThemeCustomHex] = useState(_cache?.theme_custom_hex || "#3b82f6");
  const [settingsId, setSettingsId] = useState(_cache?.id || null);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    const applySettings = (s) => {
      _cache = s;
      setTerm(s.current_term || "Second Term");
      setYear(s.current_year || "2025/2026");
      setSmsSenderId(s.sms_sender_id || "");
      setSchoolName(s.school_name || "");
      setSchoolAddress(s.school_address || "");
      setSchoolPhone(s.school_phone || "");
      setSchoolEmail(s.school_email || "");
      setSchoolLogoUrl(s.school_logo_url || "");
      setSchoolStampUrl(s.school_stamp_url || "");
      setPrincipalSignatureUrl(s.principal_signature_url || "");
      setPrincipalName(s.principal_name || "");
      setAlocApiToken(s.aloc_api_token || "");
      setFlutterwavePublicKey(s.flutterwave_public_key || "");
      setExpenseCategories(s.expense_categories ?? DEFAULT_EXPENSE_CATEGORIES);
      setHeroImages(s.hero_images || []);
      setReceiptCounter(s.receipt_counter || 0);
      setThemeColor(s.theme_color || "emerald");
      setThemeCustomHex(s.theme_custom_hex || "#3b82f6");
      setSettingsId(s.id);
      // Apply theme globally whenever settings load from the server
      applyTheme(s.theme_color || "emerald", s.theme_custom_hex || "#3b82f6");
    };

    if (_cache) {
      applySettings(_cache);
      setLoading(false);
      return;
    }
    // Use direct supabase query (no created_date ordering which doesn't exist on this table)
    supabase.from("school_settings").select("*").limit(1).then(({ data: rows }) => {
      if (rows?.length) applySettings(rows[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async (data) => {
    const id = settingsId || _cache?.id;
    // Save everything via direct supabase to bypass schema-cache column stripping
    const payload = { updated_at: new Date().toISOString(), ...data };
    if (id) {
      await supabase.from("school_settings").update(payload).eq("id", id);
    } else {
      const { data: created } = await supabase.from("school_settings").insert(payload).select().single();
      if (created) setSettingsId(created.id);
    }
    // Update module-level cache immediately
    _cache = { ..._cache, ...payload, id: id || _cache?.id };
    if (data.current_term !== undefined) setTerm(data.current_term);
    if (data.current_year !== undefined) setYear(data.current_year);
    if (data.sms_sender_id !== undefined) setSmsSenderId(data.sms_sender_id);
    if (data.school_name !== undefined) setSchoolName(data.school_name);
    if (data.school_address !== undefined) setSchoolAddress(data.school_address);
    if (data.school_phone !== undefined) setSchoolPhone(data.school_phone);
    if (data.school_email !== undefined) setSchoolEmail(data.school_email);
    if (data.school_logo_url !== undefined) setSchoolLogoUrl(data.school_logo_url);
    if (data.school_stamp_url !== undefined) setSchoolStampUrl(data.school_stamp_url);
    if (data.principal_signature_url !== undefined) setPrincipalSignatureUrl(data.principal_signature_url);
    if (data.principal_name !== undefined) setPrincipalName(data.principal_name);
    if (data.aloc_api_token !== undefined) setAlocApiToken(data.aloc_api_token);
    if (data.flutterwave_public_key !== undefined) setFlutterwavePublicKey(data.flutterwave_public_key);
    if (data.expense_categories !== undefined) setExpenseCategories(data.expense_categories);
    if (data.hero_images !== undefined) setHeroImages(data.hero_images);
    if (data.receipt_counter !== undefined) setReceiptCounter(data.receipt_counter);
    if (data.theme_color !== undefined) setThemeColor(data.theme_color);
    if (data.theme_custom_hex !== undefined) setThemeCustomHex(data.theme_custom_hex);
  };

  return {
    term, year, smsSenderId,
    schoolName, schoolAddress, schoolPhone, schoolEmail,
    schoolLogoUrl, schoolStampUrl, principalSignatureUrl, principalName,
    alocApiToken, flutterwavePublicKey, expenseCategories,
    heroImages,
    receiptCounter,
    themeColor, themeCustomHex,
    settingsId, loading, save,
  };
}

export async function getNextReceiptNumber() {
  const { data: rows } = await supabase.from("school_settings").select("id, receipt_counter").limit(1);
  if (!rows?.length) throw new Error("No school settings found");
  const currentCounter = rows[0].receipt_counter || 0;
  const newCounter = currentCounter + 1;
  await supabase.from("school_settings").update({ receipt_counter: newCounter }).eq("id", rows[0].id);
  if (_cache) _cache.receipt_counter = newCounter;
  return `REC-${getLagosYear()}-${String(newCounter).padStart(4, "0")}`;
}
