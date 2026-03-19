import { Hono } from 'hono';
import type { Env, KvLinkData } from '../types';
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

function renderErrorPage(title: string, subtitle: string, code: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        --bg: #f7f8fb;
        --ink: #111827;
        --muted: #6b7280;
        --card: #ffffff;
        --brand: #4263eb;
        --warn: #ef4444;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 10% 20%, rgba(66, 99, 235, 0.12), transparent 35%),
          radial-gradient(circle at 85% 25%, rgba(16, 185, 129, 0.10), transparent 40%),
          radial-gradient(circle at 55% 85%, rgba(239, 68, 68, 0.10), transparent 45%),
          var(--bg);
        overflow: hidden;
      }
      .orb {
        position: absolute;
        width: 220px;
        height: 220px;
        border-radius: 999px;
        filter: blur(42px);
        opacity: .45;
        animation: drift 7s ease-in-out infinite;
      }
      .orb.one { background: #4263eb; top: 8%; left: 12%; }
      .orb.two { background: #10b981; top: 58%; right: 12%; animation-delay: 1.4s; }
      .orb.three { background: #f59e0b; bottom: 6%; left: 42%; animation-delay: .7s; }
      .card {
        position: relative;
        z-index: 2;
        width: min(94vw, 560px);
        background: var(--card);
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        box-shadow: 0 24px 55px rgba(17, 24, 39, 0.10);
        padding: 28px;
        animation: rise .45s ease-out;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: .04em;
        color: #374151;
        text-transform: uppercase;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--warn);
        box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.14);
        animation: pulse 1.7s infinite;
      }
      h1 {
        margin: 14px 0 8px;
        font-size: clamp(1.4rem, 1.1rem + 1.3vw, 2rem);
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: var(--muted);
        font-size: 15px;
      }
      .meta {
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px dashed #e5e7eb;
        color: #9ca3af;
        font-size: 12px;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.12); opacity: .72; }
      }
      @keyframes drift {
        0%, 100% { transform: translateY(0px) translateX(0px); }
        50% { transform: translateY(-16px) translateX(8px); }
      }
      @keyframes rise {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
  </head>
  <body>
    <div class="orb one"></div>
    <div class="orb two"></div>
    <div class="orb three"></div>
    <article class="card">
      <div class="badge"><span class="dot"></span>Error ${code}</div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
      <div class="meta">CLiDE redirect service</div>
    </article>
  </body>
</html>`;
}

const NOT_FOUND_HTML = renderErrorPage(
  'This link is not available',
  'The short URL does not exist, was removed, or has already been reused.',
  '404'
);
const INVALID_LINK_HTML = renderErrorPage(
  'Link target is invalid',
  'This redirect target is missing or unsafe, so the request was blocked.',
  '400'
);

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
    return c.html(INVALID_LINK_HTML, 400);
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

  if (!redirectUrl || !isSafeRedirectUrl(redirectUrl)) {
    return c.html(NOT_FOUND_HTML, 404);
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
