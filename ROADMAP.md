# FitPlan — Roadmap

**Status:** canonical · **Updated:** 2026-10-18 · **Baseline:** `main` @ `099ef2e`

Status vocabulary: **complete** · **partially complete** · **incomplete** ·
**superseded** · **unknown**. Sources: `docs/recipe-phase2-plan.md` (authoritative,
baseline `36cdb39`), `docs/optimization-engine.md`, phase-labelled test suites,
commits `0fe58eb` → `099ef2e`, PRs #35–#38.

## Recipe & generation track

| Phase | Intended outcome | Status | Evidence / remaining |
|---|---|---|---|
| 1 — Eligibility & safety | Allergen/diet-correct generation funnel | **complete** | `0fe58eb`, `36cdb39`, `eligibility.test.ts`, wiring test |
| 2 — Ingredient library 47→95–110 | Realistic pool for archetypes | **complete** | `e9b1a07`; ~100-item library corroborated by `archetypes.test.ts` "real 100-item library" suites |
| 3A | No documented commitment found; label appears only as "Phase 5 3A" comment prefix in `weeklyPlanGenerator.ts` / `CandidateGenerator.ts` | **unknown** | Ask author what "3A" denoted, or treat as working label for the diversity switch |
| 3B — Archetype catalogue | Slot/role menu of archetypes | **complete** | `archetypes.ts`, 6 suites incl. vegan honesty + satisfiability |
| 3C — Archetype selection | Deterministic, eligibility-safe selection | **complete** | `archetypeSelection.ts`, 8 suites (legacy regression, slot/diet safety, roles, determinism, nutrition authority, scoring) |
| 4 — Controlled activation | One-switch rollout w/ legacy fallback | **complete** | `activation.ts`, `7fa490e`, 6 activation suites, PR #38 |
| 5 — Weekly repetition + presentation | Cross-day diversity + archetype titles in weekly plans | **complete** | `weeklyPlanGenerator.ts`, `weeklyIngredientRepetition.test.ts`, `archetypePresentation.ts` wired into Daily/Weekly/Print/IngredientManager displays; `eddc272/40fcce4/356d300/1b89af4` |
| 5 — Meal Variety UX (`099ef2e`) | Coach toggle, draft record, payload key, athlete badge | **complete (committed, CI green)** | `MealVarietyPreference`, optimizer threading, `draftMealVariety`, `plan_payload.mealVariety`, ToggleGroup UI + draft banner, `/my-plan` badge, 17 tests |

## Platform track

Check-ins/alerts/messaging, review workflow 13A–13F, training plans, shared
links, DST lock fix — all **complete** as features (quality varies; synthetic
adherence and placeholder Sentry DSN are open issues — see CURRENT_STATE §6).

## Next (ranked by value × confidence ÷ effort)

1. **Seeded-backend verification of the Phase 5 round-trip** — coach lock with
   each preference → read back `/my-plan` (badge present/absent); legacy payload
   shows no badge. Hours. Unblocks all claims.
2. **Honest-data fixes** — real Sentry DSN or remove; provisional-label (or
   checkin-computed) adherence. Days.
3. **Seeded E2E for generation→lock→athlete view** incl. the variety toggle. Days.
4. **Athlete plan interactivity v1** — check-off / swap-within-eligibility on
   `/my-plan` (read-only today). 1–2 weeks. Depends on 1–3.
5. **Discovery spike: performance-aware nutrition** — prototype one coupling
   (session load → next-day targets) behind a flag; interview 3–5 coaches/athletes
   first. 1-week spike. **Do not build before validation.**

## Archive note

`docs/archive/*` (AUDIT_AND_ROADMAP, ROOT_CAUSE_ANALYSIS, sprint reports) describe
superseded states and are historical. `docs/recipe-phase2-plan.md` remains the
authoritative recipe-track plan.
