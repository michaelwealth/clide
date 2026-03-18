import { Hono } from 'hono';
import type { Env, UserRow } from '../types';
import { generateId } from '../lib/id';

const admin = new Hono<{ Bindings: Env }>();

/** Only this email may hold is_super_admin = true. */
const SUPER_ADMIN_EMAIL = 'michael@commercium.africa';

/**
 * GET /users
 * List all platform users.
 */
admin.get('/users', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const offset = (page - 1) * limit;

  const result = await c.env.DB.prepare(`
    SELECT u.*, GROUP_CONCAT(wm.workspace_id || ':' || wm.role) as memberships
    FROM users u
    LEFT JOIN workspace_members wm ON wm.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

  const users = result.results.map((u: any) => ({
    ...u,
    memberships: u.memberships
      ? u.memberships.split(',').map((m: string) => {
          const [workspace_id, role] = m.split(':');
          return { workspace_id, role };
        })
      : [],
  }));

  const total = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();

  return c.json({
    users,
    pagination: {
      page,
      limit,
      total: total?.count ?? 0,
      pages: Math.ceil((total?.count ?? 0) / limit),
    },
  });
});

/**
 * POST /users/invite
 * Invite a new user by email.
 */
admin.post('/users/invite', async (c) => {
  const body = await c.req.json<{
    email: string;
    name: string;
    is_super_admin?: boolean;
  }>();

  if (!body.email?.trim() || !body.name?.trim()) {
    return c.json({ error: 'Email and name are required' }, 400);
  }

  const email = body.email.trim().toLowerCase();

  // Validate email domain
  const domain = email.split('@')[1];
  if (c.env.ALLOWED_DOMAIN && domain !== c.env.ALLOWED_DOMAIN) {
    return c.json({ error: `Email must be @${c.env.ALLOWED_DOMAIN}` }, 400);
  }

  // Check if already exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();

  if (existing) {
    return c.json({ error: 'User already exists' }, 409);
  }

  const id = generateId();
  const isSuperAdmin = body.is_super_admin && email === SUPER_ADMIN_EMAIL;
  await c.env.DB.prepare(`
    INSERT INTO users (id, email, name, is_super_admin) VALUES (?, ?, ?, ?)
  `).bind(id, email, body.name.trim(), isSuperAdmin ? 1 : 0).run();

  return c.json({
    user: { id, email, name: body.name.trim(), is_super_admin: isSuperAdmin },
  }, 201);
});

/**
 * PUT /users/:userId
 * Update a user.
 */
admin.put('/users/:userId', async (c) => {
  const userId = c.req.param('userId');
  const body = await c.req.json<{
    name?: string;
    is_super_admin?: boolean;
  }>();

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first<UserRow>();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Restrict super_admin to authorized email only
  const wantsSuperAdmin = body.is_super_admin !== undefined ? body.is_super_admin : undefined;
  let superAdminValue: number | null = null;
  if (wantsSuperAdmin !== undefined) {
    superAdminValue = (wantsSuperAdmin && user.email === SUPER_ADMIN_EMAIL) ? 1 : 0;
  }

  await c.env.DB.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      is_super_admin = COALESCE(?, is_super_admin),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.name?.trim() || null,
    superAdminValue,
    userId
  ).run();

  return c.json({ ok: true });
});

/**
 * DELETE /users/:userId
 * Soft-delete not implemented; we remove the user record.
 * This cascades to workspace_members.
 */
admin.delete('/users/:userId', async (c) => {
  const userId = c.req.param('userId');
  const callerUser = c.get('user');

  if (userId === callerUser.id) {
    return c.json({ error: 'Cannot delete yourself' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM workspace_members WHERE user_id = ?').bind(userId),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);

  return c.json({ ok: true });
});

export { admin };
