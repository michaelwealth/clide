import { Hono } from 'hono';
import type { Env, WorkspaceRow, WorkspaceMemberRow } from '../types';
import { generateId } from '../lib/id';
import { requireRole } from '../middleware/tenant';

const workspaces = new Hono<{ Bindings: Env }>();

/**
 * GET /details
 * Get workspace details with member count.
 */
workspaces.get('/details', async (c) => {
  const { workspace } = c.get('workspace');

  const memberCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = ?'
  ).bind(workspace.id).first<{ count: number }>();

  const campaignCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM campaigns WHERE workspace_id = ?'
  ).bind(workspace.id).first<{ count: number }>();

  return c.json({
    workspace: {
      ...workspace,
      member_count: memberCount?.count ?? 0,
      campaign_count: campaignCount?.count ?? 0,
    },
  });
});

/**
 * PUT /api/workspaces/:workspaceId
 * Update workspace name and/or custom domain.
 */
workspaces.put('/', requireRole('owner'), async (c) => {
  const { workspace } = c.get('workspace');
  const body = await c.req.json<{ name?: string; custom_domain?: string | null }>();

  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return c.json({ error: 'Name is required' }, 400);
    }
    sets.push('name = ?');
    params.push(body.name.trim());
  }

  if (body.custom_domain !== undefined) {
    if (body.custom_domain === null || body.custom_domain === '') {
      sets.push('custom_domain = NULL');
    } else {
      const domain = body.custom_domain.toLowerCase().trim();
      // Validate domain format
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
        return c.json({ error: 'Invalid domain format' }, 400);
      }
      // Check uniqueness
      const existing = await c.env.DB.prepare(
        'SELECT id FROM workspaces WHERE custom_domain = ? AND id != ?'
      ).bind(domain, workspace.id).first();
      if (existing) {
        return c.json({ error: 'Domain is already in use by another workspace' }, 409);
      }
      sets.push('custom_domain = ?');
      params.push(domain);
    }
  }

  if (sets.length === 0) {
    return c.json({ error: 'Nothing to update' }, 400);
  }

  sets.push("updated_at = datetime('now')");
  await c.env.DB.prepare(
    `UPDATE workspaces SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...params, workspace.id).run();

  return c.json({ ok: true });
});

/**
 * GET /api/workspaces/:workspaceId/members
 * List workspace members.
 */
workspaces.get('/members', requireRole('admin'), async (c) => {
  const { workspace } = c.get('workspace');

  const result = await c.env.DB.prepare(`
    SELECT wm.id, wm.role, wm.created_at, u.id as user_id, u.email, u.name, u.avatar_url
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
    ORDER BY wm.created_at
  `).bind(workspace.id).all();

  return c.json({ members: result.results });
});

/**
 * POST /api/workspaces/:workspaceId/members
 * Add a member to the workspace by email.
 */
workspaces.post('/members', requireRole('admin'), async (c) => {
  const { workspace } = c.get('workspace');
  const body = await c.req.json<{ email: string; role: string }>();

  if (!body.email || !body.role) {
    return c.json({ error: 'Email and role are required' }, 400);
  }

  const validRoles = ['admin', 'operator', 'viewer'];
  if (!validRoles.includes(body.role)) {
    return c.json({ error: `Role must be one of: ${validRoles.join(', ')}` }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(body.email).first<{ id: string }>();

  if (!user) {
    return c.json({ error: 'User not found. They must be invited to the platform first.' }, 404);
  }

  // Check if already a member
  const existing = await c.env.DB.prepare(
    'SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
  ).bind(workspace.id, user.id).first();

  if (existing) {
    return c.json({ error: 'User is already a member' }, 409);
  }

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)
  `).bind(id, workspace.id, user.id, body.role).run();

  return c.json({ member: { id, workspace_id: workspace.id, user_id: user.id, role: body.role } }, 201);
});

/**
 * PUT /api/workspaces/:workspaceId/members/:memberId
 * Update a member's role.
 */
workspaces.put('/members/:memberId', requireRole('owner'), async (c) => {
  const { workspace } = c.get('workspace');
  const memberId = c.req.param('memberId');
  const body = await c.req.json<{ role: string }>();

  const validRoles = ['admin', 'operator', 'viewer'];
  if (!validRoles.includes(body.role)) {
    return c.json({ error: `Role must be one of: ${validRoles.join(', ')}` }, 400);
  }

  const member = await c.env.DB.prepare(
    'SELECT * FROM workspace_members WHERE id = ? AND workspace_id = ?'
  ).bind(memberId, workspace.id).first<WorkspaceMemberRow>();

  if (!member) {
    return c.json({ error: 'Member not found' }, 404);
  }

  if (member.role === 'owner') {
    return c.json({ error: 'Cannot change owner role' }, 403);
  }

  await c.env.DB.prepare(
    'UPDATE workspace_members SET role = ? WHERE id = ?'
  ).bind(body.role, memberId).run();

  return c.json({ ok: true });
});

/**
 * DELETE /api/workspaces/:workspaceId/members/:memberId
 * Remove a member from the workspace.
 */
workspaces.delete('/members/:memberId', requireRole('owner'), async (c) => {
  const { workspace } = c.get('workspace');
  const memberId = c.req.param('memberId');

  const member = await c.env.DB.prepare(
    'SELECT * FROM workspace_members WHERE id = ? AND workspace_id = ?'
  ).bind(memberId, workspace.id).first<WorkspaceMemberRow>();

  if (!member) {
    return c.json({ error: 'Member not found' }, 404);
  }

  if (member.role === 'owner') {
    return c.json({ error: 'Cannot remove workspace owner' }, 403);
  }

  await c.env.DB.prepare(
    'DELETE FROM workspace_members WHERE id = ?'
  ).bind(memberId).run();

  return c.json({ ok: true });
});

// ── SMS Configuration ──

/**
 * GET /api/workspaces/:workspaceId/sms-config
 * Get workspace SMS provider configuration.
 * API keys are masked for display.
 */
workspaces.get('/sms-config', requireRole('admin'), async (c) => {
  const { workspace } = c.get('workspace');

  interface SmsConfigRow {
    provider_priority: string;
    kudi_api_key: string | null;
    kudi_sender_id: string | null;
    termii_api_key: string | null;
    termii_sender_id: string | null;
    at_api_key: string | null;
    at_username: string | null;
    at_sender_id: string | null;
  }

  const config = await c.env.DB.prepare(
    'SELECT * FROM workspace_sms_config WHERE workspace_id = ?'
  ).bind(workspace.id).first<SmsConfigRow>();

  if (!config) {
    return c.json({
      config: {
        provider_priority: 'kudi,termii,africastalking',
        kudi_api_key: '',
        kudi_sender_id: 'CLiDE',
        termii_api_key: '',
        termii_sender_id: 'CLiDE',
        at_api_key: '',
        at_username: '',
        at_sender_id: '',
      },
    });
  }

  // Mask API keys for display (show last 4 chars only)
  const maskKey = (key: string | null): string => {
    if (!key) return '';
    if (key.length <= 4) return '****';
    return '****' + key.slice(-4);
  };

  return c.json({
    config: {
      provider_priority: config.provider_priority,
      kudi_api_key: maskKey(config.kudi_api_key),
      kudi_sender_id: config.kudi_sender_id || 'CLiDE',
      termii_api_key: maskKey(config.termii_api_key),
      termii_sender_id: config.termii_sender_id || 'CLiDE',
      at_api_key: maskKey(config.at_api_key),
      at_username: config.at_username || '',
      at_sender_id: config.at_sender_id || '',
    },
  });
});

/**
 * PUT /api/workspaces/:workspaceId/sms-config
 * Update workspace SMS provider configuration.
 * Only provided keys are updated; masked values (****) are ignored.
 */
workspaces.put('/sms-config', requireRole('owner'), async (c) => {
  const { workspace } = c.get('workspace');
  const body = await c.req.json<{
    provider_priority?: string;
    kudi_api_key?: string;
    kudi_sender_id?: string;
    termii_api_key?: string;
    termii_sender_id?: string;
    at_api_key?: string;
    at_username?: string;
    at_sender_id?: string;
  }>();

  // Validate provider_priority
  if (body.provider_priority) {
    const validProviders = ['kudi', 'termii', 'africastalking'];
    const providers = body.provider_priority.split(',').map(p => p.trim());
    for (const p of providers) {
      if (!validProviders.includes(p)) {
        return c.json({ error: `Invalid provider: ${p}. Valid: ${validProviders.join(', ')}` }, 400);
      }
    }
  }

  // Load existing config
  const existing = await c.env.DB.prepare(
    'SELECT * FROM workspace_sms_config WHERE workspace_id = ?'
  ).bind(workspace.id).first<any>();

  const isMasked = (val?: string) => !val || val.startsWith('****');

  const config = {
    provider_priority: body.provider_priority || existing?.provider_priority || 'kudi,termii,africastalking',
    kudi_api_key: isMasked(body.kudi_api_key) ? (existing?.kudi_api_key || null) : body.kudi_api_key,
    kudi_sender_id: body.kudi_sender_id || existing?.kudi_sender_id || 'CLiDE',
    termii_api_key: isMasked(body.termii_api_key) ? (existing?.termii_api_key || null) : body.termii_api_key,
    termii_sender_id: body.termii_sender_id || existing?.termii_sender_id || 'CLiDE',
    at_api_key: isMasked(body.at_api_key) ? (existing?.at_api_key || null) : body.at_api_key,
    at_username: body.at_username ?? existing?.at_username ?? '',
    at_sender_id: body.at_sender_id ?? existing?.at_sender_id ?? '',
  };

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE workspace_sms_config SET
        provider_priority = ?, kudi_api_key = ?, kudi_sender_id = ?,
        termii_api_key = ?, termii_sender_id = ?,
        at_api_key = ?, at_username = ?, at_sender_id = ?,
        updated_at = datetime('now')
      WHERE workspace_id = ?
    `).bind(
      config.provider_priority, config.kudi_api_key, config.kudi_sender_id,
      config.termii_api_key, config.termii_sender_id,
      config.at_api_key, config.at_username, config.at_sender_id,
      workspace.id
    ).run();
  } else {
    const id = generateId();
    await c.env.DB.prepare(`
      INSERT INTO workspace_sms_config (id, workspace_id, provider_priority, kudi_api_key, kudi_sender_id, termii_api_key, termii_sender_id, at_api_key, at_username, at_sender_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, workspace.id,
      config.provider_priority, config.kudi_api_key, config.kudi_sender_id,
      config.termii_api_key, config.termii_sender_id,
      config.at_api_key, config.at_username, config.at_sender_id
    ).run();
  }

  return c.json({ ok: true });
});

/**
 * POST /api/workspaces/:workspaceId/domain/generate
 * Create a cmaf.cc subdomain via Cloudflare DNS API and save it as custom_domain.
 */
workspaces.post('/domain/generate', requireRole('owner'), async (c) => {
  const { workspace } = c.get('workspace');
  const { subdomain } = await c.req.json<{ subdomain: string }>();

  if (!subdomain || typeof subdomain !== 'string') {
    return c.json({ error: 'Subdomain is required' }, 400);
  }

  const slug = subdomain.toLowerCase().trim();

  // Validate subdomain: only lowercase alphanumeric + hyphens, 3-32 chars, no leading/trailing hyphen
  if (!/^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/.test(slug) || slug.length < 3) {
    return c.json({ error: 'Subdomain must be 3-32 chars, alphanumeric and hyphens only, no leading/trailing hyphen' }, 400);
  }

  // Reserved subdomains
  const reserved = ['api', 'app', 'www', 'mail', 'smtp', 'ftp', 'ns1', 'ns2', 'admin', 'dashboard', 'cdn', 's'];
  if (reserved.includes(slug)) {
    return c.json({ error: 'This subdomain is reserved' }, 400);
  }

  const domain = `${slug}.cmaf.cc`;

  // Check uniqueness in our DB
  const existing = await c.env.DB.prepare(
    'SELECT id FROM workspaces WHERE custom_domain = ? AND id != ?'
  ).bind(domain, workspace.id).first();
  if (existing) {
    return c.json({ error: 'This subdomain is already in use by another workspace' }, 409);
  }

  // Ensure Cloudflare credentials are configured
  if (!c.env.CF_API_TOKEN || !c.env.CF_ZONE_ID) {
    return c.json({ error: 'Cloudflare API credentials not configured. Contact administrator.' }, 500);
  }

  // Create CNAME record via Cloudflare API
  let cfBody: { success: boolean; errors?: { code: number; message: string }[] };
  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${c.env.CF_ZONE_ID}/dns_records`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'CNAME',
          name: slug,
          content: 'clide-worker.michaelwealth.workers.dev',
          proxied: true,
          comment: `CLiDE workspace: ${workspace.name} (${workspace.id})`,
        }),
      }
    );
    cfBody = await cfRes.json() as typeof cfBody;
  } catch (err) {
    return c.json({ error: 'Failed to reach Cloudflare API. Please try again.' }, 502);
  }

  if (!cfBody.success) {
    const errMsg = cfBody.errors?.[0]?.message || 'Unknown Cloudflare error';
    // 81057 = record already exists
    if (cfBody.errors?.some((e: { code: number }) => e.code === 81057)) {
      // Record exists — might be ours from a previous attempt; just save it
    } else {
      return c.json({ error: `DNS creation failed: ${errMsg}` }, 502);
    }
  }

  // Save the domain to workspace (UNIQUE index on custom_domain handles race conditions)
  try {
    await c.env.DB.prepare(
      "UPDATE workspaces SET custom_domain = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(domain, workspace.id).run();
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'This subdomain was just claimed by another workspace' }, 409);
    }
    throw err;
  }

  return c.json({ ok: true, domain });
});

export { workspaces };
