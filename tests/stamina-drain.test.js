import { describe, expect, it } from 'vitest';
import {
  calcCareerDrainMult,
  getCombinedStaminaDrainMult,
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
});
