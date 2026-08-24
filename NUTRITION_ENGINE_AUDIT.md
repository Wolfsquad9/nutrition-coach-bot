# Nutrition Engine — Forensic Audit & Scientific Specification

**Branch audited:** `audit/nutrition-engine` @ `59d0bf5`
**Scope:** Entire nutrition calculation / data pipeline. Audit only — **no code was modified.**
**UI scope:** EXPLICITLY OUT OF SCOPE. Visual design is preserved; only incorrect underlying values / duplicated calculations are identified.

---

## 0. How this audit was performed

The full lifecycle was traced by following imports and data flow (not filenames):

- Entry → `NutritionPage` → `NutritionTabContent` → `useNutritionPlanState` / `usePlanFetch`
- Target calc → `utils/calculations.ts` (`calculateNutritionMetrics`, `calculateBMR`, `calculateTDEE`, `calculateTargetCalories`, `calculateMacros`, `calculateWaterIntake`, `distributeMacrosAcrossMeals`)
- Plan generation → `services/recipe/weeklyPlanGenerator.ts` → `mealPlanGenerator.ts` → `generateRecipe` (recipeGenerators/selectors/ingredientUtils) → `mealAdjuster.ts` / `nutritionCalculations.ts`
- Data → `data/ingredientDatabase.ts` (`macros` per 100g, `calculateMacros` scaling)
- Persistence/hydration → `useNutritionPlanState.lockPlan`, `snapshotAdapter.ts`, `snapshot.ts`, `supabasePlanService.ts`, `snapshotPersistence.ts`, migration `20260506131500_atomic_nutrition_plan_lock.sql`
- Display → `WeeklyMealPlanDisplay`, `DailyMealPlanDisplay`, `GroceryListDisplay`, snapshot export (`snapshotExporter.ts`, `pdfExport.ts`)
- Edge → `supabase/functions/generate-fitness-plan` (OpenAI, gpt-4o)

The strategy `npx vitest run` for all `src/domain/nutrition/*.test.ts` (96 tests) and `tests/planSnapshot.test.ts` pass on the audited commit — baseline is green.

---

## 1. EXECUTIVE SUMMARY

The application has **one canonical calculation family** (utils/calculations) but **two independent plan-generation pipelines** and a **billowing patchwork of macro/calorie treatment layers** that the user `audit/nutrition-engine` correctly suspected. The specific defects, across 24 findings in §6 and 7 display notes in §7, cluster into six families:

| Family | Root cause | Severity | Findings |
|---|---|---|---|
| **1. Two plan pipelines** | live `services/recipe/*` vs legacy `services/plan/mealGenerator.ts` | HIGH | F1–F3, F21 |
| **2. Layer-agnostic food data** | ingredient `calories` field ≠ 4·P + 4·C + 9·F | HIGH | F4–F6, F12, F15 |
| **3. Snapshot loses canonical metrics** | lock builds `metrics` with tdee/bmr = 0, fiber/water = 0 | HIGH | F7–F10 |
| **4. Layer display reuse vs live** | `mapSnapshotToWeeklyPlan` sets weekly totals = single-day target | HIGH | F11, F13, F20 |
| **5. No enforcement of the kcal invariant** | no single canonical path runs for every value | CRITICAL | F14 |
| **6. Extreme/valid inputs break math** | no clamping on protein/carbs at low target | MEDIUM | F16, F19, F12 |

**Headline finding (C. F14):** The invariant `Calories ≈ protein_g·4 + carb_g·4 + fat_g·9` *holds at the target layer by construction* (carbs are the remainder — verified Δ=0 for kWh). But it **does not hold at the food / meal / recipe layer**, because ingredient rows store a separate `calories` per-100g value that diverges from the 4-4-9 sum (measured: chicken breast +8.6, salmon −9.0 per 100g). The `mealPlanGenerator` convergence loop independently targets `calories` (from the DB `calories` field) **and** macro grams (from P/C/F fields) under four separate tolerances. Because the source data does not satisfy the invariant, the loop **cannot** make both true; the displayed meal kcal and the macro‑gram‑to‑kcal reconstruction diverge by routine tens of kcal, and `Math.round` accumulation widens it. **There is no single canonical calculation path shared by target, food, meal, and display layers.**

Also confirmed: a **valid-but-low** target input (70 kg F / 165 cm / 30 y, fat_loss with `weeklyWeightChange = −1.5` kg/wk [schema-allowed]) produces `carbs = −57 g` and protein ≈ 161 g at a 551 kcal target, with fiber (25 g) exceeding total carbs. No clamp guards this.

---

## 2. CURRENT NUTRITION ARCHITECTURE

```
                     ┌─ services/recipe/*          (ACTIVE meal plan generator)   ─ preserved
  Client inputs ────►│    weeklyPlanGenerator → fullDayMealGenerator →            │
 MaterialView layout │    generateRecipe → balanced selector → nutritionCalculations │
                      │    mealAdjuster (convergence)                              │
                      └─ services/plan/*          (LEGACY/dead nutrition plan)      ─ dead
                          metricsCalculator, mealGenerator, groceryListGenerator     │
                      └─ utils: calculations.ts (targets), nutritionScience.ts (roles)│
```

- **Live target calc:** `calculateNutritionMetrics(client)` in `utils/calculations.ts` — the ONLY source of daily targets actually used by the UI (`NutritionTabContent`).
- **Live meal generation:** `generateFullDayMealPlan` → `generateRecipe` → `adjustMealIngredients`; returned as `WeeklyMealPlanResult` → `WeeklyMealPlanDisplay`.
- **Legacy (unused by UI):** `services/plan/mealGenerator.ts` (`generateDynamicNutritionPlan`, `generateDynamicDailyMealPlan`, `distributeMacrosAcrossMeals`) and `groceryListGenerator.ts` / `metricsCalculator.ts` — exported via `services/plan/index.ts` but not referenced anywhere in the active UI.
- **Persistence/hydration:** `lockPlan` writes `PlanSnapshot` + `plan_payload` via `lock_nutrition_plan` RPC. `lock` stores snapshot metrics with deliberately zeroed TDEE/BMR/fiber/water (see F7).
- **Display:** `WeeklyMealPlanDisplay`/`DailyMealPlanDisplay` render from `WeeklyMealPlanResult`; `GroceryListDisplay` from snapshot grocery list; snapshots export through `snapshotExporter` / `pdfExport`.

This is **not** a single pipeline; it is **two** and they disagree enough to bite.

---

## 3. CURRENT CALCULATION PIPELINE (traced)

**Target / metrics layer** (`utils/calculations.ts`):

```
calculateNutritionMetrics(client)
  age = calculateAge(birthDate)
  BMR  = 10·kg + 6.25·cm − 5·age + (±5 / −161)          Mifflin-St Jeor
  TDEE = round(BMR · activityFactor)                     factors: 1.2 / 1.375 / 1.55 / 1.725 / 1.9
  targetCalories = TDEE −/+ (weeklyChange·7700 / 7)      default ±550 / ±275
  protein_g = round(kg · {2.3 | 2.0 | 2.3 | 1.7})        goal-driven; ↑ if v/extr. active
  fat_g     = round(targetCal · {0.25 | 0.30 | 0.28 | 0.30} / 9)
  proteinCal= protein_g·4;  fatCal = fat_g·9
  carbs_g   = round((targetCal − proteinCal − fatCal)/4)   ← remainder = macro reconcile hits Δ0
  fiber_g   = max(25, round(targetCal/1000 · 14))
  water_L   = weight·35 /1000 ·(activity)                  // activity-adjusted in practice
```

**Meal generation layer** (`services/recipe/*`):

```
generateWeeklyMealPlan(selectedFoods, macroTargets, seed)
  generateFullDayMealPlan(per shuffled day)
    for each mealType (b/l/d/s):
      split = MEAL_MACRO_SPLIT[meal]                    0.25/0.35/0.30/0.10
      mealTargetCal = round(macroTargets.calories · split)
      recipe = generateRecipe(...)                      selects 1 protein + 1 carb + veg/fruit + fat
      scaleFactor = mealTargetCal / recipe.macrosPerServing.calories    // calories-field based
      clampedScale = clamp(0.5, 2.5)                    // ⌈cap hides unmeetable split⌉
      scaledMacros = round(recipe.macrosPerServing · clamped)              // round #1
      totalMacros += scaledMacros
      adjustMealIngredients(...) while |variance|>tol  // protein→carbs→fat, Math.round #2, #3
      FINAL: recompute each meal.macros = Σ per-ingredient round(ing.calories·factor)  // round #4, RE-DERIVES different value
    weeklyTotal = Σ days;  weeklyTarget = macroTargets ·7
```

**Persistence/hydration:**

```
lockPlan → buildLockedPlanPayload + mapWeeklyMealPlanToSnapshot + buildGroceryListFromPlan
        → buildPlanSnapshot(metrics with tdee:0, bmr:0, fiber:0, water:0)     ← F7
        → lock_nutrition_plan RPC (version, snapshot, hash)

loadPlanForClient → fetchCurrentPlan(payload, snapshot) ; hydrate setWeeklyPlan(payload.weeklyPlan)
        resolvedWeeklyPlan = snapshot ? mapSnapshotToWeeklyPlan(snapshot) : weeklyPlan   ← F11
```

**Edge:** browser UI uses `gpt-4o` (`generate-fitness-plan`) only as an *optional* separate generation path that returns **its own JSON plan object** (different shape) — it is not integrated into snapshot/lock. This is a fourth parallel model with no canonical source (F21).

---

## 4. DATA FLOW MAP

```
 Client (kg, cm, goal, activity, weeklyChange, mealsPerDay)
   │
   ├──► calculateNutritionMetrics ──► NutritionMetrics {tdee,bmr,target,p,c,f,fiber,water}
   │         └──► MacroTargets {calories, protein, carbs, fat}
   │                     │
   │                     └──► generateWeeklyMealPlan(likedFoods, macroTargets, seed=derived)
   │                              └──► WeeklyMealPlanResult
   │                                     ├──► WeeklyMealPlanDisplay (live)
   │                                     ├──► snapshotAdapter.mapWeeklyMealPlanToSnapshot ─► MealPlan[]
   │                                     ├──► snapshotAdapter.buildGroceryListFromPlan ─► GroceryItem[]
   │                                     │        (waterLiters dropped → hydration: 0)     ← F8
   │                                     └──► lockPlan ─► PlanSnapshot.weeklyPlan + groceryList
   │
   └──► (dead) services/plan/mealGenerator.ts ─► NutritionPlan (Meal[], generateDynamicGroceryList)
   └──► (dead) services/plan/metricsCalculator.calculatePersonalizedMetrics   ← dup target calc
   └──► pdfExport / generate-fitness-plan (optional, separate schema)
```

**Source‑of‑truth observations**
- Daily targets: only `utils/calculations.ts`.
- Food macro **grams** authority: `data/ingredientDatabase.ts` `macros` (P/C/F per 100g).
- Food **calories** authority: the same `macros.calories` **field** per 100g — which is NOT the 4-4-9 of the macros (F4/F14).
- Daily/meal/recipe totals: derived by three different-rounding loops (`calculateTotalMacros`, `scaledMacros`, final recompute).
- Weekly total: sum of per-day totals (`weeklyPlanGenerator`).
- Persisted canonical: `PlanSnapshot` (which drops td, bmr, fiber, water → F3).

So there are **five independent authorities** for numbers that should be one.

---

## 5. CURRENT FORMULAS (verbatim, with author references)

| Name | File/line | Formula | Notes |
|---|---|---|---|
| `calculateBMR` | `utils/calculations.ts:8` | 10·kg + 6.25·cm − 5·age + (5/−161) | Mifflin-St Jeor, correct |
| `getActivityFactor` | `utils/calculations.ts:20` | {1.2, 1.375, 1.55, 1.725, 1.9} | Harris-Benedict heritage defaults |
| `calculateTDEE` | `utils/calculations.ts:34` | round(BMR·factor) | |
| `calculateTargetCalories` | `utils/calculations.ts:41` | fat_loss: TDEE − |weekly·7700/7| ; muscle_gain: TDEE + weekly ·7700/7 | **sign asymmetry** F19 |
| `calculateMacros` | `utils/calculations.ts:70` | P=kg·mult; F=round(cal·baseFloat/9); C=remainder/4; **no clamps** | negative-carbs bug F16 |
| `fiber` | line 122 | max(25, round(target/1000·14)) | can exceed carbs |
| `distributeMacrosAcrossMeals` | line 189 | percentage tables {0.30/0.40/0.30}, etc. | LEGACY, unused |
| `calculateMacros` (ingredient) | `data/ingredientDatabase.ts:537` | P/C/F · ratio, round to 0.1g; kcal · ratio, round to int | not 4-4-9 reconcileable |
| `MEAL_MACRO_SPLIT` | `recipe/constants.ts` | 0.25 / 0.35 / 0.30 / 0.10 | must sum 1.0 |
| `MACRO_TOLERANCES` | `recipe/constants.ts` & `domain/shared/constants.ts` | cal 5% / protein 5% / carb 8% / fat 8% | two copies |

---

## 6. FORMULA / DATA INCONSISTENCIES — DETAILED FINDINGS

Each finding: **Severity · Location · Problem · Why wrong · Scientific basis · Example · Correct · Fix · Centralize?**.

---

### F1 — HIGH — Two divergent meal-plan pipelines (live vs legacy)
- **File:** `src/services/recipe/*` (live) vs `src/services/plan/mealGenerator.ts` + `groceryListGenerator.ts` + `metricsCalculator.ts` (legacy)
- **Problem:** The *active* UI path (`NutritionTabContent` → `weeklyPlanGenerator`) is a completely different algorithm from the exported-but-unreferenced `services/plan/mealGenerator.ts` path (`distributeMacrosAcrossMeals`, `generateRecipe`, `MealPlan[]`). `services/plan/index.ts:8` still exports the dead generator.
- **Why it is wrong:** Any future call-site (PDF, MyPlan, API) can silently take the legacy path and produce different servings/meal splits/rounding, contradicting the live plan.
- **Basis:** Two sources of truth for one concept; the legacy path also hardcodes a different meal‑split table ({0.30,0.40,0.30}, etc.).
- **Correct:** One generator. Mark `services/plan/mealGenerator*` obsolete; route every caller to `services/recipe/*`.
- **Centralize?** Yes — generation is a canonical-adjacent concern.

---

### F2 — HIGH — `calculateMacros` name collision across two modules
- **Files:** `utils/calculations.ts` (target grams) and `data/ingredientDatabase.ts:537` (per-100g scaling), both exported as `calculateMacros`.
- **Problem:** An import error easily resolves to the wrong function; the two are incompatible (µ-servings vs target grams).
- **Why:** Both exist and are equally likely to be imported.
- **Correct:** rename the ingredient helper `scaleMacrosForServing`; keep `calculateMacros` uniquely scoped to target grams. Then `calculateTotalMacros` uses the scaling helper explicitly.
- **Centralize?** ✅

---

### F3 — HIGH — Snapshot metrics drop TDEE / BMR / fiber / water (hard zero)
- **File:** `src/hooks/useNutritionPlanState.ts:309-319`
- **Func:** `lockPlan` builds `NutritionMetrics = { tdee:0, bmr:0, targetCalories: macroTargets.calories, …, fiberGrams:0, waterLiters:0 }`.
- **Why wrong:** TDEE, BMR, fiber g, water L **are real computed upstream** but are thrown away at the moment of canonical persistence. The snapshot is defined as “the single data shape every distribution channel operates on” (`snapshot.ts` header) — so every export/hydration of a locked plan shows **0 for TDEE/BMR/fiber/water**.
- **Evidence:** `snapshotExporter.ts:127` prints `TDEE: ${m.tdee}` → a locked plan’s PDF renders **“TDEE: 0”**. Same for water and fiber.
- **Correct:** Thread the real `NutritionMetrics` into the snapshot at generation; persist canonical metrics, not a zero-padded record.
- **Centralize?** ✅ — snapshot must carry exact canonical metrics.

---

### F4 — HIGH — Ingredient `calories` field does not follow 4·P + 4·C + 9·F
- **Location:** `src/data/ingredientDatabase.ts` (`macros.calories` per 100g).
- **Problem:** kcal stored independently; may include fiber/other/non-Atwater rounding.
- **Why:** Meal totals scale `ing.macros.calories`, while target grams use 4-4-9. So meal-recipe `calories` and macro-grams cannot reconcile (the exact defect flagged).
- **Evidence (measured):**
  - chicken breast: DB 165 vs 4P+4C+9F = 156.4 (Δ **+8.6**)
  - salmon: DB 208 vs 217 (Δ **−9.0**)
  - oats: DB 379 vs 379.3 (Δ ~0)
- **Correct:** DECIDE ONE calorie authority. Recommended **macros-first** — kcal_derived = 4P + 4C + 9F + a fiber_cal convention; flag where DB overrides. Must not mix.
- **Centralize?** ✅

---

### F5 — HIGH — Mixed-Atwater in `calculateIngredientRole`
- **File:** `nutritionScience.ts:35` computes numerator from 4-4-9 but denominator from DB `calories`.
- **Severity:** role thresholds (protein ≥40% kcal) become unstable when DB calories ≠ 4-4-9 (a 5.5% perturbation on chicken moves threshold behavior near the boundary).
- **Correct:** use one convention for both numerator and denominator.
- **Centralize?** ✅ (role classifier belongs to canonical engine).

---

### F6 — HIGH — `mealPlanGenerator` recalculates meals with a *fourth* rounding path
- **File:** `mealPlanGenerator.ts:177-187`
- **Problem:** after convergence (`scaledMacros` = round(recipe.macrosPerServing·scale)), the FINAL step recomputes each meal.macros as Σ `Math.round(ing.macros.X · factor)` per ingredient — a different rounding order → usually a different total.
- **Why wrong:** The `.converged` flag (targets within tolerance) was evaluated against the **pre-recompute** total. The recompute silently moves the number, so “in tolerance” can become “out” and the UI shows numbers the generator did not promise.
### F7 — HIGH — Weekly totals wrong for loaded-from-snapshot plans
- **Location:** `snapshotAdapter.ts:151-154` `mapSnapshotToWeeklyPlan`:
  ```
  weeklyTotalMacros: snapshot.metrics,
  weeklyTargetMacros: snapshot.metrics,
  weeklyVariance: zeroMacros(),
  ```
- **Problem:** both weekly totals and weekly target = the **single-day** `snapshot.metrics` object. So `WeeklyMealPlanDisplay` shows “Calories/week = X” where X is the *daily* target — always 7× too low — and always reports 0 variance.
- **Evidence:** for a loaded plan, the weekly sum is constant regardless of day totals.
- **Correct:** weeklyTotalMacros must be Σ daily totals; weeklyTargetMacros = daily ·7. Do not alias the same object for both.
- **Centralize?** ✅ — adapter belongs to canonical aggregation.

---

### F8 — MEDIUM — Hydration per day dropped to 0 in snapshots
- **Location:** `snapshotAdapter.ts:128 hydration: 0`; lock snapshot `waterLiters: 0`.
- **Problem:** MealPlan.hydration is NEVER populated; water is dropped at persistence.
- **Fix:** carry real `waterLiters` (or a per-day hydration) into the snapshot. Live `MealPlan` also never receives water in the active path (`weeklyPlanGenerator` doesn’t attach `waterLiters`).
- **Centralize?** ✅

---

### F9 — MEDIUM — Grocery items lack `estimatedCost`
- **Evidence:** snapshot `buildGroceryListFromPlan` never sets `estimatedCost`; the UI sums over the field → shows **€0** on locked plans. The legacy generator used `amount·0.03`.
- **Centralize?** ✅ for plan output (or move cost out of nutrition).

---

### F10 — MEDIUM — `metricsCalculator.calculatePersonalizedMetrics` duplicates `calculateNutritionMetrics`
- **File(s):** `services/plan/metricsCalculator.ts` vs `utils/calculations.ts`.
- **Problem:** same algorithm maintained in two places (metricsCalculator re-rounds TDEE/BMR and prefers `client.age`), only one is live.
- **Risk:** drift when the canonical formula changes (e.g. switching to protein-first) and the legacy copy silently diverges.
- **Fix:** delete one; expose a single `calculateNutritionMetrics(client)`.
- **Centralize?** ✅ — this is the canonical target path.

---

### F11 — HIGH — Weekly/day summary recomputes variance in the display layer instead of reading canonical data
- **Files:** `WeeklyMealPlanDisplay.tsx:106-113`, `DailyMealPlanDisplay.tsx:136-142`.
- **Problem:** `percentVariance` is re-derived `(total−target)/target` at render time rather than consumed from the plan’s canonical `variance`/`percentageVariance`.
- **Why wrong:** if the total or target is later corrected, the display drifts from the canonical variance; also adds a second divergent treatment (daily display shows target but weekly shows the same single-day target for loaded plans — see F7).
- **Correct:** render canonical `variance`; only format, never recompute.
- **Centralize?** display reads canonical aggregator.

---

### F12 — MEDIUM — Duplicate macro-tolerance constants
- **File:** `domain/shared/constants.ts` (CALORIES_PCT 5 / PROTEIN 5 / CARBS 8 / FATS 8) AND `recipe/constants.ts` `MACRO_TOLERANCES` (cal 0.05, protein 0.05, carbs 0.08, fat 0.08).
- **Problem:** two copies; if one changes, convergence and snapshot-validation disagree.
### F13 — HIGH — Fiber/water dropped at `NutritionTabContent` → `macroTargets`
- **Location:** `NutritionTabContent.tsx:106-111, 134-140` builds `macroTargets` with **only** `{calories, protein, carbs, fat}` — the `fiber` and anything else from `calculateNutritionMetrics` is discarded. Fiber is never carried into the generator target.
- **Correct:** carry fiber into `MacroTargets.fiber` (and into snapshot metrics, see F3/F8).
- **Centralize?** ✅

---

### F14 — CRITICAL — No single enforcement of `Calories ≈ 4·P + 4·C + 9·F`
- **Location:** whole pipeline (target layer, food layer, meal layer, display).
- **Problem:** the invariant is *coincidentally* true at the target layer (carbs-remainder makes the sum exact) but *not* true at the meal/food layer. Nothing asserts or reconciles it.
- **Measured:** target layer Δ = **0** for normal inputs (verified). Food layer diverges (F4: +8.6 / −9.0 per 100g).
- **Correct:** introduce a canonical `reconcileCalories(macroGrams)` that derives calories from grams (or a documented fiber/other convention) and a tolerance check. Eat-the calories from ONE source everywhere.
- **Centralize?** ✅ — THE canonical function.

---

### F15 — CRITICAL — Negative macro grams on valid-but-low target (no clamps)
- **Location:** `utils/calculations.ts:112-119` (`calculateMacros`).
- **Reproduction (verified):** 70 kg / female / 165 cm / 30 y / `fat_loss` with `weeklyWeightChange = −1.5`kg/wk (schema-permitted `clientSchema` −1.5..1.5):
  - BMR 1420, TDEE 2201, target = 2201 − 1650 = **551**
  - protein = round(70×2.3) = **161 g** (644 kcal)
  - fat = round(551×0.25/9) = **15 g** (135 kcal)
  - remaining = 551 − 644 − 135 = **−228 → carbs = −57 g**
  - `fiber` = max(25, round(551/1000·14)) = 25 g **> total carb allocation**.
- **Why wrong:** no lower-bound clamp on carbs, no sanity check protein/fat ≤ target energy; the extreme-but-valid input produces impossible targets.
- **Centralize?** ✅ — this is the canonical targets function; clamps belong there.

---

### F16 — MEDIUM — Water / fiber formula indirection & defaults
- **File:** `calculateWaterIntake` and `fiber`.
- **Problem:** water base 35 ml/kg + activity bonus is reasonable; fiber uses a single linear rule (max 25 g, then 14 g/1000 kcal). Both are unvalidated assumptions, not evidence-driven, and vary between layers (fiber dropped; water never displayed).
- **Centralize?** ✅

---

### F17 — MEDIUM — `fiber` and carbs can exceed each other; fiber kcal not counted
- If fiber ≥ carbs (F15), the returned `targetCalories` (kcal) excludes fiber energy while the plan’s meal kcal *does* include fiber kcal (DB calories already includes it) — the two calorie meanings diverge again.
- **Centralize?** ✅

---

### F18 — HIGH — `shuffleForDay` / splash of `Math.random` non-determinism exposure
- **File:** `mealPlanGenerator.ts:246-254` (`shuffleForDay`) uses a deterministic pseudo-hash, fine. But `CandidateGenerator.seedFactory` and `createSeededRng` are the only deterministic RNG; `recipeGenerators` falls back to `createSeededRng(seed+selectedFoods)`, consistent. However `weeklyPlanGenerator` calls `generateWeeklyMealPlan(those,macros,seed)` with `seed` from `Candidounage*/createCandidateSeed` — the same input seeds give identical plans (good).
- **Conclusion:** determinism holds **within** the active pipeline. The *risk*: any layer that re-runs without the seed → non-reproducible (already the case for `groceryList` and snapshot regen). Not a current bug; flag for the engine contract.
- **Centralize?** ✅ — seed/pipeline must be fully deterministic.

---

### F19 — MEDIUM — Sign asymmetry in `calculateTargetCalories`
- **Problem:** `fat_loss` uses `Math.abs(deficit)` (always subtract), so a *positive* weeklyWeightChange (weight gain) with fat_loss still subtracts. `muscle_gain` adds a raw `surplus` (no abs), so a negative weekly change with muscle_gain *adds* instead of subtracting. Contradictory sign policy.
### F20 — MEDIUM — Payload vs snapshot can diverge
- **Evidence:** `plan_payload.weeklyPlan` is the live re-hydration source; `locked_snapshot_json` is the canonical display source. If they ever diverge, the UI can show one while macros rehydrate from the other.
- **Correct:** one canonical JSON keeps payload + snapshot consistent (or snapshot becomes the single decode).
- **Centralize?** ✅

---

### F21 — MEDIUM — Optional `gpt-4o` plan path is a 4th model outside the engine
- **File:** `supabase/functions/generate-fitness-plan/index.ts`.
- **Problem:** GPT-4o returns its own calorie/macro/meal/grocery JSON with **no enforced invariant, no round policy, no fiber/adherence**, and it is not wrapped by snapshot/lock.
- **Centralize?** ✅ — fold any AI output through the canonical normaliser.

---

### F22 — MEDIUM — `mealsPerDay` ignored by the live generator
- `services/recipe/*` always builds exactly 4 meals; `mealsPerDay` (3, 5, 6) drives only the dead legacy path.
- **Example:** a `mealsPerDay: 6` client still gets 4 meals.
- **Centralize?** ✅

---

### F23 — LOW — `checkRedFlags` / `clientSchema` weekly-change bounds inconsistent
- `clientSchema` permits ±1.5 kg/wk; `checkRedFlags` warns above 1.0; the code comment claims −1 to +0.5. The negative-carbs case (F15) lives inside all windows. Unify the guard in the engine.
- **Centralize?** ✅

---

### F24 — LOW — Units (`kg`/`cm`/`g`) are only type annotations; no runtime proof
- `calculateNutritionMetrics` receives plain numbers; a pounds-in / inches-in payload silently corrupts BMR.
- **Centralize?** ✅ — validate units at the canonical boundary.

---

## 7. UI / DATA DISPLAY INCONSISTENCIES

| # | Display | Incorrect underlying value | Findings |
|---|---|---|---|
| D1 | Weekly cards “Calories/week” show **1× daily target** for loaded plans | F7 |
| D2 | Live weekly cards show `weeklyTotal=Σ days`, `weeklyTarget=target·7` (OK live) — contrast with D1 |
| D3 | `Weekly/DailyMealPlanDisplay` recompute `percentVariance` at render (not from canonical) | F11 |
| D4 | Locked plan PDF/export shows **TDEE / fiber / water = 0** | F3 |
| D5 | Grocery **€0** on locked plans | F9 |
| D6 | Meal kcal vs macro-grams disagree by tens of kcal on the same card | F4/F14 |
| D7 | `DailyMealPlanDisplay` shows a single-day target for the one generated day; a loaded plan shows the same target every day | F7 |

---

## 8. SCIENTIFIC EVIDENCE REVIEW

This states the evidence that should drive the recommended model (noting the current code's strongest idea).

1. **Energy / resting expenditure** — Mifflin-St Jeor is the most recommendable population equation for *resting* energy in healthy non-athletic adults; the code already uses it. Label it "resting / RMR", not conflate with training-day TDEE.
2. **TDEE** — an activity multiplier (1.2–1.9) is coarse. A **direct TDEE from observed weight trend** (weight‒trend × 7700 per wk) is an evidence-based alternative when data exists (≥3 wks); otherwise the multiplier, labeled approximation, is defensible.
3. **Protein** — evidence supports **per-kg (or per-LBM) g/day**, not a % of calories. Ranges commonly cited: ~1.6–2.2 g/kg muscle gain; ~2.2 g/kg during deficit to preserve lean mass; 1.2–1.6 maintenance; reduce toward ~1.0 for high body-fat (bodyweight basis overstates). The app's 1.7–2.6 are near/above these, but bodyweight-based and static.
4. **Fat** — a practical **floor** (~0.5–1.0 g/kg = ~25–35% kcal) supports hormones/satiety/variety. Don't force below a physiological floor.
5. **Carbs** — **remainder** is the most defensible default (reconciles energy; not fixed-%). Add a **minimum** (performance/duration floor) and keep non-negative.
6. **Calories / deficit** — `(weeklyRate·7700)/7` is valid; the important work is **clamps** and **adaptivity**. Design as `TDEE + signed GoalDelta`, clamped ±1375, not double-abs.
7. **Fixed %-macros vs goal-aware** — fixed-pct is not goal/activity aware; the code already uses carb-remainder (right). Make it explicit/deterministic + clamps.

**Bottom line:** no pseudoscience needed (and no proprietary formula). The biggest evidence-based upgrade is `protein-per-kg + fat-floor + carbs-remainder`, with **adaptive calorie target** and **clamps + single-canonical reconcile**. Percentages are only a reproducibility fallback.

---

## 9. RECOMMENDED NUTRITION MODEL

**Select: Hybrid — `protein-first + fat-floor + performance-based carbs`, with adaptive calorie target from observed weight trend.**

Decision versus the five candidates:
1. **Fixed % macros** — rejected (not goal/activity aware, resists adaptation).
2. **Protein-first + fat-floor + carbs remainder** — **selected**. Deterministic, explainable, evidence-based, satisfies the kcal invariant by construction.
3. **Protein-first + fat-target + performance carbs** — adopt the carb floor clause when training-volume / adherence data exists (feature-gated).
4. **Lean-mass-based protein** — scientifically attractive, rejected now (no LBM inputs); prepare behind a feature flag.
5. **Adaptive observed-trend TDEE / target** — adopted as the *optional refinement on top of #2*, gated by data sufficiency.

Two documented paths:
- **Default:** `protein = per-kg(goal)` ; `fat = floor(fat/kg)` then `carbs = remainder`; kcal invariant enforced; clamps; no double signs.
- **Adaptive:** if >= 3 weeks tracked weight, `targetCalories = TDEE_est - (observed weekly kg * 7700 / 7)`, clamped to +/- 10% around base TDEE.

---

## 10. CANONICAL FORMULA SPECIFICATION (draft spec -> final before dev)

```
BMR (Mifflin-St Jeor) = 10*kg + 6.25*cm - 5*age + (5 if male else -161)
RMR ~= BMR  (display/documented as resting)

TDEE_base = round(BMR * activityFactor)            // fallback; activity multipliers
TARGET_KCAL = TDEE_base + GoalDelta( normalised signed weekly rate * 7700 / 7 )
  clamps: fat_loss [-300..-1150] ; muscle_gain [+275..+550] ; recomposition= maintenance = 0

PROTEIN_g = round(weightKg * proteinMult):
  maintenance 1.6 | fat_loss 2.0-2.4 | recomposition 2.2 | muscle_gain 2.0
FAT_g = round( max( fatFloorPerKg*weight , targetFractionOfKcal /9 ) )   // floor, not hard %

CARB_cal = TARGET - (protein*4 + fat*9)
CARB_g   = round(CARB_cal / 4);  enforce >= 0 and >= CARB_MIN_FLOOR (training-aware when present)
  if CARB_cal < 0 -> reduce protein/fat first (or flag), never emit negative carbs

RECONCILE: targetCalories == protein*4 + fat*9 + carb*4 (+fiberRule ) within tolerance

Kcal == sumMacrosFromIngredients( per-100g macros )  at meal/day/week   (canonical)

**Primary invariant** is enforced once by the canonical targets function and once per stage via the single `sumMacros`; the UI never re-derives calories/macros.
```

---

## 11. REQUIRED INVARIANTS (MUST BE ENFORCED)

1. **Kcal invariant (macro closure):** `calories_displayed == round(4·P + 4·C + 9·F + fiberRule)` — single source; tolerance ±5 kcal on a day, ±10 kcal weekly; any deviation is an explicit warning, never silent.
2. **Serving closure:** `meal.macros == sumMacrosFromIngredients(meal.ingredients)` — not an independent formula.
3. **Aggregation closure:** `day.totalMacros == Σ meals` ; `week.summary == Σ days` ; `weeklyTarget == 7 × daily target`.
4. **Rounding closure:** the value persisted == the value displayed (same round-once boundary).
5. **Snapshot closure:** snapshot.metrics == the exact metrics the plan was generated from (including td/bmr/fiber/water). No zeros; no silent drop-outs.
6. **Non-negativity:** all macro grams >= 0 (F15 guards), calories > 0, servings > 0.
7. **Canonical-path closure:** every nutrition value in the UI/export is reachable from exactly one canonical function; no re-derivation in render/display/export.

---

## 12. ROUNDING / UNIT POLICY

- Internal engine values are **float / double** (grams, kcal).
- **Round ONCE** at the display / snapshot-persistence boundary, matching the persistence integer policy.
- **Never round-then-sum.** Use the single `sumMacrosFromIngredients()` that sums exact fractions and rounds the total last.
- **No rounding in the convergence loop** (only the emitted final value).
- Units: internal **grams** (food + macros), **cm** (height), **kg** (weight). Validate/reject `oz/lb/cup` at the canonical boundary (F24).
- Fiber: define a fiber-kcal policy (count as 0 kcal in the closure; label databases differ) so the kcal invariant stays closed.

---

## 13. DATA OWNERSHIP / SOURCE OF TRUTH

| Concept | Owner |
|---|---|
| Targets (BMR / TDEE / calorie / macros / fiber / water) | canonical `nutritionEngine` |
| Food data (per-100g grams + calories) | ingredient DB only |
| Recipe / meal / day / week totals | canonical aggregate (a single `sumMacros`) |
| Serving scaling | canonical `scaleServing(grams)` only |
| Persisted snapshot (`locked_snapshot_json`) | write-once; carries **real** metrics (td/bmr/fiber/water) |
| Display | reads canonical; never re-computes variance/calories |

Rule: **a displayed nutrition number is read, never re-computed with a second formula.**

---

## 14. TESTING GAPS (existing vs required)

Existing: `planLifecycle`, `snapshotAdapter`, `snapshotStability`, `snapshotExporter`, `planSnapshot` (structural + write-once). None test the **macro arithmetic**, which is where the defects live.

Required new tests (NOT created yet, per scope):
1. Calorie / macro reconciliation (target -> meal -> day -> week); catches F14.
2. Serving scaling + round-once policy — F6.
3. Recipe -> meal -> day -> week aggregation equality — F7/F13.
4. Unit guards (units boundary) — F24.
5. Rounding policy (round-once, never round-then-sum) — F6.
6. Zero / null -> deterministic zero-macro, never NaN.
7. Extreme-but-valid client inputs (negative-carbs F15), low-cal, heavy-set.
8. Goal x activity x body-composition matrix.
9. Weight-loss / muscle-gain signed-target (F19).
10. Locked-plan snapshot **data** fidelity (metrics carried, fiber/water, weekly totals) — F3/F7/F8.
11. Persistence / reload consistency across the adapter boundary (F7/F20).

---

## 15. PRIORITIZED FIX PLAN (ordered; none executed in this phase)

- **P0** — Introduce a **canonical `nutritionEngine`** (`BMR / TDEE / target / macro / sumMacros / scaleServing / variance`), and make the live UI path call it exclusively.
- **P0** — Carry **real metrics into the snapshot** (td/bmr/fiber/water) at lock (F3/F8/F13).
- **P0** — Enforce **kcal invariant + clamps** (non-negative carbs, deficit clamps, no signed-zero) (F14/F15/F19).
- **P0** — `mapSnapshotToWeeklyPlan` compute weekly totals via Σ days and weekly target via ·7 (F7/F11).
- **P1** — Remove the **fourth rounding path** (`mealPlanGenerator` final recompute) and re-derive `.converged` (F6).
- **P1** — Single tolerance constants, delete dead `services/plan/*` generator, single `calculateMacros`/`scaleServing` (F1/F2/F10/F12).
- **P1** — Display reads canonical (variance, calories); never re-derive (F11/D3).
- **P2** — Carry fiber + carb-performance floor; water/hydration plumbed (F13/F16/F22).
- **P2** — Grocery `estimatedCost` & hydration consistency (F8/F9).
- **P3** — Unit guards at boundary (F24), AI path through normaliser (F21).

---

## 16. RISKS / EDGE CASES

- Population equations (Mifflin) degrade at extreme weight / very lean / very obese — the engine must clamp and flag, not emit absurd (negative/overshoot) targets.
- Observed-trend adaptivity needs a sufficient **data window**; guard against short noisy series.
- LBM variant requires body-composition inputs not currently collected — keep behind a flag.
- Diet-type interactions (vegan protein ceiling, keto carb floor) must be a supported secondary constraint, not a later surprise.
- New food units (oz/lb/cup) or per-serving DB would re-open F4-style divergence without the canonical boundary.
- Fibre calorie policy and food-label rounding mean **small kcal tolerance is legitimate**; the invariant must be ±tolerance, not ==.

---

## 17. QUESTIONS TO RESOLVE BEFORE IMPLEMENTATION

1. Is **target kcal** the master, or **macro grams** (reconciliation direction)?
2. Should the canonical engine run **client-side** (today) or become a **server/edge** master?
3. Does **fiber** count toward kcal (FDA vs EU labeling) — and to what rule?
4. Keep **fixed deficit/surplus** defaults, or go **adaptive-window** immediately?
5. Should **water/hydration** be displayed per-day, or dropped entirely for now?
6. Exact **carb floor** rule (g/day vs g/kg vs % of target) when training data is present.
7. Whether to build the canonical engine as a **new `src/domain/nutrition/engine.ts`** (recommended) or refactor in place.

---

## IMPLEMENTATION CONTRACT (future implementation MUST follow)

1. **Energy equation:** Mifflin-St Jeor (correct as-is). Label **resting**, never conflate with TDEE.
2. **Activity / TDEE methodology:** multiply by activity factor as the *fallback*; use **observed weight-trend TDEE** (window ≥ 3 wks) when present; deterministic.
3. **Calorie goal adjustment:** normalise `weeklyChange` to a **signed** rate → `TARGET = TDEE + signedDelta`, clamp deficits (-300..-1150) & surplus (+275..+550); **never use Math.abs on a deficit that intends a membership gain** (F19).
4. **Protein:** **per-kg g/day** per goal (1.6/2.0–2.4/2.2/2.0), not a % output; **never negative**; optional LBM variant later.
5. **Fat:** **g/day floor** (≈ fat·kg floor) not a hard sole-% ; keep it within a physiological ceiling.
6. **Carbohydrate:** true **remainder** (`(target-4P-9F)/4`); clamp to **≥ 0 and ≥ CARB_MIN**; if remainder < 0, **reduce protein/fat first** or raise a flag — never emit an impossible macro.
7. **Macro reconciliation:** ONE canonical `reconcileK(protein,fat,carb,fiber)` returns `targetKcal`; tolerance ±3–5% (label/wire policy); **the UI never re-computes**.
8. **Rounding:** engine store float; **round-once at display/persistence**; single `sumMacrosFromIngredients` (sum exact, round last); **no round-then-sum** (F6).
9. **Serving calculations:** **only** the canonical serving/scaling function; always grams-in, grams-out.
10. **Aggregation rules:** recursive sum recipes→meal→day→week through one aggregate; weekly == 7× day target (F7).
11. **Source of truth:** every displayed nutrition value **read from canonical snapshot/result**, never a second formula (F4/F14/F11).
12. **Adaptation:** deterministic; uses only the documented observed-trend window; no `Math.random` in any output.
13. **Snapshot rules:** persist **integer-consistent**, **real metrics** including td/bmr/fiber/water; write-once; hydration re-derives **without recompute**.

---

*Audit produced by reading the audited commit. No source files were modified.*