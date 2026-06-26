import { supabase } from '@/api/supabaseClient';

export const sendBulkEmail = async ({ emails, subject, body }) => {
  const { data, error } = await supabase.functions.invoke('sendBulkEmail', {
    body: { emails, subject, body },
  });

  if (error) {
    let msg = error.message || 'Failed to reach the email service.';
    try {
      if (error.context) {
        const errBody = await error.context.json();
        if (errBody?.error) msg = errBody.error;
      }
    } catch (_) {}
    throw new Error(msg);
  }

  if (data && data.success === false) {
    throw new Error(data.error || 'Failed to send emails.');
  }

  // Log to history (fire-and-forget)
  supabase.from('message_history').insert({
    type: 'email',
    subject: subject || null,
    body,
    recipient_count: emails.length,
    status: (data?.failed || 0) > 0 ? 'partial' : 'sent',
    failed_count: data?.failed || 0,
  }).then(() => {}).catch(e => console.error('[History] Email log failed:', e));

  return { data };
};
