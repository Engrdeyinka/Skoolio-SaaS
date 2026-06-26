/**
 * auth.js
 *
 * Authentication helpers backed directly by Supabase.
 */
import { supabase } from '@/api/supabaseClient';

/** Return the current authenticated user merged with their profile row. */
export async function me() {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw { status: 401, message: 'Not authenticated' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email,
    full_name: profile?.full_name || user.user_metadata?.full_name || '',
    school_role: profile?.school_role || null,
    linked_student_id: profile?.linked_student_id || null,
    linked_teacher_id: profile?.linked_teacher_id || null,
    current_term: profile?.current_term || 'Third Term',
    current_academic_year: profile?.current_academic_year || '2025/2026',
    preview_student_id: profile?.preview_student_id || null,
    preview_student_name: profile?.preview_student_name || null,
    preview_student_grade: profile?.preview_student_grade || null,
    ...profile,
  };
}

/** Patch the current user's profile row. */
export async function updateMe(updates) {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw { status: 401, message: 'Not authenticated' };
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: created, error: upsertError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      ...updates,
    }, { onConflict: 'id' })
    .select()
    .single();

  if (upsertError) throw upsertError;
  return created;
}

/** Sign the user out and optionally redirect. */
export async function logout(redirectUrl) {
  sessionStorage.removeItem('returnUrl');
  sessionStorage.removeItem('previewRole');
  await supabase.auth.signOut();
  if (redirectUrl) window.location.href = redirectUrl;
}

/** Redirect to the login page, preserving the return URL. */
export function redirectToLogin(returnUrl) {
  if (returnUrl) sessionStorage.setItem('returnUrl', returnUrl);
  window.location.href = '/Login';
}

/**
 * Invite a user by email.
 * Currently a stub — wire up a Supabase Edge Function when ready.
 */
export async function inviteUser(email, role) {
  console.warn('inviteUser: Edge function not yet deployed');
  return { email, role };
}
