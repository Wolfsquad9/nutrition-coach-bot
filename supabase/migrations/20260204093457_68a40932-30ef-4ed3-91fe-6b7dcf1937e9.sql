-- =====================================================
-- FIX LINTER WARNINGS: View security and function search_path
-- =====================================================

-- FIX 1: Convert SECURITY DEFINER view to SECURITY INVOKER
-- The clients_trainer_view should use invoker security to respect RLS
DROP VIEW IF EXISTS public.clients_trainer_view;

CREATE VIEW public.clients_trainer_view 
WITH (security_invoker = true) AS
SELECT 
  id,
  first_name,
  last_name,
  birth_date,
  gender,
  weight,
  height,
  activity_level,
  primary_goal,
  training_experience,
  training_frequency,
  diet_type,
  dietary_restrictions,
  disliked_foods,
  created_by,
  user_profile_id,
  created_at,
  updated_at
FROM public.clients;

-- Grant access to the view
GRANT SELECT ON public.clients_trainer_view TO authenticated;

-- FIX 2: Set search_path on functions that are missing it
-- is_plan_locked function
CREATE OR REPLACE FUNCTION public.is_plan_locked(plan_version_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT created_at > now() - interval '7 days'
  FROM public.plan_versions
  WHERE id = plan_version_uuid;
$function$;

-- update_updated_at_column function  
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- is_macro_delta_within_tolerance function
CREATE OR REPLACE FUNCTION public.is_macro_delta_within_tolerance(target_macros jsonb, delta_macros jsonb, scope text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $function$
DECLARE
  cal_tol numeric;
  p_tol numeric;
  c_tol numeric;
  f_tol numeric;
BEGIN
  IF scope = 'meal' THEN
    cal_tol := 0.10;
    p_tol := 0.10;
    c_tol := 0.15;
    f_tol := 0.15;
  ELSE
    cal_tol := 0.05;
    p_tol := 0.05;
    c_tol := 0.07;
    f_tol := 0.07;
  END IF;

  RETURN
    abs((delta_macros->>'calories')::numeric) <= (target_macros->>'calories')::numeric * cal_tol
    AND abs((delta_macros->>'protein')::numeric) <= (target_macros->>'protein')::numeric * p_tol
    AND abs((delta_macros->>'carbs')::numeric) <= (target_macros->>'carbs')::numeric * c_tol
    AND abs((delta_macros->>'fat')::numeric) <= (target_macros->>'fat')::numeric * f_tol;
END;
$function$;

-- get_next_plan_version_number function
CREATE OR REPLACE FUNCTION public.get_next_plan_version_number(p_plan_id uuid)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $function$
  SELECT COALESCE(MAX(version_number), 0) + 1
  FROM public.plan_versions
  WHERE plan_id = p_plan_id;
$function$;