-- CLiDE Migration: Password auth + seed data
-- Migration: 0003_password_auth_and_seed
-- Created: 2026-03-19

-- Add password_hash column to users (nullable - only used for password login)
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- ============================================================
-- SMS Config per workspace
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_sms_config (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_priority TEXT NOT NULL DEFAULT 'kudi,termii,africastalking',
  kudi_api_key TEXT,
  kudi_sender_id TEXT DEFAULT 'CLiDE',
  termii_api_key TEXT,
  termii_sender_id TEXT DEFAULT 'CLiDE',
  at_api_key TEXT,
  at_username TEXT,
  at_sender_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id)
);

-- ============================================================
-- Seed: Super admin user
-- ============================================================
-- Password: clide-demo-2024
-- SHA-256 hex: d04d41b21ed2c266f0e8c01218fef7ec6bc2748dc90d14065ca04dedc2ed12c1
INSERT OR IGNORE INTO users (id, email, name, is_super_admin, password_hash, created_at, updated_at)
VALUES (
  '01demo000000000000000000sa',
  'michael@commercium.africa',
  'Michael',
  1,
  'd04d41b21ed2c266f0e8c01218fef7ec6bc2748dc90d14065ca04dedc2ed12c1',
  datetime('now'),
  datetime('now')
);

-- Seed: Demo workspace
INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
VALUES (
  '01demo000000000000000000ws',
  'Demo Workspace',
  'demo',
  datetime('now'),
  datetime('now')
);

-- Seed: Make demo admin owner of demo workspace
INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, created_at)
VALUES (
  '01demo000000000000000000wm',
  '01demo000000000000000000ws',
  '01demo000000000000000000sa',
  'owner',
  datetime('now')
);
