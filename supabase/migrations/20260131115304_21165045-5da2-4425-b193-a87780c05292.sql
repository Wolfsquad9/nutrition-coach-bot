-- Add PERMISSIVE insert policy for plan_versions to allow owner-based inserts
-- The existing "trainers_insert_plan_versions" is RESTRICTIVE which denies by default without a PERMISSIVE policy

CREATE POLICY "Owner can insert plan versions"
ON public.plan_versions
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Also add PERMISSIVE select policy for owner access (needed for select after insert)
CREATE POLICY "Owner can view own plan versions"
ON public.plan_versions
FOR SELECT
TO authenticated
USING (created_by = auth.uid());