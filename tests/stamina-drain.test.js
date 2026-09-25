import { describe, expect, it } from 'vitest';
import {
  calcCareerDrainMult,
  getCombinedStaminaDrainMult,
  calcRunningStaminaDrain,
} from '../src/engine/stamina-drain.js';
import { GLOBAL_STAMINA_DRAIN_MULT } from '../src/engine/constants.js';

describe('スタミナ消費倍率', () => {
  it('経験が高いほど careerDrainMult は低い（減りにくい）', () => {
    expect(calcCareerDrainMult(0.9)).toBeLessThan(calcCareerDrainMult(0.2));
  });

  it('combined はベース × career', () => {
    const horse = { careerDrainMult: calcCareerDrainMult(0.8) };
    expect(getCombinedStaminaDrainMult(horse)).toBeCloseTo(
      GLOBAL_STAMINA_DRAIN_MULT * horse.careerDrainMult,
      5,
    );
  });

  it('実際に発揮した追い出しに追加の脚を使い、距離分割でも消費量が変わらない', () => {
    const horse = { initialStamina: 150, S_sustain: 70 };
    const context = { totalDistance: 2200, distanceMeters: 100, effort: 1 };
    const normal = calcRunningStaminaDrain(horse, context);
    const sprint = calcRunningStaminaDrain(horse, { ...context, sprintBoost: 0.14 });
    expect(sprint).toBeCloseTo(normal * 1.42);
    expect(calcRunningStaminaDrain(horse, { ...context, distanceMeters: 50, sprintBoost: 0.14 }) * 2)
      .toBeCloseTo(sprint);
    expect(calcRunningStaminaDrain(horse, { ...context, sprintBoost: 0 })).toBe(normal);
    expect(calcRunningStaminaDrain(horse, { ...context, distanceMeters: 0, sprintBoost: 0.14 })).toBe(0);
  });
});
