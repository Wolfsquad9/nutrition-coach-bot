-- Add ownership-based RLS policies for authenticated users

-- =====================
-- CLIENTS TABLE
-- =====================

-- Allow authenticated users to INSERT their own clients (ownership via created_by)
CREATE POLICY "Authenticated users can create their own clients"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Allow authenticated users to SELECT their own clients (ownership via created_by)
CREATE POLICY "Authenticated users can view their own clients"
ON public.clients
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Allow authenticated users to UPDATE their own clients (ownership via created_by)
CREATE POLICY "Authenticated users can update their own clients"
ON public.clients
FOR UPDATE
TO authenticated
USING (created_by = auth.uid());

-- =====================
-- NUTRITION_PLANS TABLE
-- =====================

-- Allow authenticated users to INSERT their own nutrition plans (ownership via created_by)
CREATE POLICY "Authenticated users can create their own nutrition plans"
ON public.nutrition_plans
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Allow authenticated users to SELECT their own nutrition plans (ownership via created_by)
CREATE POLICY "Authenticated users can view their own nutrition plans"
ON public.nutrition_plans
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Allow authenticated users to UPDATE their own nutrition plans (ownership via created_by)
CREATE POLICY "Authenticated users can update their own nutrition plans"
ON public.nutrition_plans
FOR UPDATE
TO authenticated
USING (created_by = auth.uid());