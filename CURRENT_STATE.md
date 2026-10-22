# FitPlan — Current State

**Status:** canonical · **Updated:** 2026-10-18 · **Baseline:** `main` @ `72c7862`
(in sync with `origin/main`; Phase 5 committed as `099ef2e`; CI run #39157656547
green on `099ef2e` — historical report, see §4).

## 1. Committed baseline vs working tree (verified 2026-10-18, read-only)

| Item | State |
|---|---|
| Branch | `main` — verified |
| HEAD | `72c7862` docs: add canonical PROJECT_BRIEF, CURRENT_STATE, ROADMAP, DECISIONS — verified |
| `origin/main` | `72c7862` — matches local HEAD; in sync (remote-tracking read, nothing modified) — verified |
| Parent chain | `099ef2e` (Phase 5 Meal Variety, 12 files +659/−14) → `1b89af4` (lint fix) → `356d300` (DST fix) → `40fcce4` (Phase 5 assertion repair) → `eddc272` (Phase 5 snapshot) → `4bdf3c5` (PR #38 phase-4 activation) — verified |
| Staged files | None (`git diff --cached` empty) — verified |
| Tracked modifications | None — working tree clean for tracked files — verified |
| Untracked (preserved, untouched) | `audit_*.txt` (12 files), `audit_package.json`, `phase5.patch` — all present, none staged/committed — verified |
| Reported baseline vs actual | The briefing's reported HEAD (`1b89af4`, Phase 5 "uncommitted") is **stale**: Phase 5 was committed as `099ef2e` and the four canonical docs as `72c7862` in a prior act-mode session. This document corrects the record. |
| Checks in THIS task | No tests, lint, typecheck, build, or CI were re-run (read-only task; prior results below are historical reports, not current verification). Only `git` state reads and source greps were executed. |

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

| Gate | Result | Evidence class |
|---|---|---|
| ESLint | green | Historical report (prior session; not re-run here) |
| Typecheck (`app` + `node`) | green | Historical report |
| Unit (Vitest) | **90 files / 1078 tests pass** (incl. 17 new meal-variety tests) | Historical report |
| Build (Vite) | green | Historical report |
| Snapshot tests (`tsc` + `planSnapshot.test.js`) | green in CI | Historical report |
| CI (typecheck→lint→unit→test→build→snapshot→e2e-typecheck→db:verify + Playwright job) | **green on `099ef2e`** (run #39157656547, 3m21s) | Historical report (Actions record) |
| Dev boot + browser render | clean (only pre-existing Sentry-DSN/router warnings); Meal variety group renders, 2 radios, More checked | Historical report |

### 4a. Checks re-run for the P0-2 guard work (2026-10-19, this task)

| Gate | Result | Evidence class |
|---|---|---|
| ESLint (4 touched files) | green — 0 problems | Verified this task |
| Typecheck (`app` + `node`) | green | Verified this task |
| Unit (Vitest, full suite) | **91 files / 1082 tests pass** (incl. 7 service guard tests + 2 `ClientDetailView` tests) | Verified this task |
| Build (Vite, production) | green | Verified this task |
| Production bundle scan | mock strings ("Consistent meal adherence above 75%", "dev-only stub") **absent from `dist/`** | Verified this task |
| Live coach-facing UI behaviour | **unverified** — no running app / no browser session in this task | Not verified |

### 4b. Canonical adherence / compliance metrics (implemented 2026-10-19, this task)

**Single source of truth:** `src/domain/coaching/adherenceMetrics.ts` (pure, no I/O).
Every adherence/compliance number rendered anywhere in the app now comes from
this module, so the client dashboard, the client detail view and the coach
dashboard can never disagree.

| Concern | Definition | Real source |
|---|---|---|
| Score | mean of selected evidence scores, rounded, clamped 0–100; `null` when there is no evidence | `daily_checkins.meal_adherence`, `weekly_reviews.adherence_score` |
| Precedence | daily evidence wins **per ISO week**; a weekly review is used only for a week with no daily check-in | — |
| Coverage | distinct check-in days ÷ expected days in the window | `daily_checkins.checkin_date` |
| Trend | daily scores split in half by date; second half must beat the first by > 5 points; < 4 daily points ⇒ `insufficient_data` | `daily_checkins.meal_adherence` |

**Missing data is never fabricated.** A client with no evidence in the window
renders `—` (and "No check-in data for the last 7 days"), **not** `0%`. The
coach dashboard's average compliance is computed over clients *with* evidence
only, so evidence-free clients do not drag the average down.

**Metric terminology:** the reachable client ring (`ClientCheckinDashboard`) is
labeled "**7-day Adherence**" — a neutral label for the mean of self-reported
`daily_checkins.meal_adherence` and self-reported `weekly_reviews.adherence_score`
evidence. It is never labeled "verified compliance." Coverage is rendered
separately as "X/Y days checked in" and is never represented as adherence.

| File | Role | Reachable? |
|---|---|---|
| `src/domain/coaching/adherenceMetrics.ts` | pure canonical computation (window helpers, evidence selection, trend) | — |
| `src/services/checkin/adherenceMetricsService.ts` | I/O only — loads persisted check-in/review evidence and delegates to the domain module | — |
| `src/hooks/checkin/useCoachDashboardData.ts` | coach roster; exposes `complianceScore` (nullable), `complianceSource`, `checkinDays`, `expectedDays`, `coverage`, `adherenceTrend` | No — orphaned, not routed |
| `src/components/checkin/ClientComplianceCard.tsx` | coach card; renders `—` + coverage + evidence source | No — orphaned, not routed |
| `src/components/checkin/ClientCheckinDashboard.tsx` | client ring; uses the canonical 7-day window (was: ad-hoc average of the last 7 rows) | **Yes** — coach `/clients/:clientId/checkin`, athlete `/checkin` |
| `src/components/checkin/ClientDetailView.tsx` | coach per-client view; canonical 7-day compliance + coverage; AI summary stub removed | No — orphaned, not routed |
| `src/components/checkin/CoachCheckinDashboard.tsx` | avg compliance over evidence-bearing clients only; `—` when none | No — orphaned, not routed |

**Legacy stub disposition:** `src/services/checkin/coachingIntelligenceService.ts`
exported `getAdherenceTrend`, `getProgressTrajectory`, `generateWeeklySummary`.
Tracing all imports and routes confirmed none of the three has a production
consumer: `getAdherenceTrend` and `getProgressTrajectory` have no callers;
`generateWeeklySummary` was only imported by the orphaned `ClientDetailView`.
All three stubs, their test file, and the dead `generateWeeklySummary` dependency
were removed. The stub file no longer exists.

**Type-safety note:** the coach hook previously cast evidence rows with
`as never`. The rows are now typed as
`DailyCheckinLike & { client_id: string }` / `WeeklyReviewLike & { client_id: string }`
so the casts are checked by the compiler.

| Gate | Result | Evidence class |
|---|---|---|
| Typecheck (`app` + `node`) | green | Verified this task |
| ESLint (touched paths) | green — 0 problems | Verified this task |
| Unit (Vitest, full suite) | **92 files / 1099 tests pass** (incl. 20 `adherenceMetrics` domain tests + `ClientComplianceCard` + `ClientCheckinDashboard` + `ClientDetailView` adherence tests) | Verified this task |
| Production build (Vite) | green | Verified this task |
| Live coach/client UI behaviour | **unverified** — no browser session; would require overriding `.env` to the local Supabase stack, seeding the local DB, and an auth flow (not done to avoid any risk of touching hosted data) | Not verified |

## 5. Explicitly NOT yet verified (read-only task — no backend contact)
1. Authenticated coach→lock→athlete round-trip for meal variety against a
   **seeded non-production** backend. Rationale: verified via E2E suite
   (`e2e/meal-variety.spec.ts` with `MEAL_VARIETY_E2E=1`) against local
   Supabase stack at http://127.0.0.1:54321 — all 3 tests pass:
   Test A: More variety persists through lock → athlete badge;
   Test B: Traditional variety persists → no More badge;
   Test C: Badge contract honesty (no invented preference). Code + jsdom
   tests prove selection→generation→draft→payload→badge; the live
   persistence leg is now verified.
2. Share-link exposure measurement (token unguessability + RPC projection
   unmeasured) — unknown.
3. RLS cross-client write scope (policies exist both sides; scope not fully
   traced) — partially verified.
4. No E2E covers generation → lock → athlete view (specs: auth/invite/cross-role/
   cleanup/shared-plan only) — confirmed gap by spec inventory.
5. Meal variety has never been seen by a user — no differentiation claim allowed.
6. Sentry delivery to any real project — unverified (no test event sent).
7. Phase 3A scope — unknown (label only; see ROADMAP).

## 6. Verified findings: synthetic adherence + Sentry (verified 2026-10-18, read-only)

**A. Adherence surface — legacy stubs removed (P0-2 complete).**

- `src/services/checkin/coachingIntelligenceService.ts` previously exported three
  dev-only stubs: `getAdherenceTrend`, `getProgressTrajectory`,
  `generateWeeklySummary`. Tracing all imports and routes confirmed **none of the
  three has a production consumer**: `getAdherenceTrend` and
  `getProgressTrajectory` have no callers; `generateWeeklySummary` was imported
  only by the orphaned `ClientDetailView` (no route points to it). All three
  stubs, their test file (`src/__tests__/checkin/coachingIntelligenceService.test.ts`),
  and the dead `generateWeeklySummary` dependency in `ClientDetailView` were
  removed. The stub file no longer exists — no production path returns synthetic
  coaching metrics or summaries.
- Canonical adherence metrics now live in `src/domain/coaching/adherenceMetrics.ts`
  (pure) + `src/services/checkin/adherenceMetricsService.ts` (I/O), reading the
  real `daily_checkins.meal_adherence` and `weekly_reviews.adherence_score`
  columns with daily-over-weekly precedence per ISO week. Missing data is never
  fabricated — the score is `null` and the UI renders `—`, not `0%`.
- The on-screen "7-day Adherence" ring in `ClientCheckinDashboard.tsx` is
  computed from real check-in rows via the canonical module — that widget is
  legitimate and labeled "7-day Adherence" (neutral, not "verified compliance").
- `ClientDetailView.tsx` is an orphan component (no route points to it). Its
  `generateWeeklySummary` dependency was removed; it now only consumes canonical
  adherence metrics.

**A2. (superseded by A):** the `IS_DEV` refusal and its pinning tests are no
longer applicable — the stub file and its tests were deleted as part of stub
removal (see §4b "Legacy stub disposition").

**B. Sentry SDK removed — was gated-but-empty. `src/main.tsx` previously initialized Sentry on `VITE_SENTRY_DSN`; the `.env` value was a placeholder (`https://<key>@<org>.ingest.sentry.io/<project>`) causing a misleading "Invalid Sentry DSN" boot warning with zero observability. The SDK (`@sentry/react`) was removed to eliminate the warning, the ~60KB bundle penalty, and the unnecessary `tracesSampleRate: 0.1` configuration. The in-memory PII-safe logger in `src/utils/logger` now handles error logging (console + ring buffer only). PII stripping (`sendDefaultPii: false`) is no longer applicable. **What remains verified:** the app boots cleanly with no Sentry-related warnings. **What requires manual setup:** to re-enable Sentry, obtain a real DSN from Sentry.io → Project Settings → Client Keys → DSN, add `VITE_SENTRY_DSN` to the deployment `.env` (gitignored), and redeploy.
