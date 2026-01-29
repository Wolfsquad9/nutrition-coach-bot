-- Add first_name, last_name, and created_by columns to clients table
-- These are required for client identity and FK ownership

-- Add first_name column (required for identity)
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';

-- Add last_name column (required for identity)  
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';

-- Add created_by column with FK to auth.users
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add email column for contact info
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add phone column for contact info
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Update plan_overrides to add created_by if missing
ALTER TABLE public.plan_overrides
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Create index on created_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients(created_by);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_created_by ON public.nutrition_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_plan_overrides_created_by ON public.plan_overrides(created_by);