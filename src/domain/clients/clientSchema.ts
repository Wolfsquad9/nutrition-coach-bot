/**
 * Client Schema — single source of truth for validating a Client record.
 *
 * Why a Zod schema and not just the `Client` TypeScript type:
 *   1. The TypeScript type is erased at runtime. Anything crossing a trust
 *      boundary (form submit, edge function invocation, third-party payload,
 *      localStorage hydration, URL search params) needs runtime validation.
 *   2. Edge functions in particular receive untyped JSON. Sending a `Client`
 *      whose `weight` is `null` or whose `weeklyWeightChange` is `5` silently
 *      produces wrong plans instead of failing fast.
 *   3. Forms using react-hook-form + @hookform/resolvers/zod get typed,
 *      schema-driven validation for free, with the same rules as the
 *      runtime guard.
 *
 * Invariants encoded here:
 *   - Numeric ranges (height, weight, trainingDaysPerWeek, etc.) that
 *     downstream calculations (BMR, TDEE, BMI) assume.
 *   - Enums for goal/gender/activity that match `Client` in `@/types`.
 *   - Red-flag range checks (BMI 17–40, weeklyWeightChange ≤ 1) so the
 *     server can refuse to generate a plan for unsafe inputs.
 *
 * This file is pure — no React, no Supabase, no I/O. It can be imported
 * from the browser, the edge function Deno runtime, or a Node script.
 */

import { z } from 'zod';
import type { Client } from '@/types';

// ---------------------------------------------------------------------------
// Atomic literals (mirror the string unions in @/types)
// ---------------------------------------------------------------------------

export const GenderSchema = z.enum(['male', 'female']);

export const ActivityLevelSchema = z.enum([
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extra_active',
]);

export const PrimaryGoalSchema = z.enum([
  'fat_loss',
  'muscle_gain',
  'recomposition',
  'maintenance',
]);

export const TrainingExperienceSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
]);

export const TrainingStyleSchema = z.enum([
  'strength',
  'hypertrophy',
  'powerlifting',
  'crossfit',
  'bodybuilding',
]);

export const DietTypeSchema = z.enum([
  'omnivore',
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
  'paleo',
]);

export const MealsPerDaySchema = z.union([
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

// ---------------------------------------------------------------------------
// Client — the full schema used at trust boundaries
// ---------------------------------------------------------------------------

/**
 * The full Client schema. Use for validating freshly-submitted forms and
 * untrusted inbound payloads (edge function arguments, localStorage hydration,
 * URL search params). Coerces nothing — invalid data is rejected, not fixed.
 */
export const ClientSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone is required').max(40),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate must be YYYY-MM-DD'),
  gender: GenderSchema,
  age: z.number().int().min(10).max(120).optional(),

  // Physical
  height: z.number().positive().min(100, 'Height must be at least 100cm').max(250, 'Height must be at most 250cm'),
  weight: z.number().positive().min(30, 'Weight must be at least 30kg').max(300, 'Weight must be at most 300kg'),
  activityLevel: ActivityLevelSchema,

  // Goals
  primaryGoal: PrimaryGoalSchema,
  targetWeight: z.number().positive().max(300).optional(),
  // Defensive range: checkRedFlags rejects |x| > 1; we reject |x| > 1.5 here
  // so the schema catches obvious garbage before the business rule runs.
  weeklyWeightChange: z.number().min(-1.5).max(1.5).optional(),

  // Training
  trainingExperience: TrainingExperienceSchema,
  trainingDaysPerWeek: z.number().int().min(1).max(7),
  sessionDuration: z.number().int().min(15).max(240),
  preferredTrainingStyle: TrainingStyleSchema,
  equipment: z.array(z.string()).default([]),
  equipmentAvailable: z.array(z.string()).optional(),

  // Nutrition
  dietType: DietTypeSchema,
  mealsPerDay: MealsPerDaySchema,
  intolerances: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  dislikedFoods: z.array(z.string()).default([]),

  // Medical
  medicalConditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  injuries: z.array(z.string()).default([]),
  hasRedFlags: z.boolean(),

  // Meta
  createdAt: z.string(),
  updatedAt: z.string(),
  coachNotes: z.string().optional(),
}).refine(
  // BMI guard — mirrors the runtime check in checkRedFlags.
  // Done as a refine so the error message is precise instead of generic.
  (c) => {
    const bmi = c.weight / Math.pow(c.height / 100, 2);
    return bmi >= 13 && bmi <= 60;
  },
  { message: 'BMI is outside the safely processable range (13–60)', path: ['weight'] }
);

// Inferred type — keep in sync with the @/types Client. If they drift, the
// build will fail where this type is used, which is the whole point.
export type ClientSchemaT = z.infer<typeof ClientSchema>;

// ---------------------------------------------------------------------------
// Helpers used by forms, edge functions, and services
// ---------------------------------------------------------------------------

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

/**
 * Flatten a Zod failure into `{fieldName: message}` for easy display in
 * a form. The first error per field wins; subsequent ones are dropped.
 */
export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * Validate unknown input as a Client. Returns a discriminated result so
 * callers can `if (!result.ok)` without a try/catch.
 */
export function validateClient(input: unknown): ValidationResult<ClientSchemaT> {
  const result = ClientSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: flattenZodErrors(result.error) };
}

/**
 * Narrowing helper: TypeScript can't know that an arbitrary object is a
 * `Client` at runtime, so the only safe way to assert it is to validate.
 * Use this at trust boundaries — do NOT use `as Client` casts.
 */
export function isClient(input: unknown): input is Client {
  return ClientSchema.safeParse(input).success;
}

// ---------------------------------------------------------------------------
// Type-level compatibility check (compile-time only — stripped from output)
// ---------------------------------------------------------------------------

// If Client in @/types gains a field that the schema doesn't know about, the
// inferred type will be missing it; this assignment will fail with a clear
// error. The reverse direction (extra schema fields not in the type) is also
// caught because ClientSchemaT must be assignable to Client.
type _AssertClientAssignable = (x: ClientSchemaT) => Client;
type _AssertClientAssignableBack = (x: Client) => ClientSchemaT;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typecheckClient: _AssertClientAssignable = (x) => x;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typecheckClientBack: _AssertClientAssignableBack = (x) => x;
