import type { Env, SmsLogRow } from '../types';
import { createSmsManager, createSmsManagerFromConfig } from '../services/sms';
import type { WorkspaceSmsConfig } from '../services/sms';

/**
 * Process an SMS dispatch message from the queue.
 * Handles idempotency, retries, and provider failover.
 * Uses workspace-specific SMS config when available, falling back to global env.
 */
export async function processSmsDispatch(
  env: Env,
  smsLogId: string,
  phone: string,
  message: string,
  idempotencyKey: string,
  attempt: number,
  workspaceId: string
): Promise<void> {
  // Idempotency check: verify the SMS log is still in a sendable state
  const smsLog = await env.DB.prepare(
    'SELECT * FROM sms_logs WHERE id = ? AND idempotency_key = ?'
  ).bind(smsLogId, idempotencyKey).first<SmsLogRow>();

  if (!smsLog) {
    console.log(`SMS log ${smsLogId} not found, skipping`);
    return;
  }

  // Don't re-send if already delivered or sent
  if (smsLog.status === 'delivered' || smsLog.status === 'sent') {
    console.log(`SMS ${smsLogId} already ${smsLog.status}, skipping`);
    return;
  }

  // Check max attempts
  if (attempt > smsLog.max_attempts) {
    await env.DB.prepare(`
      UPDATE sms_logs SET
        status = 'failed',
        error_message = 'Max attempts exceeded',
        attempt_count = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(attempt - 1, smsLogId).run();
    return;
  }

  // Update status to queued
  await env.DB.prepare(`
    UPDATE sms_logs SET
      status = 'queued',
      attempt_count = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(attempt, smsLogId).run();

  // Send via provider manager (with failover)
  // Load workspace-specific SMS config if available
  const wsConfig = await env.DB.prepare(
    'SELECT provider_priority, kudi_api_key, termii_api_key, at_api_key, at_username FROM workspace_sms_config WHERE workspace_id = ?'
  ).bind(workspaceId).first<WorkspaceSmsConfig>();

  const manager = wsConfig
    ? createSmsManagerFromConfig(wsConfig, env)
    : createSmsManager(env);
  const result = await manager.send(phone, message);

  if (result.success) {
    await env.DB.prepare(`
      UPDATE sms_logs SET
        status = 'sent',
        provider = ?,
        provider_message_id = ?,
        sent_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(result.provider, result.messageId || null, smsLogId).run();
  } else {
    const errorMsg = result.error || 'Unknown error';

    if (attempt < smsLog.max_attempts) {
      // Mark as pending for retry (will be picked up by cron)
      await env.DB.prepare(`
        UPDATE sms_logs SET
          status = 'pending',
          provider = ?,
          error_message = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(result.provider, errorMsg, smsLogId).run();
    } else {
      await env.DB.prepare(`
        UPDATE sms_logs SET
          status = 'failed',
          provider = ?,
          error_message = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(result.provider, errorMsg, smsLogId).run();
    }
  }
}
