-- CLiDE Database Schema
-- Migration: 0001_initial
-- Created: 2026-03-18

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- Workspaces (Tenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);

-- ============================================================
-- Workspace Members (Role assignments)
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_user ON workspace_members(user_id);

-- ============================================================
-- Campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  campaign_key TEXT NOT NULL,
  base_url TEXT NOT NULL,
  fallback_url TEXT NOT NULL,
  sms_template TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'expired')),
  start_at TEXT,
  end_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, campaign_key)
);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace ON campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_key ON campaigns(campaign_key);

-- ============================================================
-- Contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  firstname TEXT NOT NULL,
  phone TEXT NOT NULL,
  extra_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(campaign_id, phone);

-- ============================================================
-- Links
-- ============================================================
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_links_campaign ON links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_links_contact ON links(contact_id);
CREATE INDEX IF NOT EXISTS idx_links_slug ON links(campaign_id, slug);

-- ============================================================
-- Click Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS click_logs (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  clicked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clicks_link ON click_logs(link_id);
CREATE INDEX IF NOT EXISTS idx_clicks_contact ON click_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_clicks_campaign ON click_logs(campaign_id);

-- ============================================================
-- SMS Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_logs (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT,
  provider_message_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'campaign' CHECK (message_type IN ('campaign', 'trigger')),
  message TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'failed')),
  error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sms_contact ON sms_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaign ON sms_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_workspace ON sms_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_idempotency ON sms_logs(idempotency_key);

-- ============================================================
-- Trigger Rules
-- ============================================================
CREATE TABLE IF NOT EXISTS trigger_rules (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('click', 'no_click')),
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  message_template TEXT NOT NULL,
  max_executions INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_triggers_campaign ON trigger_rules(campaign_id);

-- ============================================================
-- Trigger Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS trigger_logs (
  id TEXT PRIMARY KEY,
  trigger_rule_id TEXT NOT NULL REFERENCES trigger_rules(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  execution_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'fired', 'skipped', 'failed')),
  scheduled_at TEXT,
  fired_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(trigger_rule_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_tl_trigger ON trigger_logs(trigger_rule_id);
CREATE INDEX IF NOT EXISTS idx_tl_contact ON trigger_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_tl_status ON trigger_logs(status);
CREATE INDEX IF NOT EXISTS idx_tl_scheduled ON trigger_logs(scheduled_at);

-- ============================================================
-- CSV Uploads
-- ============================================================
CREATE TABLE IF NOT EXISTS csv_uploads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  row_count INTEGER,
  processed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  field_mapping TEXT,
  error_message TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_csv_campaign ON csv_uploads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_csv_status ON csv_uploads(status);
