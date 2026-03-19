import type { Env, TriggerLogRow, TriggerRuleRow, ContactRow, CampaignRow, LinkRow } from '../types';
import { fireTrigger } from '../queues/trigger-executor';

/**
 * Trigger scheduler cron job.
 * Runs every 2 minutes.
 * 
 * Fires scheduled triggers whose scheduled_at has passed.
 */
export async function scheduleTriggers(env: Env): Promise<void> {
  const now = new Date().toISOString();

  // Get scheduled trigger logs that are ready to fire
  const pendingTriggers = await env.DB.prepare(`
    SELECT tl.*, tr.message_template, tr.type, tr.max_executions, tr.is_active
    FROM trigger_logs tl
    JOIN trigger_rules tr ON tr.id = tl.trigger_rule_id
    WHERE tl.status = 'scheduled' AND tl.scheduled_at <= ?
    LIMIT 100
  `).bind(now).all<TriggerLogRow & { 
    message_template: string; 
    type: string; 
    max_executions: number; 
    is_active: number;
  }>();

  // Separate active vs inactive triggers first
  const active: typeof pendingTriggers.results = [];
  const toSkip: string[] = [];

  for (const trigger of pendingTriggers.results) {
    if (!trigger.is_active || trigger.execution_count > trigger.max_executions) {
      toSkip.push(trigger.id);
    } else {
      active.push(trigger);
    }
  }

  // Batch-skip deactivated/exhausted triggers
  if (toSkip.length) {
    const placeholders = toSkip.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE trigger_logs SET status = 'skipped' WHERE id IN (${placeholders})`
    ).bind(...toSkip).run();
  }

  if (!active.length) return;

  // Batch-fetch contacts, campaigns, and links to avoid N+1 queries
  const contactIds = [...new Set(active.map(t => t.contact_id))];
  const campaignIds = [...new Set(active.map(t => t.campaign_id))];

  const contactPlaceholders = contactIds.map(() => '?').join(',');
  const campaignPlaceholders = campaignIds.map(() => '?').join(',');

  const [contactsResult, campaignsResult, linksResult] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM contacts WHERE id IN (${contactPlaceholders})`
    ).bind(...contactIds).all<ContactRow>(),
    env.DB.prepare(
      `SELECT * FROM campaigns WHERE id IN (${campaignPlaceholders}) AND status = 'active'`
    ).bind(...campaignIds).all<CampaignRow>(),
    env.DB.prepare(
      `SELECT * FROM links WHERE contact_id IN (${contactPlaceholders}) AND campaign_id IN (${campaignPlaceholders})`
    ).bind(...contactIds, ...campaignIds).all<LinkRow>(),
  ]);

  const contactMap = new Map(contactsResult.results.map(c => [c.id, c]));
  const campaignMap = new Map(campaignsResult.results.map(c => [c.id, c]));
  const linkMap = new Map(linksResult.results.map(l => [`${l.contact_id}:${l.campaign_id}`, l]));

  for (const trigger of active) {
    const contact = contactMap.get(trigger.contact_id);
    const campaign = campaignMap.get(trigger.campaign_id);

    if (!contact || !campaign) {
      await env.DB.prepare(`
        UPDATE trigger_logs SET status = 'skipped' WHERE id = ?
      `).bind(trigger.id).run();
      continue;
    }

    const link = linkMap.get(`${trigger.contact_id}:${trigger.campaign_id}`) || null;

    const rule: TriggerRuleRow = {
      id: trigger.trigger_rule_id,
      campaign_id: trigger.campaign_id,
      type: trigger.type as 'click' | 'no_click',
      delay_minutes: 0,
      message_template: trigger.message_template,
      max_executions: trigger.max_executions,
      is_active: trigger.is_active,
      created_at: '',
      updated_at: '',
    };

    try {
      await fireTrigger(env, rule, contact, campaign, link, trigger.execution_count);
    } catch (err) {
      console.error(`Trigger ${trigger.id} failed:`, err);
      await env.DB.prepare(`
        UPDATE trigger_logs SET status = 'failed' WHERE id = ?
      `).bind(trigger.id).run();
    }
  }
}

/**
 * No-click trigger check.
 * Runs as part of the trigger scheduler.
 * Finds contacts who haven't clicked within the delay window.
 */
export async function checkNoClickTriggers(env: Env): Promise<void> {
  // Get active no_click trigger rules
  const rules = await env.DB.prepare(`
    SELECT tr.*, c.id as campaign_id, c.status as campaign_status
    FROM trigger_rules tr
    JOIN campaigns c ON c.id = tr.campaign_id
    WHERE tr.type = 'no_click' AND tr.is_active = 1 AND c.status = 'active'
  `).all<TriggerRuleRow & { campaign_status: string }>();

  for (const rule of rules.results) {
    // Find contacts who:
    // 1. Have been sent an SMS
    // 2. Haven't clicked
    // 3. SMS was sent more than delay_minutes ago
    // 4. Don't have an existing trigger log for this rule
    const cutoff = new Date(Date.now() - rule.delay_minutes * 60 * 1000).toISOString();

    const eligibleContacts = await env.DB.prepare(`
      SELECT c.* FROM contacts c
      JOIN sms_logs s ON s.contact_id = c.id AND s.campaign_id = c.campaign_id AND s.message_type = 'campaign'
      WHERE c.campaign_id = ?
        AND s.status IN ('sent', 'delivered')
        AND s.sent_at <= ?
        AND NOT EXISTS (
          SELECT 1 FROM click_logs cl WHERE cl.contact_id = c.id AND cl.campaign_id = c.campaign_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM trigger_logs tl WHERE tl.trigger_rule_id = ? AND tl.contact_id = c.id
        )
      LIMIT 50
    `).bind(rule.campaign_id, cutoff, rule.id).all<ContactRow>();

    if (eligibleContacts.results.length > 0) {
      await Promise.all(
        eligibleContacts.results.map(contact =>
          env.TRIGGER_QUEUE.send({
            type: 'trigger_check',
            trigger_rule_id: rule.id,
            contact_id: contact.id,
            campaign_id: rule.campaign_id,
            event: 'no_click',
          })
        )
      );
    }
  }
}
