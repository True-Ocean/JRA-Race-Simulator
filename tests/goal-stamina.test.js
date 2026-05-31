import { describe, expect, it } from 'vitest';
import { getStaminaBarClassName } from '../src/ui/entry-stamina.js';
import {
  calcGoalPathQuality,
  calcGoalReserveBurnDrain,
  calcGoalLeadingHoldDrain,
} from '../src/ui/goal-scene.js';

describe('スタミナバー色分け（表示%の3等分）', () => {
  it('下1/3=赤・中1/3=黄・上1/3=緑', () => {
    expect(getStaminaBarClassName(10)).toContain('is-critical');
    expect(getStaminaBarClassName(33)).toContain('is-critical');
    expect(getStaminaBarClassName(40)).toContain('is-warning');
    expect(getStaminaBarClassName(66)).toContain('is-warning');
    expect(getStaminaBarClassName(80)).toBe('stamina-remain-bar');
    expect(getStaminaBarClassName(100)).toBe('stamina-remain-bar');
  });
});

describe('ゴールシーンスタミナ燃焼', () => {
  it('進路が空いているほど pathQuality が高い', () => {
    const open = calcGoalPathQuality(18, 1.0, 0);
    const blocked = calcGoalPathQuality(2, 0.25, 900);
    expect(open).toBeGreaterThan(blocked);
  });

  it('残スタミナが多いほど reserveBurn が大きい（ゴール接近後）', () => {
    const base = {
      initialStamina: 150,
      remainMeters: 80,
      goalCurrentMps: 16,
      staminaRatio: 0.8,
      pathQuality: 0.9,
      distRatio: 0.65,
      dt: 0.05,
    };
    const high = calcGoalReserveBurnDrain({ ...base, stamina: 120 });
    const low = calcGoalReserveBurnDrain({ ...base, stamina: 40 });
    expect(high).toBeGreaterThan(low);
  });

  it('ゴールシーン序盤（distRatio 低）は reserveBurn がほぼゼロ', () => {
    const burn = calcGoalReserveBurnDrain({
      initialStamina: 150,
      stamina: 120,
      remainMeters: 190,
      goalCurrentMps: 15,
      staminaRatio: 0.8,
      pathQuality: 0.95,
      distRatio: 0.05,
      dt: 0.05,
    });
    expect(burn).toBe(0);
  });

  it('先頭グループの粘りドレインは先頭時のみ発生する', () => {
    const drain = calcGoalLeadingHoldDrain({
      initialStamina: 150,
      staminaRatio: 0.7,
      pathQuality: 0.8,
      distRatio: 0.55,
      dt: 0.05,
      isLeadingPack: true,
    });
    const none = calcGoalLeadingHoldDrain({
      initialStamina: 150,
      staminaRatio: 0.7,
      pathQuality: 0.8,
      distRatio: 0.5,
      dt: 0.05,
      isLeadingPack: false,
    });
    expect(drain).toBeGreaterThan(0);
    expect(none).toBe(0);
  });
});
