import { Hono } from 'hono';
import type { Env } from '../types';

const healthRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/health
 * Detailed dependency health check (authenticated).
 * Returns individual status for DB, KV, and worker runtime.
 */
healthRouter.get('/', async (c) => {
  const checks: Record<string, { ok: boolean; latencyMs: number; detail?: string }> = {};

  // ── D1 Database ──
  const d1Start = Date.now();
  try {
    await c.env.DB.prepare('SELECT 1 AS ping').first();
    checks.database = { ok: true, latencyMs: Date.now() - d1Start };
  } catch (e: any) {
    checks.database = { ok: false, latencyMs: Date.now() - d1Start, detail: e.message };
  }

  // ── KV Store ──
  const kvStart = Date.now();
  try {
    await c.env.KV.get('_health_');
    checks.kv = { ok: true, latencyMs: Date.now() - kvStart };
  } catch (e: any) {
    checks.kv = { ok: false, latencyMs: Date.now() - kvStart, detail: e.message };
  }

  // ── Worker Runtime (always ok if we reached here) ──
  checks.worker = {
    ok: true,
    latencyMs: 0,
    detail: c.env.ENVIRONMENT || 'production',
  };

  const allOk = Object.values(checks).every((r) => r.ok);

  return c.json(
    {
      status: allOk ? 'operational' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    allOk ? 200 : 503,
  );
});

export { healthRouter };
