-- ============================================================================
-- Migration: notifications + notification_settings
-- Purpose: replace localStorage-based notification system in NotificationCenter.tsx
--          with a real, multi-device, RLS-protected Supabase backend.
-- Created: 2026-06-10
-- Refs: AUDIT_AND_ROADMAP.md §2.2 C1 (data layer migration)
-- ============================================================================

-- ============================================================================
-- TABLE: notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('workout', 'meal', 'progress', 'achievement', 'system')),
  title       text NOT NULL,
  message     text NOT NULL,
  icon        text NOT NULL DEFAULT 'Bell'
              CHECK (icon IN ('Dumbbell', 'Utensils', 'Trophy', 'Calendar', 'Bell')),
  read        boolean NOT NULL DEFAULT false,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_client_unread
  ON public.notifications (client_id, created_at DESC)
  WHERE read = false;

COMMENT ON TABLE public.notifications IS
  'In-app notifications per client. Browser push delivery is wired separately.';

-- ============================================================================
-- TABLE: notification_settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_settings (
  client_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope             text NOT NULL DEFAULT 'in_app'
                     CHECK (scope IN ('in_app', 'email', 'push')),
  workout_reminders boolean NOT NULL DEFAULT true,
  meal_reminders     boolean NOT NULL DEFAULT true,
  progress_updates   boolean NOT NULL DEFAULT true,
  achievements       boolean NOT NULL DEFAULT true,
  reminder_time      time NOT NULL DEFAULT '09:00',
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, scope)
);

COMMENT ON TABLE public.notification_settings IS
  'Per-client notification preferences. Composite PK allows multiple channels (in_app/email/push).';

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Clients can read their own notifications
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = client_id);

-- Clients can update read-state on their own notifications
-- (insert is service-role / edge-function only)
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- Clients can read + write their own settings
DROP POLICY IF EXISTS "notification_settings_own" ON public.notification_settings;
CREATE POLICY "notification_settings_own"
  ON public.notification_settings FOR ALL
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- ============================================================================
-- AUTO-UPDATE updated_at
-- ============================================================================
-- Ensure the helper function exists (idempotent — safe to re-run).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
