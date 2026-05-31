import { GLOBAL_STAMINA_DRAIN_MULT, STAMINA_EFFICIENCY_MAX } from './constants.js';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * 馬ごとの経験によるスタミナ消費効率（1.0 = 標準、低いほど減りにくい）
 * @param {number} [staminaEfficiency] career.stamina_efficiency 0..1
 */
export function calcCareerDrainMult(staminaEfficiency = 0.5) {
  const eff = clamp01(staminaEfficiency);
  return Math.max(0.92, 1 - STAMINA_EFFICIENCY_MAX * eff);
}

/**
 * 本編・ゴールで共通のスタミナ減算倍率
 * @param {{ careerDrainMult?: number }} horse
 */
export function getCombinedStaminaDrainMult(horse) {
  const career = Number.isFinite(horse?.careerDrainMult) ? horse.careerDrainMult : 1;
  return GLOBAL_STAMINA_DRAIN_MULT * career;
}
