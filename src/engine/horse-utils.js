import { CONFIG } from '../config.js';
import {
  STAMINA_BATTLE_BASE_COST,
  STAMINA_BATTLE_LOSER_EXTRA,
  STAMINA_BATTLE_TRACKER_GAIN,
  WEIGHT_STAMINA_REF_KG,
  WEIGHT_STAMINA_PER_KG,
  WEIGHT_STAMINA_MULT_MIN,
  WEIGHT_STAMINA_MULT_MAX,
  LANE_WIDTH,
} from './constants.js';

function clampLane(v) {
  return Math.max(1, Math.min(LANE_WIDTH, v));
}

function isNigeStyle(style) {
  return style === '逃げ' || style === '大逃げ';
}

function isOonigeStyle(style) {
  return style === '大逃げ';
}

function getJockeyReliabilityNorm(horse) {
  const value = Number.isFinite(horse?.J_reliability) ? horse.J_reliability : 50;
  return Math.max(0, Math.min(1, value / 100));
}

function getJockeyAggressionNorm(horse) {
  const value = Number.isFinite(horse?.J_aggression) ? horse.J_aggression : 50;
  return Math.max(0, Math.min(1, value / 100));
}

function isLaneInShiftPath(lane, fromLane, toLane, margin = 0.9) {
  const laneMin = Math.min(fromLane, toLane) - margin;
  const laneMax = Math.max(fromLane, toLane) + margin;
  return lane >= laneMin && lane <= laneMax;
}

/**
 * 斤量からバトル・加速時のスタミナ消耗倍率を算出（基準57kg = 1.0）
 * @param {number|null|undefined} weightKg
 * @returns {number}
 */
function calcWeightStaminaMult(weightKg) {
  if (!Number.isFinite(weightKg)) return 1;
  const delta = weightKg - WEIGHT_STAMINA_REF_KG;
  const mult = 1 + delta * WEIGHT_STAMINA_PER_KG;
  return Math.max(WEIGHT_STAMINA_MULT_MIN, Math.min(WEIGHT_STAMINA_MULT_MAX, mult));
}

function getWeightStaminaMult(horse) {
  if (Number.isFinite(horse?.weightStaminaMult)) return horse.weightStaminaMult;
  return calcWeightStaminaMult(horse?.weight);
}

function applyBattleStaminaImpact(winner, loser, options = {}) {
  const loserAlreadyPenalized = Boolean(options.loserAlreadyPenalized);
  const winnerMult = Number.isFinite(options.winnerMult) ? options.winnerMult : 1.0;
  const loserMult = Number.isFinite(options.loserMult) ? options.loserMult : 1.0;
  const winnerReliabilityGuard = 1.03 - getJockeyReliabilityNorm(winner) * 0.14;
  const loserReliabilityGuard = 1.08 - getJockeyReliabilityNorm(loser) * 0.26;
  const winnerDrain =
    STAMINA_BATTLE_BASE_COST * winnerMult * winnerReliabilityGuard * getWeightStaminaMult(winner);
  const loserExtraDrainBase = loserAlreadyPenalized
    ? Math.max(0, STAMINA_BATTLE_LOSER_EXTRA - CONFIG.BATTLE_STAMINA_COST * 0.55)
    : STAMINA_BATTLE_LOSER_EXTRA;
  const loserExtraDrain =
    loserExtraDrainBase * loserMult * loserReliabilityGuard * getWeightStaminaMult(loser);

  winner.stamina = Math.max(0, winner.stamina - winnerDrain);
  loser.stamina = Math.max(0, loser.stamina - loserExtraDrain);

  winner.staminaBattleCost = (winner.staminaBattleCost ?? 0) + winnerDrain;
  loser.staminaBattleCost = (loser.staminaBattleCost ?? 0) + loserExtraDrain;
  winner.staminaEventCost = (winner.staminaEventCost ?? 0) + winnerDrain;
  loser.staminaEventCost = (loser.staminaEventCost ?? 0) + loserExtraDrain;
  winner.eventFatigueScore = (winner.eventFatigueScore ?? 0) + winnerDrain * 0.45;
  loser.eventFatigueScore = (loser.eventFatigueScore ?? 0) + loserExtraDrain * 0.62;
  winner.recentEventLoad = (winner.recentEventLoad ?? 0) + winnerDrain * 0.45;
  loser.recentEventLoad = (loser.recentEventLoad ?? 0) + loserExtraDrain * 0.62;
  // 勝者までフェーズ消費を積み上げると枯渇が早すぎるため、追跡加算は敗者中心にする。
  winner.battleLosses = (winner.battleLosses ?? 0) + STAMINA_BATTLE_TRACKER_GAIN * 0.25;
  loser.battleLosses = (loser.battleLosses ?? 0) + STAMINA_BATTLE_TRACKER_GAIN;
  winner.battleFatigue = (winner.battleFatigue ?? 0) + winnerDrain * 0.35;
  loser.battleFatigue = (loser.battleFatigue ?? 0) + loserExtraDrain * 0.45;
}

export {
  clampLane,
  isNigeStyle,
  isOonigeStyle,
  getJockeyReliabilityNorm,
  getJockeyAggressionNorm,
  isLaneInShiftPath,
  calcWeightStaminaMult,
  getWeightStaminaMult,
  applyBattleStaminaImpact,
};
