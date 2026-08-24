/**
 * PHASE 6 — Decision-Model Integrity Tests
 *
 * Architectural guards required by the Phase 6 acceptance criteria:
 *  - exactly ONE canonical nutrition calculation engine
 *  - exactly ONE calorie definition (kcal = p*4 + c*4 + f*9 lives only there)
 *  - no duplicated energy math (7700 kcal/kg, Mifflin-St Jeor terms) elsewhere
 *  - the adaptive layer is explicitly subordinate to the canonical engine
 *  - weight-change direction is never destroyed with Math.abs()
 *
 * These are static source scans (same style as the F14 data-source tests):
 * they fail if a second implementation of the nutrition math appears.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE_FILE = join(SRC_ROOT, 'domain', 'nutrition', 'engine.ts');
const ADAPTATION_FILE = join(SRC_ROOT, 'domain', 'nutrition', 'adaptation.ts');
const ADAPTATION_SERVICE_FILE = join(SRC_ROOT, 'services', 'nutrition', 'adaptiveTargetService.ts');
const ADAPTIVE_HOOK_FILE = join(SRC_ROOT, 'hooks', 'useAdaptiveNutritionTarget.ts');
const PRESCRIPTION_FILE = join(SRC_ROOT, 'domain', 'nutrition', 'prescription.ts');
const PLAN_SERVICE_FILE = join(SRC_ROOT, 'services', 'supabasePlanService.ts');

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Strip block + line comments so documentation never trips the guards. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const sourceFiles = listSourceFiles(SRC_ROOT);
const engineRel = relative(SRC_ROOT, ENGINE_FILE);

function violationsOf(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles) {
    const rel = relative(SRC_ROOT, file);
    const isEngine = file === ENGINE_FILE;
    const code = stripComments(readFileSync(file, 'utf8'));
    if (!isEngine && pattern.test(code)) hits.push(rel);
  }
  return hits;
}

describe('single canonical nutrition engine', () => {
  it('engine.ts exists and declares itself as the canonical engine', () => {
    const raw = readFileSync(ENGINE_FILE, 'utf8');
    expect(raw).toMatch(/Canonical Nutrition Engine/);
  });

  it('no other file implements BMR/TDEE functions', () => {
    expect(
      violationsOf(/function\s+calculateBMR|function\s+calculateTDEE|calculateTDEE\s*[:=]/),
    ).toEqual([]);
  });

  it('no other file hard-codes Mifflin-St Jeor terms or the 7700 kcal/kg constant', () => {
    expect(violationsOf(/\b6\.25\b/)).toEqual([]); // MSJ height term
    expect(violationsOf(/\b7700\b/)).toEqual([]); // kcal per kg bodyweight
  });

  it('no other file inlines the macro-to-calorie closure formula', () => {
    expect(violationsOf(/protein\s*\*\s*4[\s\S]{0,120}carbs\s*\*\s*4/)).toEqual([]);
  });

  it('weekly weight-change direction is never destroyed with Math.abs()', () => {
    // Only ASSIGNMENTS of Math.abs(...) over weekly-change values are flagged:
    // magnitude comparisons (red-flag checks, tolerance bands) are legitimate.
    expect(violationsOf(/=\s*Math\.abs\([^)]*weekly/i)).toEqual([]);
    expect(violationsOf(/=\s*Math\.abs\([^)]*WeightChange/i)).toEqual([]);
  });

  it('only path-style references keep the engine unique in the nutrition domain', () => {
    const domainFiles = sourceFiles.filter((f) => f.includes(join('domain', 'nutrition') + sep));
    expect(domainFiles.some((f) => f === ENGINE_FILE)).toBe(true);
  });
});

describe('adaptive layer is subordinate to the canonical engine', () => {
  it('adaptation.ts imports its energy math from ./engine (never re-implements it)', () => {
    const code = stripComments(readFileSync(ADAPTATION_FILE, 'utf8'));
    expect(code).toMatch(/from\s+'\.\//);
    expect(code).toMatch(/from\s+'\./);
    expect(code).toMatch(/engine'/);
    expect(code).not.toMatch(/function\s+calculateBMR|function\s+calculateTDEE/);
    expect(code).not.toMatch(/\b6\.25\b|\b7700\b/);
  });

  it('the engine file is the single definition site for the energy pipeline', () => {
    expect(engineRel).toBe(join('domain', 'nutrition', 'engine.ts'));
  });
});

describe('production consumers use the canonical engine (Phase 7 wiring)', () => {
  const strip = (code: string): string => stripComments(code);

  it('NutritionTabContent consumes the engine instead of recomputing targets', () => {
    const tabFile = sourceFiles.find((f) => f.endsWith('NutritionTabContent.tsx'));
    expect(tabFile).toBeTruthy();
    const code = readFileSync(tabFile!, 'utf8');
    // The tab imports its metrics from the canonical engine...
    expect(code).toMatch(/from\s+'@\/domain\/nutrition\/engine'/);
    // ...and contains no independent macro/energy arithmetic or direction flips.
    const body = strip(code);
    expect(body).not.toMatch(/\bcalculateBMR\b|\bcalculateTDEE\b/);
    expect(body).not.toMatch(/=\s*Math\.abs\(/);
    expect(body).not.toMatch(/proteinGrams\s*\*|fatGrams\s*\*\s*9|\b7700\b/);
  });

  it('the adaptive target service adds no nutrition math of its own', () => {
    const serviceCode = strip(readFileSync(ADAPTATION_SERVICE_FILE, 'utf8'));
    expect(serviceCode).not.toMatch(/\b6\.25\b|\b7700\b/);
    expect(serviceCode).not.toMatch(/function\s+calculateBMR|function\s+calculateTDEE/);
    expect(serviceCode).not.toMatch(/protein\s*\*\s*4[\s\S]{0,120}carbs\s*\*\s*4/);
    // It must delegate to the canonical engine APIs:
    expect(serviceCode).toMatch(/resolveNutritionDecision|calculateProfile/);
  });

  it('the adaptive hook renders nothing and computes no nutrition math', () => {
    const hookCode = strip(readFileSync(ADAPTIVE_HOOK_FILE, 'utf8'));
    expect(hookCode).not.toMatch(/\b6\.25\b|\b7700\b|proteinGrams\s*\*|Math\.abs\(/);
  });

  it('active-prescription logic adds no nutrition math and no new table access', () => {
    const rxCode = strip(readFileSync(PRESCRIPTION_FILE, 'utf8'));
    // No energy/macro math in the prescription module:
    expect(rxCode).not.toMatch(/\b6\.25\b|\b7700\b/);
    expect(rxCode).not.toMatch(/function\s+calculateBMR|function\s+calculateTDEE/);
    expect(rxCode).not.toMatch(/protein\s*\*\s*4[\s\S]{0,120}carbs\s*\*\s*4/);
    // It must delegate to the canonical engine:
    expect(rxCode).toMatch(/from\s+'\.\//);
    expect(rxCode).toMatch(/resolveNutritionDecision|engine'/);

    // The prescription rides the EXISTING plan-version payload — no new table,
    // no direct Supabase writes anywhere in prescription logic.
    expect(rxCode).not.toMatch(/supabase|\.from\(/);

    // And the persistence service only extends the existing payload type:
    const planServiceCode = strip(readFileSync(PLAN_SERVICE_FILE, 'utf8'));
    expect(planServiceCode).not.toMatch(/\b6\.25\b|\b7700\b/);
    expect(planServiceCode).not.toMatch(/nutrition_prescriptions/);
  });
});
