import { supabase } from "@/api/supabaseClient";

export async function getVaultDriveConfig() {
  const { data, error } = await supabase
    .from("vault_drive_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from("vault_drive_config")
    .insert({ updated_at: new Date().toISOString() })
    .select()
    .single();

  if (createError) throw createError;
  return created;
}

export async function updateVaultDriveConfig(patch = {}) {
  const current = await getVaultDriveConfig();
  const { data, error } = await supabase
    .from("vault_drive_config")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", current.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
