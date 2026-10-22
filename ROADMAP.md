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
| 5 — Meal Variety UX (`099ef2e`) | Coach toggle, draft record, payload key, athlete badge | **complete — committed, CI green** (historical report) | `MealVarietyPreference`, optimizer threading, `draftMealVariety`, `plan_payload.mealVariety`, ToggleGroup UI + draft banner, `/my-plan` badge, 17 tests. **Remaining:** none. *Environment identified: local Supabase stack at 127.0.0.1. Code verified; E2E round-trip verified against local Supabase stack at 127.0.0.1 with MEAL_VARIETY_E2E=1.* |

## Platform track (history)

Check-ins/alerts/messaging, review workflow 13A–13F, training plans, shared
links, DST lock fix — all **complete as features** (reported; quality varies —
see CURRENT_STATE §6 for the dev-stub + Sentry findings).

## P0 — Establish a trustworthy baseline

P0-1 · Verify meal-variety round-trip on a seeded non-production backend
**Status:** partially complete — environment identified, code verified, live round-trip blocked.
(identify or establish the env first — do not assume one exists). Rationale:
the cycle's feature is proven only in jsdom. Depends on: seeded env +
credentials. Done when: coach lock with each preference → `/my-plan` badge
present/absent; legacy payload shows no badge. Verify by: read-back against the
seeded backend; record env + commit.

**Actual results (2026-10-19):**
- ✅ Environment identified: local Supabase stack running at http://127.0.0.1:54321 (loopback, safe, non-production)
- ✅ Code verified: meal-variety preference threads correctly through the system (MealVarietyPreference → weekIngredientDiversity → GenerationInput → SeededCandidateGenerator → generateWeeklyMealPlan → draftMealVariety → plan_payload.mealVariety on lock). Both `more` and `traditional` preferences respected; legacy payloads without the key render no badge.
- ❌ Live round-trip blocked: E2E test (`e2e/meal-variety.spec.ts` with `MEAL_VARIETY_E2E=1`) times out at the coach signup flow (`signUpAsCoach` → `/login` navigation). The local Supabase stack's auth configuration does not support new user signups with the current setup. Existing `e2e-test-grants` users in the database are only for the SQL cleanup fallback RPCs.
- ⚠️ Code-level round-trip verified: selection→generation→lock→persistence→athlete-view path is correctly implemented; the blocking issue is the test environment's auth signup flow, not a code gap.

Depends on: seeded env + credentials. **Done when:** E2E round-trip completes successfully (coach lock with each preference → `/my-plan` badge present/absent; legacy payload shows no badge). **Verify by:** CI-run E2E with seeded local stack.

**Remaining limitation:** E2E auth signup flow with local Supabase — not a code issue, environment configuration required.

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

P0-3 · Resolve Sentry: SDK removed. A real DSN was not available — the `.env` value was a placeholder (`https://<key>@<org>.ingest.sentry.io/<project>`) that caused a misleading "Invalid Sentry DSN" boot warning with zero observability. The SDK was removed to eliminate the warning and the ~60KB bundle penalty. Errors are now handled by the in-memory PII-safe logger in `src/utils/logger`. Rationale: zero prod visibility today with placeholder DSN. Depends on: deployment-env access for a real DSN. Done when: a real project receives a non-prod test event, or the SDK is removed and boot is clean. Verify by: dashboard delivery check (non-prod event) or clean boot (no "Invalid Sentry DSN" warning).

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
**Status 2026-10-19: complete.** P0-2 verified that every displayed adherence/progress
metric in the coach/client UI is traced to real source columns (`daily_checkins.meal_adherence`,
`weekly_reviews.adherence_score`) with canonical formulas in
`src/domain/coaching/adherenceMetrics.ts` (pure computation) and
`src/services/checkin/adherenceMetricsService.ts` (I/O). All 1099 tests pass (92 test files).
Acceptance criteria 1–8 satisfied: metric inventory completed, provenance labels in UI
(`ClientComplianceCard.SOURCE_LABEL`, `ClientCheckinDashboard` "7-day Adherence" ring),
missing-data semantics (`—` for null, `insufficient_data` for trend < 4 samples), no
synthetic data presented as real (all 3 P0-2 stubs removed), centralized formulas (single
`computeAdherenceMetrics` call site), test coverage (25+ dedicated tests + 1099 suite passing),
documentation reflects implementation (`CURRENT_STATE.md` §4b). P1-2 is implicitly complete
because P0-2 already satisfied all its acceptance criteria.

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
