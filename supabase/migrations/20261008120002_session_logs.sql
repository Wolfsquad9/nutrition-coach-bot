-- ============================================================================
-- Independent session-log persistence (session_logs)
--
-- Execution data is persisted SEPARATELY from the training-plan prescription.
-- The training plan (training_plans.plan_data) is the immutable prescription
-- (sets/reps/targets) produced at generation time and is NEVER rewritten when a
-- user logs a session. Instead a session log row records what actually
-- happened during a workout:
--   * a reference to the client + training plan + workout session
--   * per-exercise execution: load, RPE, completed/failed, notes
--   * a read-only snapshot of the prescribed sets/reps (for display context)
--
-- Invariants:
--   * logging a session never mutates training_plans.plan_data
--   * exactly the same authorization model (and RLS shape) as
--     save_training_plan() so whatever can generate a plan can log sessions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.session_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id            uuid REFERENCES public.training_plans(id) ON DELETE SET NULL,
  session_id         text NOT NULL,
  session_name       text,
  week_number        integer NOT NULL,
  session_index      integer NOT NULL,
  completed          boolean NOT NULL DEFAULT true,
  failed_to_complete boolean NOT NULL DEFAULT false,
  notes              text,
  execution_data     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by         uuid NOT NULL,
  logged_at          timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_logs_client_logged_at_idx
  ON public.session_logs(client_id, logged_at DESC);

ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Atomic, authorized session-log insert. SECURITY DEFINER so the function can
-- read clients for authorization while RLS stays restrictive for the caller.
-- Mirrors the save_training_plan() authorization exactly.
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
  v_user_id UUID := auth.uid();
  v_log_id  UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  IF p_client_id IS NULL OR p_session_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'client_id and session_id are required'::TEXT;
    RETURN;
  END IF;

  -- Authorize: caller must own the client, be the linked client, be the
  -- client's designated trainer, or be an admin (same rule as save_training_plan).
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients c
    LEFT JOIN public.profiles client_profile ON client_profile.id = c.user_profile_id
    WHERE c.id = p_client_id
      AND c.archived_at IS NULL
      AND (
        c.created_by = v_user_id
        OR c.user_profile_id = v_user_id
        OR client_profile.trainer_id = v_user_id
        OR public.has_role_v2(v_user_id, 'admin')
      )
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Not authorized to log a session for this client'::TEXT;
    RETURN;
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
-- SELECT RLS mirrors the training_plans SELECT policy so fetchSessionLogs()
-- can read logs for the same set of clients that can generate plans.
-- ============================================================================
CREATE POLICY "Trainers can view session logs for clients they manage"
  ON public.session_logs FOR SELECT
  USING (
    client_id IN (
      SELECT id
      FROM public.clients
      WHERE created_by = auth.uid()
        OR user_profile_id = auth.uid()
        OR user_profile_id IN (
          SELECT id
          FROM public.profiles
          WHERE trainer_id = auth.uid()
        )
    )
    OR public.has_role_v2(auth.uid(), 'admin')
  );
