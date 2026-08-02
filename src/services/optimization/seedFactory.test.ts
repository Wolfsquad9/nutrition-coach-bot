import { describe, it, expect } from 'vitest';
import { createCandidateSeed, createRegenerationSeed, SEED_PREFIX } from './seedFactory';

describe('createCandidateSeed', () => {
  it('is deterministic for the same inputs', () => {
    const a = createCandidateSeed('client-1', 2, 3);
    const b = createCandidateSeed('client-1', 2, 3);
    expect(a).toBe(b);
  });

  it('produces different seeds for different candidate indices', () => {
    const a = createCandidateSeed('client-1', 2, 0);
    const b = createCandidateSeed('client-1', 2, 1);
    expect(a).not.toBe(b);
  });

  it('produces different seeds for different regeneration counts', () => {
    const a = createCandidateSeed('client-1', 1, 0);
    const b = createCandidateSeed('client-1', 2, 0);
    expect(a).not.toBe(b);
  });

  it('produces different seeds for different clients', () => {
    const a = createCandidateSeed('client-A', 1, 0);
    const b = createCandidateSeed('client-B', 1, 0);
    expect(a).not.toBe(b);
  });

  it('produces unique seeds across a full candidate population', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => createCandidateSeed('client-1', 5, i));
    expect(new Set(seeds).size).toBe(10);
  });

  it('contains the seed prefix', () => {
    expect(createCandidateSeed('client-1', 1, 0)).toContain(SEED_PREFIX);
  });
});

describe('createRegenerationSeed', () => {
  it('is deterministic for the same inputs', () => {
    expect(createRegenerationSeed('client-1', 3)).toBe(createRegenerationSeed('client-1', 3));
  });

  it('produces different seeds for different regeneration counts', () => {
    expect(createRegenerationSeed('client-1', 1)).not.toBe(createRegenerationSeed('client-1', 2));
  });

  it('contains the seed prefix', () => {
    expect(createRegenerationSeed('client-1', 1)).toContain(SEED_PREFIX);
  });
});