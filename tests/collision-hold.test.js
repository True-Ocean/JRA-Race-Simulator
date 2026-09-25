import { describe, expect, it } from 'vitest';
import { resolveHorseOverlaps } from '../src/engine/collision.js';

describe('resolveHorseOverlaps', () => {
  it('接触解消でも xHold より後ろへ戻さない', () => {
    const horses = [
      { id: 1, x: 100, y: 4, xHold: 100, style: '先行' },
      { id: 2, x: 104, y: 4.05, xHold: 104, style: '差し' },
    ];
    resolveHorseOverlaps(horses, {
      minXGap: 36,
      minYGap: 0.8,
      iterations: 4,
      keepOrder: true,
      freezeY: true,
    });
    expect(horses[0].x).toBeGreaterThanOrEqual(100);
    expect(horses[1].x).toBeGreaterThanOrEqual(104);
    const front = Math.max(horses[0].x, horses[1].x);
    const back = Math.min(horses[0].x, horses[1].x);
    expect(front - back).toBeGreaterThanOrEqual(35);
  });

  it('レーンが離れていれば前後位置を押し戻さない', () => {
    const horses = [
      { id: 1, x: 80, y: 2, xHold: 80, style: '逃げ' },
      { id: 2, x: 82, y: 9, xHold: 82, style: '追込' },
    ];
    resolveHorseOverlaps(horses, {
      minXGap: 40,
      minYGap: 0.9,
      iterations: 3,
      keepOrder: true,
      freezeY: true,
    });
    expect(horses[0].x).toBeCloseTo(80, 5);
    expect(horses[1].x).toBeCloseTo(82, 5);
  });
});
