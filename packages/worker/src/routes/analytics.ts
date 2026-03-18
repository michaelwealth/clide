import { Hono, Context } from 'hono';
import type { Env } from '../types';

const analytics = new Hono<{ Bindings: Env }>();

type AppContext = Context<{ Bindings: Env }>;

/**
 * GET /
 * Analytics endpoint.
 * When mounted at /analytics → workspace-level overview.
 * When mounted at /campaigns/:campaignId/analytics → campaign-level detail.
 */
analytics.get('/', async (c) => {
  const { workspace } = c.get('workspace');
  const campaignId = c.req.param('campaignId');

  if (campaignId) {
    return campaignAnalytics(c, workspace.id, campaignId);
  }
  return workspaceAnalytics(c, workspace.id);
});

async function workspaceAnalytics(c: AppContext, wid: string) {
  const [campaignStats, contactTotal, smsStats, clickTotal] = await Promise.all([
    c.env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM campaigns WHERE workspace_id = ? GROUP BY status
    `).bind(wid).all<{ status: string; count: number }>(),
    c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM contacts WHERE workspace_id = ?'
    ).bind(wid).first<{ count: number }>(),
    c.env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM sms_logs WHERE workspace_id = ? GROUP BY status
    `).bind(wid).all<{ status: string; count: number }>(),
    c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM click_logs cl
      JOIN campaigns camp ON camp.id = cl.campaign_id
      WHERE camp.workspace_id = ?
    `).bind(wid).first<{ count: number }>(),
  ]);

  return c.json({
    campaigns: campaignStats.results,
    total_contacts: contactTotal?.count ?? 0,
    sms: smsStats.results,
    total_clicks: clickTotal?.count ?? 0,
  });
}

async function campaignAnalytics(c: AppContext, workspaceId: string, campaignId: string) {
  const campaign = await c.env.DB.prepare(
    'SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?'
  ).bind(campaignId, workspaceId).first();

  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const [
    contactCount,
    linkCount,
    smsStats,
    totalClicks,
    uniqueClickers,
    clickTimeline,
    triggerStats,
  ] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM contacts WHERE campaign_id = ?')
      .bind(campaignId).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM links WHERE campaign_id = ?')
      .bind(campaignId).first<{ count: number }>(),
    c.env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM sms_logs WHERE campaign_id = ? GROUP BY status
    `).bind(campaignId).all<{ status: string; count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM click_logs WHERE campaign_id = ?')
      .bind(campaignId).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(DISTINCT contact_id) as count FROM click_logs WHERE campaign_id = ?')
      .bind(campaignId).first<{ count: number }>(),
    c.env.DB.prepare(`
      SELECT DATE(clicked_at) as date, COUNT(*) as clicks
      FROM click_logs WHERE campaign_id = ?
      GROUP BY DATE(clicked_at) ORDER BY date DESC LIMIT 30
    `).bind(campaignId).all<{ date: string; clicks: number }>(),
    c.env.DB.prepare(`
      SELECT tl.status, COUNT(*) as count
      FROM trigger_logs tl WHERE tl.campaign_id = ?
      GROUP BY tl.status
    `).bind(campaignId).all<{ status: string; count: number }>(),
  ]);

  return c.json({
    contacts: contactCount?.count ?? 0,
    links: linkCount?.count ?? 0,
    sms: smsStats.results,
    clicks: {
      total: totalClicks?.count ?? 0,
      unique: uniqueClickers?.count ?? 0,
      timeline: clickTimeline.results,
    },
    triggers: triggerStats.results,
  });
}

export { analytics };
