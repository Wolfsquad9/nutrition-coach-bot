"use strict";
/**
 * Deterministic pseudo-random number generator.
 *
 * Why: the plan generator uses `Math.random()` to pick recipes, exercises,
 * and muscle groups. That makes the same client + same input produce
 * different plans on every generation, which breaks reproducibility for
 * coaches and causes "the AI gave me a worse plan this time" support tickets.
 *
 * Mulberry32 is a tiny, well-known seeded PRNG. Seed it with a stable value
 * (e.g. `client.id + week`) and the entire plan becomes reproducible.
 *
 * Usage:
 *   const rng = createSeededRng(`${client.id}-${weekNumber}`);
 *   const recipe = pickRandom(proteins, rng);
 *   const shuffled = shuffle(muscleExercises, rng);
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashStringToSeed = hashStringToSeed;
exports.createSeededRng = createSeededRng;
/**
 * Hash a string to a 32-bit unsigned integer.
 * Used to derive a seed from a stable identifier like client.id.
 */
function hashStringToSeed(input) {
    let h = 2166136261 >>> 0; // FNV offset basis
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0; // FNV prime
    }
    return h >>> 0;
}
/**
 * Mulberry32 PRNG. Returns a function that yields floats in [0, 1).
 * State is captured in the closure, so each call advances the stream.
 */
function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/**
 * Create a seeded RNG instance. Same seed = same sequence = reproducible plans.
 */
function createSeededRng(seedInput) {
    const seed = typeof seedInput === 'number' ? seedInput : hashStringToSeed(seedInput);
    const next = mulberry32(seed);
    return {
        next,
        int: (max) => Math.floor(next() * max),
        pick: (arr) => (arr.length === 0 ? undefined : arr[Math.floor(next() * arr.length)]),
        shuffle: (arr) => {
            const out = arr.slice();
            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [out[i], out[j]] = [out[j], out[i]];
            }
            return out;
        },
    };
}
