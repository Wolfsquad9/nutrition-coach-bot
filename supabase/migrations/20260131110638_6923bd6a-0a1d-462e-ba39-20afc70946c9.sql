-- Allow authenticated users to create their own profile
-- This is critical for anonymous auth users who don't have a profile yet

CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());