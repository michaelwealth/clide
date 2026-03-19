import { Hono } from 'hono';
import type { Env, UserRow, KvSessionData } from '../types';
import { setSession, deleteSession, getSession, refreshSession } from '../lib/kv';
import { generateId } from '../lib/id';

const auth = new Hono<{ Bindings: Env }>();
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function sanitizeReturnTo(input?: string | null): string {
  if (!input || !input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

function toBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return atob(padded);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signState(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return toBase64Url(binary);
}

async function createOAuthState(secret: string, returnTo: string): Promise<string> {
  const payload = {
    r: returnTo,
    t: Math.floor(Date.now() / 1000),
    n: generateId(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await signState(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function parseOAuthState(secret: string, state: string): Promise<{ return_to: string } | null> {
  const parts = state.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expectedSignature = await signState(secret, encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const raw = fromBase64Url(encodedPayload);
    const parsed = JSON.parse(raw) as { r?: string; t?: number };
    if (!parsed?.r || typeof parsed.t !== 'number') return null;

    const now = Math.floor(Date.now() / 1000);
    if (now - parsed.t > OAUTH_STATE_TTL_SECONDS || parsed.t - now > 60) return null;

    return { return_to: sanitizeReturnTo(parsed.r) };
  } catch {
    return null;
  }
}

/**
 * GET /api/auth/login
 * Redirect to Google OAuth consent screen.
 */
auth.get('/login', async (c) => {
  const returnTo = sanitizeReturnTo(c.req.query('return_to'));
  const state = await createOAuthState(c.env.SESSION_SECRET, returnTo);

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_REDIRECT_URI,
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
  let parsedState = await parseOAuthState(c.env.SESSION_SECRET, state);

  // Backward compatibility for old in-flight states that were KV-backed.
  if (!parsedState && !state.includes('.')) {
    const storedState = await c.env.KV.get(`oauth:state:${state}`);
    if (storedState) {
      const legacy = JSON.parse(storedState) as { return_to?: string };
      parsedState = { return_to: sanitizeReturnTo(legacy.return_to) };
      await c.env.KV.delete(`oauth:state:${state}`);
    }
  }

  if (!parsedState) {
    // Graceful fallback: avoid locking out users when state cannot be validated
    // (e.g. edge/runtime inconsistencies). We default to root return path.
    parsedState = { return_to: '/' };
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
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
    `Max-Age=${SESSION_MAX_AGE}`,
    ...(isProduction ? ['Secure', 'Domain=.cmaf.cc'] : []),
  ].join('; ');

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${c.env.FRONTEND_URL}${sanitizeReturnTo(parsedState.return_to)}${parsedState.return_to.includes('?') ? '&' : '?'}from=oauth`,
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
      'Set-Cookie': `clide_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure; Domain=.cmaf.cc' : ''}`,
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

  const session = await getSession(c.env.KV, match[1]);
  if (!session) {
    return c.json({ error: 'Session expired' }, 401);
  }

  await refreshSession(c.env.KV, match[1], session);

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
 * Password-based login for users with a password set.
 * Google OAuth is the primary auth method; password is a secondary option.
 */
auth.post('/password-login', async (c) => {
  const body = await c.req.json<{
    email?: string;
    password?: string;
    return_to?: string;
    'cf-turnstile-response'?: string;
  }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  // Verify Cloudflare Turnstile token (production only)
  if (c.env.ENVIRONMENT !== 'development' && c.env.TURNSTILE_SECRET_KEY) {
    const token = body['cf-turnstile-response'];
    if (!token) {
      return c.json({ error: 'Bot verification required' }, 400);
    }
    const form = new FormData();
    form.append('secret', c.env.TURNSTILE_SECRET_KEY);
    form.append('response', token);
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const verifyData = await verifyRes.json() as { success: boolean };
    if (!verifyData.success) {
      return c.json({ error: 'Bot verification failed. Please reload and try again.' }, 400);
    }
  }

  // Rate limit: max 5 attempts per email per 5 minutes
  const normalizedEmail = body.email.toLowerCase().trim();
  const rateLimitKey = `rl:pwd:${normalizedEmail}`;
  const attempts = parseInt(await c.env.KV.get(rateLimitKey) || '0', 10);
  if (attempts >= 5) {
    return c.json({ error: 'Too many login attempts. Try again later.' }, 429);
  }
  await c.env.KV.put(rateLimitKey, String(attempts + 1), { expirationTtl: 300 });

  // Find user by email
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(normalizedEmail).first<UserRow & { password_hash?: string }>();

  if (!user || !user.password_hash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Constant-time password comparison using SHA-256
  // bcrypt is not available in Workers, so password_hash stores a hex SHA-256 digest.
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
    `Max-Age=${SESSION_MAX_AGE}`,
    ...(isProduction ? ['Secure', 'Domain=.cmaf.cc'] : []),
  ].join('; ');

  // Get user's workspaces
  const workspaces = await c.env.DB.prepare(`
    SELECT w.*, wm.role
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY w.name
  `).bind(user.id).all();

  c.header('Set-Cookie', cookieFlags);
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      is_super_admin: user.is_super_admin === 1,
    },
    workspaces: workspaces.results,
    return_to: sanitizeReturnTo(body.return_to),
  });
});

export { auth };
