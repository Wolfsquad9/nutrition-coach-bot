-- ============================================================================
-- Migration: client_checkin_engine
-- Purpose: Full check-in / follow-up engine for client → coach communication.
--          Provides daily check-in forms, weekly reviews, streak tracking,
--          coach alert generation, and AI-powered coaching summaries.
-- Created: 2026-06-13
-- Refs: AUDIT_AND_ROADMAP.md §2.2 C1 (data layer migration)
-- ============================================================================

-- ============================================================================
-- ENUM: alert_severity
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.alert_severity AS ENUM ('green', 'yellow', 'red');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TABLE: daily_checkins
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  checkin_date             date NOT NULL,
  meal_adherence           smallint NOT NULL
                             CHECK (meal_adherence >= 0 AND meal_adherence <= 100),
  workout_completed        boolean NOT NULL DEFAULT false,
  energy_level             smallint
                             CHECK (energy_level IS NULL OR (energy_level >= 1 AND energy_level <= 10)),
  mood                     smallint
                             CHECK (mood IS NULL OR (mood >= 1 AND mood <= 10)),
  sleep_hours              numeric(3,1)
                             CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)),
  water_intake_liters      numeric(3,1)
                             CHECK (water_intake_liters IS NULL OR (water_intake_liters >= 0 AND water_intake_liters <= 20)),
  current_weight_kg        numeric(5,2)
                             CHECK (current_weight_kg IS NULL OR (current_weight_kg > 0 AND current_weight_kg < 500)),
  notes                    text,
  created_by               uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- One check-in per (client, day) — upsert semantics
  CONSTRAINT uq_daily_checkins_client_date
    UNIQUE (client_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_client_date
  ON public.daily_checkins (client_id, checkin_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_client_week
  ON public.daily_checkins (client_id, checkin_date DESC);

COMMENT ON TABLE public.daily_checkins IS
  'Daily client check-in entries tracking adherence, energy, mood, sleep, weight, and notes. '
  'One row per client per calendar day via UNIQUE constraint.';

-- ============================================================================-- TABLE: weekly_reviews
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  week_start_date          date NOT NULL,
  bodyweight_kg            numeric(5,2)
                             CHECK (bodyweight_kg IS NULL OR (bodyweight_kg > 0 AND bodyweight_kg < 500)),
  waist_cm                 numeric(5,1)
                             CHECK (waist_cm IS NULL OR (waist_cm > 0 AND waist_cm < 200)),
  hip_cm                   numeric(5,1)
                             CHECK (hip_cm IS NULL OR (hip_cm > 0 AND hip_cm < 200)),
  chest_cm                 numeric(5,1)
                             CHECK (chest_cm IS NULL OR (chest_cm > 0 AND chest_cm < 200)),
  adherence_score          smallint
                             CHECK (adherence_score IS NULL OR (adherence_score >= 0 AND adherence_score <= 100)),
  diet_satisfaction        smallint
                             CHECK (diet_satisfaction IS NULL OR (diet_satisfaction >= 1 AND diet_satisfaction <= 10)),
  workout_consistency      smallint
                             CHECK (workout_consistency IS NULL OR (workout_consistency >= 0 AND workout_consistency <= 100)),
  challenges               text,
  wins                     text,
  goals_for_next_week      text,
  coach_notes              text,
  photo_urls               text[],
  created_by               uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- One review per (client, week) — upsert semantics
  CONSTRAINT uq_weekly_reviews_client_week
    UNIQUE (client_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_client_date
  ON public.weekly_reviews (client_id, week_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_adherence_low
  ON public.weekly_reviews (client_id, week_start_date DESC)
  WHERE adherence_score IS NOT NULL AND adherence_score < 70;

COMMENT ON TABLE public.weekly_reviews IS
  'Weekly client self-review with body measurements, adherence scores, qualitative feedback, '
  'coach notes, and optional progress photo URLs. One row per client per ISO week.';

-- ============================================================================
-- TABLE: checkin_streaks
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.checkin_streaks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  current_streak           integer NOT NULL DEFAULT 0
                             CHECK (current_streak >= 0),
  longest_streak           integer NOT NULL DEFAULT 0
                             CHECK (longest_streak >= 0),
  last_checkin_date        date,
  streak_start_date        date,
  streak_broken_date       date,
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- One streak record per client
  CONSTRAINT uq_checkin_streaks_client
    UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_checkin_streaks_client
  ON public.checkin_streaks (client_id);

COMMENT ON TABLE public.checkin_streaks IS
  'Denormalized streak tracking for daily check-in consistency. '
  'Updated by application logic or trigger on check-in insert.';

-- ============================================================================
-- TABLE: coach_alerts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_alerts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  trainer_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type               text NOT NULL
                             CHECK (alert_type IN (
                               'missed_checkin',
                               'low_adherence',
                               'weight_concern',
                               'mood_drop',
                               'streak_broken',
                               'goal_milestone',
                               'review_needed',
                               'system'
                             )),
  severity                 public.alert_severity NOT NULL DEFAULT 'yellow',
  title                    text NOT NULL,
  message                  text NOT NULL,
  metadata                 jsonb
                             CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object'),
  read                     boolean NOT NULL DEFAULT false,
  dismissed                boolean NOT NULL DEFAULT false,
  read_at                  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_alerts_trainer_unread
  ON public.coach_alerts (trainer_id, created_at DESC)
  WHERE read = false AND dismissed = false;

CREATE INDEX IF NOT EXISTS idx_coach_alerts_client
  ON public.coach_alerts (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_alerts_severity
  ON public.coach_alerts (trainer_id, severity, created_at DESC)
  WHERE dismissed = false;

COMMENT ON TABLE public.coach_alerts IS
  'Actionable alerts for coaches generated by check-in analysis. '
  'Covers missed check-ins, low adherence, weight/mood concerns, and milestones.';

-- ============================================================================
-- TABLE: ai_summaries
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_summaries (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  week_start_date          date NOT NULL,
  summary_type             text NOT NULL DEFAULT 'weekly'
                             CHECK (summary_type IN ('weekly', 'monthly', 'adhoc')),
  adherence_score          smallint
                             CHECK (adherence_score IS NULL OR (adherence_score >= 0 AND adherence_score <= 100)),
  progress_trajectory      text
                             CHECK (progress_trajectory IS NULL OR progress_trajectory IN ('improving', 'stable', 'declining', 'insufficient_data')),
  summary_text             text NOT NULL,
  highlights               jsonb
                             CHECK (highlights IS NULL OR jsonb_typeof(highlights) = 'array'),
  recommendations          jsonb
                             CHECK (recommendations IS NULL OR jsonb_typeof(recommendations) = 'array'),
  risk_flags               jsonb
                             CHECK (risk_flags IS NULL OR jsonb_typeof(risk_flags) = 'array'),
  model_version            text,
  raw_llm_response         jsonb,
  created_by               uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now(),

  -- One AI summary per (client, week, type)
  CONSTRAINT uq_ai_summaries_client_week_type
    UNIQUE (client_id, week_start_date, summary_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_client_date
  ON public.ai_summaries (client_id, week_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_client_latest
  ON public.ai_summaries (client_id, created_at DESC);

COMMENT ON TABLE public.ai_summaries IS
  'AI-generated coaching summaries with adherence trends, progress trajectory, '
  'highlights, recommendations, and risk flags. One per client per week per type.';

-- ============================================================================
-- RLS — daily_checkins
-- ============================================================================
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_checkins_select" ON public.daily_checkins;
CREATE POLICY "daily_checkins_select"
  ON public.daily_checkins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = daily_checkins.client_id
        AND c.created_by = auth.uid()
    )
    OR client_id = auth.uid()
  );

DROP POLICY IF EXISTS "daily_checkins_insert" ON public.daily_checkins;
CREATE POLICY "daily_checkins_insert"
  ON public.daily_checkins FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = daily_checkins.client_id
          AND c.created_by = auth.uid()
      )
      OR client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "daily_checkins_update" ON public.daily_checkins;
CREATE POLICY "daily_checkins_update"
  ON public.daily_checkins FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "daily_checkins_delete" ON public.daily_checkins;
CREATE POLICY "daily_checkins_delete"
  ON public.daily_checkins FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================================
-- RLS — weekly_reviews
-- ============================================================================
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_reviews_select" ON public.weekly_reviews;
CREATE POLICY "weekly_reviews_select"
  ON public.weekly_reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = weekly_reviews.client_id
        AND c.created_by = auth.uid()
    )
    OR client_id = auth.uid()
  );

DROP POLICY IF EXISTS "weekly_reviews_insert" ON public.weekly_reviews;
CREATE POLICY "weekly_reviews_insert"
  ON public.weekly_reviews FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = weekly_reviews.client_id
          AND c.created_by = auth.uid()
      )
      OR client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "weekly_reviews_update" ON public.weekly_reviews;
CREATE POLICY "weekly_reviews_update"
  ON public.weekly_reviews FOR UPDATE
  USING (created_by = auth.uid() OR auth.uid() IN (
    SELECT c.created_by FROM public.clients c WHERE c.id = weekly_reviews.client_id
  ))
  WITH CHECK (created_by = auth.uid() OR auth.uid() IN (
    SELECT c.created_by FROM public.clients c WHERE c.id = weekly_reviews.client_id
  ));

DROP POLICY IF EXISTS "weekly_reviews_delete" ON public.weekly_reviews;
CREATE POLICY "weekly_reviews_delete"
  ON public.weekly_reviews FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================================
-- RLS — checkin_streaks
-- ============================================================================
ALTER TABLE public.checkin_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkin_streaks_select" ON public.checkin_streaks;
CREATE POLICY "checkin_streaks_select"
  ON public.checkin_streaks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = checkin_streaks.client_id
        AND c.created_by = auth.uid()
    )
    OR client_id = auth.uid()
  );

-- Streaks are upserted by application logic (service-role or edge-function)
DROP POLICY IF EXISTS "checkin_streaks_insert" ON public.checkin_streaks;
CREATE POLICY "checkin_streaks_insert"
  ON public.checkin_streaks FOR INSERT
  WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "checkin_streaks_update" ON public.checkin_streaks;
CREATE POLICY "checkin_streaks_update"
  ON public.checkin_streaks FOR UPDATE
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- ============================================================================
-- RLS — coach_alerts
-- ============================================================================
ALTER TABLE public.coach_alerts ENABLE ROW LEVEL SECURITY;

-- Coaches (trainers) see alerts directed to them
DROP POLICY IF EXISTS "coach_alerts_select" ON public.coach_alerts;
CREATE POLICY "coach_alerts_select"
  ON public.coach_alerts FOR SELECT
  USING (trainer_id = auth.uid());

-- Alerts are generated by application logic (service-role or edge-function)
-- but we allow coaches to update read/dismissed state
DROP POLICY IF EXISTS "coach_alerts_update" ON public.coach_alerts;
CREATE POLICY "coach_alerts_update"
  ON public.coach_alerts FOR UPDATE
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

-- Clients can see alerts about themselves (read-only, no modification)
DROP POLICY IF EXISTS "coach_alerts_select_client" ON public.coach_alerts;
CREATE POLICY "coach_alerts_select_client"
  ON public.coach_alerts FOR SELECT
  USING (client_id = auth.uid());

-- ============================================================================
-- RLS — ai_summaries
-- ============================================================================
ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_summaries_select" ON public.ai_summaries;
CREATE POLICY "ai_summaries_select"
  ON public.ai_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = ai_summaries.client_id
        AND c.created_by = auth.uid()
    )
    OR client_id = auth.uid()
  );

-- Summaries are inserted by edge function / service role only
DROP POLICY IF EXISTS "ai_summaries_insert" ON public.ai_summaries;
CREATE POLICY "ai_summaries_insert"
  ON public.ai_summaries FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- AUTO-UPDATE updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_checkins_updated_at ON public.daily_checkins;
CREATE TRIGGER trg_daily_checkins_updated_at
  BEFORE UPDATE ON public.daily_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_weekly_reviews_updated_at ON public.weekly_reviews;
CREATE TRIGGER trg_weekly_reviews_updated_at
  BEFORE UPDATE ON public.weekly_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_checkin_streaks_updated_at ON public.checkin_streaks;
CREATE TRIGGER trg_checkin_streaks_updated_at
  BEFORE UPDATE ON public.checkin_streaks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
