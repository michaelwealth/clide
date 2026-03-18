import { Context, Next } from 'hono';
import type { Env, AuthUser } from '../types';
import { getSession, refreshSession } from '../lib/kv';

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/**
 * Authentication middleware.
 * Validates session cookie and populates c.get('user').
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/clide_session=([a-zA-Z0-9_-]+)/);
  
  if (!match) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  
  const token = match[1];
  const session = await getSession(c.env.KV, token);
  
  if (!session) {
    return c.json({ error: 'Session expired' }, 401);
  }
  
  // Refresh session TTL on each request
  await refreshSession(c.env.KV, token, session);
  
  const user: AuthUser = {
    id: session.user_id,
    email: session.email,
    name: session.name,
    avatar_url: session.avatar_url,
    is_super_admin: session.is_super_admin,
    sessionToken: token,
  };
  
  c.set('user', user);
  await next();
}

/**
 * Super admin guard middleware.
 */
export async function superAdminGuard(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get('user');
  if (!user.is_super_admin) {
    return c.json({ error: 'Super admin access required' }, 403);
  }
  await next();
}
