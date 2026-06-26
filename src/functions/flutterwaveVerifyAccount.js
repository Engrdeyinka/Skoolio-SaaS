import { supabase } from '@/api/supabaseClient';

export const flutterwaveVerifyAccount = async ({ accountNumber, bankCode }) => {
  const { data, error } = await supabase.functions.invoke('flutterwave-verify', {
    body: { action: 'verify', accountNumber, bankCode },
  });
  if (error) throw new Error(error.message || 'Verification failed');
  if (!data?.success) throw new Error(data?.error || 'Account verification failed');
  return data.data; // { account_number, account_name }
};
