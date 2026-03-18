import { Hono } from 'hono';
import type { Env, ShortLinkRow } from '../types';
import { generateId, randomAlphanumeric } from '../lib/id';
import { requireRole } from '../middleware/tenant';

const shortLinks = new Hono<{ Bindings: Env }>();

/**
 * GET /
 * List short links for the workspace (paginated).
 */
shortLinks.get('/', async (c) => {
  const { workspace } = c.get('workspace');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const offset = (page - 1) * limit;

  const [links, countResult] = await Promise.all([
    c.env.DB.prepare(
      'SELECT * FROM short_links WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(workspace.id, limit, offset).all<ShortLinkRow>(),
    c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM short_links WHERE workspace_id = ?'
    ).bind(workspace.id).first<{ count: number }>(),
  ]);

  return c.json({
    links: links.results,
    pagination: { page, limit, total: countResult?.count ?? 0 },
  });
});

/**
 * POST /
 * Create a new short link.
 */
shortLinks.post('/', requireRole('operator'), async (c) => {
  const { workspace } = c.get('workspace');
  const user = c.get('user');

  const body = await c.req.json<{
    url: string;
    title?: string;
    slug?: string;
    expires_at?: string;
  }>();

  if (!body.url) {
    return c.json({ error: 'URL is required' }, 400);
  }

  try {
    new URL(body.url);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  // Generate or validate slug
  let slug = body.slug?.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
  if (slug) {
    // Check global uniqueness (KV keys are global, not workspace-scoped)
    const existing = await c.env.DB.prepare(
      'SELECT id, workspace_id FROM short_links WHERE slug = ?'
    ).bind(slug).first<{ id: string; workspace_id: string }>();
    if (existing) {
      return c.json({ error: 'Slug already in use' }, 409);
    }
  } else {
    // Generate unique slug with collision retry
    let retries = 0;
    do {
      slug = randomAlphanumeric(6);
      const exists = await c.env.DB.prepare('SELECT id FROM short_links WHERE slug = ?').bind(slug).first();
      if (!exists) break;
      retries++;
    } while (retries < 10);
    if (retries >= 10) return c.json({ error: 'Failed to generate unique slug' }, 500);
  }

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO short_links (id, workspace_id, slug, destination_url, title, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, workspace.id, slug, body.url,
    body.title?.trim() || null,
    body.expires_at || null,
    user.id
  ).run();

  // Store in KV for fast redirect: key = "s:{domain}/{slug}" → destination
  const domain = workspace.custom_domain || c.env.SHORT_DOMAIN.replace(/^https?:\/\//, '');
  await c.env.KV.put(
    `s:${slug}`,
    JSON.stringify({ d: body.url, w: workspace.id, i: id, a: 1, e: body.expires_at || null }),
  );

  const link = await c.env.DB.prepare(
    'SELECT * FROM short_links WHERE id = ?'
  ).bind(id).first<ShortLinkRow>();

  return c.json({ link }, 201);
});

/**
 * GET /:linkId
 * Get short link details with click analytics.
 */
shortLinks.get('/:linkId', async (c) => {
  const { workspace } = c.get('workspace');
  const linkId = c.req.param('linkId');

  const link = await c.env.DB.prepare(
    'SELECT * FROM short_links WHERE id = ? AND workspace_id = ?'
  ).bind(linkId, workspace.id).first<ShortLinkRow>();

  if (!link) {
    return c.json({ error: 'Link not found' }, 404);
  }

  // Recent clicks
  const clicks = await c.env.DB.prepare(`
    SELECT country, COUNT(*) as count FROM short_link_clicks
    WHERE short_link_id = ? GROUP BY country ORDER BY count DESC LIMIT 10
  `).bind(linkId).all();

  return c.json({ link, analytics: { by_country: clicks.results } });
});

/**
 * PUT /:linkId
 * Update a short link.
 */
shortLinks.put('/:linkId', requireRole('operator'), async (c) => {
  const { workspace } = c.get('workspace');
  const linkId = c.req.param('linkId');

  const link = await c.env.DB.prepare(
    'SELECT * FROM short_links WHERE id = ? AND workspace_id = ?'
  ).bind(linkId, workspace.id).first<ShortLinkRow>();

  if (!link) {
    return c.json({ error: 'Link not found' }, 404);
  }

  const body = await c.req.json<{
    destination_url?: string;
    title?: string;
    is_active?: boolean;
    expires_at?: string | null;
  }>();

  if (body.destination_url) {
    try { new URL(body.destination_url); } catch { return c.json({ error: 'Invalid URL' }, 400); }
  }

  await c.env.DB.prepare(`
    UPDATE short_links SET
      destination_url = COALESCE(?, destination_url),
      title = COALESCE(?, title),
      is_active = COALESCE(?, is_active),
      expires_at = COALESCE(?, expires_at),
      updated_at = datetime('now')
    WHERE id = ? AND workspace_id = ?
  `).bind(
    body.destination_url || null,
    body.title !== undefined ? (body.title || null) : null,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
    body.expires_at !== undefined ? body.expires_at : null,
    linkId, workspace.id
  ).run();

  // Update KV (sync active state and expiry)
  const newUrl = body.destination_url || link.destination_url;
  const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : link.is_active;
  const expiresAt = body.expires_at !== undefined ? body.expires_at : link.expires_at;
  await c.env.KV.put(
    `s:${link.slug}`,
    JSON.stringify({ d: newUrl, w: workspace.id, i: linkId, a: isActive, e: expiresAt }),
  );

  return c.json({ ok: true });
});

/**
 * DELETE /:linkId
 * Delete a short link.
 */
shortLinks.delete('/:linkId', requireRole('admin'), async (c) => {
  const { workspace } = c.get('workspace');
  const linkId = c.req.param('linkId');

  const link = await c.env.DB.prepare(
    'SELECT * FROM short_links WHERE id = ? AND workspace_id = ?'
  ).bind(linkId, workspace.id).first<ShortLinkRow>();

  if (!link) {
    return c.json({ error: 'Link not found' }, 404);
  }

  await c.env.KV.delete(`s:${link.slug}`);
  await c.env.DB.prepare('DELETE FROM short_links WHERE id = ? AND workspace_id = ?').bind(linkId, workspace.id).run();

  return c.json({ ok: true });
});

export { shortLinks };
