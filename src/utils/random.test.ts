import { describe, it, expect } from 'vitest';
import { createSeededRng, hashStringToSeed } from './random';

describe('createSeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createSeededRng('client-abc-2026-W23');
    const b = createSeededRng('client-abc-2026-W23');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRng('client-abc-2026-W23');
    const b = createSeededRng('client-abc-2026-W24');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('always returns floats in [0, 1)', () => {
    const rng = createSeededRng('test');
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(max) is always in [0, max)', () => {
    const rng = createSeededRng('test');
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('pick returns a member of the array', () => {
    const rng = createSeededRng('test');
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('pick returns undefined for an empty array', () => {
    const rng = createSeededRng('test');
    expect(rng.pick([])).toBeUndefined();
  });

  it('shuffle preserves all elements (no loss, no duplicates)', () => {
    const rng = createSeededRng('test');
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = rng.shuffle(arr);
    expect(shuffled).toHaveLength(arr.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(arr);
  });

  it('shuffle is deterministic for the same seed', () => {
    const a = createSeededRng('test-shuffle');
    const b = createSeededRng('test-shuffle');
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(a.shuffle(arr)).toEqual(b.shuffle(arr));
  });
});

describe('hashStringToSeed', () => {
  it('is deterministic', () => {
    expect(hashStringToSeed('hello')).toBe(hashStringToSeed('hello'));
  });

  it('produces different seeds for different inputs', () => {
    expect(hashStringToSeed('hello')).not.toBe(hashStringToSeed('world'));
  });

  it('returns a 32-bit unsigned integer', () => {
    const s = hashStringToSeed('test');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(s)).toBe(true);
  });
});
