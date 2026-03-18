import type { Env, CampaignRow } from '../types';
import { invalidateCampaignStatusCache, setLinkData, getLinkData } from '../lib/kv';

/**
 * Campaign lifecycle cron job.
 * Runs every 5 minutes.
 * 
 * - Activates scheduled campaigns whose start_at has passed
 * - Expires active campaigns whose end_at has passed
 */
export async function checkCampaignLifecycle(env: Env): Promise<void> {
  const now = new Date().toISOString();

  // 1. Activate scheduled campaigns
  const toActivate = await env.DB.prepare(`
    SELECT * FROM campaigns
    WHERE status = 'scheduled' AND start_at <= ? AND (end_at IS NULL OR end_at > ?)
  `).bind(now, now).all<CampaignRow>();

  for (const campaign of toActivate.results) {
    // Atomic: only activate if still scheduled (prevents race with user transitions)
    const result = await env.DB.prepare(`
      UPDATE campaigns SET status = 'active', updated_at = datetime('now')
      WHERE id = ? AND status = 'scheduled'
    `).bind(campaign.id).run();

    if (!result.meta.changes) continue;

    await invalidateCampaignStatusCache(env.KV, campaign.id);

    // Update KV link entries for this campaign
    await updateCampaignLinksStatus(env, campaign, 'active');

    console.log(`Campaign ${campaign.id} activated`);
  }

  // 2. Expire active/paused campaigns past end_at
  const toExpire = await env.DB.prepare(`
    SELECT * FROM campaigns
    WHERE status IN ('active', 'paused') AND end_at IS NOT NULL AND end_at <= ?
  `).bind(now).all<CampaignRow>();

  for (const campaign of toExpire.results) {
    // Atomic: only expire if still active/paused
    const result = await env.DB.prepare(`
      UPDATE campaigns SET status = 'expired', updated_at = datetime('now')
      WHERE id = ? AND status IN ('active', 'paused')
    `).bind(campaign.id).run();

    if (!result.meta.changes) continue;

    await invalidateCampaignStatusCache(env.KV, campaign.id);

    console.log(`Campaign ${campaign.id} expired`);
  }
}

/**
 * Update the status field in KV entries for all links in a campaign.
 * Used when campaign transitions to active.
 */
async function updateCampaignLinksStatus(
  env: Env,
  campaign: CampaignRow,
  newStatus: string
): Promise<void> {
  const links = await env.DB.prepare(`
    SELECT l.slug FROM links l WHERE l.campaign_id = ?
  `).bind(campaign.id).all<{ slug: string }>();

  // Batch update KV entries - update campaign status cache instead
  // This is more efficient than updating every individual KV entry
  await env.KV.put(
    `cs:${campaign.id}`,
    JSON.stringify({
      status: newStatus,
      fallback_url: campaign.fallback_url,
      end_at: campaign.end_at,
    }),
    { expirationTtl: 300 }
  );
}
