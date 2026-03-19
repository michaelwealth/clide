import { Hono } from 'hono';
import type { Env, TriggerRuleRow } from '../types';
import { generateId } from '../lib/id';
import { requireRole } from '../middleware/tenant';

const triggers = new Hono<{ Bindings: Env }>();

/**
 * GET /
 * List trigger rules for a campaign.
 */
triggers.get('/', async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  const campaign = await c.env.DB.prepare(
    'SELECT id FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const result = await c.env.DB.prepare(`
    SELECT * FROM trigger_rules WHERE campaign_id = ? ORDER BY created_at
  `).bind(campaignId).all<TriggerRuleRow>();

  return c.json({ triggers: result.results });
});

/**
 * POST /
 * Create a trigger rule.
 */
triggers.post('/', requireRole('operator'), async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  const campaign = await c.env.DB.prepare(
    'SELECT id FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const body = await c.req.json<{
    type: string;
    delay_minutes: number;
    message_template: string;
    max_executions?: number;
  }>();

  if (!['click', 'no_click', 'click_delay'].includes(body.type)) {
    return c.json({ error: 'Type must be "click", "no_click", or "click_delay"' }, 400);
  }

  if (typeof body.delay_minutes !== 'number' || body.delay_minutes < 0) {
    return c.json({ error: 'delay_minutes must be a non-negative number' }, 400);
  }

  if (body.type === 'click_delay' && body.delay_minutes <= 0) {
    return c.json({ error: 'click_delay type requires delay_minutes > 0' }, 400);
  }

  if (!body.message_template?.trim()) {
    return c.json({ error: 'message_template is required' }, 400);
  }

  const maxExec = body.max_executions ?? 1;
  if (maxExec < 1 || maxExec > 10) {
    return c.json({ error: 'max_executions must be 1-10' }, 400);
  }

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO trigger_rules (id, campaign_id, type, delay_minutes, message_template, max_executions)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, campaignId, body.type, body.delay_minutes, body.message_template.trim(), maxExec).run();

  const rule = await c.env.DB.prepare('SELECT * FROM trigger_rules WHERE id = ?').bind(id).first<TriggerRuleRow>();

  return c.json({ trigger: rule }, 201);
});

/**
 * PUT /:triggerId
 * Update a trigger rule.
 */
triggers.put('/:triggerId', requireRole('operator'), async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');
  const triggerId = c.req.param('triggerId');

  const rule = await c.env.DB.prepare(`
    SELECT tr.* FROM trigger_rules tr
    JOIN campaigns c ON c.id = tr.campaign_id
    WHERE tr.id = ? AND tr.campaign_id = ? AND c.workspace_id = ?
  `).bind(triggerId, campaignId, workspace.id).first<TriggerRuleRow>();

  if (!rule) {
    return c.json({ error: 'Trigger rule not found' }, 404);
  }

  const body = await c.req.json<{
    delay_minutes?: number;
    message_template?: string;
    max_executions?: number;
    is_active?: boolean;
  }>();

  if (body.delay_minutes !== undefined && (typeof body.delay_minutes !== 'number' || body.delay_minutes < 0)) {
    return c.json({ error: 'delay_minutes must be a non-negative number' }, 400);
  }

  if (body.max_executions !== undefined && (body.max_executions < 1 || body.max_executions > 10)) {
    return c.json({ error: 'max_executions must be 1-10' }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE trigger_rules SET
      delay_minutes = COALESCE(?, delay_minutes),
      message_template = COALESCE(?, message_template),
      max_executions = COALESCE(?, max_executions),
      is_active = COALESCE(?, is_active),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.delay_minutes ?? null,
    body.message_template?.trim() || null,
    body.max_executions ?? null,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
    triggerId
  ).run();

  return c.json({ ok: true });
});

/**
 * DELETE /:triggerId
 * Delete a trigger rule.
 */
triggers.delete('/:triggerId', requireRole('admin'), async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');
  const triggerId = c.req.param('triggerId');

  const rule = await c.env.DB.prepare(`
    SELECT tr.id FROM trigger_rules tr
    JOIN campaigns c ON c.id = tr.campaign_id
    WHERE tr.id = ? AND tr.campaign_id = ? AND c.workspace_id = ?
  `).bind(triggerId, campaignId, workspace.id).first();

  if (!rule) {
    return c.json({ error: 'Trigger rule not found' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM trigger_rules WHERE id = ?').bind(triggerId).run();

  return c.json({ ok: true });
});

export { triggers };
