import { describe, expect, it } from 'vitest';
import { createRng, randFloat, randInt } from '../src/engine/rng.js';

describe('createRng', () => {
  it('同じ seed なら同じ乱数列を返す', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('seed が異なれば乱数列も異なる', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
  });

  it('randInt / randFloat が範囲内の値を返す', () => {
    const rng = createRng(99);
    for (let i = 0; i < 20; i += 1) {
      expect(randInt(rng, 3, 7)).toBeGreaterThanOrEqual(3);
      expect(randInt(rng, 3, 7)).toBeLessThanOrEqual(7);
      expect(randFloat(rng, 0.2, 0.8)).toBeGreaterThanOrEqual(0.2);
      expect(randFloat(rng, 0.2, 0.8)).toBeLessThanOrEqual(0.8);
    }
  });
});
