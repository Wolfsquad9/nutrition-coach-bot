# Professional Repository Audit & Strategic Implementation Prompts

This document contains a production-grade meta-prompt for conducting a professional repository audit, followed by a structured prompt sequence designed to drive surgical, step-by-step implementation toward a market-ready product.

## Lovable Usage Notes

If you are using Lovable as the primary implementation environment, adapt the prompts to be more surgical and incremental. Favor small, isolated refactors that touch a single file or feature at a time, and validate after each step in Lovable before moving to the next prompt in the sequence.

## 1. Master Prompt — Professional Repo Audit & Strategic Review

> Act as a **Principal App Engineer / Staff Software Architect** with experience shipping **production-grade, scalable, and commercially successful applications**.
>
> Your task is to perform a **full professional audit** of the provided code repository.
>
> ### Objectives:
>
> 1. **Code Review & Architecture Assessment**
>
>    * Analyze overall architecture, folder structure, modularity, layering, and separation of concerns
>    * Identify technical debt, architectural smells, anti-patterns, and scalability risks
>    * Evaluate code quality, readability, consistency, documentation, and test coverage
> 2. **Engineering Maturity Evaluation**
>
>    * Assess the app’s current state across:
>
>      * Architecture robustness
>      * Performance & efficiency
>      * Security & data handling
>      * Maintainability & extensibility
>      * DevOps readiness (CI/CD, environments, configs)
>    * Rate each dimension on a **0–10 scale** with justification
> 3. **Product & Technical Vision**
>
>    * Infer the intended product vision from the codebase
>    * Identify limitations preventing the app from being:
>
>      * Scalable
>      * Reliable
>      * Differentiated / “groundbreaking”
> 4. **Future Development Strategy**
>
>    * Propose a **clear, opinionated future architecture** suitable for a production-scale app
>    * Recommend:
>
>      * Core refactors
>      * Infrastructure changes
>      * Tooling / frameworks / patterns (only if justified)
>    * Highlight what *must* change vs. what *can* wait
>
> ### Deliverables:
>
> * Executive Summary (non-technical, high-level)
> * Detailed Technical Review (engineer-focused)
> * Current State Scorecard
> * Key Risks & Bottlenecks
> * Recommended Target Architecture
> * High-level Development Roadmap
>
> Be **direct, critical, and specific**.
> Prioritize **engineering excellence, long-term scalability, and product impact** over superficial improvements.

## 2. Prompt Sequence — Surgical Infrastructure & App Completion

Once the audit is done, use the following prompt series, executed one by one. Each prompt assumes the previous one has been fully implemented.

### Prompt 1 — Target Architecture Definition

> Based on the completed audit, define the **final target architecture** for this app.
>
> * Specify architectural pattern(s) (e.g. Clean Architecture, Hexagonal, Modular Monolith, Microservices — justify choice)
> * Define:
>
>   * Core domains
>   * Data flow
>   * Service boundaries
>   * API contracts
> * Provide a **clear folder/module structure**
>
> Output must be concrete enough to directly refactor the codebase.

### Prompt 2 — Infrastructure & Environment Hardening

> Design the **production-ready infrastructure** for this app.
>
> Include:
>
> * Environment separation (dev / staging / prod)
> * Configuration management
> * Secrets handling
> * CI/CD pipeline structure
> * Logging, monitoring, and error tracking
>
> Focus on **simplicity, reliability, and scalability**.

### Prompt 3 — Core Refactor Plan (High-Impact First)

> Create a **prioritized refactor plan** that targets:
>
> * Highest technical debt
> * Architectural violations
> * Performance bottlenecks
>
> Each refactor item must include:
>
> * Problem description
> * Why it matters
> * Exact files/modules affected
> * Expected outcome

### Prompt 4 — Domain & Business Logic Stabilization

> Refactor and formalize the **core business/domain logic**.
>
> * Identify domain entities, value objects, and services
> * Eliminate leakage between UI, infrastructure, and domain layers
> * Propose clean interfaces and boundaries
>
> Goal: make the domain **testable, stable, and future-proof**.

### Prompt 5 — Data Layer & Performance Optimization

> Review and redesign the **data layer**.
>
> * Storage choices & schema design
> * Query optimization
> * Caching strategy
> * Migration strategy
>
> Focus on **performance, correctness, and scalability**.

### Prompt 6 — Security & Reliability Hardening

> Perform a **security and reliability review**.
>
> * Authentication & authorization
> * Data protection
> * Input validation
> * Failure modes & recovery strategies
>
> Provide concrete improvements with minimal complexity overhead.

### Prompt 7 — Test Strategy & Quality Gates

> Design a **complete testing strategy**.
>
> * Unit tests (what, where, how much)
> * Integration tests
> * End-to-end tests
> * CI quality gates
>
> Aim for **confidence, not test bloat**.

### Prompt 8 — Product Differentiation & “Groundbreaking” Features

> Based on the stabilized architecture, propose **high-leverage features** or technical capabilities that could make this app **meaningfully differentiated**.
>
> * Must be technically feasible
> * Must align with the existing domain
> * Must create user or business impact
>
> Separate *must-have* from *experimental* ideas.

### Prompt 9 — Final Hardening & Release Readiness

> Prepare the app for **production release**.
>
> * Deployment checklist
> * Performance benchmarks
> * Rollback strategy
> * Observability readiness
>
> Output should function as a **pre-launch checklist**.

## 3. How to Use This Effectively

**Recommended workflow:**

1. Run the **Master Audit Prompt**
2. Implement changes prompted by **one follow-up prompt at a time**
3. Commit after each step
4. Re-run partial audits if architecture shifts significantly

This approach keeps changes **surgical**, minimizes regressions, and steadily converges toward a **finished, professional-grade product**.
