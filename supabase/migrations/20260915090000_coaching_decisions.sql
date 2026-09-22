-- ============================================================================
-- Phase 13C — coaching_decisions
--
-- Records what a coach ACTUALLY decided after reviewing the Phase 13A/13B
-- system recommendation. This is a historical AUDIT event only:
--   * it never mutates the existing nutrition prescription,
--   * it never creates/generates/locks a new nutrition plan,
--   * it stores the system recommendation as a SNAPSHOT so a future reader can
--     always distinguish "what the system recommended" from "what the coach
--     decided" without re-deriving anything from current client state.
--
-- Invariants (enforced here and unit-tested in Phase 13C):
--   * recommendation_status is one of the Phase 13A review statuses.
--   * coach_action is one of: accepted / modified / maintained / deferred.
--   * accepted|modified are only valid for an adjustment_recommended status.
--   * a final_target_calories is required exactly when the action accepted or
--     modified it; maintained/deferred never store a target.
--   * one decision per (client, decision_date) — explicit, not accidental.
--   * only the owning coach (or an admin) may create/read a decision.
--
-- The actual plan-generation/activation workflow stays a SEPARATE existing
-- step; persisting a decision never shortcuts that lifecycle.
-- ============================================================================

CREATE TABLE public.coaching_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- The coach who made the decision (== auth.uid() at creation time).
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_date date NOT NULL DEFAULT CURRENT_DATE,
  recommendation_status text NOT NULL,
  coach_action text NOT NULL,
  -- Which plan version / prescription the decision was based on, when one
  -- exists (a decision may also be based on the canonical initial profile when
  -- no locked prescription exists yet). Read-only provenance.
  baseline_prescription_version_id uuid REFERENCES public.plan_versions(id) ON DELETE SET NULL,
  -- ---- System recommendation SNAPSHOT (recorded verbatim, never recomputed) --
  observed_weekly_rate_kg numeric,
  target_weekly_rate_kg numeric,
  adherence_score numeric,
  recommended_calorie_adjustment numeric,
  recommended_target_calories numeric,
  -- --------------------------------------------------------------------------
  -- The coach's chosen end target when applicable (accepted/modified only).
  -- Stored SEPARATELY from the recommendation above.
  final_target_calories numeric,
  coach_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coaching_decisions_recommendation_status_check
    CHECK (recommendation_status IN (
      'maintain','adjustment_recommended','review_required','insufficient_data'
    )),
  CONSTRAINT coaching_decisions_coach_action_check
    CHECK (coach_action IN ('accepted','modified','maintained','deferred')),
  -- accepted/modified may only be applied to an adjustment_recommended status;
  -- maintained/deferred are always legal (they never imply an adjustment).
  CONSTRAINT coaching_decisions_action_status_check
    CHECK (
      coach_action IN ('maintained','deferred')
      OR (recommendation_status = 'adjustment_recommended'
          AND coach_action IN ('accepted','modified'))
    ),
  -- final_target_calories is required exactly when the action chose one.
  CONSTRAINT coaching_decisions_final_target_required_check
    CHECK ((final_target_calories IS NOT NULL) = (coach_action IN ('accepted','modified'))),
  -- Light positivity guard only; the domain layer applies the CANONICAL engine
  -- feasibility check (reconcileTarget) before persisting a modified target.
  CONSTRAINT coaching_decisions_final_target_positive_check
    CHECK (final_target_calories IS NULL OR final_target_calories > 0)
);

ALTER TABLE public.coaching_decisions ENABLE ROW LEVEL SECURITY;

-- One decision per client per day: explicit single-decision-per-day model, so a
-- repeated submission is an explicit error rather than an accidental duplicate.
CREATE UNIQUE INDEX coaching_decisions_client_date_idx
  ON public.coaching_decisions(client_id, decision_date);
CREATE INDEX coaching_decisions_client_created_idx
  ON public.coaching_decisions(client_id, created_at DESC);

-- ============================================================================
-- SELECT — the owning coach (and the linked client, read-only, and admins) can
-- read decisions. Mirrors the session_logs / coach_messages authorization.
-- ============================================================================
CREATE POLICY "coach_reads_decisions_for_owned_clients"
  ON public.coaching_decisions FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.clients
      WHERE created_by = auth.uid()
         OR user_profile_id = auth.uid()
         OR user_profile_id IN (
           SELECT id FROM public.profiles WHERE trainer_id = auth.uid()
         )
    )
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- No UPDATE / DELETE policies: coaching decisions are immutable audit events.
-- No direct INSERT policy: creation goes through the authorized RPC below.

-- ============================================================================
-- Atomic, authorized insert. SECURITY DEFINER so the function can read
-- `clients` for ownership authorization while RLS stays restrictive for the
-- caller. Never touches nutrition_plans / plan_versions / diets: it only ever
-- writes a coaching_decisions row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_coaching_decision(
  p_client_id UUID,
  p_recommendation_status TEXT,
  p_coach_action TEXT,
  p_baseline_prescription_version_id UUID,
  p_observed_weekly_rate_kg NUMERIC,
  p_target_weekly_rate_kg NUMERIC,
  p_adherence_score NUMERIC,
  p_recommended_calorie_adjustment NUMERIC,
  p_recommended_target_calories NUMERIC,
  p_final_target_calories NUMERIC,
  p_coach_note TEXT,
  p_decision_date DATE
)
RETURNS TABLE(success BOOLEAN, coaching_decision_id UUID, coach_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_date date := COALESCE(p_decision_date, CURRENT_DATE);
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::uuid, NULL::uuid, 'Not authenticated';
    RETURN;
  END IF;

  IF p_client_id IS NULL OR p_recommendation_status IS NULL OR p_coach_action IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::uuid, NULL::uuid,
      'client_id, recommendation_status, and coach_action are required';
    RETURN;
  END IF;

  -- Authorize: the caller must be the client's owning coach, or an admin.
  -- (Never allow cross-coach recording, and never via client self-service.)
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.archived_at IS NULL
      AND (c.created_by = v_user_id OR public.has_role_v2(v_user_id, 'admin'))
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::uuid, NULL::uuid, 'Not authorized to record a decision for this client';
    RETURN;
  END IF;

  -- Explicit single-decision-per-day model: reject a second decision today.
  SELECT id INTO v_id
  FROM public.coaching_decisions
  WHERE client_id = p_client_id AND decision_date = v_date;
  IF FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::uuid, NULL::uuid,
      'A decision for this client is already recorded for ' || to_char(v_date, 'YYYY-MM-DD');
    RETURN;
  END IF;

  INSERT INTO public.coaching_decisions (
    client_id,
    coach_id,
    decision_date,
    recommendation_status,
    coach_action,
    baseline_prescription_version_id,
    observed_weekly_rate_kg,
    target_weekly_rate_kg,
    adherence_score,
    recommended_calorie_adjustment,
    recommended_target_calories,
    final_target_calories,
    coach_note
  ) VALUES (
    p_client_id,
    v_user_id,
    v_date,
    p_recommendation_status,
    p_coach_action,
    p_baseline_prescription_version_id,
    p_observed_weekly_rate_kg,
    p_target_weekly_rate_kg,
    p_adherence_score,
    p_recommended_calorie_adjustment,
    p_recommended_target_calories,
    p_final_target_calories,
    NULLIF(trim(COALESCE(p_coach_note, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT TRUE, v_id, v_user_id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.record_coaching_decision(
  UUID, TEXT, TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coaching_decision(
  UUID, TEXT, TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE
) TO authenticated;