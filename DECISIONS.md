# FitPlan — Decisions Log

**Status:** canonical, append-only · **Updated:** 2026-10-18

Rule: each entry records date, decider (owner when known), status
(**decided** / **open**), and contradicting evidence if any. Never rewrite —
supersede with a new entry.

## D1 — JSONB payload convention (decided, 2026-10-18, prior practice)

New recorded preferences are additive optional keys inside the `plan_payload`
JSONB document; no schema change required. Optional keys keep legacy payloads
valid and historical rows are never rewritten.
*Evidence:* `PlanPayload.mealVariety?` + conditional-spread builder
(`src/services/supabasePlanService.ts`); whole-payload `hashPlanPayload`.

## D2 — Byte-identical legacy fallback rule (decided, Phase 3C/4, reaffirmed 5)

Every opt-in generation path keeps a byte-identical legacy path: omitted/false
flags route to the exact pre-existing generator output.
*Evidence:* `weeklyPlanGenerator` strips `weekUsedIngredientIds` when the flag is
off; `traditional` runs the legacy weekly path; regression suites
(`archetypeGeneration` omitted/false byte-identical; `CandidateGenerator` legacy
mode; `phase4Activation` same-allow-list fallback).

## D3 — Optimizer default-don: omitted diversity stays ON (decided, 2026-10-18)

`weekIngredientDiversity: input.weekIngredientDiversity ?? true` — omitted means
enabled, preserving the optimizer's established behaviour (candidates were always
generated with cross-day diversity on). Explicit `false` opts out.
*Evidence:* `SeededCandidateGenerator` + `GenerationInput` docs
(`src/services/optimization/`); threading test asserting the default.

## D4 — Preference recorded at generation time, never inferred (decided, 2026-10-18)

The variety value persisted on lock is the generation-time selection stored on
the draft (`draftMealVariety` ref, same pattern as the weekly rate). A draft
generated without an explicit preference persists no key; absent key renders no
athlete label.
*Evidence:* `setDraftPlan(..., { mealVariety })`, `draftMealVarietyRef`,
conditional-spread in `buildLockedPlanPayload`, badge gated on `plan.mealVariety`.

## D5 — Meal variety is coach control, athlete-visible (decided, 2026-10-18)

The toggle lives in the coach weekly-generation flow; athletes see only the
recorded-preference badge on `/my-plan`. Daily generation is deliberately
unaffected (weekly-only control).
*Evidence:* `NutritionTabContent` ToggleGroup (default `'more'`);
`ClientMyPlanPage` badge. *Open follow-up:* whether athletes should ever choose
(see §Open O2).

## D6 — Roles resolve from the DB, never JWT claims (decided, prior)

`useAuth` sources `user_roles` + `clients.clientId`; JWT metadata explicitly not
used; resolution failure falls safe to sign-in.
*Evidence:* `src/hooks/useAuth.tsx:5-10,52-53,81`.

## Open O1 — Synthetic adherence (open, 2026-10-18)

`coachingIntelligenceService.ts:43` synthesizes coach-facing adherence from a
seeded RNG. Decide: compute from check-ins, provisional-label, or remove. Blocks
any "coach intelligence" positioning.

## Open O2 — Preference ownership (open, 2026-10-18)

Coach-only control (current, D5) vs athlete-visible choice. Affects `PlanPayload`
evolution and `/my-plan` UX.

## Open O3 — Default variety policy (open, 2026-10-18)

`'more'` preserves today's optimizer behavior — but is it the desired product
default, or should Traditional be default until variety is user-validated?

## Open O4 — Observability posture (open, 2026-10-18)

Real Sentry DSN (PII-stripping already coded in `main.tsx`) vs removal. Current
placeholder DSN yields zero production visibility.

## Open O5 — Multi-tenant readiness (open, 2026-10-18)

"Independent coaches on their own businesses" implies org/workspace isolation;
current model is coach-owns-clients with no org entity. Decide before any
business-model work.
