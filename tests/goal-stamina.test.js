import { describe, expect, it } from 'vitest';
import { getStaminaBarClassName, getStaminaDisplayBarPct } from '../src/ui/entry-stamina.js';
import { calcRunningStaminaDrain } from '../src/engine/stamina-drain.js';
import { getRaceDistanceBudget } from '../src/engine/race-effort.js';

describe('実際の余力とスタミナバー', () => {
  it('100%から0%まで実残量を表示し、半分で空にならない', () => {
    for (const pct of [100, 66, 50, 33, 10, 0]) {
      expect(getStaminaDisplayBarPct({ stamina: pct * 1.5, initialStamina: 150 })).toBeCloseTo(pct);
    }
    expect(getStaminaBarClassName(33)).toContain('is-critical');
    expect(getStaminaBarClassName(50)).toContain('is-warning');
    expect(getStaminaBarClassName(80)).toBe('stamina-remain-bar');
  });

  it('小数残量を保ち、不正・範囲外の入力でもバー幅を壊さない', () => {
    expect(getStaminaDisplayBarPct({ stamina: 49.75, initialStamina: 100 })).toBe(49.75);
    for (const h of [null, {}, { initialStamina: 0, stamina: 5 }, { initialStamina: 100, stamina: NaN }]) {
      expect(getStaminaDisplayBarPct(h)).toBe(0);
    }
    expect(getStaminaDisplayBarPct({ initialStamina: 100, stamina: -4 })).toBe(0);
    expect(getStaminaDisplayBarPct({ initialStamina: 100, stamina: 140 })).toBe(100);
  });
});

describe('道中・ゴール共通の消費', () => {
  const horse = { initialStamina: 150, S_sustain: 70, careerDrainMult: 0.98 };

  it('本編と最後の200mの距離合計がレース距離になる', () => {
    for (const distance of [1200, 1600, 2200, 2400, 3200]) {
      const budget = getRaceDistanceBudget(distance);
      expect(budget.main + budget.goal).toBe(distance);
    }
  });

  it('同じ移動・加速の消費量は30/60/120fpsで変わらない', () => {
    const simulate = fps => {
      let drain = 0;
      for (let i = 0; i < fps * 10; i++) {
        drain += calcRunningStaminaDrain(horse, {
          distanceMeters: 18 / fps, totalDistance: 1200, effort: 0.95,
          deltaSpeed: 2 / (fps * 10),
        });
      }
      return drain;
    };
    expect(simulate(30)).toBeCloseTo(simulate(60), 8);
    expect(simulate(120)).toBeCloseTo(simulate(60), 8);
  });

  it('巡航中にも負荷に応じて消費し、加速と外回りには代償がある', () => {
    const params = { distanceMeters: 100, totalDistance: 1600, effort: 0.4 };
    const easy = calcRunningStaminaDrain(horse, params);
    expect(easy).toBeGreaterThan(0);
    expect(calcRunningStaminaDrain(horse, { ...params, effort: 1 })).toBeGreaterThan(easy * 2);
    expect(calcRunningStaminaDrain(horse, { ...params, deltaSpeed: 1 })).toBeGreaterThan(easy);
    expect(calcRunningStaminaDrain(horse, { ...params, laneFactor: 1.08 })).toBeGreaterThan(easy);
  });
});
