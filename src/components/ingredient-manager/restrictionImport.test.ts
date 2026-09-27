/**
 * Phase 1 — restriction import validation.
 *
 * The importer used to `setClientRestrictions(JSON.parse(...))` with no checks,
 * which could create contradictory state (an id in BOTH `blockedIngredients`
 * and `preferredIngredients`) — and generation only read `preferredIngredients`,
 * so a "blocked" ingredient would have been used. These tests pin the
 * fail-closed contract while proving the existing valid format still works.
 */

import { describe, it, expect } from 'vitest';
import {
  validateImportedRestrictions,
  formatRestrictionImportErrors,
} from '@/components/ingredient-manager/restrictionImport';
import { coreIngredients } from '@/data/ingredientDatabase';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

const KNOWN = coreIngredients.map((ingredient) => ingredient.id);

const validEntry: ClientIngredientRestrictions = {
  clientId: 'client-1',
  clientName: 'Alex Smith',
  blockedIngredients: ['mango'],
  preferredIngredients: ['chicken-breast', 'brown-rice', 'broccoli', 'olive-oil', 'eggs'],
  substitutionRules: { mango: ['apple'] },
};

const validate = (raw: unknown, expectedClientId: string | null = 'client-1') =>
  validateImportedRestrictions(raw, { knownIngredientIds: KNOWN, expectedClientId });

const errorsOf = (raw: unknown) => {
  const result = validate(raw);
  expect(result.ok).toBe(false);
  return result.errors.join(' ');
};

describe('Phase 1 · import · (11) existing valid import/export behaviour is preserved', () => {
  it('accepts the exact shape the exporter writes', () => {
    const result = validate([validEntry]);
    expect(result.ok).toBe(true);
    expect(result.restrictions).toEqual([validEntry]);
  });

  it('round-trips a multi-client export unchanged', () => {
    const payload = [
      validEntry,
      {
        clientId: 'client-2',
        clientName: 'Sam Jones',
        blockedIngredients: [],
        preferredIngredients: ['tofu', 'brown-rice'],
        substitutionRules: {},
      },
    ];
    const result = validateImportedRestrictions(payload, { knownIngredientIds: KNOWN });
    expect(result.ok).toBe(true);
    expect(result.restrictions).toEqual(payload);
  });

  it('accepts an entry with no substitution rules (optional field)', () => {
    const result = validate([
      { clientId: 'client-1', preferredIngredients: ['brown-rice'], blockedIngredients: [] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.restrictions[0].substitutionRules).toEqual({});
  });
});

describe('Phase 1 · import · (5) malformed payloads are rejected', () => {
  it('rejects a non-array payload', () => {
    expect(errorsOf({ clientId: 'client-1' })).toContain('must be a JSON array');
    expect(errorsOf('nope')).toContain('must be a JSON array');
    expect(errorsOf(null)).toContain('must be a JSON array');
  });

  it('rejects an empty array', () => {
    expect(errorsOf([])).toContain('no client restriction entries');
  });

  it('rejects entries that are not objects', () => {
    expect(errorsOf(['client-1'])).toContain('Entry 1 is invalid');
    expect(errorsOf([null])).toContain('Entry 1 is invalid');
  });

  it('rejects a missing/blank clientId', () => {
    expect(errorsOf([{ ...validEntry, clientId: '' }])).toContain('clientId');
    expect(errorsOf([{ ...validEntry, clientId: undefined }])).toContain('Entry 1 is invalid');
  });
});
describe('Phase 1 · import · (6) invalid restriction structures are rejected', () => {
  it('rejects non-array or wrong-typed id lists', () => {
    expect(errorsOf([{ ...validEntry, preferredIngredients: 'brown-rice' }])).toContain('Entry 1 is invalid');
    expect(errorsOf([{ ...validEntry, blockedIngredients: 42 }])).toContain('Entry 1 is invalid');
    expect(errorsOf([{ ...validEntry, preferredIngredients: [123] }])).toContain('Entry 1 is invalid');
    expect(errorsOf([{ ...validEntry, preferredIngredients: [''] }])).toContain('Entry 1 is invalid');
  });

  it('rejects a malformed substitutionRules map', () => {
    expect(errorsOf([{ ...validEntry, substitutionRules: ['mango'] }])).toContain('Entry 1 is invalid');
    expect(errorsOf([{ ...validEntry, substitutionRules: { mango: 'apple' } }])).toContain('Entry 1 is invalid');
  });

  it('rejects unknown ingredient ids in either list', () => {
    expect(errorsOf([{ ...validEntry, preferredIngredients: ['brown-rice', 'unicorn-steak'] }])).toContain(
      'unknown ingredient id(s): unicorn-steak',
    );
    expect(errorsOf([{ ...validEntry, blockedIngredients: ['dragon-fruit'] }])).toContain(
      'unknown ingredient id(s): dragon-fruit',
    );
  });

  it('rejects unknown ids referenced by substitution rules', () => {
    expect(errorsOf([{ ...validEntry, substitutionRules: { mango: ['lychee'] } }])).toContain(
      'unknown ingredient id(s) in substitution rules: lychee',
    );
  });

  it('rejects duplicates within a single list', () => {
    expect(errorsOf([{ ...validEntry, preferredIngredients: ['brown-rice', 'brown-rice'] }])).toContain(
      'duplicate preferred ingredient id(s): brown-rice',
    );
    expect(errorsOf([{ ...validEntry, blockedIngredients: ['mango', 'mango'] }])).toContain(
      'duplicate blocked ingredient id(s): mango',
    );
  });

  it('rejects duplicate client entries', () => {
    expect(errorsOf([validEntry, { ...validEntry }])).toContain('Duplicate client entries');
  });
});

describe('Phase 1 · import · blocked and preferred must be disjoint (A2 hard invariant)', () => {
  it('rejects an id listed as BOTH blocked and preferred', () => {
    const errors = errorsOf([
      { ...validEntry, blockedIngredients: ['brown-rice'], preferredIngredients: ['brown-rice', 'broccoli'] },
    ]);
    expect(errors).toContain('listed as BOTH blocked and preferred: brown-rice');
    expect(errors).toContain('Blocked and preferred must be disjoint');
  });

  it('never returns restrictions for a contradictory payload', () => {
    const result = validate([
      { ...validEntry, blockedIngredients: ['brown-rice'], preferredIngredients: ['brown-rice'] },
    ]);
    expect(result.ok).toBe(false);
    expect(result.restrictions).toEqual([]);
  });
});

describe('Phase 1 · import · client-id mismatch', () => {
  it('rejects a payload with no entry for the active client', () => {
    const errors = errorsOf([{ ...validEntry, clientId: 'someone-else' }]);
    expect(errors).toContain('no entry for the current client (client-1)');
    expect(errors).toContain('would clear this client');
  });

  it('accepts a payload that does contain the active client', () => {
    expect(validate([{ ...validEntry, clientId: 'client-1' }]).ok).toBe(true);
  });

  it('skips the check when no client is active (bulk import)', () => {
    expect(validate([{ ...validEntry, clientId: 'someone-else' }], null).ok).toBe(true);
  });
});

describe('Phase 1 · import · error formatting', () => {
  it('bounds the toast text and reports the remainder', () => {
    const formatted = formatRestrictionImportErrors(['a', 'b', 'c', 'd', 'e'], 3);
    expect(formatted).toContain('a b c');
    expect(formatted).toContain('+2 more');
  });

  it('does not append a remainder when everything is shown', () => {
    expect(formatRestrictionImportErrors(['a', 'b'], 3)).toBe('a b');
  });
});
