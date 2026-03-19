import { Hono, Context } from 'hono';
import type { Env, CampaignRow, CampaignStatus } from '../types';
import { VALID_TRANSITIONS } from '../types';
import { generateId, generateCampaignKey } from '../lib/id';
import { invalidateCampaignStatusCache, deleteLinkData, setCampaignStatusCache } from '../lib/kv';
import { requireRole } from '../middleware/tenant';

const campaigns = new Hono<{ Bindings: Env }>();

/**
 * GET /
 * List campaigns for the workspace.
 */
campaigns.get('/', async (c) => {
  const { workspace } = c.get('workspace');
  const status = c.req.query('status');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM campaigns WHERE workspace_id = ?';
  const params: unknown[] = [workspace.id];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all<CampaignRow>();

  const countQuery = status
    ? 'SELECT COUNT(*) as total FROM campaigns WHERE workspace_id = ? AND status = ?'
    : 'SELECT COUNT(*) as total FROM campaigns WHERE workspace_id = ?';
  const countParams = status ? [workspace.id, status] : [workspace.id];
  const total = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

  return c.json({
    campaigns: result.results,
    pagination: {
      page,
      limit,
      total: total?.total ?? 0,
      pages: Math.ceil((total?.total ?? 0) / limit),
    },
  });
});

/**
 * POST /
 * Create a new campaign.
 */
campaigns.post('/', requireRole('operator'), async (c) => {
  const user = c.get('user');
  const { workspace } = c.get('workspace');
  const body = await c.req.json<{
    name: string;
    base_url: string;
    fallback_url: string;
    sms_template?: string;
    start_at?: string;
    end_at?: string;
  }>();

  if (!body.name?.trim()) {
    return c.json({ error: 'Campaign name is required' }, 400);
  }

  // Validate URLs
  try {
    new URL(body.base_url);
    new URL(body.fallback_url);
  } catch {
    return c.json({ error: 'Invalid base_url or fallback_url' }, 400);
  }

  // Validate schedule
  if (body.start_at && body.end_at) {
    if (new Date(body.start_at) >= new Date(body.end_at)) {
      return c.json({ error: 'start_at must be before end_at' }, 400);
    }
  }

  // Generate unique campaign key within workspace
  let campaignKey: string;
  let attempts = 0;
  do {
    campaignKey = generateCampaignKey();
    const exists = await c.env.DB.prepare(
      'SELECT id FROM campaigns WHERE workspace_id = ? AND campaign_key = ?'
    ).bind(workspace.id, campaignKey).first();
    if (!exists) break;
    attempts++;
  } while (attempts < 20);

  if (attempts >= 20) {
    return c.json({ error: 'Failed to generate unique campaign key' }, 500);
  }

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO campaigns (id, workspace_id, name, campaign_key, base_url, fallback_url, sms_template, start_at, end_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, workspace.id, body.name.trim(), campaignKey,
    body.base_url, body.fallback_url,
    body.sms_template || null,
    body.start_at || null, body.end_at || null,
    user.id
  ).run();

  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ?'
  ).bind(id).first<CampaignRow>();

  return c.json({ campaign }, 201);
});

/**
 * GET /:campaignId
 * Get campaign details with stats.
 */
campaigns.get('/:campaignId', async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first<CampaignRow>();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  // Get summary stats (workspace_id filter for defense-in-depth)
  const [contactCount, linkCount, clickCount, smsCount] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ? AND workspace_id = ?')
      .bind(campaignId, workspace.id).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM links WHERE campaign_id = ? AND campaign_id IN (SELECT id FROM campaigns WHERE workspace_id = ?)')
      .bind(campaignId, workspace.id).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM click_logs WHERE campaign_id = ? AND campaign_id IN (SELECT id FROM campaigns WHERE workspace_id = ?)')
      .bind(campaignId, workspace.id).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM sms_logs WHERE campaign_id = ? AND workspace_id = ?')
      .bind(campaignId, workspace.id).first<{ count: number }>(),
  ]);

  return c.json({
    campaign,
    stats: {
      contacts: contactCount?.count ?? 0,
      links: linkCount?.count ?? 0,
      clicks: clickCount?.count ?? 0,
      sms_sent: smsCount?.count ?? 0,
    },
  });
});

/**
 * PUT /:campaignId
 * Update campaign details (draft or scheduled only).
 */
campaigns.put('/:campaignId', requireRole('operator'), async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId')!;

  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first<CampaignRow>();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  if (!['draft', 'scheduled'].includes(campaign.status)) {
    return c.json({ error: 'Can only edit draft or scheduled campaigns' }, 400);
  }

  const body = await c.req.json<{
    name?: string;
    base_url?: string;
    fallback_url?: string;
    sms_template?: string;
    start_at?: string;
    end_at?: string;
  }>();

  if (body.base_url) {
    try { new URL(body.base_url); } catch { return c.json({ error: 'Invalid base_url' }, 400); }
  }
  if (body.fallback_url) {
    try { new URL(body.fallback_url); } catch { return c.json({ error: 'Invalid fallback_url' }, 400); }
  }

  const startAt = body.start_at ?? campaign.start_at;
  const endAt = body.end_at ?? campaign.end_at;
  if (startAt && endAt && new Date(startAt) >= new Date(endAt)) {
    return c.json({ error: 'start_at must be before end_at' }, 400);
  }

  // Build dynamic update to allow clearing nullable fields
  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined && body.name.trim()) {
    sets.push('name = ?');
    params.push(body.name.trim());
  }
  if (body.base_url !== undefined) {
    sets.push('base_url = ?');
    params.push(body.base_url);
  }
  if (body.fallback_url !== undefined) {
    sets.push('fallback_url = ?');
    params.push(body.fallback_url);
  }
  if (body.sms_template !== undefined) {
    sets.push('sms_template = ?');
    params.push(body.sms_template || null);
  }
  if (body.start_at !== undefined) {
    sets.push('start_at = ?');
    params.push(body.start_at || null);
  }
  if (body.end_at !== undefined) {
    sets.push('end_at = ?');
    params.push(body.end_at || null);
  }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    await c.env.DB.prepare(
      `UPDATE campaigns SET ${sets.join(', ')} WHERE id = ? AND workspace_id = ?`
    ).bind(...params, campaignId, workspace.id).run();
  }

  // If fallback_url or end_at changed, invalidate the KV status cache
  if (body.fallback_url !== undefined || body.end_at !== undefined) {
    await invalidateCampaignStatusCache(c.env.KV, campaignId);
  }

  return c.json({ ok: true });
});

// ── State Transition Endpoints ──

async function transitionCampaign(
  c: Context<{ Bindings: Env }>,
  targetStatus: CampaignStatus
) {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId')!;

  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first<CampaignRow>();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const currentStatus = campaign.status as CampaignStatus;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(targetStatus)) {
    return c.json({
      error: `Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed.join(', ') || 'none'}`,
    }, 400);
  }

  // Validation for scheduling
  if (targetStatus === 'scheduled') {
    if (!campaign.start_at || !campaign.end_at) {
      return c.json({ error: 'Campaign must have start_at and end_at to schedule' }, 400);
    }
  }

  // Atomic state transition: only update if status hasn't changed since read
  const result = await c.env.DB.prepare(`
    UPDATE campaigns SET status = ?, updated_at = datetime('now')
    WHERE id = ? AND workspace_id = ? AND status = ?
  `).bind(targetStatus, campaignId, workspace.id, currentStatus).run();

  if (!result.meta.changes) {
    return c.json({ error: 'Campaign status changed concurrently, please retry' }, 409);
  }

  // Set KV cache with the new status so redirect handler uses it immediately
  await setCampaignStatusCache(
    c.env.KV,
    campaignId,
    targetStatus,
    campaign.fallback_url,
    campaign.end_at
  );

  return c.json({ ok: true, status: targetStatus });
}

campaigns.post('/:campaignId/schedule', requireRole('operator'), (c) => transitionCampaign(c, 'scheduled'));
campaigns.post('/:campaignId/activate', requireRole('admin'), (c) => transitionCampaign(c, 'active'));
campaigns.post('/:campaignId/pause', requireRole('admin'), (c) => transitionCampaign(c, 'paused'));
campaigns.post('/:campaignId/expire', requireRole('admin'), (c) => transitionCampaign(c, 'expired'));

// Cancel schedule: scheduled → draft
campaigns.post('/:campaignId/unschedule', requireRole('operator'), (c) => transitionCampaign(c, 'draft'));

/**
 * DELETE /:campaignId
 * Delete a draft campaign.
 */
campaigns.delete('/:campaignId', requireRole('admin'), async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first<CampaignRow>();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  if (campaign.status !== 'draft') {
    return c.json({ error: 'Only draft campaigns can be deleted' }, 400);
  }

  // Clean up KV link entries for this campaign before deleting from DB
  const links = await c.env.DB.prepare(
    'SELECT slug FROM links WHERE campaign_id = ?'
  ).bind(campaignId).all<{ slug: string }>();

  const kvDeletes = links.results.map(l =>
    deleteLinkData(c.env.KV, campaign.campaign_key, l.slug)
  );
  kvDeletes.push(invalidateCampaignStatusCache(c.env.KV, campaign.id));
  await Promise.allSettled(kvDeletes);

  await c.env.DB.prepare('DELETE FROM campaigns WHERE id = ? AND workspace_id = ?').bind(campaignId, workspace.id).run();

  return c.json({ ok: true });
});

export { campaigns };
