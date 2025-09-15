// Sample data for recipes, exercises, and example clients

import { Recipe, Exercise, Client } from '@/types';

export const sampleRecipes: Recipe[] = [
  // Breakfast recipes
  {
    id: 'rec-1',
    name: 'Protein Oatmeal Bowl',
    category: 'breakfast',
    prepTime: 5,
    cookTime: 10,
    servings: 1,
    ingredients: [
      { id: 'ing-1', name: 'Rolled oats', amount: 60, unit: 'g', category: 'carb', macrosPer100g: { calories: 379, protein: 13.2, carbs: 67.7, fat: 6.5, fiber: 10.1 } },
      { id: 'ing-2', name: 'Whey protein powder', amount: 30, unit: 'g', category: 'protein', macrosPer100g: { calories: 400, protein: 80, carbs: 10, fat: 5 } },
      { id: 'ing-3', name: 'Banana', amount: 100, unit: 'g', category: 'fruit', macrosPer100g: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 } },
      { id: 'ing-4', name: 'Almond butter', amount: 15, unit: 'g', category: 'fat', macrosPer100g: { calories: 614, protein: 21, carbs: 21, fat: 50 } },
      { id: 'ing-5', name: 'Blueberries', amount: 50, unit: 'g', category: 'fruit', macrosPer100g: { calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4 } }
    ],
    instructions: [
      'Boil 250ml water in a pot',
      'Add oats and reduce heat to medium-low',
      'Cook for 5-7 minutes, stirring occasionally',
      'Remove from heat and stir in protein powder',
      'Top with sliced banana, berries, and almond butter',
      'Add cinnamon to taste'
    ],
    macrosPerServing: { calories: 495, protein: 36, carbs: 68, fat: 11, fiber: 10 },
    tags: ['high-protein', 'pre-workout', 'quick', 'vegetarian'],
    dietTypes: ['omnivore', 'vegetarian'],
    allergens: ['gluten', 'dairy', 'nuts'],
    equipment: ['stove', 'pot'],
    difficulty: 'easy'
  },
  {
    id: 'rec-2',
    name: 'Greek Yogurt Parfait',
    category: 'breakfast',
    prepTime: 5,
    cookTime: 0,
    servings: 1,
    ingredients: [
      { id: 'ing-6', name: 'Greek yogurt 0%', amount: 200, unit: 'g', category: 'dairy', macrosPer100g: { calories: 59, protein: 10.3, carbs: 3.6, fat: 0.4 } },
      { id: 'ing-7', name: 'Granola', amount: 40, unit: 'g', category: 'carb', macrosPer100g: { calories: 471, protein: 10, carbs: 64, fat: 20 } },
      { id: 'ing-8', name: 'Mixed berries', amount: 75, unit: 'g', category: 'fruit', macrosPer100g: { calories: 40, protein: 0.7, carbs: 9.6, fat: 0.3, fiber: 3 } },
      { id: 'ing-9', name: 'Honey', amount: 15, unit: 'g', category: 'carb', macrosPer100g: { calories: 304, protein: 0.3, carbs: 82, fat: 0 } }
    ],
    instructions: [
      'In a glass or bowl, layer half the yogurt',
      'Add half the granola and berries',
      'Repeat layers with remaining ingredients',
      'Drizzle honey on top',
      'Serve immediately'
    ],
    macrosPerServing: { calories: 375, protein: 26, carbs: 52, fat: 9, fiber: 4 },
    tags: ['quick', 'no-cook', 'high-protein', 'vegetarian'],
    dietTypes: ['omnivore', 'vegetarian'],
    allergens: ['dairy', 'gluten', 'nuts'],
    equipment: [],
    difficulty: 'easy'
  },
  
  // Lunch recipes
  {
    id: 'rec-3',
    name: 'Grilled Chicken Power Bowl',
    category: 'lunch',
    prepTime: 15,
    cookTime: 20,
    servings: 1,
    ingredients: [
      { id: 'ing-10', name: 'Chicken breast', amount: 150, unit: 'g', category: 'protein', macrosPer100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 } },
      { id: 'ing-11', name: 'White rice', amount: 80, unit: 'g', category: 'carb', macrosPer100g: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 } },
      { id: 'ing-12', name: 'Broccoli', amount: 100, unit: 'g', category: 'vegetable', macrosPer100g: { calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6 } },
      { id: 'ing-13', name: 'Sweet potato', amount: 100, unit: 'g', category: 'carb', macrosPer100g: { calories: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3 } },
      { id: 'ing-14', name: 'Olive oil', amount: 10, unit: 'ml', category: 'fat', macrosPer100g: { calories: 884, protein: 0, carbs: 0, fat: 100 } }
    ],
    instructions: [
      'Season chicken breast with salt, pepper, and herbs',
      'Grill chicken for 6-8 minutes per side until cooked through',
      'Cook rice according to package instructions',
      'Steam broccoli for 5-6 minutes',
      'Roast sweet potato cubes at 200°C for 20 minutes',
      'Slice chicken and arrange in bowl with rice, vegetables',
      'Drizzle with olive oil and season to taste'
    ],
    macrosPerServing: { calories: 520, protein: 52, carbs: 60, fat: 8, fiber: 6 },
    tags: ['high-protein', 'balanced', 'meal-prep', 'gluten-free'],
    dietTypes: ['omnivore', 'paleo'],
    allergens: [],
    equipment: ['grill', 'stove', 'oven'],
    difficulty: 'medium'
  },
  {
    id: 'rec-4',
    name: 'Tuna Quinoa Salad',
    category: 'lunch',
    prepTime: 10,
    cookTime: 15,
    servings: 2,
    ingredients: [
      { id: 'ing-15', name: 'Tuna in water', amount: 160, unit: 'g', category: 'protein', macrosPer100g: { calories: 116, protein: 25.5, carbs: 0, fat: 0.8 } },
      { id: 'ing-16', name: 'Quinoa', amount: 100, unit: 'g', category: 'carb', macrosPer100g: { calories: 120, protein: 4.4, carbs: 21.3, fat: 1.9, fiber: 2.8 } },
      { id: 'ing-17', name: 'Cherry tomatoes', amount: 100, unit: 'g', category: 'vegetable', macrosPer100g: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 } },
      { id: 'ing-18', name: 'Cucumber', amount: 100, unit: 'g', category: 'vegetable', macrosPer100g: { calories: 16, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5 } },
      { id: 'ing-19', name: 'Feta cheese', amount: 40, unit: 'g', category: 'dairy', macrosPer100g: { calories: 264, protein: 14, carbs: 4, fat: 21 } },
      { id: 'ing-20', name: 'Lemon juice', amount: 20, unit: 'ml', category: 'other', macrosPer100g: { calories: 22, protein: 0.4, carbs: 6.9, fat: 0.2 } }
    ],
    instructions: [
      'Cook quinoa according to package instructions and let cool',
      'Drain tuna and flake with a fork',
      'Dice tomatoes and cucumber',
      'Crumble feta cheese',
      'Mix all ingredients in a large bowl',
      'Dress with lemon juice and olive oil',
      'Season with salt, pepper, and herbs'
    ],
    macrosPerServing: { calories: 290, protein: 30, carbs: 28, fat: 7, fiber: 3 },
    tags: ['high-protein', 'mediterranean', 'meal-prep', 'pescatarian'],
    dietTypes: ['omnivore', 'pescatarian'],
    allergens: ['fish', 'dairy'],
    equipment: ['stove'],
    difficulty: 'easy'
  },
  
  // Dinner recipes
  {
    id: 'rec-5',
    name: 'Lean Beef Stir-Fry',
    category: 'dinner',
    prepTime: 20,
    cookTime: 15,
    servings: 2,
    ingredients: [
      { id: 'ing-21', name: 'Lean beef sirloin', amount: 250, unit: 'g', category: 'protein', macrosPer100g: { calories: 158, protein: 26, carbs: 0, fat: 5.4 } },
      { id: 'ing-22', name: 'Brown rice', amount: 150, unit: 'g', category: 'carb', macrosPer100g: { calories: 111, protein: 2.6, carbs: 23, fat: 0.9, fiber: 1.8 } },
      { id: 'ing-23', name: 'Bell peppers', amount: 150, unit: 'g', category: 'vegetable', macrosPer100g: { calories: 31, protein: 1, carbs: 6, fat: 0.3, fiber: 2.1 } },
      { id: 'ing-24', name: 'Snap peas', amount: 100, unit: 'g', category: 'vegetable', macrosPer100g: { calories: 42, protein: 2.8, carbs: 7.6, fat: 0.2, fiber: 2.6 } },
      { id: 'ing-25', name: 'Soy sauce', amount: 30, unit: 'ml', category: 'other', macrosPer100g: { calories: 53, protein: 5.5, carbs: 4.9, fat: 0.1 } },
      { id: 'ing-26', name: 'Sesame oil', amount: 10, unit: 'ml', category: 'fat', macrosPer100g: { calories: 884, protein: 0, carbs: 0, fat: 100 } }
    ],
    instructions: [
      'Cook brown rice according to package instructions',
      'Slice beef into thin strips against the grain',
      'Heat wok or large pan over high heat with sesame oil',
      'Stir-fry beef for 2-3 minutes until browned, remove',
      'Add vegetables to pan, stir-fry for 3-4 minutes',
      'Return beef to pan, add soy sauce and ginger',
      'Toss everything together for 1-2 minutes',
      'Serve over rice'
    ],
    macrosPerServing: { calories: 420, protein: 38, carbs: 46, fat: 10, fiber: 5 },
    tags: ['high-protein', 'asian', 'quick', 'balanced'],
    dietTypes: ['omnivore'],
    allergens: ['soy', 'sesame'],
    equipment: ['wok', 'stove'],
    difficulty: 'medium'
  },
  {
    id: 'rec-6',
    name: 'Baked Salmon with Vegetables',
    category: 'dinner',
    prepTime: 10,
    cookTime: 25,
    servings: 1,
    ingredients: [
      { id: 'ing-27', name: 'Salmon fillet', amount: 150, unit: 'g', category: 'protein', macrosPer100g: { calories: 208, protein: 20, carbs: 0, fat: 13 } },
      { id: 'ing-28', name: 'Asparagus', amount: 150, unit: 'g', category: 'vegetable', macrosPer100g: { calories: 20, protein: 2.2, carbs: 3.9, fat: 0.1, fiber: 2.1 } },
      { id: 'ing-29', name: 'Baby potatoes', amount: 150, unit: 'g', category: 'carb', macrosPer100g: { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2 } },
      { id: 'ing-30', name: 'Lemon', amount: 30, unit: 'g', category: 'fruit', macrosPer100g: { calories: 29, protein: 1.1, carbs: 9.3, fat: 0.3 } },
      { id: 'ing-31', name: 'Olive oil', amount: 15, unit: 'ml', category: 'fat', macrosPer100g: { calories: 884, protein: 0, carbs: 0, fat: 100 } }
    ],
    instructions: [
      'Preheat oven to 200°C',
      'Place salmon on a baking sheet lined with parchment',
      'Arrange vegetables around salmon',
      'Drizzle everything with olive oil',
      'Season with salt, pepper, and herbs',
      'Top salmon with lemon slices',
      'Bake for 20-25 minutes until salmon flakes easily',
      'Serve immediately'
    ],
    macrosPerServing: { calories: 510, protein: 36, carbs: 32, fat: 26, fiber: 5 },
    tags: ['omega-3', 'mediterranean', 'easy', 'pescatarian'],
    dietTypes: ['omnivore', 'pescatarian', 'paleo'],
    allergens: ['fish'],
    equipment: ['oven'],
    difficulty: 'easy'
  },
  
  // Snack recipes
  {
    id: 'rec-7',
    name: 'Protein Smoothie',
    category: 'snack',
    prepTime: 5,
    cookTime: 0,
    servings: 1,
    ingredients: [
      { id: 'ing-32', name: 'Protein powder', amount: 30, unit: 'g', category: 'protein', macrosPer100g: { calories: 400, protein: 80, carbs: 10, fat: 5 } },
      { id: 'ing-33', name: 'Spinach', amount: 30, unit: 'g', category: 'vegetable', macrosPer100g: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 } },
      { id: 'ing-34', name: 'Frozen berries', amount: 100, unit: 'g', category: 'fruit', macrosPer100g: { calories: 40, protein: 0.7, carbs: 9.6, fat: 0.3, fiber: 3 } },
      { id: 'ing-35', name: 'Almond milk', amount: 250, unit: 'ml', category: 'dairy', macrosPer100g: { calories: 17, protein: 0.6, carbs: 0.6, fat: 1.5 } },
      { id: 'ing-36', name: 'Chia seeds', amount: 10, unit: 'g', category: 'fat', macrosPer100g: { calories: 486, protein: 17, carbs: 42, fat: 31, fiber: 34 } }
    ],
    instructions: [
      'Add all ingredients to a blender',
      'Blend on high for 45-60 seconds until smooth',
      'Add ice if desired for thicker consistency',
      'Pour into glass and serve immediately'
    ],
    macrosPerServing: { calories: 220, protein: 28, carbs: 18, fat: 6, fiber: 6 },
    tags: ['post-workout', 'quick', 'high-protein', 'vegetarian'],
    dietTypes: ['omnivore', 'vegetarian'],
    allergens: ['dairy', 'nuts'],
    equipment: ['blender'],
    difficulty: 'easy'
  },
  {
    id: 'rec-8',
    name: 'Cottage Cheese Bowl',
    category: 'snack',
    prepTime: 3,
    cookTime: 0,
    servings: 1,
    ingredients: [
      { id: 'ing-37', name: 'Cottage cheese 2%', amount: 150, unit: 'g', category: 'dairy', macrosPer100g: { calories: 82, protein: 11, carbs: 3.4, fat: 2.3 } },
      { id: 'ing-38', name: 'Apple', amount: 100, unit: 'g', category: 'fruit', macrosPer100g: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 } },
      { id: 'ing-39', name: 'Walnuts', amount: 15, unit: 'g', category: 'fat', macrosPer100g: { calories: 654, protein: 15, carbs: 14, fat: 65, fiber: 7 } },
      { id: 'ing-40', name: 'Cinnamon', amount: 2, unit: 'g', category: 'spice', macrosPer100g: { calories: 247, protein: 4, carbs: 81, fat: 1.2, fiber: 53 } }
    ],
    instructions: [
      'Place cottage cheese in a bowl',
      'Dice apple into small pieces',
      'Chop walnuts roughly',
      'Top cottage cheese with apple and walnuts',
      'Sprinkle with cinnamon',
      'Mix gently if desired'
    ],
    macrosPerServing: { calories: 265, protein: 20, carbs: 23, fat: 13, fiber: 4 },
    tags: ['high-protein', 'quick', 'no-cook', 'vegetarian'],
    dietTypes: ['omnivore', 'vegetarian'],
    allergens: ['dairy', 'nuts'],
    equipment: [],
    difficulty: 'easy'
  }
];

export const sampleExercises: Exercise[] = [
  // Chest exercises
  {
    id: 'ex-1',
    name: 'Barbell Bench Press',
    category: 'chest',
    equipment: ['barbell', 'bench', 'plates'],
    difficulty: 'intermediate',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front deltoids'],
    instructions: [
      'Lie flat on bench with eyes under the bar',
      'Grip bar slightly wider than shoulder-width',
      'Plant feet firmly on the ground',
      'Arch back slightly and retract shoulder blades',
      'Unrack bar and lower to chest with control',
      'Touch chest lightly, then press up explosively',
      'Lock out arms at the top'
    ]
  },
  {
    id: 'ex-2',
    name: 'Dumbbell Incline Press',
    category: 'chest',
    equipment: ['dumbbells', 'incline bench'],
    difficulty: 'intermediate',
    primaryMuscles: ['upper chest'],
    secondaryMuscles: ['triceps', 'front deltoids'],
    instructions: [
      'Set bench to 30-45 degree incline',
      'Hold dumbbells at chest level with palms facing forward',
      'Press dumbbells up and together in an arc motion',
      'Squeeze chest at the top',
      'Lower with control back to starting position'
    ]
  },
  
  // Back exercises
  {
    id: 'ex-3',
    name: 'Deadlift',
    category: 'back',
    equipment: ['barbell', 'plates'],
    difficulty: 'advanced',
    primaryMuscles: ['erector spinae', 'glutes', 'hamstrings'],
    secondaryMuscles: ['traps', 'lats', 'quads'],
    instructions: [
      'Stand with feet hip-width apart, bar over mid-foot',
      'Bend at hips and knees, grip bar outside legs',
      'Keep back straight, chest up, shoulders over bar',
      'Drive through heels to lift bar',
      'Push hips forward as bar passes knees',
      'Stand tall with shoulders back',
      'Lower bar with control by pushing hips back'
    ]
  },
  {
    id: 'ex-4',
    name: 'Pull-ups',
    category: 'back',
    equipment: ['pull-up bar'],
    difficulty: 'intermediate',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'middle back', 'rear deltoids'],
    instructions: [
      'Hang from bar with overhand grip, hands shoulder-width apart',
      'Engage core and retract shoulder blades',
      'Pull body up until chin clears the bar',
      'Focus on pulling with back muscles',
      'Lower with control to full arm extension'
    ]
  },
  {
    id: 'ex-5',
    name: 'Barbell Row',
    category: 'back',
    equipment: ['barbell', 'plates'],
    difficulty: 'intermediate',
    primaryMuscles: ['middle back', 'lats'],
    secondaryMuscles: ['biceps', 'rear deltoids'],
    instructions: [
      'Stand with feet hip-width apart, knees slightly bent',
      'Hinge at hips to 45-degree angle',
      'Grip bar slightly wider than shoulder-width',
      'Keep back straight and core engaged',
      'Row bar to lower chest/upper abdomen',
      'Squeeze shoulder blades together at top',
      'Lower with control'
    ]
  },
  
  // Legs exercises
  {
    id: 'ex-6',
    name: 'Barbell Back Squat',
    category: 'legs',
    equipment: ['barbell', 'squat rack', 'plates'],
    difficulty: 'intermediate',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'core', 'calves'],
    instructions: [
      'Position bar on upper traps, not neck',
      'Stand with feet shoulder-width apart, toes slightly out',
      'Take a deep breath and brace core',
      'Initiate movement by pushing hips back',
      'Descend until hips are below knees',
      'Drive through heels to stand up',
      'Squeeze glutes at the top'
    ]
  },
  {
    id: 'ex-7',
    name: 'Romanian Deadlift',
    category: 'legs',
    equipment: ['barbell', 'plates'],
    difficulty: 'intermediate',
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['erector spinae', 'core'],
    instructions: [
      'Hold bar at hip level with overhand grip',
      'Stand with feet hip-width apart, knees slightly bent',
      'Push hips back while lowering bar',
      'Keep bar close to body throughout',
      'Feel stretch in hamstrings',
      'Drive hips forward to return to start',
      'Keep back straight throughout movement'
    ]
  },
  {
    id: 'ex-8',
    name: 'Leg Press',
    category: 'legs',
    equipment: ['leg press machine'],
    difficulty: 'beginner',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
    instructions: [
      'Sit in leg press machine with back against pad',
      'Place feet shoulder-width apart on platform',
      'Release safety handles',
      'Lower platform by bending knees to 90 degrees',
      'Press through heels to extend legs',
      'Stop just short of locking knees',
      'Control the descent'
    ]
  },
  
  // Shoulders exercises
  {
    id: 'ex-9',
    name: 'Military Press',
    category: 'shoulders',
    equipment: ['barbell', 'plates'],
    difficulty: 'intermediate',
    primaryMuscles: ['front deltoids'],
    secondaryMuscles: ['triceps', 'upper chest', 'core'],
    instructions: [
      'Stand with feet hip-width apart',
      'Grip bar slightly wider than shoulder-width',
      'Rest bar on front shoulders',
      'Brace core and squeeze glutes',
      'Press bar straight up overhead',
      'Lock out arms at top',
      'Lower with control to starting position'
    ]
  },
  {
    id: 'ex-10',
    name: 'Lateral Raises',
    category: 'shoulders',
    equipment: ['dumbbells'],
    difficulty: 'beginner',
    primaryMuscles: ['side deltoids'],
    secondaryMuscles: ['traps'],
    instructions: [
      'Stand with dumbbells at sides',
      'Keep slight bend in elbows',
      'Raise arms out to sides until parallel with floor',
      'Lead with elbows, not hands',
      'Pause at top',
      'Lower with control'
    ]
  },
  
  // Arms exercises
  {
    id: 'ex-11',
    name: 'Barbell Curl',
    category: 'biceps',
    equipment: ['barbell', 'plates'],
    difficulty: 'beginner',
    primaryMuscles: ['biceps'],
    secondaryMuscles: ['forearms'],
    instructions: [
      'Stand with feet hip-width apart',
      'Hold bar with underhand grip, arms extended',
      'Keep elbows at sides',
      'Curl bar up towards shoulders',
      'Squeeze biceps at top',
      'Lower with control'
    ]
  },
  {
    id: 'ex-12',
    name: 'Tricep Dips',
    category: 'triceps',
    equipment: ['dip bars'],
    difficulty: 'intermediate',
    primaryMuscles: ['triceps'],
    secondaryMuscles: ['chest', 'front deltoids'],
    instructions: [
      'Support body on dip bars with arms extended',
      'Lean slightly forward for chest emphasis or stay upright for triceps',
      'Lower body by bending elbows to 90 degrees',
      'Push back up to starting position',
      'Keep core engaged throughout'
    ]
  },
  
  // Core exercises
  {
    id: 'ex-13',
    name: 'Plank',
    category: 'abs',
    equipment: [],
    difficulty: 'beginner',
    primaryMuscles: ['core'],
    secondaryMuscles: ['shoulders', 'back'],
    instructions: [
      'Start in push-up position on forearms',
      'Keep body in straight line from head to heels',
      'Engage core and glutes',
      'Keep hips level, dont sag or pike',
      'Breathe normally',
      'Hold for prescribed time'
    ]
  },
  {
    id: 'ex-14',
    name: 'Cable Crunches',
    category: 'abs',
    equipment: ['cable machine', 'rope attachment'],
    difficulty: 'intermediate',
    primaryMuscles: ['rectus abdominis'],
    secondaryMuscles: ['obliques'],
    instructions: [
      'Kneel facing away from cable machine',
      'Hold rope behind head',
      'Keep hips stationary',
      'Crunch forward bringing elbows toward knees',
      'Focus on flexing spine',
      'Return to start with control'
    ]
  }
];

export const sampleClient: Client = {
  id: 'client-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '+1234567890',
  birthDate: '1990-05-15',
  gender: 'male',
  height: 178,
  weight: 82,
  activityLevel: 'moderately_active',
  primaryGoal: 'recomposition',
  targetWeight: 80,
  weeklyWeightChange: -0.25,
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  sessionDuration: 60,
  preferredTrainingStyle: 'hypertrophy',
  equipment: ['barbell', 'dumbbells', 'cables', 'machines', 'pull-up bar'],
  dietType: 'omnivore',
  mealsPerDay: 4,
  intolerances: ['lactose'],
  allergies: [],
  dislikedFoods: ['liver', 'brussels sprouts'],
  medicalConditions: [],
  medications: [],
  injuries: ['old shoulder impingement - resolved'],
  hasRedFlags: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  coachNotes: 'Client is motivated and consistent. Previous shoulder issue fully resolved.'
};