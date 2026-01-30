-- Add proper RLS policies for plan_versions since we removed dev policies
-- Clients can view their own plan versions
CREATE POLICY "clients_view_own_plan_versions"
ON public.plan_versions FOR SELECT
USING (plan_id IN (
  SELECT id FROM public.nutrition_plans WHERE client_id IN (
    SELECT id FROM public.clients WHERE user_profile_id = auth.uid()
  )
));

-- Trainers can view their clients' plan versions
CREATE POLICY "trainers_view_client_plan_versions"
ON public.plan_versions FOR SELECT
USING (plan_id IN (
  SELECT id FROM public.nutrition_plans WHERE client_id IN (
    SELECT client_id FROM public.get_trainer_client_ids(auth.uid())
  )
));

-- Trainers and admins can insert plan versions
CREATE POLICY "trainers_insert_plan_versions"
ON public.plan_versions FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'trainer'::app_role) 
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
);

-- Trainers and admins can update plan versions
CREATE POLICY "trainers_update_plan_versions"
ON public.plan_versions FOR UPDATE
USING (
  public.has_role(auth.uid(), 'trainer'::app_role) 
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
);

-- Add proper RLS policies for plan_overrides since we removed dev policies
-- Clients can view their own overrides
CREATE POLICY "clients_view_own_overrides"
ON public.plan_overrides FOR SELECT
USING (client_id IN (
  SELECT id FROM public.clients WHERE user_profile_id = auth.uid()
));

-- Trainers can view their clients' overrides
CREATE POLICY "trainers_view_client_overrides"
ON public.plan_overrides FOR SELECT
USING (client_id IN (
  SELECT client_id FROM public.get_trainer_client_ids(auth.uid())
));

-- Trainers and admins can insert overrides
CREATE POLICY "trainers_insert_overrides"
ON public.plan_overrides FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'trainer'::app_role) 
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
);

-- Trainers and admins can update overrides
CREATE POLICY "trainers_update_overrides"
ON public.plan_overrides FOR UPDATE
USING (
  public.has_role(auth.uid(), 'trainer'::app_role) 
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
);