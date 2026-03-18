import type { Env, SmsLogRow } from '../types';

/**
 * SMS retry cron job.
 * Runs every 10 minutes.
 * 
 * Re-queues failed/pending SMS that haven't exceeded max attempts.
 */
export async function retrySmsFailures(env: Env): Promise<void> {
  // Find retryable SMS logs
  const retryable = await env.DB.prepare(`
    SELECT * FROM sms_logs
    WHERE status IN ('pending', 'failed')
    AND attempt_count < max_attempts
    AND attempt_count > 0
    AND updated_at <= datetime('now', '-5 minutes')
    LIMIT 100
  `).all<SmsLogRow>();

  for (const sms of retryable.results) {
    // Re-enqueue for sending
    await env.SMS_QUEUE.send({
      type: 'sms_send',
      sms_log_id: sms.id,
      contact_id: sms.contact_id,
      phone: sms.phone,
      message: sms.message,
      idempotency_key: sms.idempotency_key,
      attempt: sms.attempt_count + 1,
      workspace_id: sms.workspace_id,
    });
  }

  if (retryable.results.length > 0) {
    console.log(`Re-queued ${retryable.results.length} SMS for retry`);
  }
}
