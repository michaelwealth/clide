-- CLiDE Migration: Custom domains + standalone short links
-- Migration: 0004_domains_and_short_links
-- Created: 2026-03-18

-- ============================================================
-- Add custom_domain to workspaces for per-brand short domains
-- e.g. s.cmaf.cc, afsa.cmaf.cc
-- ============================================================
ALTER TABLE workspaces ADD COLUMN custom_domain TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_domain ON workspaces(custom_domain);

-- ============================================================
-- Standalone short links (not tied to campaigns)
-- ============================================================
CREATE TABLE IF NOT EXISTS short_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  title TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_short_links_workspace ON short_links(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_short_links_slug_global ON short_links(slug);

-- ============================================================
-- Short link click logs
-- ============================================================
CREATE TABLE IF NOT EXISTS short_link_clicks (
  id TEXT PRIMARY KEY,
  short_link_id TEXT NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  clicked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_slc_link ON short_link_clicks(short_link_id);

-- ============================================================
-- Update seed workspace with custom_domain
-- ============================================================
UPDATE workspaces SET custom_domain = 's.cmaf.cc' WHERE id = '01demo000000000000000000ws';
