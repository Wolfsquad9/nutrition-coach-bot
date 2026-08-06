/**
 * Deterministic seed derivation for the optimization engine.
 *
 * Each candidate in a regeneration population gets a unique seed derived from:
 *   clientId + regenerationCount + candidateIndex
 *
 * This guarantees:
 * - Different regeneration clicks produce different seed populations
 *   (because regenerationCount increments).
 * - The same (clientId, regenerationCount, candidateIndex) always yields
 *   the same seed, preserving reproducibility for tests and coaches.
 */

export const SEED_PREFIX = 'plan';

export function createCandidateSeed(
  clientId: string,
  regenerationCount: number,
  candidateIndex: number
): string {
  return `${SEED_PREFIX}-${clientId}-${regenerationCount}-candidate-${candidateIndex}`;
}

export function createRegenerationSeed(
  clientId: string,
  regenerationCount: number
): string {
  return `${SEED_PREFIX}-${clientId}-${regenerationCount}`;
}