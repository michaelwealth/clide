import type { Env, TriggerRuleRow, TriggerLogRow, ContactRow, LinkRow, CampaignRow } from '../types';
import { generateId } from '../lib/id';
import { interpolateTemplate } from '../lib/helpers';

/**
 * Process a trigger event (click or no_click).
 * Checks applicable trigger rules and creates trigger logs / SMS jobs.
 */
export async function processTriggerEvent(
  env: Env,
  contactId: string,
  campaignId: string,
  event: 'click' | 'no_click'
): Promise<void> {
  // Get active trigger rules for this campaign and event type (verify campaign is active)
  const rules = await env.DB.prepare(`
    SELECT tr.* FROM trigger_rules tr
    JOIN campaigns c ON c.id = tr.campaign_id
    WHERE tr.campaign_id = ? AND tr.type = ? AND tr.is_active = 1 AND c.status = 'active'
  `).bind(campaignId, event).all<TriggerRuleRow>();

  if (!rules.results.length) return;

  const contact = await env.DB.prepare(
    'SELECT * FROM contacts WHERE id = ? AND campaign_id = ?'
  ).bind(contactId, campaignId).first<ContactRow>();

  if (!contact) return;

  const campaign = await env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = (SELECT workspace_id FROM contacts WHERE id = ?)'
  ).bind(campaignId, contactId).first<CampaignRow>();

  if (!campaign) return;

  const link = await env.DB.prepare(
    'SELECT * FROM links WHERE contact_id = ? AND campaign_id = ?'
  ).bind(contactId, campaignId).first<LinkRow>();

  // Batch-fetch existing trigger logs for all rules + this contact to avoid N+1
  const ruleIds = rules.results.map(r => r.id);
  const logPlaceholders = ruleIds.map(() => '?').join(',');
  const existingLogs = await env.DB.prepare(
    `SELECT * FROM trigger_logs WHERE trigger_rule_id IN (${logPlaceholders}) AND contact_id = ?`
  ).bind(...ruleIds, contactId).all<TriggerLogRow>();
  const logByRule = new Map(existingLogs.results.map(l => [l.trigger_rule_id, l]));

  for (const rule of rules.results) {
    // Check deduplication: has this trigger already been processed for this contact?
    const existingLog = logByRule.get(rule.id) || null;

    if (existingLog) {
      // Check if max executions reached
      if (existingLog.execution_count >= rule.max_executions) {
        continue;
      }

      // Already scheduled or fired for single-execution rules
      if (rule.max_executions === 1 && existingLog.status !== 'failed') {
        continue;
      }
    }

    // Calculate scheduled time
    const scheduledAt = new Date(Date.now() + rule.delay_minutes * 60 * 1000).toISOString();

    if (existingLog) {
      // Update existing log for retry/re-execution
      await env.DB.prepare(`
        UPDATE trigger_logs SET
          status = 'scheduled',
          scheduled_at = ?,
          execution_count = execution_count + 1
        WHERE id = ?
      `).bind(scheduledAt, existingLog.id).run();
    } else {
      // Atomic insert: INSERT OR IGNORE prevents race condition duplicates
      const logId = generateId();
      const insertResult = await env.DB.prepare(`
        INSERT OR IGNORE INTO trigger_logs (id, trigger_rule_id, contact_id, campaign_id, status, scheduled_at, execution_count)
        VALUES (?, ?, ?, ?, 'scheduled', ?, 1)
      `).bind(logId, rule.id, contactId, campaignId, scheduledAt).run();

      if (!insertResult.meta.changes) {
        // Another worker already created this log, skip
        continue;
      }
    }

    // If delay is 0, fire immediately
    if (rule.delay_minutes === 0) {
      const execCount = existingLog ? existingLog.execution_count + 1 : 1;
      await fireTrigger(env, rule, contact, campaign, link, execCount);
    }
  }
}

/**
 * Fire a trigger: create and enqueue the SMS.
 */
export async function fireTrigger(
  env: Env,
  rule: TriggerRuleRow,
  contact: ContactRow,
  campaign: CampaignRow,
  link: LinkRow | null,
  executionCount: number = 1
): Promise<void> {
  let extraVars: Record<string, string> = {};
  if (contact.extra_data) {
    try { extraVars = JSON.parse(contact.extra_data); } catch { /* ignore */ }
  }

  const shortLink = link
    ? `${env.SHORT_DOMAIN}/${campaign.campaign_key}/${link.slug}`
    : '';

  const message = interpolateTemplate(rule.message_template, {
    firstname: contact.firstname,
    link: shortLink,
    ...extraVars,
  });

  // Idempotency key for trigger SMS — includes execution count to allow retries
  const idempotencyKey = `trigger:${rule.id}:${contact.id}:${executionCount}`;

  // Atomic idempotent SMS creation
  const smsLogId = generateId();
  const insertResult = await env.DB.prepare(`
    INSERT OR IGNORE INTO sms_logs (id, contact_id, campaign_id, workspace_id, message_type, message, phone, idempotency_key)
    VALUES (?, ?, ?, ?, 'trigger', ?, ?, ?)
  `).bind(smsLogId, contact.id, campaign.id, campaign.workspace_id, message, contact.phone, idempotencyKey).run();

  if (!insertResult.meta.changes) return; // Already exists

  // Enqueue SMS
  await env.SMS_QUEUE.send({
    type: 'sms_send',
    sms_log_id: smsLogId,
    contact_id: contact.id,
    phone: contact.phone,
    message,
    idempotency_key: idempotencyKey,
    attempt: 1,
    workspace_id: campaign.workspace_id,
  });

  // Update trigger log
  await env.DB.prepare(`
    UPDATE trigger_logs SET status = 'fired', fired_at = datetime('now')
    WHERE trigger_rule_id = ? AND contact_id = ?
  `).bind(rule.id, contact.id).run();
}
