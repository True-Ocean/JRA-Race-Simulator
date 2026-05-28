import { describe, expect, it } from 'vitest';
import {
  buildBattleProximityLimits,
  buildGoalBattleProximityLimits,
  detectContacts,
  isPairBattleProximity,
  shouldBattle,
} from '../src/engine/battle.js';
import { createRng } from '../src/engine/rng.js';

describe('battle proximity', () => {
  const horseA = { id: 1, name: 'A', x: 100, y: 5 };
  const horseB = { id: 2, name: 'B', x: 110, y: 5.2 };
  const horseFar = { id: 3, name: 'C', x: 200, y: 5 };

  it('buildBattleProximityLimits は描画メトリクスを優先する', () => {
    const limits = buildBattleProximityLimits({ drawNearXGap: 30, drawNearLaneGap: 0.9 });
    expect(limits.maxDx).toBeCloseTo(30 * 1.20);
    expect(limits.maxDy).toBe(0.9);
  });

  it('近い2頭のみ isPairBattleProximity が true', () => {
    const limits = buildBattleProximityLimits({ drawNearXGap: 30, drawNearLaneGap: 1.0 });
    expect(isPairBattleProximity(horseA, horseB, limits)).toBe(true);
    expect(isPairBattleProximity(horseA, horseFar, limits)).toBe(false);
  });

  it('detectContacts は遠いペアを返さない', () => {
    const limits = buildBattleProximityLimits({ drawNearXGap: 25, drawNearLaneGap: 1.0 });
    const pairs = detectContacts([horseA, horseB, horseFar], limits);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe(1);
    expect(pairs[0].b.id).toBe(2);
  });

  it('shouldBattle は遠いペアでは false', () => {
    const rng = createRng(42);
    const limits = buildBattleProximityLimits({ drawNearXGap: 25, drawNearLaneGap: 1.0 });
    expect(shouldBattle(rng, [horseA, horseFar], horseA, horseFar, limits)).toBe(false);
  });

  it('ゴール用 limits は本編の広いコース展開時より狭い', () => {
    const main = buildBattleProximityLimits({ drawNearXGap: 40, drawNearLaneGap: 1.0 });
    const goal = buildGoalBattleProximityLimits();
    expect(goal.maxDx).toBeLessThan(main.maxDx);
  });

  it('ゴール用 rateBonus で近接ペアの成功率が上がる', () => {
    const limits = buildGoalBattleProximityLimits();
    let goalHits = 0;
    let mainHits = 0;
    for (let seed = 0; seed < 200; seed++) {
      const rngGoal = createRng(seed);
      const rngMain = createRng(seed);
      if (shouldBattle(rngGoal, [horseA, horseB], horseA, horseB, limits, { rateBonus: 0.14 })) {
        goalHits += 1;
      }
      if (shouldBattle(rngMain, [horseA, horseB], horseA, horseB, limits)) {
        mainHits += 1;
      }
    }
    expect(goalHits).toBeGreaterThan(mainHits);
  });
});
