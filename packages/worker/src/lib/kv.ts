import type { KvLinkData, KvSessionData, CampaignStatus } from '../types';

const LINK_PREFIX = 'r:';
const SESSION_PREFIX = 'sess:';
const CAMPAIGN_STATUS_PREFIX = 'cs:';

// ── Link Resolution KV ──

export function linkKey(campaignKey: string, slug: string): string {
  return `${LINK_PREFIX}${campaignKey}/${slug}`;
}

export async function setLinkData(
  kv: KVNamespace,
  campaignKey: string,
  slug: string,
  data: KvLinkData
): Promise<void> {
  await kv.put(linkKey(campaignKey, slug), JSON.stringify(data));
}

export async function getLinkData(
  kv: KVNamespace,
  campaignKey: string,
  slug: string
): Promise<KvLinkData | null> {
  const raw = await kv.get(linkKey(campaignKey, slug));
  if (!raw) return null;
  return JSON.parse(raw) as KvLinkData;
}

export async function deleteLinkData(
  kv: KVNamespace,
  campaignKey: string,
  slug: string
): Promise<void> {
  await kv.delete(linkKey(campaignKey, slug));
}

// ── Campaign Status Cache ──

export async function setCampaignStatusCache(
  kv: KVNamespace,
  campaignId: string,
  status: CampaignStatus,
  fallbackUrl: string,
  endAt: string | null
): Promise<void> {
  await kv.put(
    `${CAMPAIGN_STATUS_PREFIX}${campaignId}`,
    JSON.stringify({ status, fallback_url: fallbackUrl, end_at: endAt }),
    { expirationTtl: 86400 } // 24h — invalidated explicitly on status transitions
  );
}

export async function getCampaignStatusCache(
  kv: KVNamespace,
  campaignId: string
): Promise<{ status: CampaignStatus; fallback_url: string; end_at: string | null } | null> {
  const raw = await kv.get(`${CAMPAIGN_STATUS_PREFIX}${campaignId}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function invalidateCampaignStatusCache(
  kv: KVNamespace,
  campaignId: string
): Promise<void> {
  await kv.delete(`${CAMPAIGN_STATUS_PREFIX}${campaignId}`);
}

// ── Sessions ──

export async function setSession(
  kv: KVNamespace,
  token: string,
  data: KvSessionData
): Promise<void> {
  await kv.put(`${SESSION_PREFIX}${token}`, JSON.stringify(data), {
    expirationTtl: 1800, // 30 minutes
  });
}

export async function getSession(
  kv: KVNamespace,
  token: string
): Promise<KvSessionData | null> {
  const raw = await kv.get(`${SESSION_PREFIX}${token}`);
  if (!raw) return null;
  return JSON.parse(raw) as KvSessionData;
}

export async function refreshSession(
  kv: KVNamespace,
  token: string,
  data: KvSessionData
): Promise<void> {
  // Only re-write with fresh TTL if last refresh was more than 20 minutes ago
  // (session TTL is 30 min, so refresh in the last 10 minutes of the window)
  const now = Math.floor(Date.now() / 1000);
  const lastRefresh = data.refreshed_at ?? 0;
  if (now - lastRefresh < 1200) return; // 20 min = 1200s; skip if recently refreshed

  await setSession(kv, token, { ...data, refreshed_at: now });
}

export async function deleteSession(
  kv: KVNamespace,
  token: string
): Promise<void> {
  await kv.delete(`${SESSION_PREFIX}${token}`);
}
