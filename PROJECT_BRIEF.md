# FitPlan — Project Brief

**Status:** canonical · **Updated:** 2026-10-18 · **Baseline commit:** `099ef2e`

## 1. What FitPlan is

FitPlan is a **coach-operated nutrition + training platform with an athlete portal**.
Coaches onboard clients, generate deterministic weekly meal plans through an
optimizer, review and lock them under a 7-day atomic lock, and assign training
plans. Athletes consume their plans, log training sessions, submit check-ins,
and read coach messages.

## 2. Who it serves

- **Coaches** — the working surface: client management, ingredient restrictions,
  weekly/daily plan generation, draft review → lock, training assignment,
  check-in review, alerts, and plan sharing.
- **Athletes (`role=client`)** — primarily consumption + logging: view weekly/daily
  plans, grocery lists, training execution logs, check-in forms, progress charts,
  alerts inbox. Athletes cannot regenerate or edit plans (coach-only by design).

## 3. Business direction (aspirational — not yet built)

The owner direction names a hybrid coaching/business model: independent coaches
running their own businesses on FitPlan, competition-readiness support, and
performance-aware nutrition. **None of this is implemented**: there is no billing
or subscription code, no organization/workspace model (the current model is
coach-owns-clients), no competition concepts (event date, weight class, travel,
taper) in schema or domain, and no training↔nutrition coupling
(`SessionExecutionForm` has zero macro/calorie/nutrition references).

## 4. Technical identity

- **Stack:** React + Vite + TypeScript + Tailwind/shadcn, Supabase (Postgres + Auth
  + Edge Functions), Vitest + Playwright, GitHub Actions CI.
- **Core subsystem:** the recipe engine —
  `resolveEligibleIngredients` → archetype selection → seeded generation → weekly
  repetition control → seeded candidate optimizer → atomic lock (`lock_nutrition_plan`
  RPC). Hard safety contracts: eligibility is always authoritative upstream, the
  canonical macro engine stays authoritative downstream, and every opt-in
  generation path keeps a byte-identical legacy fallback.
- **Persistence convention:** additive optional keys inside the `plan_payload`
  JSONB document — no migration required for new recorded preferences.

## 5. Non-goals (current)

- No athlete-side plan editing or regeneration.
- No billing, subscriptions, or multi-tenant org isolation.
- No load-aware fueling or competition-prep modeling (discovery-gated).
- No differentiation claims without user evidence (see §6).

## 6. Honesty constraints (binding)

1. Never present synthetic or seeded numbers as measured data.
2. Never describe meal variety (or any feature) as a competitive advantage until
   a user has seen and validated it.
3. Legacy payloads without a recorded preference must never be labelled with one.
4. Every product claim in derived docs cites a code path or is labelled hypothesis.
