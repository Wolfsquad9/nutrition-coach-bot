-- Migration: add_follow_up_enabled_to_clients
-- Purpose: Add follow_up_enabled toggle to clients table for follow-up sequence orchestration.
-- Created: 2026-06-14

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clients.follow_up_enabled IS
  'When false, follow-up sequence orchestration (WhatsApp + in-app reminders) is disabled for this client.';