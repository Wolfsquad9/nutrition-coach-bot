# Technical Report: Meal Plan Regeneration System

## 1. Complete Execution Flow

### Flow Diagram (when user clicks "Regenerate Plan" / "Weekly Plan")

```
User clicks "Regenerate" or "Weekly Plan" button
  │
  ▼
NutritionTabContent.tsx :: handleGenerateWeeklyPlan()
  │
  ├── Validates: not blocked, not locked, sufficient ingredients
  │
  ├── calculateNutritionMetrics(activeClient) → target macros
  │     (from src/utils/calculations.ts)
  │
  ├── generateWeeklyMealPlan(likedFoods, macroTargets)
  │     (from src/services/recipe/weeklyPlanGenerator.ts)
  │     │
  │     ├── Loop 7 days (dayIndex 0..6):
  │     │     │
  │     │     ├── shuffleForDay(selectedFoods, dayIndex)
  │     │     │     Seeded deterministic shuffle per day
  │     │     │
  │     │     ├── generateFullDayMealPlan(shuffledFoods, macroTargets)
  │     │     │     (from src/services/recipe/mealPlanGenerator.ts)
  │     │     │     │
  │     │     │     ├── Loop 4 meals (breakfast, lunch, dinner, snack):
  │     │     │     │     │
  │     │     │     │     ├── generateRecipe(selectedFoods, mealType)
  │     │     │     │     │     (from src/services/recipe/recipeGenerators.ts)
  │     │     │     │     │     │
  │     │     │     │     │     ├── createSeededRng(seed) → deterministic RNG
  │     │     │     │     │     │   seed = `recipe-${mealType}-${foods.join('|')}`
  │     │     │     │     │     │
  │     │     │     │     │     ├── getSuitableIngredients() → filter by meal type
  │     │     │     │     │     │
  │     │     │     │     │     ├── selectBalancedIngredients() → pick 1 protein,
  │     │     │     │     │     │   1 carb, 1-2 veg, 1 fruit, 1 fat, 1 misc
  │     │     │     │     │     │
  │     │     │     │     │     ├── generateRecipeName() → template-based
  │     │     │     │     │     ├── generateInstructions() → template-based
  │     │     │     │     │     └── calculateTotalMacros() → sum ingredient macros
  │     │     │     │     │
  │     │     │     │     ├── Scale ingredients to meal calorie target
  │     │     │     │     │   (scale factor clamped to 0.5x–2.5x)
  │     │     │     │     │
  │     │     │     │     └── generateMealRecipeText() → formatted recipe text
  │     │     │     │
  │     │     │     ├── CONVERGENCE LOOP (up to 5 iterations):
  │     │     │     │     │
  │     │     │     │     ├── checkMacroTolerance() → within ±5% cal/protein, ±8% carbs/fat?
  │     │     │     │     │
  │     │     │     │     ├── If NOT within tolerance:
  │     │     │     │     │   adjustMealIngredients() → scale serving sizes
  │     │     │     │     │   in priority order: protein → carbs → fat
  │     │     │     │     │
  │     │     │     │     └── Track best result (lowest total variance)
  │     │     │     │
  │     │     │     ├── Final recipe text regeneration (once, after convergence)
  │     │     │     │
  │     │     │     └── Return FullDayMealPlanResult with variance and convergence info
  │     │     │
  │     │     └── Accumulate daily totals into weekly totals
  │     │
  │     ├── Calculate weekly variance = weeklyTotal - (dailyTarget × 7)
  │     │
  │     └── Return WeeklyMealPlanResult
  │
  ├── planState.setDraftPlan(weeklyPlan, macroTargets, likedFoods)
  │     (from src/hooks/useNutritionPlanState.ts)
  │     │
  │     └── Updates React state: weeklyPlan, macroTargets, likedIngredients
  │         Clears: planId, versionId, versionNumber, lockedAt, lockedUntil, snapshot
  │
  └── Toast: "Draft generated!"
```

### The "Regenerate" Button

The "Regenerate" button is **the same button** as "Weekly Plan" — it simply changes label text based on state:

```tsx
// src/components/NutritionTabContent.tsx, line 223-224:
<Button ...>
  {planState.isDraft ? 'Regenerate' : 'Weekly Plan'}
</Button>
```

Both trigger the **exact same** `handleGenerateWeeklyPlan` function. There is no separate "regenerate" code path.

---

## 2. Every File Involved

### UI Layer (React Components)
| File | Role |
|------|------|
| `src/components/NutritionTabContent.tsx` | Contains the "Regenerate"/"Weekly Plan" button and `handleGenerateWeeklyPlan` handler |
| `src/components/WeeklyMealPlanDisplay.tsx` | Displays the generated plan, shows variance percentages per day |
| `src/components/DailyMealPlanDisplay.tsx` | Displays a single daily plan |
| `src/components/LockPlanButton.tsx` | Lock/Discard buttons (lifecycle management) |

### Hooks (State Management)
| File | Role |
|------|------|
| `src/hooks/useNutritionPlanState.ts` | Central state: holds `weeklyPlan`, `macroTargets`, `likedIngredients`, calls `setDraftPlan` |
| `src/hooks/usePlanStateMachine.ts` | Derives lifecycle state (EMPTY/DRAFT/LOCKED/EXPIRED), permission booleans |
| `src/hooks/usePlanFetch.ts` | Loads plan from database |
| `src/hooks/useIngredientValidation.ts` | Validates minimum ingredient count |

### Plan Generation Engine (Services)
| File | Role |
|------|------|
| `src/services/recipe/weeklyPlanGenerator.ts` | Orchestrates 7-day generation, calculates weekly variance |
| `src/services/recipe/mealPlanGenerator.ts` | Generates single day, runs convergence loop, returns final macros |
| `src/services/recipe/recipeGenerators.ts` | `generateRecipe()` — ingredient selection, name generation, instructions |
| `src/services/recipe/selectors.ts` | `selectBalancedIngredients()` — picks 1 from each category |
| `src/services/recipe/mealAdjuster.ts` | `adjustMealIngredients()` — convergence iteration, scales serving sizes |
| `src/services/recipe/nutritionCalculations.ts` | `checkMacroTolerance()` — variance check, `calculateTotalMacros()` |
| `src/services/recipe/ingredientUtils.ts` | `getSuitableIngredients()` — filters by meal type suitability |
| `src/services/recipe/deterministicRecipeText.ts` | Generates recipe text strings |
| `src/services/recipe/constants.ts` | Macro splits, tolerances, recipe templates |

### Domain Layer
| File | Role |
|------|------|
| `src/domain/nutrition/planLifecycle.ts` | State machine: EMPTY → DRAFT → LOCKED → EXPIRED, `canRegenerate()` |
| `src/domain/nutrition/snapshot.ts` | Plan snapshot building for persistence |
| `src/domain/nutrition/snapshotAdapter.ts` | Maps between WeeklyMealPlanResult and PlanSnapshot |
| `src/domain/shared/constants.ts` | `PORTION_CONSTRAINTS` (MAX_PROTEIN_PER_MEAL_G_PER_KG, etc.) |

### Utilities
| File | Role |
|------|------|
| `src/utils/random.ts` | `createSeededRng()` — Mulberry32 PRNG with FNV hash |
| `src/utils/nutritionScience.ts` | `calculateIngredientRole()`, `enhanceIngredientWithRole()`, `calculateMaxPerMealGrams()` |
| `src/utils/calculations.ts` | `calculateNutritionMetrics()` — TDEE/BMR/macro target calculation |
| `src/utils/ingredientSubstitution.ts` | Client ingredient restrictions |

### Data
| File | Role |
|------|------|
| `src/data/ingredientDatabase.ts` | Ingredient definitions with macros, categories, `allowedMeals` |
| `src/data/sampleData.ts` | Sample data |

### Database / Persistence
| File | Role |
|------|------|
| `src/services/supabasePlanService.ts` | `lockNutritionPlan()`, `buildLockedPlanPayload()`, `hashPlanPayload()` |
| `src/services/supabaseOverrideService.ts` | Meal swap overrides |
| `src/services/planService.ts` | Plan CRUD operations |

---

## 3. Regeneration Mechanics

### 3a. Does regeneration call the LLM again?
**NO.** There is **no LLM/API call anywhere** in the regeneration flow. The entire system is **purely algorithmic**:

- Recipe generation uses template-based names and instructions
- Ingredient selection is rule-based (category filtering + random selection)
- Macro optimization is a deterministic convergence loop
- No external AI service is consulted

### 3b. Does regeneration reuse previous results?
**NO.** Each regeneration call **generates a completely fresh plan from scratch** by calling `generateWeeklyMealPlan()` which loops through all 7 days. The previous plan is discarded and replaced in state via `setDraftPlan()`.

### 3c. Does regeneration use randomness?
**YES, but it is seeded (deterministic) randomness.** The system uses a Mulberry32 PRNG (from `src/utils/random.ts`) seeded with:

```
seed = `recipe-${mealType}-${selectedFoods.join('|')}`
```

**Critical consequence:** If the user's liked ingredients (`selectedFoods`) haven't changed, the seed will be **identical** on every regeneration call, and the same recipes will be generated. This means clicking "Regenerate" without changing ingredients produces the **exact same plan** every time. The only source of variation is:

- `shuffleForDay()` uses `(dayIndex + 1) * (i + 1) * 0.618` which is deterministic per day index
- The `rng` is seeded per (mealType, selectedFoods), so different days get different ingredient selections

But **within the same day with the same ingredients, the results are 100% reproducible**.

### 3d. Does regeneration filter recipes?
**YES.** `getSuitableIngredients()` filters ingredients by checking each ingredient's `allowedMeals` array against the current meal type. For example, an ingredient tagged as `allowedMeals: ['breakfast', 'snack']` would not appear in lunch or dinner.

### 3e. Does regeneration optimize macros?
**YES.** A convergence loop (up to 5 iterations) runs for each day:

1. `checkMacroTolerance()` checks if actual macros are within tolerance of targets:
   - Calories: ±5%
   - Protein: ±5%
   - Carbs: ±8%
   - Fat: ±8%

2. If out of tolerance, `adjustMealIngredients()` adjusts serving sizes in priority order:
   - **Protein first** — preserve lean mass and satiety
   - **Carbohydrates second** — primary performance/energy substrate
   - **Fats last** — energy-dense, avoid large swings

3. Adjustments are constrained by science-based portion limits:
   - Protein: max ~225g/meal (or bodyweight × 0.5g/kg)
   - Carbs: max ~400g/meal (or bodyweight × 1.75g/kg)
   - Fat: max ~70g/meal (or bodyweight × 0.325g/kg)
   - Minimum: 10g per ingredient

4. The best result (lowest total variance) is tracked and used if convergence fails.

### 3f. Does regeneration ask the AI to generate another plan?
**NO.** The system is entirely algorithmic — no AI/LLM is involved in any capacity.

---

## 4. How Macro Variance is Calculated

### Daily Variance (per day, per meal)

**Absolute variance** (calculated in `mealPlanGenerator.ts` lines 205-210):
```
variance.calories = totalMacros.calories - targetMacros.calories
variance.protein  = totalMacros.protein  - targetMacros.protein
variance.carbs    = totalMacros.carbs    - targetMacros.carbs
variance.fat      = totalMacros.fat      - targetMacros.fat
```

**Percentage variance** (calculated in `nutritionCalculations.ts` lines 29-37):
```
percentageVariance.calories = (actual.calories - target.calories) / target.calories
percentageVariance.protein  = (actual.protein  - target.protein)  / target.protein
percentageVariance.carbs    = (actual.carbs    - target.carbs)    / target.carbs
percentageVariance.fat      = (actual.fat      - target.fat)      / target.fat
```

### Weekly Variance (calculated in `weeklyPlanGenerator.ts` lines 40-52):
```
weeklyTarget.calories = dailyTarget.calories × 7
weeklyTarget.protein  = dailyTarget.protein  × 7
weeklyTarget.carbs    = dailyTarget.carbs    × 7
weeklyTarget.fat      = dailyTarget.fat      × 7

weeklyVariance.calories = weeklyTotal.calories - weeklyTarget.calories
weeklyVariance.protein  = weeklyTotal.protein  - weeklyTarget.protein
weeklyVariance.carbs    = weeklyTotal.carbs    - weeklyTarget.carbs
weeklyVariance.fat      = weeklyTotal.fat      - weeklyTarget.fat
```

### Convergence Score (for tracking best result, `mealPlanGenerator.ts` lines 112-116):
```
currentVariance = |%var.calories| + |%var.protein| + |%var.carbs| + |%var.fat|
```
Lower is better. The iteration with the lowest score is kept if full convergence fails.

---

## 5. Is Variance Displayed or Used During Generation?

**Both.**

### Used during generation:
- The convergence loop in `mealPlanGenerator.ts` uses `checkMacroTolerance()` to determine whether to continue iterating
- `adjustMealIngredients()` uses the variance/deficit to calculate how much to adjust each ingredient's serving size
- The best result (lowest variance) is tracked across iterations and used if final convergence fails

### Displayed to the user:
- `WeeklyMealPlanDisplay.tsx` calculates and displays percentage variance per day:
  ```tsx
  <p>Variance: {percentVariance.calories > 0 ? '+' : ''}{percentVariance.calories.toFixed(1)}% cal</p>
  ```
  Color-coded: green (≤5%), yellow (≤10%), red (>10%)

- Each day's card shows target vs actual macros in the weekly summary grid

- Convergence warnings are displayed when convergence fails (e.g., "Convergence limitée par contraintes physiologiques")

---

## 6. How Recipes Are Selected

### Step 1: Filter by Meal Suitability
`getSuitableIngredients()` (from `ingredientUtils.ts`) filters the user's liked ingredients by checking each ingredient's `allowedMeals` array. Only ingredients that include the current meal type (breakfast/lunch/dinner/snack) are kept.

### Step 2: Select Balanced Composition
`selectBalancedIngredients()` (from `selectors.ts`) uses the seeded RNG to pick:

| Meal Type | Protein | Carb | Vegetable | Fruit | Fat | Misc |
|-----------|---------|------|-----------|-------|-----|------|
| Breakfast | 1 | 1 | 0 | 1 | 1 | 0 |
| Lunch | 1 | 1 | 1-2 | 0 | 1 | 1 |
| Dinner | 1 | 1 | 1-2 | 0 | 1 | 1 |
| Snack | 1 | 0 | 0 | 1 | 1 | 0 |

Each selection is made using `rng.int(array.length)`, which is deterministic per seed.

### Step 3: Scale to Calorie Target
After selecting ingredients, their serving sizes are scaled to meet the meal's calorie target:
```
scaleFactor = mealTargetCalories / recipe.macrosPerServing.calories
clampedScale = max(0.5, min(2.5, scaleFactor))
```

### Step 4: Converge Macros (if needed)
The convergence loop adjusts serving sizes to hit macro targets more precisely.

---

## 7. Does the System Evaluate Multiple Candidate Plans?

**NO.** The system generates exactly **one plan** (one recipe per meal per day) and then runs the convergence loop on that single plan.

The convergence loop does:
- Track the best result from its iterations (up to 5 adjustments to the same plan)
- Return the best result if final convergence fails

But this is **NOT** the same as generating multiple independent candidate plans. There is no:
- Parallel generation of N different plans
- Scoring/ranking of multiple plans
- Selection of the best from a set of candidates
- Variation of seeds to produce different outcomes

Each call to `generateWeeklyMealPlan()` produces a single deterministic result. If the inputs haven't changed, the output is identical.

---

## 8. Required Algorithm for Improving Macro Accuracy While Maintaining Diversity

### The Problem
The current system has two related issues:
1. **Regeneration is deterministic with same inputs** — clicking "Regenerate" without changing liked ingredients produces the exact same plan
2. **Single-plan generation limits macro accuracy** — if the initial ingredient selection is far from targets, the convergence loop has limited ability to correct (constrained by portion limits)

### Recommended Algorithm: Multi-Candidate Evaluation with Simulated Annealing

#### Phase 1: Generate Multiple Candidates
```
For each candidate (1..N, where N = 5-10):
    Use a different seed per candidate:
        seed = `recipe-${mealType}-${foods.join('|')}-candidate-${i}`
    
    For each day (1..7):
        Run the existing generateFullDayMealPlan() with this seed
        Store the candidate's total variance and diversity score
    
    Score candidate = w₁ × accuracyScore + w₂ × diversityScore
```

#### Phase 2: Score Candidates
```
accuracyScore = 1 - (|%var.cal| + |%var.pro| + |%var.carb| + |%var.fat|) / 4
```
This is a normalized score where 1.0 = perfect match, 0.0 = 100% off.

```
diversityScore = 1 - (overlapRatio with previous locked plan)
```
Where `overlapRatio` = fraction of ingredients that appear in both the candidate and the previous locked plan. This prevents the system from always picking the same ingredients.

#### Phase 3: Select Best Candidate
```
selectedPlan = argmax(candidate.score) over all candidates
```

#### Phase 4: Converge Selected Plan
```
Run the existing convergence loop on the selected plan
```

### Implementation Considerations

1. **Seeded diversity**: Use `candidate-${i}` in the seed string to produce different ingredient selections without changing the user's liked ingredients
2. **Parallel generation**: All N candidates can be generated in parallel (they're independent)
3. **Diversity weights**: Higher weight on diversity when user has few liked ingredients (to avoid repetition), lower weight when they have many
4. **Accuracy threshold**: If any candidate achieves accuracyScore > 0.95 (i.e., within 5% of all targets), skip further candidates
5. **History awareness**: Track which ingredients were used in the last 3 locked plans to penalize overused ingredients
6. **Computational cost**: N=5 candidates × 7 days × 4 meals = 140 recipe generations. This is still fast (no LLM calls) but about 5x the current cost. Consider caching or progressive generation.

### Why This Works

- **Improves macro accuracy**: More candidates = higher probability of finding a good initial ingredient combination that's close to targets
- **Maintains diversity**: The diversity score ensures candidates aren't all similar
- **No LLM required**: All algorithmic, deterministic, reproducible
- **Backward compatible**: The existing convergence loop is the final step, so portion constraints are still respected
- **Predictable results**: Coaches get different plans on regeneration (addressing the main UX issue) while still being reproducible with the same seed

### Alternative: Incremental Improvement (Simpler)

If multi-candidate evaluation is too complex, a simpler alternative is:

1. **Change the seed on regeneration**: Include a `regenerationCount` or `timestamp` in the seed so that clicking "Regenerate" always produces a different plan
2. **Run the convergence loop more aggressively**: Increase `MAX_CONVERGENCE_ITERATIONS` from 5 to 10, and allow ingredient swaps (swapping one ingredient for another of the same category) rather than just scaling
3. **Store the best plan across regenerations**: Keep the last N generated plans and their variance scores; show the best one

This simpler approach doesn't evaluate multiple candidates simultaneously but produces variation on each regeneration attempt.