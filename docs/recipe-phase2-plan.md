# Recipe System — Phase 2 Plan: Ingredient-Library Expansion

**Status:** approved, not yet implemented
**Authoritative source:** the Recipe & Meal-Plan System audit (§11 phased plan, §12 quantified recommendations)
**Baseline commit:** `36cdb39` (Phase 1 complete)
**Related:** `docs/optimization-engine.md`

---

## 1. Objective and scope

### 1.1 Objective

Expand the ingredient library from **47 → 95–110** ingredients so that a realistic client
pool can produce meaningfully more culinary variety, **without** touching the nutrition
engine, the generation architecture, or the safety boundary established in Phase 1.

The expansion is deliberately targeted at **role scarcity per meal slot** rather than
raw count. The audit established that the current library's limiting factor is not
protein or calorie availability, but that the role-based selector has almost no
candidates in several slot/role combinations (see §5).

### 1.2 In scope

* Adding ~50–60 `IngredientData` records to `src/data/ingredientDatabase.ts`.
* Every new record carries complete structured metadata (`allergens`, `dietTags`, and
  the optional fields in §6).
* Tests: per-ingredient energy validation, id uniqueness, metadata completeness,
  allergen/diet truth tables, slot-scarcity measurements, variety measurement.
* Re-measuring the audit's variety/scarcity baselines and recording the new numbers.

### 1.3 Out of scope (Phase 3+)

Phase 2 is **data only**. None of the following may appear in this phase:

* recipe archetypes or any archetype-driven generation
* changes to `selectors.ts`, `recipeGenerators.ts`, `mealPlanGenerator.ts`,
  `weeklyPlanGenerator.ts`, or `deterministicRecipeText.ts`
* new recipe scoring criteria, `PlanScorer.ts` changes
* weekly repetition / diversity constraints
* recipe-text or recipe-UI redesign
* household measurements, variety reports
* changes to `MIN_LIKED_INGREDIENTS` (see §12.2)
* database migrations, external recipe APIs, LLM generation

A new ingredient becomes available to generation **automatically** because
`getSuitableIngredients` is the single selection funnel and reads from the library.
No generation code needs to change.

---

## 2. In-scope files

| File | Change | Risk |
|---|---|---|
| `src/data/ingredientDatabase.ts` | Add ~50–60 records; each with full metadata | **Medium** — pool sizes change, so plan output changes (expected) |
| `src/services/recipe/eligibility.test.ts` | Extend guard/truth-table tests; add slot-scarcity + variety assertions | Low |
| energy-validation test (existing location — see §8.1) | Per-ingredient 4-4-9 reconciliation for new records | Low |

The structured metadata types (`AllergenTag`, `DietTag`, `IngredientData.allergens`,
`IngredientData.dietTags`) already exist and must **not** be re-shaped. If §6 optional
fields are added, they must be optional so existing test fixtures
(`snapshotAdapter.test.ts`, `dataSourceIntegrity.test.ts`) remain valid without edits.

---

## 3. Phase 1 dependencies (all satisfied)

Phase 2 is **fully unblocked**. Every prerequisite the audit identified as a safety
condition for library expansion landed in Phase 1 (`0fe58eb`, `36cdb39`):

| Dependency | Status |
|---|---|
| Structured `allergens` / `dietTags` on `IngredientData` (optional fields) | ✅ shipped |
| Data-driven `determineAllergens` / `determineDietTypes` (no hardcoded ID lists) | ✅ shipped |
| Library-completeness guard test (every ingredient must declare both fields) | ✅ shipped — a Phase 2 record missing metadata **fails CI automatically** |
| Fail-closed diet handling (missing `dietTags` ⇒ not vegan-compatible) | ✅ shipped |
| Eligibility boundary as the single source of the generation pool | ✅ shipped, wiring mutation-verified |
| Closed, exact-match allergen alias table (no fuzzy matching) | ✅ shipped |
| Deterministic seeded generation unchanged | ✅ shipped |

---

## 4. Ingredient-library expansion targets

| Category | Current | Target | Rationale (audit §2) |
|---|---|---|---|
| protein | 10 | ~20 | No beef/pork/lamb, white fish, shrimp, plant protein powder, tempeh/edamame, chickpeas, skyr, ricotta |
| carbohydrate | 8 | ~14 | No couscous/bulgur/farro, rice noodles, tortilla/wrap, cornmeal/polenta, granola/muesli |
| vegetable | 10 | ~20 | No onion, mushroom, aubergine, green beans, cabbage, peas, mixed leaves, sweetcorn, Brussels sprouts, beetroot |
| fruit | 6 | ~12 | No kiwi, pineapple, pear, peach, melon, dates/raisins; **zero** lunch/dinner-usable fruit |
| fat | 8 | ~14 | No tahini, sesame seeds, pumpkin seeds, olives, feta/parmesan, cashews |
| misc / flavour | 5 | ~15–17 | No onion, cumin, paprika, chilli, coriander, basil, oregano, soy sauce, vinegar, mustard, curry powder, stock |
| **Total** | **47** | **95–110** | — |

### 4.1 High-value additions (from audit §2)

* **Proteins:** lean beef, cod/white fish, shrimp, tempeh, edamame, chickpeas, whey or
  plant protein powder, skyr, ricotta, mackerel/sardines.
* **Carbs:** tortilla/wrap, couscous, bulgur, rice noodles, corn/polenta, granola/muesli.
* **Vegetables:** onion, mushrooms, aubergine, green beans, cabbage, peas, mixed leaves,
  sweetcorn, Brussels sprouts, beetroot.
* **Fruits:** kiwi, pineapple, pear, peach, melon, dates/raisins — **at least 3 must be
  lunch/dinner usable** (salads, salsas) to fix the current zero.
* **Fats:** tahini, sesame seeds, pumpkin seeds, olives, feta/parmesan, cashews.
* **Flavour:** onion, cumin, paprika, chilli, coriander, basil, oregano, soy sauce,
  vinegar, mustard, curry powder, stock.

**Required:** every new ingredient must be nutritionally meaningful and compatible with
the existing nutrition engine (i.e. expressible in the per-100 g macro shape the engine
already consumes).
---

## 5. Slot-scarcity targets (the actual objective)

Raw count is **not** the goal. The current role-per-slot availability measured by the
audit is the binding constraint:

| Slot | protein | carb | veg | fruit | fat | misc |
|---|---|---|---|---|---|---|
| breakfast | 3 | **2** | 3 (unused) | 5 | 8 | 3 (unused) |
| lunch | 8 | 7 | 10 | **0** | **3** | 4 |
| dinner | 7 | 6 | 10 | **0** | **3** | 4 |
| snack | 4 | 2 (unused) | 2 (unused) | 6 | 6 | 1 (unused) |

Required after Phase 2:

| Metric | Current | Target |
|---|---|---|
| Lunch/dinner-eligible fats | 3 | 9–10 |
| Breakfast-eligible carbs | 2 | 6–7 |
| Lunch/dinner-eligible fruits | 0 | ≥3 |
| Breakfast-eligible proteins | 3 | ≥6 |
| Lunch/dinner flavour items | 4 | ≥10 |

---

## 6. Required metadata for new ingredients

### 6.1 Mandatory (already exist — guard-tested)

* `allergens: AllergenTag[]` — one of `gluten | dairy | eggs | fish | nuts | soy | sesame | shellfish`
* `dietTags: DietTag[]` — `vegan | vegetarian | pescatarian | omnivore`, most-restrictive-first
  (nesting is centralized in `isIngredientCompatibleWithDiet`)

Both are **required in practice** even though the type field is optional: the Phase 1
completeness guard test fails CI if either is missing. There are **no card tests** in this
project, so that guard test is the enforcement mechanism.

### 6.2 Optional extensions (audit §8) — decide before implementation

The audit recommended additional optional fields (`role`, `cookMethod`, `flavour`,
`portionRange`, `swaps`, `archetypes`). **Open decision (D-2, §12.3):** adding them now
serves Phase 3 (archetypes), not Phase 2. Recommendation: **defer** unless the team wants
them in the same commit, because each field without a consumer is dead data.

If any are added they must be optional, guard-tested for presence, and must not alter
any generation behaviour in Phase 2.

---

## 7. Required eligibility / allergen / diet tests

These extend the existing `src/services/recipe/eligibility.test.ts`. Existing tests must
be preserved unchanged (they encode the Phase 1 safety contract).

1. **Library completeness** — extend the existing guard: every ingredient (new included)
   declares `allergens` and `dietTags`. *(already present; must keep passing)*
2. **Id uniqueness** — no duplicate `id` in the expanded library.
3. **Vegan safety invariant** — no ingredient tagged `vegan` may declare
   `dairy`/`eggs`/`fish`. *(already present; must keep passing)*
4. **Allergen truth tables for new classes** — each new allergen class gets an explicit
   case: `shellfish` (shrimp) → `allergens: ['shellfish']`; cheese/feta → `['dairy']`;
   tahini/sesame seeds → `['sesame']`; wheat tortilla → `['gluten']` (see D-1, §12.1).
5. **Diet truth tables for new classes** — shellfish → `pescatarian`; feta → `vegetarian`;
   tahini, tempeh, quinoa → `vegan`; oats/gluten items → **not** implicitly gluten-free.
6. **Eligibility still removes new allergens/diets** — a new gluten item is excluded from
   a `gluten` allergy pool; a new animal protein is excluded from a `vegan` pool.
7. **Unknown new ids** — a made-up id referencing a not-yet-added ingredient is rejected
   with reason `not-in-library`.
8. **Import validation still holds for the expanded library** — `restrictionImport.test.ts`
   must pass unchanged (it derives its known-id set from `coreIngredients`).

---

## 8. Energy-validation requirement

### 8.1 Rule

Every new ingredient must satisfy the canonical energy identity for its per-100 g macro
values, using the authoritative helpers in `src/domain/nutrition/engine.ts`
(`KCAL_PER_G_*` / `caloriesFromMacros`) — **never** a new formula:

```
calories ≈ 4·protein + 4·carbs + 9·fat
```

The test must import the engine's own constants rather than hardcoding 4/4/9, so the
engine stays the single source of truth.

### 8.2 Open decision (D-3, §12.4): existing rows already diverge

`NUTRITION_ENGINE_AUDIT.md` finding **F4** documents that several current rows deviate
from strict 4-4-9 (chicken +8.6 kcal/100 g, salmon −9.0 kcal/100 g, per the audit).
Therefore a strict assertion would either fail on existing data or force edits to
existing rows (out of scope).

**Required decision before implementation:** either
(a) new rows must be strict and the test asserts strictness for records added in Phase 2
only, or
(b) the test asserts within the same tolerance currently tolerated for existing rows.

**Recommendation:** (a) — new data should not widen an existing divergence; the test
should be scoped to new records and existing rows explicitly excluded with a comment
referencing F4.

### 8.3 Additional per-record requirements

* `typical_serving_size_g` must be a realistic culinary portion (the audit found existing
  outputs such as 225 g cottage cheese + 14 g bread in a single meal).
* `macros` are per 100 g and must be sourced from a recognised reference, not estimated
  in a way that breaks §8.1.
---

## 9. Variety / slot-scarcity measurements and baselines

Phase 2 must be **measured**, not assumed. The audit's measurements were produced by
executing the real generators; the same harness should be re-run after the expansion.

### 9.1 Baselines to beat (measured at 47 ingredients)

| Measurement | Baseline |
|---|---|
| Distinct recipe **names** over 200 generated weeks, all 47 liked | **180** (breakfast 6, lunch 80, dinner 70, snack 24) |
| Distinct recipe names, realistic **16-ingredient** client | **16** |
| Distinct ingredient **sets**, 16-ingredient client, 200 weeks | **32** |
| Distinct names, minimum 5-ingredient client | **5** |
| Lunch/dinner fat variety per week | 1 (olive oil 7/7) |
| Distinct carb sources per week | 1–2 |
| Distinct protein ids across 28 meals | 2–3 |
| Genuinely different **culinary** structures per slot | ~1 |

### 9.2 Required Phase 2 measurements

1. **Slot scarcity** — recompute the §5 table; assert every target is met.
2. **Variety** — re-run the name/set measurement for the 16-ingredient fixture and record
   the new numbers. Phase 2 alone is **not** expected to reach the audit's Phase 3+ targets
   (≥300 names) because variety is bounded by archetype count, not ingredient count; the
   point is a **measurable increase** from the baselines above.
3. **Weekly repetition** — record distinct proteins/carbs/fats per week. Phase 2 should
   improve these, but the **hard repetition constraints are Phase 5**, not Phase 2.
4. **Nutrition health** — confirm the convergence/tolerance behaviour is unchanged in
   character: weekly kcal variance should remain within the range already observed
   (−277…+444 kcal). A materially worse variance after expansion would indicate that a
   new ingredient's macros or serving size are harming convergence — investigate before
   accepting the batch.

### 9.3 Interpretation caveat

More ingredients increase *combinations*, not *culinary meals*. The audit was explicit
that the current system has ~1 culinary structure per slot regardless of pool size.
Phase 2 should therefore be judged on **scarcity relief + measurable variety increase**,
not on "solving" variety. That is Phase 3's job.

---

## 10. Recommended implementation order

1. **Resolve decisions D-1…D-4** (§12). D-1 (gluten convention) blocks any new
   gluten-containing carb.
2. **Metadata contract (optional)** — only if D-2 decides to include §6.2 fields.
   Otherwise skip.
3. **Expand in small batches**, ordered by scarcity relief, each batch a reviewable commit:
   * Batch A — **carbohydrates** (fixes breakfast carbs 2 → 6–7)
   * Batch B — **fats** (fixes lunch/dinner fats 3 → 9–10)
   * Batch C — **vegetables** (also supplies the flavour base: onion, garlic-adjacent)
   * Batch D — **proteins** (verify no vegan-tagged animal protein slips through)
   * Batch E — **fruits** (must include ≥3 lunch/dinner-usable)
   * Batch F — **flavour / seasoning** (largest variety-per-gram win)
4. **Per batch:** energy validation + uniqueness + metadata completeness + eligibility
   truth tables + full test suite green.
5. **Re-measure** §9 after each batch, not just at the end.
6. **Re-audit before Phase 3.** The Phase 3 archetype catalogue's role requirements
   depend on the final ingredient pool, so it must not be designed against the 47-item pool.

---

## 11. Validation requirements

Per batch and at the end of Phase 2:

| Command | Requirement |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test:unit` | pass, no existing test weakened |
| `npm run test:snapshot` | pass, **no snapshot update** |
| `npm run build` | pass |
| E2E | only if the user flow changed — it should not in a data-only phase |

**Explicit regression watch-list (must remain green, unmodified):**

* `src/services/recipe/eligibility.test.ts` — the Phase 1 safety contract
* `src/components/NutritionTabContent.eligibilityWiring.test.tsx` — production wiring
* `src/components/ingredient-manager/restrictionImport.test.ts` — import validation
* `src/services/recipe/regeneration.test.ts` — regeneration determinism
* `src/services/recipe/phase10MealRounding.test.ts` — returned macros == validated macros
* `src/services/recipe/seedThreading.test.ts` — deterministic seed threading
* `src/services/recipe/phase9Integrity.test.ts` — engine integrity
* `src/components/NutritionTabContent.lockGuard.test.tsx` — locked-plan behaviour
* snapshot fidelity suite

**Hard invariants for this phase:**

* `src/domain/nutrition/engine.ts` is **not modified** (byte-identical).
* No tolerance, convergence, rounding, portion-scaling, or energy-factor change.
* Ingredient count after Phase 2 is within 95–110.
* `git diff origin/main --stat` shows no migration, no UI component, and no
  `src/services/recipe/*` production file (other than data/tests).
## 12. Known risks and decisions

### 12.1 Settled decisions (recorded, not open)

| ID | Decision | Rationale |
|---|---|---|
| **D-1** | `oats` keeps `allergens: ['gluten']` | Intentional Phase 1 safety behaviour. It removes a pre-existing contradiction where oats was excluded from "gluten-free" diet labelling but reported no gluten allergen. Measured impact at 47 ingredients: 44 ingredient subsets change `determineAllergens` output; `determineDietTypes` output is unchanged. |
| **D-2** | `MIN_LIKED_INGREDIENTS` (currently `5` in `src/domain/shared/constants.ts`) is **not** changed in Phase 2 | Do not change preemptively. Revisit only if implementation evidence shows the threshold is incompatible with the approved scope (e.g. a diet-restricted client cannot reach it). The audit measured that a 5-food profile yields only 4 distinct ingredient sets, so this is a known weakness — but it is a separate, later decision. |
| **D-3** | `src/domain/nutrition/engine.ts` is **not** modified in Phase 2 | The canonical engine stays authoritative. Phase 2 is data-only. |
| **D-4** | New ingredients must use the existing structured `allergens` / `dietTags` system | The library-completeness guard test fails CI for any ingredient missing either field. No exceptions, no free-text allergen strings. |
| **D-5** | New gluten-containing ingredients follow the same convention as `oats` | Any item containing gluten declares `allergens: ['gluten']`, consistent with D-1. Applies to wheat tortilla, seitan, and any other gluten-bearing addition. |

### 12.2 Open decisions (resolve before or during implementation)

| ID | Open question | Why it matters |
|---|---|---|
| **O-1** | **Energy strictness (audit finding F4).** Existing rows already deviate from strict 4-4-9 (chicken +8.6 kcal, salmon −9.0 kcal per 100 g). Must new rows match existing tolerance, or be strict? | New data that diverges widens the convergence gap the engine has to absorb. Affects the acceptance test in §8. |
| **O-2** | **Optional metadata fields.** Should `role`, `cookMethod`, `flavour`, `portionRange`, `swaps` be added to the type in Phase 2, or deferred to Phase 3 (archetypes)? | They were designed for archetype selection. Adding them now without a consumer is speculative; the audit recommended adding them "only if that can be done without introducing Phase 2's full ingredient-library expansion" scope creep. Recommendation: defer to Phase 3. |
| **O-3** | **New allergen tags in the UI.** `sesame` and `shellfish` exist in the `AllergenTag` vocabulary but no current ingredient uses them. Tahini/sesame and shrimp will be the first. | Verify `WeeklyMealPlanDisplay` / `PrintableMealPlan` render new tags correctly before adding ingredients that use them. |
| **O-4** | **Batch size and count.** 95–110 is the approved target; the audit proposed ~50–60 additions. Confirm the exact final count and the per-batch split before the first batch lands. | Determines how many times plan output churns and how many PRs the phase spans. |
| **O-5** | **Diet-class auditing.** Eligibility is now diet-aware, so additions affect which ingredients a vegan/vegetarian client can be offered at all, not just variety. | A batch that adds no vegan breakfast carb could shrink a vegan client's eligible pool below the generation floor. Each batch must be audited per diet class (§9.2). |

### 12.3 Known non-goals restated

Phase 2 is **data-only**. If implementation appears to require changing `eligibility.ts`,
`ingredientUtils.ts`, `recipeGenerators.ts`, `mealPlanGenerator.ts`, `weeklyPlanGenerator.ts`,
`optimization/*`, or any display component, that work belongs to Phase 3+ and should be
deferred — not smuggled into this phase.

### 12.4 Planning-artifact provenance

This document is a transcription of the approved audit report (§11 "Proposed phased
implementation plan" and §12 "Quantified recommendations") plus the Phase 2 preparation
review. It introduces no new requirements. Where the audit was not specific enough to
state something confidently, the item is recorded above as an **open decision** rather
than resolved by invention.
