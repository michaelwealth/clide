-- CLiDE Database Schema Update
-- Migration: 0002_add_composite_indexes
-- Purpose: Add composite indexes for cron job queries and retry performance

-- SMS retry cron: filters by (status, attempt_count, updated_at)
CREATE INDEX IF NOT EXISTS idx_sms_retry ON sms_logs(status, attempt_count, updated_at);

-- Trigger scheduler cron: filters by (status, scheduled_at)
CREATE INDEX IF NOT EXISTS idx_tl_status_scheduled ON trigger_logs(status, scheduled_at);

-- Campaign lifecycle cron: filters by (status, start_at) and (status, end_at)
CREATE INDEX IF NOT EXISTS idx_campaigns_lifecycle ON campaigns(status, start_at, end_at);

-- Click logs: timeline queries group by campaign + date
CREATE INDEX IF NOT EXISTS idx_clicks_campaign_date ON click_logs(campaign_id, clicked_at);

-- SMS logs: provider message ID lookup for webhooks
CREATE INDEX IF NOT EXISTS idx_sms_provider_msg ON sms_logs(provider_message_id);
