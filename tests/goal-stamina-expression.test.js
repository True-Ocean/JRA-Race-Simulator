import { describe, expect, it } from 'vitest';
import {
  calcGoalExpressionMult,
  calcGoalAccelTierMult,
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
});
