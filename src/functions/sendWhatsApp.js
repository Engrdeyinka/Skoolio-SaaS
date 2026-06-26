import { supabase } from '@/api/supabaseClient';

export const sendWhatsApp = async ({ phoneNumbers, message, senderId }) => {
  const { data, error } = await supabase.functions.invoke('sendWhatsApp', {
    body: { phoneNumbers, message, senderId },
  });

  if (error) {
    let msg = error.message || 'Failed to reach the WhatsApp service.';
    try {
      if (error.context) {
        const body = await error.context.json();
        if (body?.error) msg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
      }
    } catch (_) {}
    throw new Error(msg);
  }

  if (data && data.success === false) {
    throw new Error(data.message || data.error || 'Failed to send WhatsApp message.');
  }

  // Log to history (fire-and-forget)
  supabase.from('message_history').insert({
    type: 'whatsapp',
    body: message,
    recipient_count: phoneNumbers.length,
    status: (data?.failed || 0) > 0 ? 'partial' : 'sent',
    failed_count: data?.failed || 0,
  }).then(() => {}).catch(e => console.error('[History] WhatsApp log failed:', e));

  return { data };
};
