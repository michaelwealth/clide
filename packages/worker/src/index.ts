import { Hono } from 'hono';
import type {
  Env,
  CsvProcessMessage,
  SmsDispatchMessage,
  TriggerExecutionMessage,
} from './types';

// Middleware
import { authMiddleware, superAdminGuard } from './middleware/auth';
import { corsMiddleware, rateLimitMiddleware } from './middleware/cors';
import { tenantMiddleware } from './middleware/tenant';

// Routes
import { auth } from './routes/auth';
import { workspaces } from './routes/workspaces';
import { campaigns } from './routes/campaigns';
import { contacts } from './routes/contacts';
import { sms } from './routes/sms';
import { triggers } from './routes/triggers';
import { analytics } from './routes/analytics';
import { admin } from './routes/admin';
import { webhooks } from './routes/webhooks';
import { redirect } from './routes/redirect';
import { shortLinks } from './routes/short-links';

// Queue handlers
import { processCsvUpload } from './queues/csv-processor';
import { processSmsDispatch } from './queues/sms-dispatcher';
import { processTriggerEvent } from './queues/trigger-executor';

// Cron handlers
import { checkCampaignLifecycle } from './cron/campaign-lifecycle';
import { scheduleTriggers, checkNoClickTriggers } from './cron/trigger-scheduler';
import { retrySmsFailures } from './cron/sms-retry';

const app = new Hono<{ Bindings: Env }>();

// ── Global Middleware ──
app.use('/api/*', corsMiddleware);

// ── Public Routes ──
app.route('/api/auth', auth);
app.route('/api/webhooks/sms', webhooks);

// ── Authenticated API Routes ──
app.use('/api/workspaces/*', authMiddleware);
app.use('/api/admin/*', authMiddleware, superAdminGuard);

// Workspace listing (no tenant context needed)
app.get('/api/workspaces', async (c) => {
  const user = c.get('user');
  let result;
  if (user.is_super_admin) {
    result = await c.env.DB.prepare(`
      SELECT w.*, 'owner' as role,
        (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as member_count,
        (SELECT COUNT(*) FROM campaigns ca WHERE ca.workspace_id = w.id) as campaign_count
      FROM workspaces w ORDER BY w.name
    `).all();
  } else {
    result = await c.env.DB.prepare(`
      SELECT w.*, wm.role,
        (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspace_id = w.id) as member_count,
        (SELECT COUNT(*) FROM campaigns ca WHERE ca.workspace_id = w.id) as campaign_count
      FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ?
      ORDER BY w.name
    `).bind(user.id).all();
  }
  return c.json({ workspaces: result.results });
});

// Create workspace (super admin)
app.post('/api/workspaces', superAdminGuard, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name: string; slug: string }>();
  if (!body.name?.trim() || !body.slug?.trim()) {
    return c.json({ error: 'Name and slug are required' }, 400);
  }
  const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (slug.length < 2 || slug.length > 50) {
    return c.json({ error: 'Slug must be 2-50 characters' }, 400);
  }
  const existing = await c.env.DB.prepare('SELECT id FROM workspaces WHERE slug = ?').bind(slug).first();
  if (existing) return c.json({ error: 'Slug already in use' }, 409);
  const { generateId } = await import('./lib/id');
  const id = generateId();
  const memberId = generateId();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO workspaces (id, name, slug) VALUES (?, ?, ?)').bind(id, body.name.trim(), slug),
    c.env.DB.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, 'owner')").bind(memberId, id, user.id),
  ]);
  return c.json({ workspace: { id, name: body.name.trim(), slug } }, 201);
});

// ── Workspace-scoped Routes ──
app.use('/api/workspaces/:workspaceId/*', tenantMiddleware);

// Workspace CRUD
app.route('/api/workspaces/:workspaceId', workspaces);

// Campaigns
app.route('/api/workspaces/:workspaceId/campaigns', campaigns);

// Short links (standalone URL shortening)
app.route('/api/workspaces/:workspaceId/links', shortLinks);

// Campaign sub-resources
app.route('/api/workspaces/:workspaceId/campaigns/:campaignId/contacts', contacts);
app.route('/api/workspaces/:workspaceId/campaigns/:campaignId/sms', sms);
app.route('/api/workspaces/:workspaceId/campaigns/:campaignId/triggers', triggers);

// Analytics (mounted directly — context must flow through Hono middleware chain)
app.route('/api/workspaces/:workspaceId/analytics', analytics);
app.route('/api/workspaces/:workspaceId/campaigns/:campaignId/analytics', analytics);

// Admin routes
app.route('/api/admin', admin);

// ── Health Check ──
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Public Redirect (must be LAST to avoid catching API routes) ──
// Rate limit: 500 requests per IP per 60 seconds
app.use('/:slug', rateLimitMiddleware(500, 60));
app.use('/:campaignKey/:slug', rateLimitMiddleware(500, 60));
app.route('/', redirect);

// ── Export ──
export default {
  fetch: app.fetch,

  // ── Queue Consumer ──
  async queue(
    batch: MessageBatch<CsvProcessMessage | SmsDispatchMessage | TriggerExecutionMessage>,
    env: Env
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        const data = message.body;

        switch (data.type) {
          case 'csv_process':
            await processCsvUpload(
              env,
              data.upload_id,
              data.campaign_id,
              data.workspace_id
            );
            break;

          case 'sms_send':
            await processSmsDispatch(
              env,
              data.sms_log_id,
              data.phone,
              data.message,
              data.idempotency_key,
              data.attempt,
              data.workspace_id
            );
            break;

          case 'trigger_check':
            await processTriggerEvent(
              env,
              data.contact_id,
              data.campaign_id,
              data.event
            );
            break;

          default:
            console.warn('Unknown queue message type:', (data as any).type);
        }

        message.ack();
      } catch (err) {
        console.error('Queue processing error:', err);
        message.retry();
      }
    }
  },

  // ── Cron Trigger ──
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    switch (event.cron) {
      case '*/5 * * * *':
        ctx.waitUntil(checkCampaignLifecycle(env).catch(err => console.error('Campaign lifecycle error:', err)));
        break;
      case '*/2 * * * *':
        ctx.waitUntil(
          Promise.all([
            scheduleTriggers(env).catch(err => console.error('Trigger scheduler error:', err)),
            checkNoClickTriggers(env).catch(err => console.error('No-click trigger error:', err)),
          ])
        );
        break;
      case '*/10 * * * *':
        ctx.waitUntil(retrySmsFailures(env).catch(err => console.error('SMS retry error:', err)));
        break;
      default:
        console.warn('Unknown cron schedule:', event.cron);
    }
  },
};
