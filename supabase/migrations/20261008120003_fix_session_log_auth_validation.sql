-- ============================================================================
-- Fix session-log authorization, validation, and progression ordering.
--
-- Problem:
--   save_session_log() authorized INSERT via a broad ownership union
--   (created_by = coach, user_profile_id = client, profiles.trainer_id =
--   coach, admin). That treated the coach as a legitimate writer, which the
--   product contract forbids: the CLIENT is the only actor that logs their
--   own daily session execution. Coaches/admins keep read/review through the
--   SELECT policy. The broad union also meant the "authorization" was not
--   actually keyed to the authenticated client's own record.
--
-- Fix:
--   * INSERT is authorized ONLY for the linked client (clients.user_profile_id
--     = auth.uid()) on their own, non-archived client record.
--   * An empty / non-array execution payload can never be logged.
--   * A completed session requires every exercise to carry a valid load (>= 0)
--     and a valid RPE (1-10).
--   * Ordering guard: the only session that may be logged is the NEXT
--     not-yet-logged session in the current active plan (mirrors
--     selectClientProgress). Future/unearned sessions and repeated completions
--     are rejected. When the plan carries a startDate, the target session must
--     also be scheduled on or before today.
--   * A unique index prevents duplicate completed logs at the database level.

-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_session_log(
  p_client_id UUID,
  p_plan_id UUID,
  p_session_id TEXT,
  p_session_name TEXT,
  p_week_number INTEGER,
  p_session_index INTEGER,
  p_completed BOOLEAN,
  p_failed_to_complete BOOLEAN,
  p_notes TEXT,
  p_execution_data JSONB,
  p_logged_at TIMESTAMPTZ
)
RETURNS TABLE(success BOOLEAN, session_log_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_log_id      UUID;
  v_pd          JSONB;
  v_ordered     TEXT[] := ARRAY[]::TEXT[];
  v_done        TEXT[] := ARRAY[]::TEXT[];
  v_target      TEXT;
  v_loop        INTEGER;
  v_row         JSONB;
  v_load_value  JSONB;
  v_load        NUMERIC;
  v_rpe         NUMERIC;
  v_start_date  TEXT;
  v_wk_txt      TEXT;
  v_s_txt       TEXT;
  v_scheduled   DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  IF p_client_id IS NULL OR p_session_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'client_id and session_id are required'::TEXT;
    RETURN;
  END IF;

  -- Authorize: ONLY the linked client may log their own session execution.
  -- Coaches/trainers/admins must NOT log on behalf of the client (they retain
  -- read/review capability via the session_logs SELECT policy).
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = p_client_id
      AND c.archived_at IS NULL
      AND c.user_profile_id = v_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Not authorized to log a session for this client'::TEXT;
    RETURN;
  END IF;

  -- Empty sessions are never loggable.
  IF p_execution_data IS NULL
     OR jsonb_typeof(p_execution_data) <> 'array'
     OR jsonb_array_length(p_execution_data) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot log a session with no exercise execution'::TEXT;
    RETURN;
  END IF;

  -- A completed session requires every exercise to carry valid execution data.
  IF COALESCE(p_completed, true) THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_execution_data) LOOP
      v_load_value := v_row->'load';
      IF v_load_value IS NULL OR v_load_value = 'null'::jsonb THEN
        v_load := NULL;
      ELSE
        v_load := (v_row->>'load')::NUMERIC;
      END IF;
      v_rpe := NULLIF(v_row->>'rpe', '')::NUMERIC;

      IF v_load IS NULL OR v_load < 0 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Every completed exercise must have a valid load'::TEXT;
        RETURN;
      END IF;
      IF v_rpe IS NULL OR v_rpe < 1 OR v_rpe > 10 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Every completed exercise must have a valid RPE between 1 and 10'::TEXT;
        RETURN;
      END IF;
    END LOOP;
  END IF;

  -- Progression/ordering guard: the only loggable session is the NEXT
  -- not-yet-logged session in the current active plan (no skipping ahead).
  IF p_plan_id IS NOT NULL THEN
    SELECT plan_data INTO v_pd
    FROM public.training_plans
    WHERE id = p_plan_id
      AND client_id = p_client_id
      AND status = 'active';

    IF v_pd IS NULL OR v_pd->'weeks' IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Plan not found for session log'::TEXT;
      RETURN;
    END IF;

    -- Prescription order = plan.weeks flattened by (week, dayNumber).
    SELECT COALESCE(
             array_agg((t.s->>'id') ORDER BY t.w_ord, t.s_ord),
             ARRAY[]::TEXT[]
           )
    INTO v_ordered
    FROM (
      SELECT w.ord AS w_ord, s.ord AS s_ord, s.value AS s
      FROM jsonb_array_elements(v_pd->'weeks') WITH ORDINALITY AS w(value, ord)
      CROSS JOIN LATERAL jsonb_array_elements(w.value->'sessions') WITH ORDINALITY AS s(value, ord)
    ) t;

    -- Sessions already logged for this plan.
    SELECT COALESCE(array_agg(DISTINCT session_id), ARRAY[]::TEXT[])
    INTO v_done
    FROM public.session_logs
    WHERE plan_id = p_plan_id AND client_id = p_client_id;

    v_target := NULL;
    FOR v_loop IN 1 .. cardinality(v_ordered) LOOP
      IF NOT (v_ordered[v_loop] = ANY(v_done)) THEN
        v_target := v_ordered[v_loop];
        EXIT;
      END IF;
    END LOOP;

    IF v_target IS NULL OR v_target IS DISTINCT FROM p_session_id THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'This session is not the next available session'::TEXT;
      RETURN;
    END IF;

    -- Calendar gate (mirrors selectClientProgress Option B): the next session
    -- must be scheduled on or before today when the plan has a startDate.
    IF v_pd->>'startDate' IS NOT NULL THEN
      v_start_date := v_pd->>'startDate';
      SELECT w.value->>'weekNumber', s.value->>'dayNumber'
      INTO v_wk_txt, v_s_txt
      FROM jsonb_array_elements(v_pd->'weeks') AS w(value)
      CROSS JOIN LATERAL jsonb_array_elements(w.value->'sessions') AS s(value)
      WHERE s.value->>'id' = v_target
      LIMIT 1;

      IF v_wk_txt IS NOT NULL AND v_s_txt IS NOT NULL THEN
        v_scheduled := (v_start_date::DATE)
          + (((v_wk_txt::INTEGER - 1) * 7 + (v_s_txt::INTEGER - 1)) * INTERVAL '1 day');
        IF v_scheduled > CURRENT_DATE THEN
          RETURN QUERY SELECT FALSE, NULL::UUID, 'This session is not scheduled yet'::TEXT;
          RETURN;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.session_logs (
    client_id,
    plan_id,
    session_id,
    session_name,
    week_number,
    session_index,
    completed,
    failed_to_complete,
    notes,
    execution_data,
    created_by,
    logged_at
  ) VALUES (
    p_client_id,
    p_plan_id,
    p_session_id,
    p_session_name,
    COALESCE(p_week_number, 1),
    COALESCE(p_session_index, 1),
    COALESCE(p_completed, true),
    COALESCE(p_failed_to_complete, false),
    p_notes,
    COALESCE(p_execution_data, '[]'::jsonb),
    v_user_id,
    COALESCE(p_logged_at, now())
  )
  RETURNING id INTO v_log_id;

  RETURN QUERY SELECT TRUE, v_log_id, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.save_session_log(UUID, UUID, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, BOOLEAN, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_session_log(UUID, UUID, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, BOOLEAN, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;

-- ============================================================================
-- Deduplicate redundant session_logs BEFORE creating the unique index.
--
-- Historical seed/test data (logged before the per-session guard was enforced)
-- contains accidental duplicate (client_id, plan_id, session_id) rows for two
-- session groups. Per group we keep exactly ONE canonical row and delete only
-- the redundant copies:
--   * prefer completed sessions,
--   * prefer the payload with the MOST completed exercises (most complete /
--     valid),
--   * then the latest logged_at (most recent legitimate record),
--   * then created_at, then id as a deterministic tie-break.
-- Rows that are the sole instance of a group are never touched (rn = 1). This
-- is idempotent and safe to re-run: it only removes rows whose group has a
-- canonical survivor.
-- ============================================================================
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, plan_id, session_id
      ORDER BY
        completed DESC,
        (
          SELECT count(*)
          FROM jsonb_array_elements(COALESCE(execution_data, '[]'::jsonb)) e
          WHERE (e->>'completed')::boolean
        ) DESC,
        logged_at DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.session_logs
)
DELETE FROM public.session_logs sl
USING ranked r
WHERE sl.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS session_logs_unique_session_per_client_plan
  ON public.session_logs(client_id, plan_id, session_id);