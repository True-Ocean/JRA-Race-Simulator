import { describe, expect, it } from 'vitest';
import { easeCardAdjust, resolveHorseCardPlacement } from '../src/ui/horse-card-spacing.js';

describe('resolveHorseCardPlacement', () => {
  const options = {
    cardSpacing: 40,
    nearLaneGap: 1.2,
    nearXGap: 30,
    maxLateralNudge: 12,
  };

  it('離れたレーンの馬は基準位置のまま並走できる', () => {
    const placed = resolveHorseCardPlacement([
      { id: 1, x: 100, lane: 2, baseY: 200 },
      { id: 2, x: 101, lane: 8, baseY: 198 },
    ], options);
    expect(placed.get(1).y).toBeCloseTo(200, 5);
    expect(placed.get(2).y).toBeCloseTo(198, 5);
  });

  it('同じレーンで近い馬はカード1枚分以上あける', () => {
    const placed = resolveHorseCardPlacement([
      { id: 1, x: 120, lane: 4, baseY: 180 },
      { id: 2, x: 112, lane: 4.1, baseY: 186 },
    ], options);
    const lead = placed.get(1);
    const trail = placed.get(2);
    expect(lead.y).toBeCloseTo(180, 5);
    expect(trail.y - lead.y).toBeGreaterThanOrEqual(39);
  });

  it('前後が入れ替わっても位置の変化は連続に近い', () => {
    let prev = null;
    let maxJump = 0;
    for (let step = 0; step <= 20; step += 1) {
      const x = 100 + (step - 10) * 1.5;
      const placed = resolveHorseCardPlacement([
        { id: 1, x, lane: 5, baseY: 200 - step },
        { id: 2, x: 100, lane: 5.05, baseY: 210 },
      ], options);
      const y = placed.get(2).y;
      if (prev != null) maxJump = Math.max(maxJump, Math.abs(y - prev));
      prev = y;
    }
    expect(maxJump).toBeLessThan(options.cardSpacing);
  });
});

describe('easeCardAdjust', () => {
  it.each([30, 60, 120])('%sfpsでも補正の上限速度は秒単位で一定', (fps) => {
    let position = { y: 0, x: 0 };
    for (let i = 0; i < fps; i++) {
      position = easeCardAdjust(position, { y: 1000, x: 0 }, 1000 / fps, { maxYSpeed: 28 });
    }
    expect(position.y).toBeCloseTo(28, 8);
  });

  it('目標が大きく跳んでも1フレームでは追いつかない', () => {
    const next = easeCardAdjust({ y: 0, x: 0 }, { y: 80, x: 20 }, 16, { tauY: 90, tauX: 90 });
    expect(next.y).toBeGreaterThan(0);
    expect(next.y).toBeLessThan(30);
    expect(Math.abs(next.x)).toBeLessThan(8);
  });

  it('経過0のフレームでは前の補正を保つ', () => {
    const next = easeCardAdjust({ y: 12, x: -3 }, { y: 40, x: 4 }, 0, 90);
    expect(next).toEqual({ y: 12, x: -3 });
  });
});
