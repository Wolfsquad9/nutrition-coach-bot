-- Replay-faithful reconstruction of the core nutrition plan versioning tables
-- that existed historically before later migrations altered them.
--
-- This migration intentionally creates only the base table/constraint/index layer
-- needed for subsequent migrations to replay in chronological order. Later lock
-- snapshot/idempotency columns, constraints, comments, RLS policies, grants,
-- functions, and triggers remain owned by their later migrations.

CREATE TABLE IF NOT EXISTS public.plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  created_by UUID,
  plan_payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  note TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Keep the historical pointer column available before later lock RPC migrations.
ALTER TABLE public.nutrition_plans
ADD COLUMN IF NOT EXISTS current_version_id UUID;

CREATE TABLE IF NOT EXISTS public.plan_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id UUID NOT NULL,
  client_id UUID NOT NULL,
  meal_type TEXT NOT NULL,
  original_ingredient TEXT NOT NULL,
  replacement_ingredient TEXT NOT NULL,
  macro_delta JSONB NOT NULL,
  within_tolerance BOOLEAN NOT NULL DEFAULT true,
  requires_recipe_regeneration BOOLEAN NOT NULL DEFAULT false,
  suggested_by TEXT NOT NULL,
  approved_by UUID,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT plan_overrides_plan_version_fk
    FOREIGN KEY (plan_version_id) REFERENCES public.plan_versions(id) ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_overrides_plan_version_fk'
      AND conrelid = 'public.plan_overrides'::regclass
  ) THEN
    ALTER TABLE public.plan_overrides
    ADD CONSTRAINT plan_overrides_plan_version_fk
    FOREIGN KEY (plan_version_id)
    REFERENCES public.plan_versions(id)
    ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.client_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  plan_version_id UUID NOT NULL,
  snapshot_type TEXT NOT NULL,
  metrics JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.macro_tolerance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL UNIQUE,
  calories_pct_max NUMERIC NOT NULL,
  protein_pct_max NUMERIC NOT NULL,
  carbs_pct_max NUMERIC NOT NULL,
  fats_pct_max NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'macro_tolerance_rules_scope_key'
      AND conrelid = 'public.macro_tolerance_rules'::regclass
  ) THEN
    ALTER TABLE public.macro_tolerance_rules
    ADD CONSTRAINT macro_tolerance_rules_scope_key
    UNIQUE (scope);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_plan_versions_plan_id
ON public.plan_versions(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_versions_created_by
ON public.plan_versions(created_by);

CREATE INDEX IF NOT EXISTS idx_plan_overrides_plan_version_id
ON public.plan_overrides(plan_version_id);

CREATE INDEX IF NOT EXISTS idx_plan_overrides_client_id
ON public.plan_overrides(client_id);

CREATE INDEX IF NOT EXISTS idx_client_progress_snapshots_client_id
ON public.client_progress_snapshots(client_id);

CREATE INDEX IF NOT EXISTS idx_client_progress_snapshots_plan_version_id
ON public.client_progress_snapshots(plan_version_id);
