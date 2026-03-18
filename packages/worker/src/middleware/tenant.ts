import { Context, Next } from 'hono';
import type { Env, Role, WorkspaceContext, WorkspaceMemberRow, WorkspaceRow } from '../types';
import { ROLE_HIERARCHY } from '../types';

declare module 'hono' {
  interface ContextVariableMap {
    workspace: WorkspaceContext;
  }
}

/**
 * Workspace tenant isolation middleware.
 * Validates the user has access to the workspace in the URL.
 * Populates c.get('workspace') with workspace data and membership.
 */
export async function tenantMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const workspaceId = c.req.param('workspaceId');
  if (!workspaceId) {
    return c.json({ error: 'Workspace ID required' }, 400);
  }

  const user = c.get('user');

  // Super admins can access any workspace
  if (user.is_super_admin) {
    const workspace = await c.env.DB.prepare(
      'SELECT * FROM workspaces WHERE id = ?'
    ).bind(workspaceId).first<WorkspaceRow>();

    if (!workspace) {
      return c.json({ error: 'Workspace not found' }, 404);
    }

    // Virtual owner membership for super admins
    const ctx: WorkspaceContext = {
      workspace,
      membership: {
        id: 'super_admin',
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'owner',
        created_at: workspace.created_at,
      },
    };
    c.set('workspace', ctx);
    return next();
  }

  // Regular user: check workspace membership
  const row = await c.env.DB.prepare(`
    SELECT w.*, wm.id as wm_id, wm.role, wm.created_at as wm_created_at
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE w.id = ? AND wm.user_id = ?
  `).bind(workspaceId, user.id).first<WorkspaceRow & { wm_id: string; role: Role; wm_created_at: string }>();

  if (!row) {
    return c.json({ error: 'Workspace not found or access denied' }, 404);
  }

  const ctx: WorkspaceContext = {
    workspace: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      custom_domain: row.custom_domain,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    membership: {
      id: row.wm_id,
      workspace_id: row.id,
      user_id: user.id,
      role: row.role,
      created_at: row.wm_created_at,
    },
  };
  c.set('workspace', ctx);
  await next();
}

/**
 * Role guard factory.
 * Returns middleware that checks if the user's role meets the minimum required.
 */
export function requireRole(minRole: Role) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const { membership } = c.get('workspace');
    const userLevel = ROLE_HIERARCHY[membership.role];
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userLevel < requiredLevel) {
      return c.json(
        { error: `Requires ${minRole} role or higher` },
        403
      );
    }

    await next();
  };
}
