// ── Cloudflare Bindings ──
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  CSV_QUEUE: Queue;
  SMS_QUEUE: Queue;
  TRIGGER_QUEUE: Queue;

  // Vars
  ENVIRONMENT: string;
  SHORT_DOMAIN: string;
  FRONTEND_URL: string;
  ALLOWED_DOMAIN: string;
  SUPER_ADMIN_EMAIL: string;

  // Secrets
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  WEBHOOK_SECRET: string;

  // Legacy global SMS keys (fallback only — prefer workspace_sms_config)
  KUDI_API_KEY?: string;
  TERMII_API_KEY?: string;
  AT_API_KEY?: string;
  AT_USERNAME?: string;

  // Dev/demo only
  DEMO_PASSWORD_ENABLED?: string;
}

// ── Roles ──
export type Role = 'owner' | 'admin' | 'operator' | 'viewer';

export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  operator: 2,
  viewer: 1,
};

// ── Campaign Status ──
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';

export const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['scheduled'],
  scheduled: ['active', 'draft'],
  active: ['paused', 'expired'],
  paused: ['active', 'expired'],
  expired: [],
};

// ── SMS Status ──
export type SmsStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'failed';

// ── Trigger Types ──
export type TriggerType = 'click' | 'no_click';
export type TriggerLogStatus = 'pending' | 'scheduled' | 'fired' | 'skipped' | 'failed';

// ── DB Row Types ──
export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_super_admin: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

export interface CampaignRow {
  id: string;
  workspace_id: string;
  name: string;
  campaign_key: string;
  base_url: string;
  fallback_url: string;
  sms_template: string | null;
  status: CampaignStatus;
  start_at: string | null;
  end_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContactRow {
  id: string;
  campaign_id: string;
  workspace_id: string;
  firstname: string;
  phone: string;
  extra_data: string | null;
  created_at: string;
}

export interface LinkRow {
  id: string;
  campaign_id: string;
  contact_id: string;
  slug: string;
  destination_url: string;
  created_at: string;
}

export interface ClickLogRow {
  id: string;
  link_id: string;
  contact_id: string;
  campaign_id: string;
  ip_address: string | null;
  user_agent: string | null;
  referer: string | null;
  country: string | null;
  clicked_at: string;
}

export interface SmsLogRow {
  id: string;
  contact_id: string;
  campaign_id: string;
  workspace_id: string;
  provider: string | null;
  provider_message_id: string | null;
  message_type: 'campaign' | 'trigger';
  message: string;
  phone: string;
  status: SmsStatus;
  error_message: string | null;
  idempotency_key: string;
  attempt_count: number;
  max_attempts: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TriggerRuleRow {
  id: string;
  campaign_id: string;
  type: TriggerType;
  delay_minutes: number;
  message_template: string;
  max_executions: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface TriggerLogRow {
  id: string;
  trigger_rule_id: string;
  contact_id: string;
  campaign_id: string;
  execution_count: number;
  status: TriggerLogStatus;
  scheduled_at: string | null;
  fired_at: string | null;
  created_at: string;
}

export interface CsvUploadRow {
  id: string;
  campaign_id: string;
  workspace_id: string;
  r2_key: string;
  filename: string;
  row_count: number | null;
  processed_count: number;
  failed_count: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  field_mapping: string | null;
  error_message: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

// ── Standalone Short Links ──
export interface ShortLinkRow {
  id: string;
  workspace_id: string;
  slug: string;
  destination_url: string;
  title: string | null;
  clicks: number;
  is_active: number;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── KV Value Types ──
export interface KvLinkData {
  d: string;  // destination_url
  f: string;  // fallback_url
  c: string;  // campaign_id
  t: string;  // contact_id
  l: string;  // link_id
  e: number;  // expiry timestamp (0 = no expiry)
  s: CampaignStatus; // campaign status
}

export interface KvSessionData {
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_super_admin: boolean;
  /** Epoch seconds when session was last refreshed (used to avoid redundant KV writes) */
  refreshed_at?: number;
}

// ── Queue Message Types ──
export interface CsvProcessMessage {
  type: 'csv_process';
  upload_id: string;
  campaign_id: string;
  workspace_id: string;
}

export interface SmsDispatchMessage {
  type: 'sms_send';
  sms_log_id: string;
  contact_id: string;
  phone: string;
  message: string;
  idempotency_key: string;
  attempt: number;
  workspace_id: string;
}

export interface TriggerExecutionMessage {
  type: 'trigger_check';
  trigger_rule_id: string;
  contact_id: string;
  campaign_id: string;
  event: 'click' | 'no_click';
}

// ── Auth Context ──
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_super_admin: boolean;
  sessionToken: string;
}

export interface WorkspaceContext {
  workspace: WorkspaceRow;
  membership: WorkspaceMemberRow;
}
