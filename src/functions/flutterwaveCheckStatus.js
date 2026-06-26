import { supabase } from '@/api/supabaseClient';

/**
 * Poll Flutterwave transfer status for a list of references.
 * @param {string[]} references - Array of FLW-SAL-xxx reference strings
 * @returns {Promise<Array<{reference, status, id?, error?}>>}
 */
export const flutterwaveCheckStatus = async (references) => {
  const { data, error } = await supabase.functions.invoke('flutterwave-status', {
    body: { references },
  });
  if (error) throw new Error(error.message || 'Status check failed');
  if (!data?.success) throw new Error(data?.error || 'Status check failed');
  return data.results;
};
