import { Hono } from 'hono';
import type { Env, UserRow, KvSessionData } from '../types';
import { setSession, deleteSession } from '../lib/kv';
import { generateId } from '../lib/id';

const auth = new Hono<{ Bindings: Env }>();

/**
 * GET /api/auth/login
 * Redirect to Google OAuth consent screen.
 */
auth.get('/login', async (c) => {
  const state = generateId();
  // Store state in KV for CSRF validation (10 minute TTL)
  await c.env.KV.put(`oauth:state:${state}`, '1', { expirationTtl: 600 });

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${c.env.SHORT_DOMAIN}/api/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    hd: c.env.ALLOWED_DOMAIN,
    prompt: 'select_account',
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

/**
 * GET /api/auth/callback
 * Handle Google OAuth callback.
 */
auth.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code) {
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=no_code`);
  }

  // CSRF: validate OAuth state parameter
  if (!state) {
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=missing_state`);
  }
  const storedState = await c.env.KV.get(`oauth:state:${state}`);
  if (!storedState) {
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=invalid_state`);
  }
  // Delete state to prevent replay
  await c.env.KV.delete(`oauth:state:${state}`);

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${c.env.SHORT_DOMAIN}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json<{ access_token: string }>();

  // Fetch user info
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=userinfo_failed`);
  }

  const googleUser = await userInfoRes.json<{
    email: string;
    name: string;
    picture: string;
    hd?: string;
  }>();

  // Validate domain restriction
  if (googleUser.hd !== c.env.ALLOWED_DOMAIN && c.env.ALLOWED_DOMAIN) {
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=domain_restricted`);
  }

  // Upsert user in D1
  let user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(googleUser.email).first<UserRow>();

  if (!user) {
    // New users must be pre-invited; reject unknown accounts
    return c.redirect(`${c.env.FRONTEND_URL}/login?error=not_invited`);
  }

  // Update user info from Google
  await c.env.DB.prepare(`
    UPDATE users SET name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(googleUser.name, googleUser.picture, user.id).run();

  // Create session
  const sessionToken = generateId();
  const sessionData: KvSessionData = {
    user_id: user.id,
    email: user.email,
    name: googleUser.name,
    avatar_url: googleUser.picture,
    is_super_admin: user.is_super_admin === 1,
  };

  await setSession(c.env.KV, sessionToken, sessionData);

  // Set secure cookie and redirect to frontend
  const isProduction = c.env.ENVIRONMENT === 'production';
  const cookieFlags = [
    `clide_session=${sessionToken}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=1800`,
    ...(isProduction ? ['Secure'] : []),
  ].join('; ');

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${c.env.FRONTEND_URL}/w`,
      'Set-Cookie': cookieFlags,
    },
  });
});

/**
 * POST /api/auth/logout
 */
auth.post('/logout', async (c) => {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/clide_session=([a-zA-Z0-9_-]+)/);

  if (match) {
    await deleteSession(c.env.KV, match[1]);
  }

  const isProduction = c.env.ENVIRONMENT === 'production';
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `clide_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`,
    },
  });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user info.
 */
auth.get('/me', async (c) => {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/clide_session=([a-zA-Z0-9_-]+)/);

  if (!match) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const { getSession } = await import('../lib/kv');
  const session = await getSession(c.env.KV, match[1]);
  if (!session) {
    return c.json({ error: 'Session expired' }, 401);
  }

  // Get user's workspaces
  const workspaces = await c.env.DB.prepare(`
    SELECT w.*, wm.role
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY w.name
  `).bind(session.user_id).all();

  return c.json({
    user: {
      id: session.user_id,
      email: session.email,
      name: session.name,
      avatar_url: session.avatar_url,
      is_super_admin: session.is_super_admin,
    },
    workspaces: workspaces.results,
  });
});

/**
 * POST /api/auth/password-login
 * Password-based login for super admin (dev/emergency access).
 * Only enabled when DEMO_PASSWORD_ENABLED env var is set.
 */
auth.post('/password-login', async (c) => {
  if (c.env.DEMO_PASSWORD_ENABLED !== 'true') {
    return c.json({ error: 'Password login is disabled' }, 403);
  }

  const body = await c.req.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  // Rate limit: max 5 attempts per email per 5 minutes
  const rateLimitKey = `rl:pwd:${body.email}`;
  const attempts = parseInt(await c.env.KV.get(rateLimitKey) || '0', 10);
  if (attempts >= 5) {
    return c.json({ error: 'Too many login attempts. Try again later.' }, 429);
  }
  await c.env.KV.put(rateLimitKey, String(attempts + 1), { expirationTtl: 300 });

  // Find user by email
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(body.email).first<UserRow & { password_hash?: string }>();

  if (!user || !user.password_hash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Constant-time password comparison using SHA-256
  // bcrypt is not available in Workers, so password_hash stores a hex SHA-256 digest.
  // The route is gated by DEMO_PASSWORD_ENABLED and intended for dev/demo only.
  const encoder = new TextEncoder();
  const inputHash = await crypto.subtle.digest('SHA-256', encoder.encode(body.password));
  const inputHashHex = Array.from(new Uint8Array(inputHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison of input hash vs stored hash
  const storedHash = user.password_hash;
  if (inputHashHex.length !== storedHash.length) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  let mismatch = 0;
  for (let i = 0; i < inputHashHex.length; i++) {
    mismatch |= inputHashHex.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Create session
  const sessionToken = generateId();
  const sessionData: KvSessionData = {
    user_id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    is_super_admin: user.is_super_admin === 1,
  };

  await setSession(c.env.KV, sessionToken, sessionData);

  const isProduction = c.env.ENVIRONMENT === 'production';
  const cookieFlags = [
    `clide_session=${sessionToken}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=1800`,
    ...(isProduction ? ['Secure'] : []),
  ].join('; ');

  // Get user's workspaces
  const workspaces = await c.env.DB.prepare(`
    SELECT w.*, wm.role
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY w.name
  `).bind(user.id).all();

  return new Response(
    JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        is_super_admin: user.is_super_admin === 1,
      },
      workspaces: workspaces.results,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieFlags,
      },
    }
  );
});

export { auth };
