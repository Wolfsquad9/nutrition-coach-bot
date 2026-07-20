-- Backfill: handle_new_user was fixed directly on production after
-- 20260530120000_p0_ownership_bootstrap_client_linking.sql was deployed.
-- The original migration defaulted new users to 'coach'::app_role with
-- metadata-derived role logic; the live fix hardcodes 'trainer'::app_role
-- (the correct self-serve signup role) and removes the unused DECLARE/v_role
-- pattern.  This migration codifies the already-applied production fix
-- into history for consistency.  It is safe to run because the function
-- already exists with this exact body on the live database.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, role, email, full_name)
  VALUES (NEW.id, 'trainer'::app_role, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'trainer'::app_role)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

