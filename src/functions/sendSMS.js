import { supabase } from '@/api/supabaseClient';

export const sendSMS = async ({ phoneNumbers, message, messageType, senderId }) => {
  const { data, error } = await supabase.functions.invoke('sendSMS', {
    body: { phoneNumbers, message, messageType, senderId },
  });

  if (error) {
    let msg = error.message || 'Failed to reach the SMS service.';
    try {
      if (error.context) {
        const body = await error.context.json();
        if (body?.error) msg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
      }
    } catch (_) {}
    throw new Error(msg);
  }

  if (data && data.success === false) {
    throw new Error(data.message || data.error || 'Failed to send SMS.');
  }

  // Log to history (fire-and-forget)
  supabase.from('message_history').insert({
    type: 'sms',
    body: message,
    recipient_count: phoneNumbers.length,
    status: (data?.failed || 0) > 0 ? 'partial' : 'sent',
    failed_count: data?.failed || 0,
  }).then(() => {}).catch(e => console.error('[History] SMS log failed:', e));

  return { data };
};
