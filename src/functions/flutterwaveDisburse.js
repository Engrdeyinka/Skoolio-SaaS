import { supabase } from '@/api/supabaseClient';

export const flutterwaveDisburse = async (transfers) => {
  // transfers: [{ accountNumber, bankCode, amountNaira, narration, staffName }]
  const { data, error } = await supabase.functions.invoke('flutterwave-transfer', {
    body: { transfers },
  });
  if (error) throw new Error(error.message || 'Disbursement failed');
  if (!data?.success) throw new Error(data?.error || 'Transfer failed');
  return data; // { success, results }
};
