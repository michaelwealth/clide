import { Hono } from 'hono';
import type { Env, CampaignRow, ContactRow, CsvUploadRow } from '../types';
import { generateId } from '../lib/id';
import { requireRole } from '../middleware/tenant';

const contacts = new Hono<{ Bindings: Env }>();

/**
 * GET /
 * List contacts for a campaign (paginated, filterable).
 */
contacts.get('/', async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  // Verify campaign belongs to workspace
  const campaign = await c.env.DB.prepare(
    'SELECT id, campaign_key FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first<{ id: string; campaign_key: string }>();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const offset = (page - 1) * limit;
  const search = c.req.query('search') || '';
  const smsStatus = c.req.query('sms_status') || '';
  const clickStatus = c.req.query('click_status') || '';

  // Build query with joins for status fields
  let query = `
    SELECT
      c.id, c.firstname, c.phone, c.created_at,
      l.slug, l.destination_url,
      ? as campaign_key,
      COALESCE(s.status, 'not_sent') as sms_status,
      CASE WHEN cl.id IS NOT NULL THEN 1 ELSE 0 END as has_clicked,
      (SELECT COUNT(*) FROM click_logs cl2 WHERE cl2.contact_id = c.id AND cl2.campaign_id = c.campaign_id) as click_count,
      COALESCE(tl.status, 'none') as trigger_status,
      s.sent_at as sms_sent_at,
      cl.clicked_at as last_click_at
    FROM contacts c
    LEFT JOIN links l ON l.contact_id = c.id AND l.campaign_id = c.campaign_id
    LEFT JOIN (
      SELECT contact_id, campaign_id, status, sent_at,
        ROW_NUMBER() OVER (PARTITION BY contact_id, campaign_id ORDER BY created_at DESC) as rn
      FROM sms_logs WHERE message_type = 'campaign'
    ) s ON s.contact_id = c.id AND s.campaign_id = c.campaign_id AND s.rn = 1
    LEFT JOIN (
      SELECT contact_id, campaign_id, id, clicked_at,
        ROW_NUMBER() OVER (PARTITION BY contact_id, campaign_id ORDER BY clicked_at DESC) as rn
      FROM click_logs
    ) cl ON cl.contact_id = c.id AND cl.campaign_id = c.campaign_id AND cl.rn = 1
    LEFT JOIN (
      SELECT contact_id, campaign_id, status,
        ROW_NUMBER() OVER (PARTITION BY contact_id, campaign_id ORDER BY created_at DESC) as rn
      FROM trigger_logs
    ) tl ON tl.contact_id = c.id AND tl.campaign_id = c.campaign_id AND tl.rn = 1
    WHERE c.campaign_id = ? AND c.workspace_id = ?
  `;
  const params: unknown[] = [campaign.campaign_key, campaignId, workspace.id];

  if (search) {
    const safeSearch = search.replace(/[%_]/g, '\\$&');
    query += " AND (c.firstname LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')";
    params.push(`%${safeSearch}%`, `%${safeSearch}%`);
  }

  if (smsStatus === 'not_sent') {
    query += ' AND s.status IS NULL';
  } else if (smsStatus) {
    query += ' AND s.status = ?';
    params.push(smsStatus);
  }

  if (clickStatus === 'clicked') {
    query += ' AND cl.id IS NOT NULL';
  } else if (clickStatus === 'not_clicked') {
    query += ' AND cl.id IS NULL';
  }

  query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  // Total count — must mirror same JOINs and filters as the data query
  let countQuery = 'SELECT COUNT(*) as total FROM contacts c';
  const countParams: unknown[] = [];

  if (smsStatus) {
    countQuery += `
      LEFT JOIN (
        SELECT contact_id, campaign_id, status,
          ROW_NUMBER() OVER (PARTITION BY contact_id, campaign_id ORDER BY created_at DESC) as rn
        FROM sms_logs WHERE message_type = 'campaign'
      ) s ON s.contact_id = c.id AND s.campaign_id = c.campaign_id AND s.rn = 1`;
  }
  if (clickStatus) {
    countQuery += `
      LEFT JOIN (
        SELECT contact_id, campaign_id, id,
          ROW_NUMBER() OVER (PARTITION BY contact_id, campaign_id ORDER BY clicked_at DESC) as rn
        FROM click_logs
      ) cl ON cl.contact_id = c.id AND cl.campaign_id = c.campaign_id AND cl.rn = 1`;
  }

  countQuery += ' WHERE c.campaign_id = ? AND c.workspace_id = ?';
  countParams.push(campaignId, workspace.id);

  if (search) {
    const safeSearch = search.replace(/[%_]/g, '\\$&');
    countQuery += " AND (c.firstname LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')";
    countParams.push(`%${safeSearch}%`, `%${safeSearch}%`);
  }
  if (smsStatus === 'not_sent') {
    countQuery += ' AND s.status IS NULL';
  } else if (smsStatus) {
    countQuery += ' AND s.status = ?';
    countParams.push(smsStatus);
  }
  if (clickStatus === 'clicked') {
    countQuery += ' AND cl.id IS NOT NULL';
  } else if (clickStatus === 'not_clicked') {
    countQuery += ' AND cl.id IS NULL';
  }

  const total = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

  return c.json({
    contacts: result.results,
    pagination: {
      page,
      limit,
      total: total?.total ?? 0,
      pages: Math.ceil((total?.total ?? 0) / limit),
    },
  });
});

/**
 * POST /upload
 * Upload a CSV file for processing.
 */
contacts.post('/upload', requireRole('operator'), async (c) => {
  const user = c.get('user');
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first<CampaignRow>();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const mappingStr = formData.get('field_mapping') as string | null;
  const duplicateModeRaw = (formData.get('duplicate_mode') as string | null) || 'keep';
  const duplicateMode = duplicateModeRaw === 'replace' ? 'replace' : 'keep';

  if (!file) {
    return c.json({ error: 'CSV file is required' }, 400);
  }

  if (!file.name.endsWith('.csv')) {
    return c.json({ error: 'Only CSV files are accepted' }, 400);
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: 'File size must be under 5MB' }, 400);
  }

  const uploadId = generateId();
  const r2Key = `uploads/${workspace.id}/${campaignId}/${uploadId}.csv`;

  // Store file in R2
  const fileBuffer = await file.arrayBuffer();
  await c.env.R2.put(r2Key, fileBuffer, {
    customMetadata: { filename: file.name, workspace_id: workspace.id },
  });

  // Count rows (rough estimate from file content)
  const text = new TextDecoder().decode(fileBuffer);
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const rowCount = Math.max(0, lines.length - 1); // Exclude header

  if (rowCount > 5000) {
    await c.env.R2.delete(r2Key);
    return c.json({ error: 'CSV must have 5,000 rows or fewer' }, 400);
  }

  if (rowCount === 0) {
    await c.env.R2.delete(r2Key);
    return c.json({ error: 'CSV file is empty' }, 400);
  }

  // Pack mapping + upload metadata into field_mapping for queue processor.
  let packedFieldMapping: string | null = null;
  if (mappingStr) {
    try {
      const parsed = JSON.parse(mappingStr);
      packedFieldMapping = JSON.stringify({
        mapping: parsed,
        __meta: { duplicate_mode: duplicateMode },
      });
    } catch {
      return c.json({ error: 'Invalid field_mapping JSON' }, 400);
    }
  } else {
    packedFieldMapping = JSON.stringify({
      mapping: null,
      __meta: { duplicate_mode: duplicateMode },
    });
  }

  // Create upload record
  await c.env.DB.prepare(`
    INSERT INTO csv_uploads (id, campaign_id, workspace_id, r2_key, filename, row_count, field_mapping, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    uploadId, campaignId, workspace.id, r2Key,
    file.name, rowCount, packedFieldMapping, user.id
  ).run();

  // Enqueue for processing
  await c.env.CSV_QUEUE.send({
    type: 'csv_process',
    upload_id: uploadId,
    campaign_id: campaignId,
    workspace_id: workspace.id,
  });

  return c.json({
    upload: {
      id: uploadId,
      filename: file.name,
      row_count: rowCount,
      status: 'pending',
    },
  }, 202);
});

/**
 * GET /uploads
 * List CSV uploads for a campaign.
 */
contacts.get('/uploads', requireRole('operator'), async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  const result = await c.env.DB.prepare(`
    SELECT id, filename, row_count, processed_count, failed_count, status, error_message, created_at
    FROM csv_uploads
    WHERE campaign_id = ? AND workspace_id = ?
    ORDER BY created_at DESC
  `).bind(campaignId, workspace.id).all<CsvUploadRow>();

  return c.json({ uploads: result.results });
});

/**
 * GET /uploads/:uploadId
 * Get upload status.
 */
contacts.get('/uploads/:uploadId', requireRole('operator'), async (c) => {
  const { workspace } = c.get('workspace');
  const uploadId = c.req.param('uploadId');

  const upload = await c.env.DB.prepare(
    'SELECT * FROM csv_uploads WHERE id = ? AND workspace_id = ?'
  ).bind(uploadId, workspace.id).first<CsvUploadRow>();

  if (!upload) {
    return c.json({ error: 'Upload not found' }, 404);
  }

  return c.json({ upload });
});

/**
 * GET /export
 * Export contacts as CSV.
 */
contacts.get('/export', requireRole('operator'), async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspace.id).first<CampaignRow>();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const result = await c.env.DB.prepare(`
    SELECT
      c.firstname, c.phone,
      l.slug,
      COALESCE(s.status, 'not_sent') as sms_status,
      CASE WHEN cl.click_count > 0 THEN 'clicked' ELSE 'not_clicked' END as click_status,
      cl.click_count
    FROM contacts c
    LEFT JOIN links l ON l.contact_id = c.id AND l.campaign_id = c.campaign_id
    LEFT JOIN (
      SELECT contact_id, campaign_id, status,
        ROW_NUMBER() OVER (PARTITION BY contact_id, campaign_id ORDER BY created_at DESC) as rn
      FROM sms_logs WHERE message_type = 'campaign'
    ) s ON s.contact_id = c.id AND s.campaign_id = c.campaign_id AND s.rn = 1
    LEFT JOIN (
      SELECT contact_id, campaign_id, COUNT(*) as click_count
      FROM click_logs GROUP BY contact_id, campaign_id
    ) cl ON cl.contact_id = c.id AND cl.campaign_id = c.campaign_id
    WHERE c.campaign_id = ? AND c.workspace_id = ?
    ORDER BY c.firstname
    LIMIT 50000
  `).bind(campaignId, workspace.id).all();

  // Build CSV with injection protection
  const shortBase = c.env.SHORT_DOMAIN;

  /**
   * Sanitize a CSV cell value to prevent formula injection.
   * Escapes embedded double quotes and prefixes dangerous leading chars.
   */
  function csvCell(value: string): string {
    let v = String(value ?? '');
    // Escape embedded double-quotes
    v = v.replace(/"/g, '""');
    // Prefix formula-triggering characters to prevent CSV injection
    if (/^[=+\-@\t\r]/.test(v)) {
      v = "'" + v;
    }
    return `"${v}"`;
  }

  const header = 'First Name,Phone,Short Link,SMS Status,Click Status,Click Count\n';
  const rows = result.results.map((r: any) => {
    const link = r.slug ? `${shortBase}/${campaign.campaign_key}/${r.slug}` : '';
    return [
      csvCell(r.firstname),
      csvCell(r.phone),
      csvCell(link),
      csvCell(r.sms_status),
      csvCell(r.click_status),
      csvCell(String(r.click_count || 0)),
    ].join(',');
  }).join('\n');

  const safeName = campaign.name.replace(/[^a-zA-Z0-9_\- ]/g, '_');
  return new Response(header + rows, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${safeName}-contacts.csv"`,
    },
  });
});

export { contacts };
