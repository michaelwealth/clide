import { Hono } from 'hono';
import type { Env, SmsLogRow } from '../types';

const webhooks = new Hono<{ Bindings: Env }>();

/**
 * Verify webhook signature using HMAC-SHA256.
 */
async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Verify a webhook via a shared secret token passed as a query parameter.
 * Used for providers that don't support HMAC signatures.
 */
function verifyWebhookToken(url: string, secret: string): boolean {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get('webhook_token');
    if (!token || !secret) return false;
    // Constant-time comparison
    if (token.length !== secret.length) return false;
    let mismatch = 0;
    for (let i = 0; i < token.length; i++) {
      mismatch |= token.charCodeAt(i) ^ secret.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

/**
 * Update SMS log status from webhook callback.
 */
async function updateSmsStatus(
  db: D1Database,
  providerMessageId: string,
  status: string,
  errorMessage?: string
) {
  const normalizedStatus = normalizeStatus(status);

  await db.prepare(`
    UPDATE sms_logs SET
      status = ?,
      error_message = COALESCE(?, error_message),
      updated_at = datetime('now')
    WHERE provider_message_id = ? AND status != 'delivered'
  `).bind(normalizedStatus, errorMessage || null, providerMessageId).run();
}

function normalizeStatus(providerStatus: string): string {
  const map: Record<string, string> = {
    // Common status mappings
    'delivered': 'delivered',
    'sent': 'sent',
    'failed': 'failed',
    'rejected': 'failed',
    'undelivered': 'failed',
    'expired': 'failed',
    'pending': 'pending',
    'queued': 'queued',
    'submitted': 'sent',
    'success': 'delivered',
  };
  return map[providerStatus.toLowerCase()] || 'sent';
}

/**
 * POST /kudi
 * Kudi SMS webhook callback.
 */
webhooks.post('/kudi', async (c) => {
  const bodyText = await c.req.text();
  const signature = c.req.header('X-Webhook-Signature') || '';

  if (!c.env.WEBHOOK_SECRET) {
    return c.json({ error: 'Webhook secret not configured' }, 500);
  }

  const valid = await verifyWebhookSignature(bodyText, signature, c.env.WEBHOOK_SECRET);
  if (!valid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const payload = JSON.parse(bodyText);
  if (payload.message_id && payload.status) {
    await updateSmsStatus(c.env.DB, payload.message_id, payload.status, payload.error);
  }

  return c.json({ ok: true });
});

/**
 * POST /termii
 * Termii SMS webhook callback.
 * Authenticated via webhook_token query parameter.
 */
webhooks.post('/termii', async (c) => {
  if (!c.env.WEBHOOK_SECRET) {
    return c.json({ error: 'Webhook secret not configured' }, 500);
  }

  if (!verifyWebhookToken(c.req.url, c.env.WEBHOOK_SECRET)) {
    return c.json({ error: 'Invalid webhook token' }, 401);
  }

  const payload = await c.req.json<{
    message_id?: string;
    status?: string;
    notify_type?: string;
  }>();

  if (payload.message_id && payload.status) {
    await updateSmsStatus(c.env.DB, payload.message_id, payload.status);
  }

  return c.json({ ok: true });
});

/**
 * POST /africastalking
 * Africa's Talking SMS webhook callback.
 * Authenticated via webhook_token query parameter.
 */
webhooks.post('/africastalking', async (c) => {
  if (!c.env.WEBHOOK_SECRET) {
    return c.json({ error: 'Webhook secret not configured' }, 500);
  }

  if (!verifyWebhookToken(c.req.url, c.env.WEBHOOK_SECRET)) {
    return c.json({ error: 'Invalid webhook token' }, 401);
  }

  const formData = await c.req.formData();
  const messageId = formData.get('id') as string;
  const status = formData.get('status') as string;
  const failureReason = formData.get('failureReason') as string;

  if (messageId && status) {
    await updateSmsStatus(c.env.DB, messageId, status, failureReason);
  }

  return c.json({ ok: true });
});

export { webhooks };
