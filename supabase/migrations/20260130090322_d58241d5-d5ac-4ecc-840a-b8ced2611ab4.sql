-- Fix 1: Remove dangerous development policy from clients table
DROP POLICY IF EXISTS "dev_clients_all" ON public.clients;

-- Fix 2: Enable RLS on client_progress_snapshots and add proper policies
ALTER TABLE public.client_progress_snapshots ENABLE ROW LEVEL SECURITY;

-- Clients can view their own progress snapshots
CREATE POLICY "clients_view_own_progress"
ON public.client_progress_snapshots FOR SELECT
USING (client_id IN (
  SELECT id FROM public.clients WHERE user_profile_id = auth.uid()
));

-- Clients can create their own progress snapshots
CREATE POLICY "clients_create_own_progress"
ON public.client_progress_snapshots FOR INSERT
WITH CHECK (
  client_id IN (SELECT id FROM public.clients WHERE user_profile_id = auth.uid())
  OR created_by = auth.uid()
);

-- Trainers can view their clients' progress
CREATE POLICY "trainers_view_client_progress"
ON public.client_progress_snapshots FOR SELECT
USING (client_id IN (
  SELECT client_id FROM public.get_trainer_client_ids(auth.uid())
));

-- Trainers and admins can insert progress snapshots for their clients
CREATE POLICY "trainers_create_client_progress"
ON public.client_progress_snapshots FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'trainer'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Trainers and admins can update progress snapshots
CREATE POLICY "trainers_update_client_progress"
ON public.client_progress_snapshots FOR UPDATE
USING (
  public.has_role(auth.uid(), 'trainer'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Fix 3: Remove other dangerous dev policies
DROP POLICY IF EXISTS "dev_nutrition_plans_all" ON public.nutrition_plans;
DROP POLICY IF EXISTS "dev_plan_overrides_all" ON public.plan_overrides;
DROP POLICY IF EXISTS "dev_plan_versions_all" ON public.plan_versions;

-- Enable RLS on macro_tolerance_rules (currently missing)
ALTER TABLE public.macro_tolerance_rules ENABLE ROW LEVEL SECURITY;

-- Anyone can read macro tolerance rules (they are reference data)
CREATE POLICY "anyone_can_read_macro_rules"
ON public.macro_tolerance_rules FOR SELECT
USING (true);

-- Only admins can modify macro tolerance rules
CREATE POLICY "admins_manage_macro_rules"
ON public.macro_tolerance_rules FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));