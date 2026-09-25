import { describe, expect, it } from 'vitest';
import {
  calcGoalExpressionMult,
  calcGoalAccelTierMult,
  calcGoalReserveBoost,
} from '../src/engine/goal-stamina-expression.js';
import { resolveStaminaTier } from '../src/engine/stamina-display.js';
import { getStaminaBarClassName } from '../src/ui/entry-stamina.js';

describe('ゴールスタミナ発揮率（表示％連動）', () => {
  it('緑 > 黄 > 赤の順で expressionMult が高い', () => {
    const green = calcGoalExpressionMult(80, 0.5);
    const yellow = calcGoalExpressionMult(50, 0.5);
    const red = calcGoalExpressionMult(20, 0.5);
    expect(green).toBeGreaterThan(yellow);
    expect(yellow).toBeGreaterThan(red);
  });

  it('goal_class_index（G1着順主）が高いほどゴール速度が有利', () => {
    const low = calcGoalExpressionMult(80, 0.15);
    const high = calcGoalExpressionMult(80, 0.95);
    expect(high).toBeGreaterThan(low);
    expect(high - low).toBeGreaterThan(0.12);
  });

  it('tier は entry-stamina の色分けと一致', () => {
    expect(resolveStaminaTier(80)).toBe('green');
    expect(resolveStaminaTier(50)).toBe('yellow');
    expect(resolveStaminaTier(20)).toBe('red');
    expect(getStaminaBarClassName(80)).toBe('stamina-remain-bar');
    expect(getStaminaBarClassName(20)).toContain('is-critical');
  });

  it('赤 tier の加速倍率は緑より低い', () => {
    expect(calcGoalAccelTierMult(20)).toBeLessThan(calcGoalAccelTierMult(80));
  });

  it('バーの色が切り替わっても速度・加速が不連続に跳ねない', () => {
    for (const boundary of [33, 66]) {
      for (const expression of [calcGoalExpressionMult, calcGoalAccelTierMult, calcGoalReserveBoost]) {
        expect(Math.abs(expression(boundary + 0.01) - expression(boundary - 0.01)))
          .toBeLessThan(0.001);
      }
    }
  });

  it('余力が残るほど追い出しが強まり、最大14%に収まる', () => {
    expect(calcGoalReserveBoost(0)).toBe(0);
    expect(calcGoalReserveBoost(20)).toBeLessThan(calcGoalReserveBoost(35));
    expect(calcGoalReserveBoost(35)).toBeLessThan(calcGoalReserveBoost(50));
    expect(calcGoalReserveBoost(50)).toBeGreaterThan(0.12);
    expect(calcGoalReserveBoost(100)).toBeCloseTo(0.14);
    expect(calcGoalReserveBoost(200)).toBeCloseTo(0.14);
  });

  it('控えている間は追い出さず、仕掛けに応じて連続的に強まる', () => {
    expect(calcGoalReserveBoost(60, 0.5)).toBe(0);
    expect(calcGoalReserveBoost(60, 0.7)).toBeLessThan(calcGoalReserveBoost(60, 0.9));
    expect(calcGoalReserveBoost(60, 0.9)).toBeLessThan(calcGoalReserveBoost(60, 1));
    expect(calcGoalReserveBoost(NaN)).toBe(0);
    expect(calcGoalReserveBoost(60, NaN)).toBe(0);
  });
});
