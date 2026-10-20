# FitPlan — Project Brief

**Status:** canonical · **Updated:** 2026-10-18 · **Baseline commit:** `72c7862`
(`main` == `origin/main`; Phase 5 Meal Variety committed as `099ef2e`, docs as
`72c7862`; working tree clean — see CURRENT_STATE §1 for the full verification).

## 1. Product identity and mission

FitPlan is an **athlete-first nutrition and coaching platform**. Coaches onboard
clients, generate deterministic weekly meal plans through an optimizer, review
and lock them under a 7-day atomic lock, and assign training plans. Athletes
consume their plans, log training sessions, submit check-ins, and read coach
messages. The long-term mission is **measurable real-world athlete outcomes**:
performance, competitive preparation, and adherence — not feature count.

## 2. Hybrid business model (accepted direction)

- **Owner-operated coaching:** the owner uses FitPlan today to manage their own
  coaching clients.
- **Independent-coach platform (future):** other coaches must eventually operate
  their own coaching businesses on FitPlan.
- **Architectural consequence:** multi-coach tenancy (organization/workspace
  isolation, coach ownership, data isolation, onboarding) is a **prerequisite**,
  not a cosmetic feature. The current model is coach-owns-clients with **no org
  entity** — see DECISIONS Open O5. No billing/subscription code exists today.

## 3. Athlete-first product philosophy (recommendation, not yet a validated outcome)

Product, architecture, and long-term differentiation **prioritize athlete
performance, competitive preparation, and measurable outcomes**. In practice this
means: athlete outcomes over feature count; truthful metrics over plausible
numbers; evidence before claims; safe defaults; backward compatibility. Every
strategic pillar below is labelled hypothesis until user evidence exists.

## 4. Current target users and jobs to be done

- **Coaches** need to: onboard/manage clients, set ingredient restrictions,
  generate weekly/daily plans, review drafts and lock them atomically, assign
  training, review check-ins, triage alerts, and share plans.
- **Athletes (`role=client`)** need to: view their weekly/daily plan, shop and
  prep (grocery/print), log training sessions, submit check-ins, track progress,
  and read coach messages. Athletes **cannot** regenerate or edit plans
  (coach-only by design).

## 5. What FitPlan demonstrably does today

Exactly the capabilities in CURRENT_STATE §2 — coach generation → draft review →
atomic lock → athlete consumption, plus training assignment/logging, check-ins,
review workflow 13A–13F, shared plan links, and (committed `099ef2e`) a
coach-controlled meal-variety preference persisted to the locked payload and
shown as an athlete badge. Nothing more is claimed here.

## 6. Long-term strategic pillars (all HYPOTHESES — not implemented or validated)

1. **Performance-aware nutrition** — training demands informing nutrition
   planning. *Hypothesis:* no coupling exists (`SessionExecutionForm` has zero
   nutrition references). Discovery-gated (ROADMAP P2).
2. **Practical meal execution and adherence** — meal completion, feedback, safe
   substitution. *Hypothesis:* athlete side is read-only today. P1.
3. **Trustworthy coach intelligence** — adherence/progress metrics a coach can
   act on. *Hypothesis:* the current trend function is a **dev-only stub**
   returning seeded mock data (CURRENT_STATE §6). Must be computed or
   removed/labelled before any claim. P0.
4. **Competition and event readiness** — event dates, weight class, travel,
   taper. *Hypothesis:* no such concepts exist in schema or domain.
5. **Multi-coach business infrastructure** — tenancy, isolation, onboarding,
   billing. *Hypothesis:* no org entity, no billing code. P3, tenancy model first.

## 7. Non-goals and claims we must not make yet

- No measurable competitive advantage, performance gains, or clinical benefits —
  no user evidence exists (meal variety has never been seen by a user).
- No "AI coach intelligence" — the trend/trajectory/summary functions are
  dev-only stubs behind `IS_DEV` guards.
- No performance-aware or competition-prep capability.
- No multi-coach tenancy, billing, or security guarantees beyond what is
  evidenced in CURRENT_STATE §5.
- No athlete-side plan editing.

## 8. Product principles

Athlete outcomes over feature count · truthful metrics (never present seeded
numbers as measured) · evidence before claims · safe defaults (`more` preserves
established optimizer behavior) · backward compatibility (byte-identical legacy
paths; additive optional payload keys; legacy payloads never relabelled).
