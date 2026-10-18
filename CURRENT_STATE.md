# FitPlan — Current State

**Status:** canonical · **Updated:** 2026-10-18 · **Baseline:** `main` @ `099ef2e`
(in sync with `origin/main`; CI #39157656547 green).

## 1. Committed baseline vs working tree

| Item | State |
|---|---|
| HEAD | `099ef2e` feat(nutrition): add coach-controlled meal variety preference |
| Parent chain | `1b89af4` (lint fix) → `356d300` (DST fix) → `40fcce4` (Phase 5 assertion repair) → `eddc272` (Phase 5 snapshot) → `4bdf3c5` (PR #38 phase-4 activation) |
| Working tree | Clean apart from pre-existing untracked audit artifacts (`audit_*.txt`, `phase5.patch`, `audit_package.json`) — all preserved, none committed |
| Validation on HEAD | lint green · typecheck green · **1078 unit tests / 90 files pass** · build green · CI green |

## 2. Capability summary (with evidence)

**Coach:** client management + invite/claim (`ClientPage`, `e2e/client-invite-flow.spec.ts`);
ingredient restrictions (`IngredientsPage`); weekly optimizer generation
(`NutritionTabContent.handleGenerateWeeklyPlan` → `optimizationEngine.generate`);
daily generation; draft review → atomic lock (`LockPlanButton` confirm dialog →
`lockPlan` → `lock_nutrition_plan` RPC); discard/regenerate/reload; training
assignment (atomic save migration `20261008120000`); check-in review + alerts
(`generate-coach-alerts`); review workflow 13A–13F; shared plan links
(`/plan/:shareId`, `get-shared-plan`).

**Coach — new in `099ef2e`:** Meal variety toggle (More / Traditional) on weekly
generation. `MealVarietyPreference` (`src/services/recipe/types.ts`) threads
`weekIngredientDiversity` through `GenerationInput` → `SeededCandidateGenerator`
(`?? true` default) → `generateWeeklyMealPlan`; the generation-time value is
recorded on the draft (`draftMealVariety`) and persisted as optional
`plan_payload.mealVariety` on lock. **Soft preference only**: never widens
eligibility, never overrides allergens/diet, never changes macro convergence;
`traditional` = byte-identical legacy weekly path; daily generation unaffected.

**Athlete:** weekly/daily plan view (`ClientMyPlanPage` → `fetchCurrentPlan`);
**new in `099ef2e`:** `Meal variety: More/Traditional variety` badge rendered
ONLY when the persisted payload carries the key — legacy payloads show nothing.
Plus grocery/prep lists, training session logging (insert-gated completion
message), check-in forms, progress charts, alerts/messages inbox.

## 3. Architecture map

`main.tsx` (Sentry init) → `App.tsx` (public / coach / client routes,
`ProtectedRoute role=` guards) → `useAuth` (DB-sourced `user_roles`; JWT metadata
NOT used). Coach plan state: `useNutritionPlanState` + `usePlanFetch`
(load/hydrate: plan → snapshot → overrides) + `usePlanStateMachine` (pure
lifecycle); drafts are memory-only, only `lockPlan` persists. Generation:
eligibility funnel → `buildRecipeGenerationOptions` (single activation point,
`RECIPE_ACTIVATION.archetypeGeneration`) → archetype selection w/ legacy fallback
→ weekly loop → seeded candidates → scorer → draft. JSONB `plan_payload`
(`type/generatedAt/lockedAt/macroTargets/weeklyPlan/liked/prescription/[+mealVariety]`)
→ whole-payload hash → `lock_nutrition_plan` (SECURITY DEFINER, authenticated-only,
30s timeout).

## 4. Quality table

| Gate | Result |
|---|---|
| ESLint | green |
| Typecheck (`app` + `node`) | green |
| Unit (Vitest) | **90 files / 1078 tests pass** (incl. 17 new meal-variety tests) |
| Build (Vite) | green |
| Snapshot tests (`tsc` + `planSnapshot.test.js`) | green in CI |
| CI (typecheck→lint→unit→test→build→snapshot→e2e-typecheck→db:verify + Playwright job) | **green on `099ef2e`** |
| Dev boot + browser render | clean (only pre-existing Sentry-DSN/router warnings); Meal variety group renders, 2 radios, More checked |

## 5. Explicitly NOT production-verified

1. Authenticated coach→lock→athlete round-trip against a real backend (needs
   credentials or seeded env; E2E suite targets live Supabase and creates real
   users — deliberately not run here).
2. Share-link exposure measurement (token unguessability + RPC projection unmeasured).
3. RLS cross-client write scope (policies exist both sides; scope not fully traced).
4. No E2E covers generation → lock → athlete view (specs: auth/invite/cross-role/cleanup/shared-plan only).
5. Meal variety has never been seen by a user — no differentiation claim allowed.

## 6. Known trust issues (open)

- `coachingIntelligenceService.ts:43` computes coach-facing adherence
  (`60 + rng*35`) from a seeded RNG — deterministic but **synthetic, not measured**.
- Sentry initializes with a placeholder DSN (`Invalid Sentry Dsn` on boot) — zero
  production error visibility.
