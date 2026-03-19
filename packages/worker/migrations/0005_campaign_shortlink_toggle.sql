-- Migration: 0005_campaign_shortlink_toggle
-- Add manual toggle to disable campaign shortlink generation.

ALTER TABLE campaigns
ADD COLUMN disable_shortlink_generation INTEGER NOT NULL DEFAULT 0;
