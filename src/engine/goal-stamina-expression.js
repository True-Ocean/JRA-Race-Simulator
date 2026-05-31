import {
  GOAL_EXPRESSION_CAREER_MAX,
  GOAL_EXPRESSION_CAREER_MIN,
  GOAL_EXPRESSION_GREEN_MAX,
  GOAL_EXPRESSION_GREEN_MIN,
  GOAL_EXPRESSION_RED_MAX,
  GOAL_EXPRESSION_RED_MIN,
  GOAL_EXPRESSION_YELLOW_MAX,
  GOAL_EXPRESSION_YELLOW_MIN,
  GOAL_CAREER_ACCEL_MAX,
  GOAL_CAREER_ACCEL_MIN,
  GOAL_ACCEL_MULT_GREEN,
  GOAL_ACCEL_MULT_RED,
  GOAL_ACCEL_MULT_YELLOW,
} from './constants.js';
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
 * 表示％に応じたゴールシーン発揮率（毎フレーム再計算・UI色と同期）
 * @param {number} displayPct 0〜100
 * @param {number} [goalClassIndex] 0〜1（career.goal_class_index / G1着順主）
 */
export function calcGoalExpressionMult(displayPct, goalClassIndex = 0.5) {
  const pct = Math.max(0, Math.min(100, displayPct));
  let base;
  if (pct <= 33) {
    base = lerp(GOAL_EXPRESSION_RED_MIN, GOAL_EXPRESSION_RED_MAX, pct / 33);
  } else if (pct <= 66) {
    base = lerp(
      GOAL_EXPRESSION_YELLOW_MIN,
      GOAL_EXPRESSION_YELLOW_MAX,
      (pct - 33) / 33,
    );
  } else {
    base = lerp(
      GOAL_EXPRESSION_GREEN_MIN,
      GOAL_EXPRESSION_GREEN_MAX,
      (pct - 66) / 34,
    );
  }
  return base * calcGoalCareerSpeedMult(goalClassIndex);
}

/** スタミナ色 tier ＋ 重賞実績による加速スケール */
export function calcGoalAccelTierMult(displayPct, goalClassIndex = 0.5) {
  const tier = resolveStaminaTier(displayPct);
  let tierMult = GOAL_ACCEL_MULT_GREEN;
  if (tier === 'red') tierMult = GOAL_ACCEL_MULT_RED;
  else if (tier === 'yellow') tierMult = GOAL_ACCEL_MULT_YELLOW;
  return tierMult * calcGoalCareerAccelMult(goalClassIndex);
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
