-- =====================================================
-- SECURITY FIX: Address 3 Critical RLS Vulnerabilities
-- 1. Prevent role escalation by moving roles to protected table
-- 2. Restrict trainer UPDATE policies to owned plans
-- 3. Tighten client PII access with restricted view
-- =====================================================

-- =====================================================
-- FIX 1: ROLE ESCALATION - Move roles to separate protected table
-- =====================================================

-- 1a. Create the user_roles table (as per security best practices)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    role public.app_role NOT NULL DEFAULT 'client',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 1b. Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 1c. Migrate existing roles from profiles to user_roles
INSERT INTO public.user_roles (user_id, role, created_at, updated_at)
SELECT id, role, created_at, updated_at 
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 1d. Create SECURITY DEFINER function to check roles from new table
CREATE OR REPLACE FUNCTION public.has_role_v2(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 1e. RLS policies for user_roles - ONLY admins can manage roles
-- Users can read their own role
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only admins can insert/update/delete roles
CREATE POLICY "Only admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role_v2(auth.uid(), 'admin'))
  WITH CHECK (public.has_role_v2(auth.uid(), 'admin'));

-- 1f. Update profiles UPDATE policy to prevent role changes
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update own profile fields only"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Role cannot be changed via profiles - must use user_roles table
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- 1g. Update handle_new_user trigger to also create user_roles entry
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert into profiles (backward compatible)
  INSERT INTO public.profiles (id, role, email)
  VALUES (NEW.id, 'client'::app_role, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert into user_roles (new secure table)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client'::app_role)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$function$;

-- =====================================================
-- FIX 2: TRAINER UPDATE POLICIES - Restrict to owned plans/created_by
-- =====================================================

-- 2a. Drop overly permissive nutrition_plans UPDATE policy
DROP POLICY IF EXISTS "Trainers and admins can update nutrition plans" ON public.nutrition_plans;

-- 2b. Create restricted UPDATE policy for nutrition_plans
CREATE POLICY "Users can update their own nutrition plans"
  ON public.nutrition_plans FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- 2c. Drop overly permissive training_plans UPDATE policy
DROP POLICY IF EXISTS "Trainers and admins can update training plans" ON public.training_plans;

-- 2d. Create restricted UPDATE policy for training_plans  
CREATE POLICY "Users can update their own training plans"
  ON public.training_plans FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- 2e. Drop overly permissive INSERT policies and restrict to owner
DROP POLICY IF EXISTS "Trainers and admins can insert nutrition plans" ON public.nutrition_plans;

CREATE POLICY "Users can insert their own nutrition plans"
  ON public.nutrition_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Trainers and admins can insert training plans" ON public.training_plans;

CREATE POLICY "Users can insert their own training plans"
  ON public.training_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- 2f. Fix plan_versions INSERT/UPDATE policies
DROP POLICY IF EXISTS "trainers_insert_plan_versions" ON public.plan_versions;
DROP POLICY IF EXISTS "trainers_update_plan_versions" ON public.plan_versions;

CREATE POLICY "Users can update their own plan versions"
  ON public.plan_versions FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- 2g. Fix plan_overrides INSERT/UPDATE policies
DROP POLICY IF EXISTS "trainers_insert_overrides" ON public.plan_overrides;
DROP POLICY IF EXISTS "trainers_update_overrides" ON public.plan_overrides;

CREATE POLICY "Users can insert their own overrides"
  ON public.plan_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

CREATE POLICY "Users can update their own overrides"
  ON public.plan_overrides FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- =====================================================
-- FIX 3: CLIENT PII EXPOSURE - Create restricted view for trainers
-- =====================================================

-- 3a. Create a restricted view that hides sensitive PII from trainers
CREATE OR REPLACE VIEW public.clients_trainer_view AS
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
  -- Exclude sensitive PII: email, phone, medical_conditions, allergies
  disliked_foods,
  created_by,
  user_profile_id,
  created_at,
  updated_at
FROM public.clients;

-- 3b. Grant access to the view for authenticated users
GRANT SELECT ON public.clients_trainer_view TO authenticated;

-- 3c. Drop overly permissive trainer SELECT policy and replace with stricter one
DROP POLICY IF EXISTS "Trainers can view their clients' data" ON public.clients;

-- Trainers should use the restricted view for their clients
-- Keep owner and client self-access policies intact
-- The view provides non-PII access for trainer workflows

-- =====================================================
-- CLEANUP: Add trigger for updated_at on user_roles
-- =====================================================
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();