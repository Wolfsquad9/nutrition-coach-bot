-- Create role enum
CREATE TYPE public.app_role AS ENUM ('client', 'trainer', 'admin');

-- Create profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'client',
  trainer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clients table (detailed fitness profile)
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  birth_date DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  weight NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  primary_goal TEXT NOT NULL,
  activity_level TEXT NOT NULL,
  dietary_restrictions TEXT[],
  allergies TEXT[],
  disliked_foods TEXT[],
  diet_type TEXT,
  medical_conditions TEXT[],
  training_frequency INTEGER,
  training_experience TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create recipes table
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  prep_time INTEGER,
  cook_time INTEGER,
  macros JSONB NOT NULL,
  ingredients JSONB NOT NULL,
  instructions TEXT[],
  allergens TEXT[],
  diet_types TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create exercises table
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  muscle_groups TEXT[] NOT NULL,
  equipment TEXT[],
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  is_compound BOOLEAN DEFAULT false,
  instructions TEXT[],
  progression_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create nutrition_plans table
CREATE TABLE public.nutrition_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create training_plans table
CREATE TABLE public.training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_data JSONB NOT NULL,
  weeks INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create plan_history table
CREATE TABLE public.plan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('nutrition', 'training')),
  event_type TEXT NOT NULL,
  modifications JSONB,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_history ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id AND role = _role
  )
$$;

-- Create function to get user's clients (for trainers)
CREATE OR REPLACE FUNCTION public.get_trainer_client_ids(_trainer_id UUID)
RETURNS TABLE(client_id UUID)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE user_profile_id IN (
    SELECT id FROM public.profiles WHERE trainer_id = _trainer_id
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Trainers can view their clients' profiles"
  ON public.profiles FOR SELECT
  USING (trainer_id = auth.uid());

-- RLS Policies for clients
CREATE POLICY "Clients can view their own data"
  ON public.clients FOR SELECT
  USING (user_profile_id = auth.uid());

CREATE POLICY "Trainers can view their clients' data"
  ON public.clients FOR SELECT
  USING (user_profile_id IN (SELECT id FROM public.profiles WHERE trainer_id = auth.uid()));

CREATE POLICY "Trainers and admins can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers and admins can update clients"
  ON public.clients FOR UPDATE
  USING (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for recipes (public read, admin write)
CREATE POLICY "Anyone can view recipes"
  ON public.recipes FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert recipes"
  ON public.recipes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update recipes"
  ON public.recipes FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for exercises (public read, admin write)
CREATE POLICY "Anyone can view exercises"
  ON public.exercises FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert exercises"
  ON public.exercises FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update exercises"
  ON public.exercises FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for nutrition_plans
CREATE POLICY "Clients can view their own nutrition plans"
  ON public.nutrition_plans FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_profile_id = auth.uid()));

CREATE POLICY "Trainers can view their clients' nutrition plans"
  ON public.nutrition_plans FOR SELECT
  USING (client_id IN (SELECT client_id FROM public.get_trainer_client_ids(auth.uid())));

CREATE POLICY "Trainers and admins can insert nutrition plans"
  ON public.nutrition_plans FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers and admins can update nutrition plans"
  ON public.nutrition_plans FOR UPDATE
  USING (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for training_plans
CREATE POLICY "Clients can view their own training plans"
  ON public.training_plans FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_profile_id = auth.uid()));

CREATE POLICY "Trainers can view their clients' training plans"
  ON public.training_plans FOR SELECT
  USING (client_id IN (SELECT client_id FROM public.get_trainer_client_ids(auth.uid())));

CREATE POLICY "Trainers and admins can insert training plans"
  ON public.training_plans FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Trainers and admins can update training plans"
  ON public.training_plans FOR UPDATE
  USING (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for plan_history
CREATE POLICY "Users can view history of their plans"
  ON public.plan_history FOR SELECT
  USING (
    (plan_type = 'nutrition' AND plan_id IN (SELECT id FROM public.nutrition_plans WHERE client_id IN (SELECT id FROM public.clients WHERE user_profile_id = auth.uid())))
    OR
    (plan_type = 'training' AND plan_id IN (SELECT id FROM public.training_plans WHERE client_id IN (SELECT id FROM public.clients WHERE user_profile_id = auth.uid())))
  );

CREATE POLICY "Trainers can view their clients' plan history"
  ON public.plan_history FOR SELECT
  USING (
    (plan_type = 'nutrition' AND plan_id IN (SELECT id FROM public.nutrition_plans WHERE client_id IN (SELECT client_id FROM public.get_trainer_client_ids(auth.uid()))))
    OR
    (plan_type = 'training' AND plan_id IN (SELECT id FROM public.training_plans WHERE client_id IN (SELECT client_id FROM public.get_trainer_client_ids(auth.uid()))))
  );

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_nutrition_plans_updated_at BEFORE UPDATE ON public.nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_training_plans_updated_at BEFORE UPDATE ON public.training_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_profiles_trainer_id ON public.profiles(trainer_id);
CREATE INDEX idx_clients_user_profile_id ON public.clients(user_profile_id);
CREATE INDEX idx_nutrition_plans_client_id ON public.nutrition_plans(client_id);
CREATE INDEX idx_nutrition_plans_created_by ON public.nutrition_plans(created_by);
CREATE INDEX idx_training_plans_client_id ON public.training_plans(client_id);
CREATE INDEX idx_training_plans_created_by ON public.training_plans(created_by);
CREATE INDEX idx_plan_history_plan_id ON public.plan_history(plan_id);
CREATE INDEX idx_recipes_category ON public.recipes(category);
CREATE INDEX idx_exercises_difficulty ON public.exercises(difficulty);

-- Seed data for recipes
INSERT INTO public.recipes (name, category, prep_time, cook_time, macros, ingredients, instructions, allergens, diet_types) VALUES
('Grilled Chicken & Quinoa', 'lunch', 15, 25, '{"calories": 450, "protein": 40, "carbs": 35, "fat": 15}', '[{"name": "chicken breast", "amount": 150, "unit": "g"}, {"name": "quinoa", "amount": 80, "unit": "g"}, {"name": "olive oil", "amount": 10, "unit": "ml"}]', ARRAY['Season chicken with salt and pepper', 'Grill for 6-7 minutes per side', 'Cook quinoa according to package', 'Serve together'], ARRAY[]::TEXT[], ARRAY['high-protein', 'gluten-free']),
('Greek Yogurt Parfait', 'breakfast', 5, 0, '{"calories": 320, "protein": 25, "carbs": 40, "fat": 8}', '[{"name": "greek yogurt", "amount": 200, "unit": "g"}, {"name": "granola", "amount": 40, "unit": "g"}, {"name": "berries", "amount": 100, "unit": "g"}]', ARRAY['Layer yogurt in bowl', 'Add granola', 'Top with berries'], ARRAY[]::TEXT[], ARRAY['vegetarian', 'high-protein']),
('Salmon & Sweet Potato', 'dinner', 10, 30, '{"calories": 520, "protein": 38, "carbs": 45, "fat": 20}', '[{"name": "salmon fillet", "amount": 180, "unit": "g"}, {"name": "sweet potato", "amount": 200, "unit": "g"}, {"name": "broccoli", "amount": 150, "unit": "g"}]', ARRAY['Bake salmon at 400F for 15 minutes', 'Roast sweet potato for 25 minutes', 'Steam broccoli'], ARRAY[]::TEXT[], ARRAY['high-protein', 'gluten-free', 'pescatarian']),
('Protein Smoothie', 'snack', 5, 0, '{"calories": 280, "protein": 30, "carbs": 25, "fat": 8}', '[{"name": "protein powder", "amount": 30, "unit": "g"}, {"name": "banana", "amount": 1, "unit": "piece"}, {"name": "almond milk", "amount": 250, "unit": "ml"}]', ARRAY['Blend all ingredients until smooth'], ARRAY[]::TEXT[], ARRAY['high-protein', 'vegetarian']),
('Turkey & Avocado Wrap', 'lunch', 10, 0, '{"calories": 420, "protein": 35, "carbs": 30, "fat": 18}', '[{"name": "turkey breast", "amount": 120, "unit": "g"}, {"name": "whole wheat tortilla", "amount": 1, "unit": "piece"}, {"name": "avocado", "amount": 50, "unit": "g"}]', ARRAY['Layer turkey on tortilla', 'Add sliced avocado', 'Roll and serve'], ARRAY[]::TEXT[], ARRAY['high-protein']),
('Egg White Omelette', 'breakfast', 5, 10, '{"calories": 250, "protein": 28, "carbs": 12, "fat": 10}', '[{"name": "egg whites", "amount": 200, "unit": "ml"}, {"name": "spinach", "amount": 50, "unit": "g"}, {"name": "feta cheese", "amount": 30, "unit": "g"}]', ARRAY['Whisk egg whites', 'Cook in pan with spinach', 'Add feta and fold'], ARRAY[]::TEXT[], ARRAY['high-protein', 'vegetarian', 'gluten-free']),
('Beef Stir Fry', 'dinner', 15, 15, '{"calories": 480, "protein": 42, "carbs": 38, "fat": 16}', '[{"name": "lean beef", "amount": 150, "unit": "g"}, {"name": "brown rice", "amount": 80, "unit": "g"}, {"name": "mixed vegetables", "amount": 200, "unit": "g"}]', ARRAY['Cook rice', 'Stir fry beef and vegetables', 'Serve over rice'], ARRAY[]::TEXT[], ARRAY['high-protein', 'gluten-free']),
('Cottage Cheese Bowl', 'snack', 5, 0, '{"calories": 200, "protein": 24, "carbs": 15, "fat": 6}', '[{"name": "cottage cheese", "amount": 200, "unit": "g"}, {"name": "pineapple", "amount": 80, "unit": "g"}]', ARRAY['Combine cottage cheese and pineapple'], ARRAY[]::TEXT[], ARRAY['high-protein', 'vegetarian', 'gluten-free']),
('Tuna Salad', 'lunch', 10, 0, '{"calories": 350, "protein": 38, "carbs": 20, "fat": 12}', '[{"name": "tuna", "amount": 150, "unit": "g"}, {"name": "mixed greens", "amount": 100, "unit": "g"}, {"name": "olive oil", "amount": 10, "unit": "ml"}]', ARRAY['Mix tuna with greens', 'Dress with olive oil'], ARRAY[]::TEXT[], ARRAY['high-protein', 'gluten-free', 'pescatarian']),
('Protein Pancakes', 'breakfast', 10, 15, '{"calories": 380, "protein": 32, "carbs": 42, "fat": 10}', '[{"name": "protein powder", "amount": 40, "unit": "g"}, {"name": "oats", "amount": 60, "unit": "g"}, {"name": "eggs", "amount": 2, "unit": "piece"}]', ARRAY['Blend ingredients', 'Cook on griddle', 'Serve with berries'], ARRAY[]::TEXT[], ARRAY['high-protein', 'vegetarian']);

-- Seed data for exercises
INSERT INTO public.exercises (name, muscle_groups, equipment, difficulty, is_compound, instructions, progression_metadata) VALUES
('Barbell Squat', ARRAY['quadriceps', 'glutes', 'hamstrings'], ARRAY['barbell', 'rack'], 'intermediate', true, ARRAY['Position bar on upper back', 'Descend until thighs parallel', 'Drive through heels to stand'], '{"progressionType": "linear", "weeklyIncrement": 2.5, "deloadWeek": 4}'),
('Bench Press', ARRAY['chest', 'triceps', 'shoulders'], ARRAY['barbell', 'bench'], 'intermediate', true, ARRAY['Lie on bench', 'Lower bar to chest', 'Press back to start'], '{"progressionType": "linear", "weeklyIncrement": 2.5, "deloadWeek": 4}'),
('Deadlift', ARRAY['back', 'glutes', 'hamstrings'], ARRAY['barbell'], 'advanced', true, ARRAY['Grip bar with hands outside legs', 'Lift by extending hips and knees', 'Lower with control'], '{"progressionType": "linear", "weeklyIncrement": 5, "deloadWeek": 4}'),
('Pull-ups', ARRAY['back', 'biceps'], ARRAY['pull-up bar'], 'intermediate', true, ARRAY['Hang from bar', 'Pull until chin over bar', 'Lower with control'], '{"progressionType": "reps", "weeklyIncrement": 1}'),
('Overhead Press', ARRAY['shoulders', 'triceps'], ARRAY['barbell'], 'intermediate', true, ARRAY['Press bar from shoulders', 'Lock out overhead', 'Lower to shoulders'], '{"progressionType": "linear", "weeklyIncrement": 2.5, "deloadWeek": 4}'),
('Barbell Row', ARRAY['back', 'biceps'], ARRAY['barbell'], 'intermediate', true, ARRAY['Bend at hips', 'Pull bar to lower chest', 'Lower with control'], '{"progressionType": "linear", "weeklyIncrement": 2.5, "deloadWeek": 4}'),
('Dumbbell Curl', ARRAY['biceps'], ARRAY['dumbbells'], 'beginner', false, ARRAY['Curl weights to shoulders', 'Lower with control'], '{"progressionType": "reps", "weeklyIncrement": 1}'),
('Tricep Dips', ARRAY['triceps', 'chest'], ARRAY['dip bars'], 'intermediate', false, ARRAY['Lower body by bending elbows', 'Push back to start'], '{"progressionType": "reps", "weeklyIncrement": 1}'),
('Leg Press', ARRAY['quadriceps', 'glutes'], ARRAY['leg press machine'], 'beginner', true, ARRAY['Press platform away', 'Lower with control'], '{"progressionType": "linear", "weeklyIncrement": 5, "deloadWeek": 4}'),
('Lat Pulldown', ARRAY['back', 'biceps'], ARRAY['cable machine'], 'beginner', false, ARRAY['Pull bar to upper chest', 'Control back to start'], '{"progressionType": "linear", "weeklyIncrement": 2.5}'),
('Lunges', ARRAY['quadriceps', 'glutes'], ARRAY['dumbbells'], 'beginner', true, ARRAY['Step forward', 'Lower back knee', 'Return to start'], '{"progressionType": "reps", "weeklyIncrement": 2}'),
('Plank', ARRAY['core'], ARRAY['bodyweight'], 'beginner', false, ARRAY['Hold body straight', 'Engage core', 'Hold position'], '{"progressionType": "time", "weeklyIncrement": 5}'),
('Russian Twists', ARRAY['core', 'obliques'], ARRAY['medicine ball'], 'beginner', false, ARRAY['Sit with knees bent', 'Rotate torso side to side'], '{"progressionType": "reps", "weeklyIncrement": 2}'),
('Face Pulls', ARRAY['shoulders', 'upper back'], ARRAY['cable machine'], 'beginner', false, ARRAY['Pull rope to face', 'Squeeze shoulder blades'], '{"progressionType": "linear", "weeklyIncrement": 2.5}'),
('Leg Curls', ARRAY['hamstrings'], ARRAY['leg curl machine'], 'beginner', false, ARRAY['Curl legs to glutes', 'Lower with control'], '{"progressionType": "linear", "weeklyIncrement": 2.5}');