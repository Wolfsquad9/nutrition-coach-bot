
-- Add locked_snapshot_json column to plan_versions for persisted immutable snapshots
ALTER TABLE public.plan_versions
ADD COLUMN locked_snapshot_json JSONB NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.plan_versions.locked_snapshot_json IS 'Write-once immutable PlanSnapshot JSON, set at lock time. Canonical source for all print/export/share operations.';
