import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * CORS middleware for API routes.
 * Allows the frontend origin and handles preflight requests.
 */
export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin') || '';
  const allowedOrigin = c.env.FRONTEND_URL;

  // Set CORS headers
  c.header('Access-Control-Allow-Origin', allowedOrigin);
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.header('Access-Control-Max-Age', '86400');

  // Handle preflight — use c.body() so Hono includes the CORS headers set above
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
}

/**
 * Rate limiting middleware using simple KV-based sliding window.
 * Returns the middleware function directly (not a factory).
 */
export function rateLimitMiddleware(
  limit: number,
  windowSeconds: number
) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const key = `rl:${ip}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    const current = await c.env.KV.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limit) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    await c.env.KV.put(key, String(count + 1), {
      expirationTtl: windowSeconds,
    });

    await next();
  };
}
