# FitPlan — Roadmap

**Status:** canonical · **Updated:** 2026-10-18 · **Baseline:** `main` @ `72c7862`

Status vocabulary: **complete** · **partially complete** · **incomplete** ·
**superseded** · **unknown**. Sources: `docs/recipe-phase2-plan.md` (authoritative,
baseline `36cdb39`), `docs/optimization-engine.md`, phase-labelled test suites,
commits `0fe58eb` → `099ef2e`, PRs #35–#38. Phase statuses below are
**retrospective reconstructions from code/test/commit evidence**, not fresh
re-verification (no tests re-run in this task).

## Recipe & generation track

| Phase | Intended outcome | Status | Evidence / remaining |
|---|---|---|---|
| 1 — Eligibility & safety | Allergen/diet-correct generation funnel | **complete** | `0fe58eb`, `36cdb39`, `eligibility.test.ts`, wiring test |
| 2 — Ingredient library 47→95–110 | Realistic pool for archetypes | **complete** | `e9b1a07`; ~100-item library corroborated by `archetypes.test.ts` "real 100-item library" suites |
| 3A | No documented commitment found; label appears only as "Phase 5 3A" comment prefix in `weeklyPlanGenerator.ts` / `CandidateGenerator.ts` | **unknown — do not invent scope** | Pending evidence (author intent or discovery) |
| 3B — Archetype catalogue | Slot/role menu of archetypes | **complete** | `archetypes.ts`, 6 suites incl. vegan honesty + satisfiability |
| 3C — Archetype selection | Deterministic, eligibility-safe selection | **complete** | `archetypeSelection.ts`, 8 suites (legacy regression, slot/diet safety, roles, determinism, nutrition authority, scoring) |
| 4 — Controlled activation | One-switch rollout w/ legacy fallback | **complete** | `activation.ts`, `7fa490e`, 6 activation suites, PR #38 |
| 5 — Weekly repetition + presentation | Cross-day diversity + archetype titles in weekly plans | **complete** | `weeklyPlanGenerator.ts`, `weeklyIngredientRepetition.test.ts`, `archetypePresentation.ts` wired into Daily/Weekly/Print/IngredientManager displays; `eddc272/40fcce4/356d300/1b89af4` |
| 5 — Meal Variety UX (`099ef2e`) | Coach toggle, draft record, payload key, athlete badge | **complete — committed, CI green** (historical report) | `MealVarietyPreference`, optimizer threading, `draftMealVariety`, `plan_payload.mealVariety`, ToggleGroup UI + draft banner, `/my-plan` badge, 17 tests. **Remaining:** seeded-backend round-trip (P0-1). |

## Platform track (history)

Check-ins/alerts/messaging, review workflow 13A–13F, training plans, shared
links, DST lock fix — all **complete as features** (reported; quality varies —
see CURRENT_STATE §6 for the dev-stub + Sentry findings).

## P0 — Establish a trustworthy baseline

P0-1 · Verify meal-variety round-trip on a seeded non-production backend
(identify or establish the env first — do not assume one exists). Rationale:
the cycle's feature is proven only in jsdom. Depends on: seeded env +
credentials. Done when: coach lock with each preference → `/my-plan` badge
present/absent; legacy payload shows no badge. Verify by: read-back against the
seeded backend; record env + commit.

P0-2 · Address the misleading adherence surface. Rationale: truthful metrics is
a product principle. Code-only, no dependency. Done when: `IS_DEV` refusal kept;
stubs replaced with defined real-source computation or removed/labelled; a test
pins prod-null behavior. Verify by: unit test + code review (no backend mutation).
**Status 2026-10-19 — complete.** Canonical adherence metrics now live in
`src/domain/coaching/adherenceMetrics.ts` (pure) +
`src/services/checkin/adherenceMetricsService.ts` (I/O), reading the real
`daily_checkins.meal_adherence` and `weekly_reviews.adherence_score` columns
with daily-over-weekly precedence per ISO week. Missing data is never fabricated
— the score is `null` and the UI renders `—`, not `0%`. Reachable surface
`ClientCheckinDashboard` (coach `/clients/:clientId/checkin` and athlete
`/checkin`) consumes it, showing score + coverage separately. The dev-only stub
exports (`getAdherenceTrend`, `getProgressTrajectory`, `generateWeeklySummary`)
in `src/services/checkin/coachingIntelligenceService.ts` had no production
consumer (verified by tracing all imports/routes) and were removed, along with
their test file and the now-dead `generateWeeklySummary` dependency in the
orphaned `ClientDetailView`. Pinned by 20 domain unit tests plus component-level
null-handling tests. **Remaining limitation:** no live browser verification
performed (would require overriding `.env` to the local Supabase stack, seeding
the local DB, and an auth flow — not done to avoid any risk of touching hosted
data). Reachable-route and metric-behavior coverage is via unit/integration
tests only.

P0-3 · Resolve Sentry: provision a real DSN via deployment-env config OR remove
the SDK. Rationale: zero prod visibility today. Depends on: deployment-env
access. Done when: errors reach a real project, or SDK removed and boot warning
gone. Verify by: dashboard delivery check (non-prod event) or clean boot.

P0-4 · Regression coverage for generation → review → lock → athlete-view.
Rationale: structural blind spot (no E2E covers it). Depends on: P0-1 seeded
env. Done when: seeded E2E incl. variety toggle green in CI. Verify by: CI record.

## P1 — Improve athlete execution and data quality

P1-1 · Smallest valuable athlete-side workflow (candidates: meal completion /
feedback / safe substitution — decide after capability + impact review).
Rationale: athlete side is read-only; first genuine athlete value. Depends on:
P0-1–P0-4. Done when: one shipped workflow with defined metric + source data.
Discovery-gated if scope unclear.

P1-2 · Explicit definitions + reliable sources for any new adherence/progress
metric. Rationale: never repeat the stub pattern. Depends on: P0-2. Done when:
every displayed metric cites source table + formula.

## P2 — Validate the differentiation hypothesis (discovery-gated)

P2-1 · Small discovery study with 3–5 coaches/athletes. Rationale: no
performance claim without evidence. No dependency. Done when: interview notes +
falsifiable problem statement recorded.

P2-2 · ONE narrow testable training↔nutrition connection (prototype behind a
flag): required inputs, expected athlete outcome, safety constraints, and
success metric defined BEFORE implementation. Rationale: de-risks the pillar.
Depends on: P2-1. Done when: prototype + pre-registered metric evaluated.
Do not build a broad engine without evidence.

## P3 — Prepare for independent coaches (model first)

P3-1 · Tenancy model investigation: org/workspace entity, coach ownership, data
isolation, onboarding, ops requirements. Rationale: isolation is a prerequisite,
not cosmetic. Done when: written model + migration sketch pass design review.

P3-2 · Billing / large workspace refactor — explicitly deferred until the P3-1
model is accepted. Do not implement before the tenancy model is understood.

No item is marked complete without evidence. No dates are committed.

## Archive note

`docs/archive/*` (AUDIT_AND_ROADMAP, ROOT_CAUSE_ANALYSIS, sprint reports) describe
superseded states and are historical. `docs/recipe-phase2-plan.md` remains the
authoritative recipe-track plan.
