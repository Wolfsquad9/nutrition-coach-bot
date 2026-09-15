/**
 * Coaching Decision — persistence & RLS static tests (Phase 13C)
 *
 * Static guards over the migration SQL and the Phase 13C source, mirroring the
 * repository's existing source-scanning test pattern (see
 * phase11bFeasibility.test.ts). Because no live Postgres is available in this
 * suite, these verify the authoritative invariants at the source level:
 *  - the migration creates, enables RLS, exposes the right CHECK constraints
 *   and one-decision-per-day index, gives SELECT RLS to owning coaches, and
 *   records via a SECURITY DEFINER authorized RPC;
 *  - the migration and service NEVER write to nutrition_plans / plan_versions
 *   and never lock/generate a plan;
 *  - the domain/service introduce no new nutrition bound math.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260915090000_coaching_decisions.sql',
);
const DOMAIN_PATH = resolve(process.cwd(), 'src/domain/coaching/coachingDecision.ts');
const SERVICE_PATH = resolve(process.cwd(), 'src/services/review/coachingDecisionService.ts');

const read = (p: string): string => {
  if (!existsSync(p)) throw new Error(`file not found: ${p}`);
  return readFileSync(p, 'utf8');
};

describe('coaching_decisions migration — persistence', () => {
  it('creates the coaching_decisions table', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).toContain('CREATE TABLE public.coaching_decisions');
  });

  it('stores the coach, client, decision date, action and recommendation snapshot', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).toContain('client_id uuid NOT NULL');
    expect(sql).toContain('coach_id uuid NOT NULL');
    expect(sql).toContain('decision_date date NOT NULL');
    expect(sql).toContain('recommendation_status text NOT NULL');
    expect(sql).toContain('coach_action text NOT NULL');
    expect(sql).toContain('recommended_target_calories');
    expect(sql).toContain('recommended_calorie_adjustment');
    expect(sql).toContain('final_target_calories');
    expect(sql).toContain('baseline_prescription_version_id');
  });

  it('enforces enum-ish CHECK constraints for status and action', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).toContain(
      "'maintain','adjustment_recommended','review_required','insufficient_data'",
    );
    expect(sql).toContain(
      "coach_action IN ('accepted','modified','maintained','deferred')",
    );
  });

  it('enforces one decision per client per day', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).toContain('UNIQUE INDEX coaching_decisions_client_date_idx');
    expect(sql).toContain('ON public.coaching_decisions(client_id, decision_date)');
  });
});

describe('coaching_decisions migration — RLS & immutability', () => {
  it('enables row level security', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).toContain('ALTER TABLE public.coaching_decisions ENABLE ROW LEVEL SECURITY');
  });

  it('grants SELECT only to the owning coach / linked client / admin', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).toContain('coach_reads_decisions_for_owned_clients');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('created_by = auth.uid()');
  });

  it('provides no UPDATE / DELETE / direct INSERT policies (immutability)', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).not.toContain('coaching_decisions FOR UPDATE');
    expect(sql).not.toContain('coaching_decisions FOR DELETE');
    expect(sql).not.toContain('coaching_decisions INSERT');
  });

  it('records through a SECURITY DEFINER, authenticated RPC', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_coaching_decision');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_coaching_decision');
    expect(sql).toContain('TO authenticated');
  });
});

describe('coaching_decisions migration — no nutrition-plan mutation', () => {
  it('never writes to nutrition_plans, plan_versions, or lock/generate a plan', () => {
    const sql = read(MIGRATION_PATH);
    expect(sql).not.toContain('INSERT INTO public.nutrition_plans');
    expect(sql).not.toContain('INSERT INTO public.plan_versions');
    expect(sql).not.toContain('UPDATE public.nutrition_plans');
    expect(sql).not.toContain('lock_nutrition_plan');
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.(generate|lock)/i);
  });
});

describe('Phase 13C invariants — no new nutrition math or prescription writes', () => {
  it('domain validation introduces no new calorie-bound algorithm', () => {
    const src = read(DOMAIN_PATH);
    expect(src).not.toMatch(/MIN_TARGET_KCAL|MAX_TARGET_KCAL/);
    expect(src).not.toMatch(/7700|calculateTargetCalories|dailyEnergyDelta/);
    // The only canonical mechanism reused is the engine feasibility gateway.
    expect(src).toContain('reconcileTarget');
  });

  it('the service only persists via the coaching RPC and never touches nutrition tables', () => {
    const src = read(SERVICE_PATH);
    expect(src).not.toMatch(/\.from\('nutrition_plans'\)|\.from\('plan_versions'\)|\.upsert\(/);
    expect(src).not.toContain('lock_nutrition_plan');
    expect(src).toContain("rpc(\n      'record_coaching_decision'");
    expect(src).toContain("'coaching_decisions'");
  });
});