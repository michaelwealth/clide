import { Hono } from 'hono';
import type { Env, KvLinkData, CampaignRow } from '../types';
import { getLinkData, getCampaignStatusCache, setCampaignStatusCache } from '../lib/kv';
import { generateId } from '../lib/id';

const redirect = new Hono<{ Bindings: Env }>();

/**
 * Validate that a URL is safe to redirect to (HTTP/HTTPS only).
 */
function isSafeRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const NOT_FOUND_HTML = '<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:2rem;margin-bottom:0.5rem">Link not found</h1><p style="color:#666">This short link does not exist or has been removed.</p></div></body></html>';

/**
 * GET /:slug
 * Standalone short link redirect (single-segment path).
 * Checks KV for a standalone short link entry first.
 */
redirect.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  // Skip API paths, health checks, and favicon
  if (slug === 'api' || slug === 'health' || slug === 'favicon.ico') {
    return c.notFound();
  }

  // Look up standalone short link from KV (key: "s:{slug}")
  const raw = await c.env.KV.get(`s:${slug}`);
  if (!raw) {
    return c.html(NOT_FOUND_HTML, 404);
  }

  const data = JSON.parse(raw) as { d: string; w: string; i: string; a?: number; e?: string | null };

  // Check active / expired status
  if (data.a === 0) return c.html(NOT_FOUND_HTML, 404);
  if (data.e && new Date(data.e) < new Date()) return c.html(NOT_FOUND_HTML, 404);

  if (!isSafeRedirectUrl(data.d)) {
    return c.html('<html><body><h1>Invalid link</h1></body></html>', 400);
  }

  // Log click and increment counter asynchronously
  c.executionCtx.waitUntil(logShortLinkClick(c.env, data.i, c.req.raw));

  return c.redirect(data.d, 302);
});

/**
 * GET /:campaignKey/:slug
 * Campaign link redirect (two-segment path).
 * Optimized for minimal latency using KV.
 */
redirect.get('/:campaignKey/:slug', async (c) => {
  const campaignKey = c.req.param('campaignKey');
  const slug = c.req.param('slug');

  // Step 1: Look up link data from KV
  const linkData = await getLinkData(c.env.KV, campaignKey, slug);

  if (!linkData) {
    return c.html(NOT_FOUND_HTML, 404);
  }

  // Step 2: Determine campaign status
  let campaignStatus = linkData.s;
  let fallbackUrl = linkData.f;

  const cachedStatus = await getCampaignStatusCache(c.env.KV, linkData.c);
  if (cachedStatus) {
    campaignStatus = cachedStatus.status;
    fallbackUrl = cachedStatus.fallback_url;
  }

  // Check time-based expiry
  if (linkData.e > 0 && Date.now() / 1000 > linkData.e) {
    campaignStatus = 'expired';
  }

  // Step 3: Redirect based on status
  const redirectUrl = campaignStatus === 'active' ? linkData.d : fallbackUrl;

  if (!isSafeRedirectUrl(redirectUrl)) {
    return c.html('<html><body><h1>Invalid link</h1></body></html>', 400);
  }

  // Step 4: Log click asynchronously
  c.executionCtx.waitUntil(logClick(c.env, linkData, campaignStatus, c.req.raw));

  return c.redirect(redirectUrl, 302);
});

/**
 * Log a standalone short link click.
 */
async function logShortLinkClick(env: Env, shortLinkId: string, rawReq: Request): Promise<void> {
  try {
    const clickId = generateId();
    await Promise.all([
      env.DB.prepare(`
        INSERT INTO short_link_clicks (id, short_link_id, ip_address, user_agent, referer, country)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        clickId, shortLinkId,
        rawReq.headers.get('CF-Connecting-IP'),
        rawReq.headers.get('User-Agent')?.slice(0, 500) || null,
        rawReq.headers.get('Referer')?.slice(0, 500) || null,
        rawReq.headers.get('CF-IPCountry') || null
      ).run(),
      env.DB.prepare(
        'UPDATE short_links SET clicks = clicks + 1 WHERE id = ?'
      ).bind(shortLinkId).run(),
    ]);
  } catch (err) {
    console.error('Short link click logging failed:', err);
  }
}

/**
 * Log a campaign click event asynchronously.
 */
async function logClick(
  env: Env,
  linkData: KvLinkData,
  campaignStatus: string,
  rawReq: Request
): Promise<void> {
  try {
    if (campaignStatus !== 'active') return;

    const clickId = generateId();

    await env.DB.prepare(`
      INSERT INTO click_logs (id, link_id, contact_id, campaign_id, ip_address, user_agent, referer, country)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      clickId, linkData.l, linkData.t, linkData.c,
      rawReq.headers.get('CF-Connecting-IP'),
      rawReq.headers.get('User-Agent')?.slice(0, 500) || null,
      rawReq.headers.get('Referer')?.slice(0, 500) || null,
      rawReq.headers.get('CF-IPCountry') || null
    ).run();

    await env.TRIGGER_QUEUE.send({
      type: 'trigger_check',
      trigger_rule_id: '',
      contact_id: linkData.t,
      campaign_id: linkData.c,
      event: 'click',
    });
  } catch (err) {
    console.error('Click logging failed:', err);
  }
}

export { redirect };
