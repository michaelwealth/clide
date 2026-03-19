import type { Env, CampaignRow } from '../types';
import { invalidateCampaignStatusCache, setCampaignStatusCache } from '../lib/kv';

/**
 * Campaign lifecycle cron job.
 * Runs every 5 minutes.
 * 
 * - Activates scheduled campaigns whose start_at has passed
 * - Pauses active campaigns whose end_at has passed
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

  // 2. Pause active campaigns past end_at
  const toPause = await env.DB.prepare(`
    SELECT * FROM campaigns
    WHERE status = 'active' AND end_at IS NOT NULL AND end_at <= ?
  `).bind(now).all<CampaignRow>();

  for (const campaign of toPause.results) {
    // Atomic: only pause if still active
    const result = await env.DB.prepare(`
      UPDATE campaigns SET status = 'paused', updated_at = datetime('now')
      WHERE id = ? AND status = 'active'
    `).bind(campaign.id).run();

    if (!result.meta.changes) continue;

    await invalidateCampaignStatusCache(env.KV, campaign.id);
    await setCampaignStatusCache(env.KV, campaign.id, 'paused', campaign.fallback_url, campaign.end_at);

    console.log(`Campaign ${campaign.id} paused (end_at reached)`);
  }
}

/**
 * Update the status field in KV cache for a campaign.
 * Uses setCampaignStatusCache for consistent 24h TTL.
 */
async function updateCampaignLinksStatus(
  env: Env,
  campaign: CampaignRow,
  newStatus: string
): Promise<void> {
  await setCampaignStatusCache(
    env.KV,
    campaign.id,
    newStatus as any,
    campaign.fallback_url,
    campaign.end_at
  );
}
