import { describe, expect, it } from 'vitest';
import {
  calcWeightStaminaMult,
  getWeightStaminaMult,
  applyBattleStaminaImpact,
} from '../src/engine/horse-utils.js';
import { WEIGHT_STAMINA_REF_KG } from '../src/engine/constants.js';

describe('calcWeightStaminaMult', () => {
  it('基準斤量は1.0', () => {
    expect(calcWeightStaminaMult(WEIGHT_STAMINA_REF_KG)).toBe(1);
  });

  it('軽い斤量は消耗が減る', () => {
    expect(calcWeightStaminaMult(55)).toBeCloseTo(0.97, 5);
  });

  it('重い斤量は消耗が増える', () => {
    expect(calcWeightStaminaMult(59)).toBeCloseTo(1.03, 5);
  });

  it('斤量未設定は1.0', () => {
    expect(calcWeightStaminaMult(null)).toBe(1);
    expect(calcWeightStaminaMult(undefined)).toBe(1);
  });
});

describe('getWeightStaminaMult', () => {
  it('事前計算済みの weightStaminaMult を優先する', () => {
    expect(getWeightStaminaMult({ weight: 57, weightStaminaMult: 0.5 })).toBe(0.5);
  });
});

describe('applyBattleStaminaImpact', () => {
  it('斤量が重い敗者ほどスタミナを多く失う', () => {
    const winner = {
      stamina: 100,
      initialStamina: 100,
      J_reliability: 50,
      weight: 55,
      weightStaminaMult: calcWeightStaminaMult(55),
    };
    const loserLight = {
      stamina: 100,
      initialStamina: 100,
      J_reliability: 50,
      weight: 55,
      weightStaminaMult: calcWeightStaminaMult(55),
    };
    const loserHeavy = {
      stamina: 100,
      initialStamina: 100,
      J_reliability: 50,
      weight: 59,
      weightStaminaMult: calcWeightStaminaMult(59),
    };
    applyBattleStaminaImpact(winner, loserLight);
    const lightDrain = 100 - loserLight.stamina;
    loserHeavy.stamina = 100;
    applyBattleStaminaImpact(winner, loserHeavy);
    const heavyDrain = 100 - loserHeavy.stamina;
    expect(heavyDrain).toBeGreaterThan(lightDrain);
  });
});
