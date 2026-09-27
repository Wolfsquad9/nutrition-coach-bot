/**
 * Restriction import validation.
 *
 * The JSON import previously accepted any parsed payload and pushed it straight
 * into application state. That allowed contradictory or malformed data to
 * create an unsafe state — most importantly an id listed in BOTH
 * `blockedIngredients` and `preferredIngredients`, which the (pre-Phase-1)
 * generation path would happily use, because only `preferredIngredients` was
 * consulted.
 *
 * Validation fails closed: on any problem nothing is written to state.
 * The export format is unchanged (the same shapes round-trip).
 */

import { z } from 'zod';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

/**
 * Structural schema mirroring `ClientIngredientRestrictions`.
 * `clientName` and `substitutionRules` default when omitted: missing display
 * metadata cannot create an unsafe pool.
 */
export const ClientIngredientRestrictionsSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().default(''),
  blockedIngredients: z.array(z.string().min(1)),
  preferredIngredients: z.array(z.string().min(1)),
  substitutionRules: z.record(z.array(z.string().min(1))).default({}),
});

export interface RestrictionImportOptions {
  /** Every ingredient id the library currently knows about. */
  knownIngredientIds: readonly string[];
  /**
   * Client the import is being applied to. When provided, the payload MUST
   * contain an entry for it — otherwise importing would silently wipe that
   * client's restrictions.
   */
  expectedClientId?: string | null;
}

/**
 * Flat result shape.
 *
 * Note: this is intentionally NOT a discriminated union (`{ok:true}|{ok:false}`)
 * because the app compiles with `strict: false` (see `tsconfig.app.json`), where
 * TypeScript does not narrow on a boolean-literal discriminant. A flat shape
 * keeps the `errors` access valid regardless of compiler settings.
 */
export interface RestrictionImportResult {
  ok: boolean;
  /** Populated only when `ok` is true. */
  restrictions: ClientIngredientRestrictions[];
  /** Populated only when `ok` is false. */
  errors: string[];
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

/**
 * Validate an imported restrictions payload.
 *
 * Rejects: non-array payloads, malformed entries, wrong value types, unknown
 * ingredient ids, ids present in both lists, duplicates within a list,
 * duplicate client entries and (when `expectedClientId` is set) a payload that
 * omits that client.
 */
export function validateImportedRestrictions(
  raw: unknown,
  options: RestrictionImportOptions,
): RestrictionImportResult {
  const errors: string[] = [];
  const known = new Set(options.knownIngredientIds);

  if (!Array.isArray(raw)) {
    return {
      ok: false,
      restrictions: [],
      errors: ['Imported data must be a JSON array of client restrictions.'],
    };
  }
  if (raw.length === 0) {
    return {
      ok: false,
      restrictions: [],
      errors: ['Imported data contains no client restriction entries.'],
    };
  }

  const restrictions: ClientIngredientRestrictions[] = [];

  raw.forEach((entry, index) => {
    const parsed = ClientIngredientRestrictionsSchema.safeParse(entry);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'entry'}: ${issue.message}`)
        .join(', ');
      errors.push(`Entry ${index + 1} is invalid (${detail}).`);
      return;
    }

    const restriction = parsed.data as ClientIngredientRestrictions;
    const { clientId, blockedIngredients, preferredIngredients, substitutionRules } = restriction;

    const duplicateBlocked = findDuplicates(blockedIngredients);
    const duplicatePreferred = findDuplicates(preferredIngredients);
    if (duplicateBlocked.length > 0) {
      errors.push(`Entry ${index + 1} (${clientId}): duplicate blocked ingredient id(s): ${duplicateBlocked.join(', ')}.`);
    }
    if (duplicatePreferred.length > 0) {
      errors.push(`Entry ${index + 1} (${clientId}): duplicate preferred ingredient id(s): ${duplicatePreferred.join(', ')}.`);
    }

    const overlap = blockedIngredients.filter((id) => preferredIngredients.includes(id));
    if (overlap.length > 0) {
      errors.push(
        `Entry ${index + 1} (${clientId}): ingredient id(s) listed as BOTH blocked and preferred: ${overlap.join(', ')}. ` +
          'Blocked and preferred must be disjoint.',
      );
    }

    const unknown = [...new Set([...blockedIngredients, ...preferredIngredients])].filter((id) => !known.has(id));
    if (unknown.length > 0) {
      errors.push(`Entry ${index + 1} (${clientId}): unknown ingredient id(s): ${unknown.join(', ')}.`);
    }

    const unknownSubstitutionIds: string[] = [];
    for (const [sourceId, targets] of Object.entries(substitutionRules)) {
      if (!known.has(sourceId)) unknownSubstitutionIds.push(sourceId);
      for (const targetId of targets) {
        if (!known.has(targetId)) unknownSubstitutionIds.push(targetId);
      }
    }
    if (unknownSubstitutionIds.length > 0) {
      errors.push(
        `Entry ${index + 1} (${clientId}): unknown ingredient id(s) in substitution rules: ${[...new Set(unknownSubstitutionIds)].join(', ')}.`,
      );
    }

    restrictions.push(restriction);
  });

  const duplicateClients = findDuplicates(restrictions.map((entry) => entry.clientId));
  if (duplicateClients.length > 0) {
    errors.push(`Duplicate client entries for client id(s): ${duplicateClients.join(', ')}.`);
  }

  if (options.expectedClientId && !restrictions.some((entry) => entry.clientId === options.expectedClientId)) {
    errors.push(
      `Imported data has no entry for the current client (${options.expectedClientId}); importing it would clear this client's restrictions.`,
    );
  }

  if (errors.length > 0) return { ok: false, restrictions: [], errors };
  return { ok: true, restrictions, errors: [] };
}

/** Human-readable, bounded summary for a toast. */
export function formatRestrictionImportErrors(errors: readonly string[], max = 3): string {
  const shown = errors.slice(0, max).join(' ');
  const remaining = errors.length - max;
  return remaining > 0 ? `${shown} (+${remaining} more problem(s))` : shown;
}
