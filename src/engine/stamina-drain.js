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

/**
 * 本編・ゴール共通の仕事量。基礎走行＋負荷の二乗＋実際に増した速度を課金する。
 * distanceMeters はコース上の距離（描画用 x ではない）。加速分に dt を二重に掛けない。
 * sprintBoost は余力で実際に増した速度の割合。追い出しの追加出力も走行負荷へ反映する。
 * ゴール時の残量や着順を強制せず、使った脚だけを差し引く。
 */
export function calcRunningStaminaDrain(horse, {
  distanceMeters, totalDistance, effort, speedRatio = 1,
  trackModifier = 1, laneFactor = 1, deltaSpeed = 0, sprintBoost = 0,
}) {
  if (!(horse?.initialStamina > 0) || !(totalDistance > 0)) return 0;
  const distance = Math.max(0, Number(distanceMeters) || 0);
  const load = clamp01(effort);
  const sustain = clamp01((horse.S_sustain ?? 50) / 100);
  const efficiency = 1.18 - sustain * 0.32;
  const speed = Math.max(0.5, Math.min(1.5, speedRatio));
  const running = (distance / totalDistance) * (0.34 + 0.98 * load * load)
    * (0.90 + 0.10 * speed * speed) * (1 + 3 * clamp01(sprintBoost))
    * trackModifier * laneFactor;
  const acceleration = Math.max(0, deltaSpeed) * 0.006;
  return horse.initialStamina * (running + acceleration) * efficiency
    * getCombinedStaminaDrainMult(horse) * (horse.weightStaminaMult ?? 1);
}
