import {
  GOAL_EXPRESSION_CAREER_MAX,
  GOAL_EXPRESSION_CAREER_MIN,
  GOAL_CAREER_ACCEL_MAX,
  GOAL_CAREER_ACCEL_MIN,
} from './constants.js';
import { staminaSpeedMultiplier, staminaAccelMultiplier } from './race-effort.js';
import { resolveGoalClassIndex } from './career-goal.js';
import {
  getStaminaDisplayBarPct,
  resolveStaminaTier,
} from './stamina-display.js';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

/**
 * 最後の追い出しで余力を速度へ変える追加分（最大14%）。
 * 疲労による基礎発揮率とは分け、シーン入口で速度を跳ね上げず加速で到達させる。
 * 色境界には依存せず、余力・仕掛けの強さの両方が必要。
 */
export function calcGoalReserveBoost(displayPct, effort = 1) {
  const smooth = value => {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
  };
  return 0.14 * smooth(displayPct / 60) * smooth((effort - 0.55) / 0.45);
}

/** 重賞実績（G1 着順中心）によるゴール速度・加速の乗算 */
export function calcGoalCareerSpeedMult(goalClassIndex = 0.5) {
  return lerp(
    GOAL_EXPRESSION_CAREER_MIN,
    GOAL_EXPRESSION_CAREER_MAX,
    clamp01(goalClassIndex),
  );
}

export function calcGoalCareerAccelMult(goalClassIndex = 0.5) {
  return lerp(
    GOAL_CAREER_ACCEL_MIN,
    GOAL_CAREER_ACCEL_MAX,
    clamp01(goalClassIndex),
  );
}

/**
 * 実残量に応じた発揮率。バーの色境界で速度を飛ばさない。
 * @param {number} displayPct 0〜100
 * @param {number} [goalClassIndex] 0〜1（career.goal_class_index / G1着順主）
 */
export function calcGoalExpressionMult(displayPct, goalClassIndex = 0.5) {
  const ratio = clamp01(displayPct / 100);
  const base = staminaSpeedMultiplier(ratio) * (0.98 + 0.04 * ratio);
  return base * calcGoalCareerSpeedMult(goalClassIndex);
}

/** 色分けとは独立した連続的な加速余力。 */
export function calcGoalAccelTierMult(displayPct, goalClassIndex = 0.5) {
  return staminaAccelMultiplier(clamp01(displayPct / 100)) * calcGoalCareerAccelMult(goalClassIndex);
}

export function getGoalStaminaSpeedState(horse) {
  const displayPct = getStaminaDisplayBarPct(horse);
  const tier = resolveStaminaTier(displayPct);
  const goalClassIndex = Number.isFinite(horse.goalClassIndex)
    ? horse.goalClassIndex
    : resolveGoalClassIndex({ class_index: horse.classIndex });
  return {
    displayPct,
    tier,
    goalClassIndex,
    expressionMult: calcGoalExpressionMult(displayPct, goalClassIndex),
    accelTierMult: calcGoalAccelTierMult(displayPct, goalClassIndex),
    careerSpeedMult: calcGoalCareerSpeedMult(goalClassIndex),
    careerAccelMult: calcGoalCareerAccelMult(goalClassIndex),
  };
}
