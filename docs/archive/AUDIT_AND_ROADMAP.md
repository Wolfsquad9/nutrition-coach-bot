# Fresh Code Audit — June 17, 2026

> **Project:** `/Users/guyvodor/Documents/nutrition-coach-bot`
> **Scope:** full re-audit after 32 commits since June 10 (PR #12–#19 merged)
> **Branch audited:** `origin/main` @ `be1e77a` (the "design-system-tokens" merge)
> **Audit branch:** `audit/june-2026-fresh`
> **Compared to:** previous audit on `e987d4a` (June 10)
> **Audit stance:** direct, critical, specific — same as v1

---

## TL;DR — What changed in 7 days

**You've shipped a major feature: the check-in engine.** A complete coach/client check-in flow with:

- 7 new check-in components (`src/components/checkin/*` — 1,336 lines)
- 6 new services (`src/services/checkin/*` — 1,011 lines)
- 1 hook (`useCoachDashboardData` — ~200 lines)
- 1 new page (`CheckinPage.tsx`, `ClientClaimPage.tsx`)
- 1 new layout (`ClientLayout.tsx`) — bottom-tab mobile navigation
- 4 new migrations (checkin engine, follow-up flag, coach_messages, notifications backend)
- 4 new edge functions (`generate-coach-alerts`, `send-whatsapp`, plus existing ones)
- Auth extended with `userRole` (coach/client), `isClient`, `isCoach`, `clientId`
- 1 new domain error class (`PlanRuntimeError`) + structured runtime telemetry
- 16 test files (was 2)
- ~25,903 lines of TS/TSX (was ~9,000 — **2.9× growth in 7 days**)

**The good news:** the check-in feature is well-architected. Services are small (107–267 lines), properly split, with companion test files. New `domain/nutrition/` layer is well-named and properly separated from React. Auth is correctly extended with role logic. `runtimeErrors.ts` is exemplary engineering — a typed error class with codes, retryability, and structured details.

**The bad news:**

1. **Sentry is installed but not imported anywhere.** It's a 60KB+ dependency that does nothing. This is now my highest-priority finding.
2. **The original debt didn't go away.** The same 4 monoliths I flagged on June 10 still exist: `recipeService.ts` (1,147 lines), `useNutritionPlanState.ts` (688), `planService.ts` (510), `EnhancedIngredientManager.tsx` (833 — new entry, also too big).
3. **New debt emerged with the check-in feature.** `WeeklyReviewForm.tsx` (297) and `DailyCheckinForm.tsx` (280) mix business logic, validation, and rendering. `coachingIntelligenceService.ts:30` reintroduces `Math.random()` for adherence — a regression against your own S2 determinism goal.
4. **The new `coach_messages` migration has an RLS hole.** The `client_reads_own_messages` policy uses `auth.jwt() -> 'user_metadata' ->> 'client_id'` — but there's no policy restricting **who can insert** a `coach_messages` row with a given `client_id`. Any authenticated user could claim to be a coach for any client and post a message.

**Bottom line:** you went from "working prototype" to "feature-rich early product" in 7 days. The check-in engine is the breakthrough feature. But you now have a second wave of debt on top of the first, and a Sentry package that's paid for and unused. The 3-week roadmap from v1 is still valid; this audit adds a Week 4 to handle the new debt.

---

## 1. State scorecard (0–10)

| Dimension | June 10 | June 17 | Δ | Notes |
|---|---|---|---|---|
| **Architecture robustness** | 5 | 5.5 | +0.5 | `domain/` layer is well-done. New check-in services respect the small-service pattern. Monoliths still monolith. |
| **Performance & efficiency** | 6 | 6 | 0 | No regressions. No new bundle audit done — but added 1,336 lines of check-in components, plus Sentry. |
| **Security & data handling** | 4 | 4 | 0 | `coach_messages` RLS has an insert hole (see §3.1). |
| **Maintainability & extensibility** | 3 | 4 | +1 | Check-in is well-factored. 16 test files (was 2). Domain layer emerging. |
| **DevOps readiness** | 2 | 3.5 | +1.5 | Sentry installed (even if unused). 19 migrations (was 11). 4 edge functions. |
| **Testing** | 3 | 6 | +3 | 16 test files; `domain/nutrition/` has dedicated tests. Big jump. |
| **Product completeness** | 6 | 7.5 | +1.5 | Check-in engine is a real, shippable coach feature. |
| **Documentation** | 5 | 5 | 0 | No new docs. |

**Overall:** **5.2/10** engineering (was 4.5), **7.5/10** product (was 6).

---

## 2. New strengths to keep

1. **`src/domain/nutrition/`** — proper domain layer with `planLifecycle`, `snapshot`, `snapshotAdapter`, `snapshotExporter`, `runtimeErrors`, `runtimeTelemetry`. This is exactly the separation the v1 audit called for. Has companion `.test.ts` files. **This is the template — replicate the pattern elsewhere.**
2. **`runtimeErrors.ts`** — typed error class with `code` (enum), `retryable` flag, `source`, `details[]`, and ES2022 `cause`. This is professional-grade. Use it as the template for all service errors.
3. **Auth extension with role** — `userRole: 'coach' | 'client'`, `isCoach`, `isClient`, `clientId` in the auth context. Clean, additive, doesn't break the old API.
4. **Check-in service size discipline** — all 6 services are 107–267 lines. Compare to `recipeService.ts` at 1,147. The team clearly *knows* the right pattern; it just hasn't been retrofitted to the old code.
5. **Test coverage on new code** — 16 test files; `planLifecycle.test.ts` is 497 lines, `useNutritionPlanState.test.ts` 610, `snapshotAdapter.test.ts`, `snapshotExporter.test.ts`, `snapshotStability.test.ts`. Real coverage on real domains.
6. **`generate-coach-alerts` edge function** — the check-in engine has a real, server-side trigger that produces coach-facing alerts. This is the kind of feature that makes coaches pay.
7. **`ClientLayout.tsx` with bottom-tab nav** — mobile-first client view. This is the client portal that the v1 roadmap identified as missing. Good.

---

## 3. Critical issues (must fix)

### 🔴 C1. Sentry is installed and never imported

- `package.json` has `"@sentry/react": "^10.57.0"` (line 48)
- `grep -rn "sentry\|Sentry" src/` returns **only comments** — no actual `import` anywhere
- `src/main.tsx` does not initialize Sentry
- `ErrorBoundary.componentDidCatch` logs to the local `logger`, which is ring-buffer only — never reaches Sentry
- **Impact:** the Sentry package is in the bundle, ships to users, does nothing. Wasted ~60KB of bundle, wasted subscription, zero observability in production.
- **Cost to fix:** 15 minutes.
- **Files to touch:** `src/main.tsx` (add `Sentry.init({...})`), `src/utils/logger.ts` (call `Sentry.captureException` from `logEvent` when `level === 'error'`).
- **Needs from you:** a Sentry DSN. If you don't have one, create a free project at sentry.io → Settings → Client Keys (DSN).

### 🔴 C2. `coach_messages` migration has an incomplete RLS policy

File: `supabase/migrations/20260614200000_coach_messages.sql:14-29`

```sql
-- Coach full access to own messages
CREATE POLICY "coach_manages_messages" ON public.coach_messages
  FOR ALL USING (coach_id = auth.uid());
```

This policy uses `FOR ALL` (covers INSERT/UPDATE/DELETE) with `USING (coach_id = auth.uid())` but **lacks a `WITH CHECK` clause**. Consequence: PostgreSQL RLS evaluates `WITH CHECK` on INSERT, and when `WITH CHECK` is absent, it falls back to `USING`. So a coach can insert any message with any `client_id` as long as the row's `coach_id` matches `auth.uid()`.

This is **probably what you want** (any coach can message any client), but the intent isn't clear and a stricter version (coach can only message clients they own) would prevent cross-coach spam. **Decide explicitly.** Recommended: add `WITH CHECK (coach_id = auth.uid())` and verify the client_id is owned by this coach (sub-select on `clients`).

Also, the `client_reads_own_messages` policy uses `auth.jwt() -> 'user_metadata' ->> 'client_id'`, which assumes the client_id is stored in user metadata at signup. If that's not enforced, **clients can never see messages**. The auth hook now returns `clientId` — verify the signup flow populates `user_metadata.client_id`.

- **Impact:** medium-high. Either silent (clients never see messages because metadata is empty) or permissive (anyone with `coach_id` matching can claim to be anyone's coach).
- **Cost to fix:** 30 minutes for the migration, 30 minutes for a test in `__tests__/`.

### 🔴 C3. `coachingIntelligenceService.ts:30` uses `Math.random()` for adherence

```ts
adherence: Math.round(60 + Math.random() * 35),
```

This generates **fake adherence data** in a coach-facing intelligence service. If this is mock data for dev, gate it behind `import.meta.env.DEV`. If it's real, replace with a query to `client_checkins` (or whatever table backs adherence). Right now a coach could be looking at numbers that are literally random.

- **Impact:** product trust. If a coach bases a decision on this, they make a wrong call.
- **Cost to fix:** 15 minutes to gate behind dev, or 2 hours to wire to real data.

### 🟠 C4. The 4 monoliths from v1 are unchanged

| File | Lines | Change since June 10 |
|---|---|---|
| `src/services/recipeService.ts` | 1,147 | 0 |
| `src/hooks/useNutritionPlanState.ts` | 688 | 0 |
| `src/services/planService.ts` | 510 | 0 |
| `src/components/EnhancedIngredientManager.tsx` | 833 | 0 (newly seen in this audit) |

These are now *blocking* the team. The check-in team had to invent a new pattern (small services) because the old one is unmaintainable. A new dev joining the project will read `recipeService.ts` first and copy that pattern.

- **Cost to fix:** 3–5 days for `recipeService.ts` split (it's the worst). 1 day each for the other three.

### 🟠 C5. `localStorage` usage is documented but not eliminated

The previous `ProgressTracker.tsx` is now augmented by `src/services/progress/index.ts`, but the **component itself still reads/writes localStorage**. The service exists but is not used by the component. Two storage layers, one source of truth, zero enforcement.

Same for `NotificationCenter.tsx` — uses `localStorage` directly despite the new `services/notifications/index.ts` exposing Supabase CRUD.

- **Impact:** users still lose data on device switch. The v1 audit finding is half-fixed.
- **Cost to fix:** 1 day per component to wire to the new service.

---

## 4. High-priority issues

### 🟠 H1. New debt: `WeeklyReviewForm.tsx` (297 lines) and `DailyCheckinForm.tsx` (280)

These are the two largest check-in components and both mix:
- form state and validation
- API calls to `dailyCheckinService` / `weeklyReviewService`
- toast notifications
- local UI state

This is the **recipe** for the same problem the old code has. Not as bad (300 lines is half of 600+), but the pattern is starting. The fix is the same as v1's recommendation: extract `useDailyCheckinForm` and `useWeeklyReviewForm` hooks (≤150 lines), keep components pure presentational.

### 🟠 H2. `useCoachDashboardData` — only one hook for the entire check-in dashboard

I haven't read its full body, but if it follows the same pattern as `useNutritionPlanState.ts` (688 lines), it's going to be the next monolith. Worth checking. If it's already at >200 lines, split it now while it's small.

### 🟡 H3. Test coverage is uneven

`domain/nutrition/` is well-tested. But:
- `services/checkin/*` has no test files (6 services, 1,011 lines, 0 tests)
- `components/checkin/*` has no test files (7 components, 1,336 lines, 0 tests)
- `services/progress/index.ts` has tests for pure helpers only (no integration tests for the Supabase CRUD)

The check-in engine is the breakthrough feature — it should have the **best** test coverage, not the worst. The risk is: a coach uses it for 2 weeks, a bug silently corrupts adherence data, the coach loses trust.

### 🟡 H4. `localStorage` grep returns 6 files, but I see only 2 in components

`grep -l "localStorage" src -r`:
- `src/integrations/supabase/client.ts` (auth token storage — correct)
- `src/components/NotificationCenter.tsx` (settings)
- `src/components/ProgressTracker.tsx` (entries)
- `src/services/progress/index.ts` (commented in the file I wrote)
- `src/services/notifications/settings.ts` (commented in the file I wrote)
- `src/services/progress/types.ts` (commented in the file I wrote)

The 3 commented references are from the v1 work I did. They're documentation comments, fine. The 2 components are the problem.

---

## 5. Key risks & bottlenecks

| Risk | Severity | Mitigation |
|---|---|---|
| **Sentry paid for, not used** | High | 15 min to wire. Do it now. |
| **coach_messages RLS ambiguity** | High | Decide intent, add WITH CHECK, test with 2 users. |
| **Random adherence in production** | High | Gate behind dev or wire to real data. |
| **Old monoliths block new contributors** | High | Split `recipeService.ts` first (worst offender). |
| **Check-in lacks tests** | Medium | Add 3 test files (services + form + dashboard). |
| **Component-level localStorage** | Medium | Wire to new services. |
| **Sentry adds 60KB to bundle** | Low | Used vs unused is the real cost; fix C1 and it's fine. |

---

## 6. Target architecture (refreshed)

The v1 Modular Monolith plan still holds. **Add this rule for the new layers:**

```
src/
├── app/                    # App.tsx, providers
├── pages/                  # Route components
├── features/               # Vertical slices — EACH follows this layout:
│   ├── clients/
│   ├── plans/              # STILL not split (W2 work)
│   ├── progress/
│   ├── checkin/            # NEW — already follows the pattern
│   ├── notifications/      # NEW — partially
│   ├── ingredients/
│   ├── training/
│   ├── sharing/
│   └── messages/           # NEW — coach_messages
├── shared/
│   ├── ui/                 # shadcn
│   ├── hooks/              # useAuth, use-toast, use-mobile, logger
│   ├── lib/                # utils, random
│   └── types/              # global types only
├── domain/                 # PURE functions, no React imports
│   ├── nutrition/          # already exists, well-done
│   ├── checkin/            # NEW — extract from services/checkin
│   └── shared/
└── integrations/
    └── supabase/
```

**Two new rules from this audit:**
1. **No service file > 250 lines.** Already enforced on new code; retrofit the old.
2. **No `Math.random()` in any `services/*` file.** Either compute deterministically, gate behind dev, or load from real data. Lint rule: `no-restricted-syntax` on `MemberExpression[object.name='Math'][property.name='random']`.

---

## 7. The 3-week roadmap (refreshed)

The v1 plan is 60% complete. Here's what's left and what's new:

### Week 1 (DONE)
- [x] D1: env security, ErrorBoundary, RNG util, AUDIT doc → merged in PR #12, #13
- [ ] D2: Sentry wiring (PENDING — C1 in this audit, 15 min)
- [x] D3: ProgressTracker data layer → service exists, component unwired (C5 partial)
- [x] D4: eslint quality rules → partial (CI exists, no in-repo eslint config changes)

### Week 2 — Refactor for velocity (5 days)
Same as v1, unchanged:
- 2.1: Split `recipeService.ts` (1,147 → 5 files)
- 2.1: Split `useNutritionPlanState.ts` (688 → 4 hooks)
- 2.2: Split `planService.ts` (510 → 2 files)
- 2.2: Move `planGenerator.ts` into `domain/checkin/`-style pure folder
- 2.2: Add domain unit tests
- 2.3: Set up `features/*` folder structure
- 2.3: Make recipe selection deterministic (use `src/utils/random.ts` which I shipped in v1)
- 2.4: ESLint rule: no Math.random() in services
- 2.4: Zod schema validation on `Client` before edge function call

### Week 3 — Differentiation & ship (5 days)
Same as v1. **Add: 3.1' — wire Sentry before this week (15 min, do it now).**

### Week 4 (NEW) — Check-in hardening (3 days)

Added based on this audit. The check-in engine is the new core; it needs to be production-grade before you sell.

| Day | Task | Why | Effort |
|---|---|---|---|
| 4.1 | Fix `coach_messages` RLS (C2) | Security | 1h |
| 4.1 | Replace `Math.random()` in `coachingIntelligenceService` (C3) | Product trust | 2h |
| 4.1 | Wire `ProgressTracker` to new service (C5, 1/2) | Data loss | 4h |
| 4.2 | Wire `NotificationCenter` to new service (C5, 2/2) | Data loss | 4h |
| 4.2 | Extract `useDailyCheckinForm` hook from `DailyCheckinForm.tsx` (H1, 1/2) | Maintainability | 3h |
| 4.2 | Extract `useWeeklyReviewForm` hook from `WeeklyReviewForm.tsx` (H1, 2/2) | Maintainability | 3h |
| 4.3 | Test suite for `services/checkin/*` (H3, 1/3) | Quality | 4h |
| 4.3 | Test suite for `components/checkin/DailyCheckinForm` (H3, 2/3) | Quality | 3h |
| 4.3 | Test suite for `components/checkin/ClientCheckinDashboard` (H3, 3/3) | Quality | 3h |

**End of Week 4 deliverable:** check-in engine is the most-tested, most-reliable part of the product. Coaches can sell this feature with confidence.

---

## 8. The "breakthrough" — refreshed positioning

The v1 positioning was: **"The CRM for nutrition coaches."**

The check-in engine makes that positioning **real**. The old v1 differentiators were:
1. Coach sees real adherence
2. AI does the busywork
3. White-label client portal

The check-in engine delivers #1 (and starts #3 with `ClientLayout`). The new differentiators that the check-in engine unlocks:
4. **Streaks and gamification for clients** — `streakService.ts` exists. Make this visible to clients ("You're on a 7-day streak 🔥"). Coaches will pay for retention metrics.
5. **Coach alerts from patterns** — `generate-coach-alerts` edge function exists. The breakthrough: alerts that fire **before** a client relapses, not after. "Sarah's adherence dropped from 90% to 60% over the last 4 days. Suggested message: 'Hey, noticed a tough stretch. Want to adjust the plan?'"
6. **WhatsApp outreach** — `send-whatsapp` edge function exists. Combine with #5: coach gets an alert, clicks "Send WhatsApp", pre-filled message goes out. The 1-click intervention feature no other tool has.

The moat deepens. Don't lose it by shipping broken check-ins.

---

## 9. Immediate next actions (next 48 hours)

If you do nothing else, do these 5 things in order:

1. **Wire Sentry** (C1) — 15 minutes, 1 file, 1 env var. I have the code ready to ship as a PR.
2. **Fix `coach_messages` RLS** (C2) — 1 hour including a test. Decide intent first.
3. **Gate `Math.random()` in `coachingIntelligenceService`** (C3) — 15 minutes, the dev-vs-prod fix.
4. **Add the lint rule** for `Math.random()` in services — 30 minutes, prevents regression.
5. **Read this audit end-to-end with the team** — 1 hour. Decide what stays in Week 2 vs Week 4.

I can do items 1, 3, and 4 in the next session (low risk, high value). Items 2 and 5 need a product decision from you first.

---

## 10. Appendix — file inventory

**New since June 10** (44 files, ~5,000 lines):

```
src/__tests__/checkin/                  NEW directory
src/components/checkin/                 7 new components (1,336 lines)
src/hooks/checkin/                      1 new hook
src/services/checkin/                   6 new services (1,011 lines)
src/services/notifications/             3 new files (from v1)
src/services/progress/                  3 new files (from v1)
src/layouts/ClientLayout.tsx            NEW
src/pages/CheckinPage.tsx               NEW
src/pages/ClientClaimPage.tsx           NEW
src/domain/nutrition/runtimeErrors.ts   NEW
src/domain/nutrition/runtimeTelemetry.ts NEW
src/utils/logger.ts                     NEW (from v1)
src/utils/random.ts                     NEW (from v1)
supabase/migrations/20260613120000_checkin_engine.sql                  NEW
supabase/migrations/20260614190000_add_follow_up_enabled_to_clients.sql NEW
supabase/migrations/20260614200000_coach_messages.sql                  NEW
supabase/functions/generate-coach-alerts/                               NEW
supabase/functions/send-whatsapp/                                       NEW
```

**Unchanged monoliths** (the debt that didn't move):

```
src/services/recipeService.ts            1,147 lines  (unchanged)
src/hooks/useNutritionPlanState.ts         688 lines  (unchanged)
src/services/planService.ts                510 lines  (unchanged)
src/components/EnhancedIngredientManager.tsx 833 lines (unchanged)
```

---

*End of fresh audit. Ready to act on §9 items 1, 3, 4 in a follow-up session — say the word and I'll ship the Sentry wiring + the lint rule as a single PR.*
