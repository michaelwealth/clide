import { Hono } from 'hono';
import type { Env, CampaignRow, ContactRow, LinkRow, SmsLogRow, SmsDispatchMessage } from '../types';
import { generateId } from '../lib/id';
import { interpolateTemplate, normalizePhone } from '../lib/helpers';
import { requireRole } from '../middleware/tenant';

const sms = new Hono<{ Bindings: Env }>();

/**
 * POST /send
 * Send campaign SMS to contacts.
 * Body: { contact_ids?: string[], send_all?: boolean }
 */
sms.post('/send', requireRole('admin'), async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first<CampaignRow>();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  if (!campaign.sms_template) {
    return c.json({ error: 'Campaign has no SMS template' }, 400);
  }

  if (campaign.status !== 'active') {
    return c.json({ error: 'Campaign must be active to send SMS' }, 400);
  }

  const body = await c.req.json<{ contact_ids?: string[]; send_all?: boolean }>();

  // Get contacts to send to
  let contactsQuery: string;
  let contactsParams: unknown[];

  if (body.send_all) {
    // Send to all contacts that haven't been sent a campaign SMS yet
    contactsQuery = `
      SELECT c.*, l.slug, l.destination_url
      FROM contacts c
      LEFT JOIN links l ON l.contact_id = c.id AND l.campaign_id = c.campaign_id
      WHERE c.campaign_id = ? AND c.workspace_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM sms_logs s
        WHERE s.contact_id = c.id AND s.campaign_id = c.campaign_id
        AND s.message_type = 'campaign' AND s.status != 'failed'
      )
    `;
    contactsParams = [campaignId, workspace.id];
  } else if (body.contact_ids?.length) {
    if (body.contact_ids.length > 500) {
      return c.json({ error: 'Maximum 500 contact IDs per request. Use send_all for larger batches.' }, 400);
    }
    const placeholders = body.contact_ids.map(() => '?').join(',');
    contactsQuery = `
      SELECT c.*, l.slug, l.destination_url
      FROM contacts c
      LEFT JOIN links l ON l.contact_id = c.id AND l.campaign_id = c.campaign_id
      WHERE c.campaign_id = ? AND c.workspace_id = ?
      AND c.id IN (${placeholders})
    `;
    contactsParams = [campaignId, workspace.id, ...body.contact_ids];
  } else {
    return c.json({ error: 'Provide contact_ids or set send_all: true' }, 400);
  }

  const result = await c.env.DB.prepare(contactsQuery).bind(...contactsParams)
    .all<ContactRow & { slug: string | null; destination_url: string | null }>();

  if (!result.results.length) {
    return c.json({ error: 'No eligible contacts found' }, 404);
  }

  const shortBase = c.env.SHORT_DOMAIN;
  let queued = 0;
  let skipped = 0;
  const queueMessages: SmsDispatchMessage[] = [];

  for (const contact of result.results) {
    const phone = normalizePhone(contact.phone);
    if (!phone) {
      skipped++;
      continue;
    }

    if (!contact.slug) {
      skipped++;
      continue;
    }

    const shortLink = `${shortBase}/${campaign.campaign_key}/${contact.slug}`;

    // Build idempotency key: campaign + contact + type
    const idempotencyKey = `sms:${campaignId}:${contact.id}:campaign`;

    // Interpolate the template
    let extraVars: Record<string, string> = {};
    if (contact.extra_data) {
      try { extraVars = JSON.parse(contact.extra_data); } catch { /* ignore */ }
    }

    const message = interpolateTemplate(campaign.sms_template!, {
      firstname: contact.firstname,
      link: shortLink,
      ...extraVars,
    });

    // Idempotent SMS log creation: INSERT OR IGNORE prevents race condition duplicates
    const smsLogId = generateId();
    const insertResult = await c.env.DB.prepare(`
      INSERT OR IGNORE INTO sms_logs (id, contact_id, campaign_id, workspace_id, message_type, message, phone, idempotency_key)
      VALUES (?, ?, ?, ?, 'campaign', ?, ?, ?)
    `).bind(smsLogId, contact.id, campaignId, workspace.id, message, phone, idempotencyKey).run();

    if (!insertResult.meta.changes) {
      // Row already exists (duplicate idempotency key), skip
      skipped++;
      continue;
    }

    // Collect for batch queue send
    queueMessages.push({
      type: 'sms_send',
      sms_log_id: smsLogId,
      contact_id: contact.id,
      phone,
      message,
      idempotency_key: idempotencyKey,
      attempt: 1,
      workspace_id: workspace.id,
    });

    queued++;
  }

  // Batch-enqueue SMS messages in parallel chunks
  const QUEUE_CHUNK = 25;
  for (let qi = 0; qi < queueMessages.length; qi += QUEUE_CHUNK) {
    await Promise.all(
      queueMessages.slice(qi, qi + QUEUE_CHUNK).map(msg => c.env.SMS_QUEUE.send(msg))
    );
  }

  return c.json({
    queued,
    skipped,
    total: result.results.length,
  });
});

/**
 * GET /logs
 * List SMS logs for a campaign (paginated).
 */
sms.get('/logs', async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const offset = (page - 1) * limit;
  const status = c.req.query('status');

  let query = `
    SELECT s.*, c.firstname, c.phone as contact_phone
    FROM sms_logs s
    JOIN contacts c ON c.id = s.contact_id
    WHERE s.campaign_id = ? AND s.workspace_id = ?
  `;
  const params: unknown[] = [campaignId, workspace.id];

  if (status) {
    query += ' AND s.status = ?';
    params.push(status);
  }

  query += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  const countQuery = status
    ? 'SELECT COUNT(*) as total FROM sms_logs WHERE campaign_id = ? AND workspace_id = ? AND status = ?'
    : 'SELECT COUNT(*) as total FROM sms_logs WHERE campaign_id = ? AND workspace_id = ?';
  const countParams = status ? [campaignId, workspace.id, status] : [campaignId, workspace.id];
  const total = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

  return c.json({
    logs: result.results,
    pagination: {
      page,
      limit,
      total: total?.total ?? 0,
      pages: Math.ceil((total?.total ?? 0) / limit),
    },
  });
});

export { sms };
