import { CONFIG } from '../config.js';

export function calcPhaseCount(distance) {
  return Math.max(5, Math.round(distance / 270));
}

export function buildPhases(distance) {
  const total  = calcPhaseCount(distance);
  const phases = [];

  // コーナーフェーズのインデックス（全フェーズ数に対して均等配置）
  const cornerSlots = [
    Math.floor(total * 0.15),
    Math.floor(total * 0.35),
    Math.floor(total * 0.55),
    Math.floor(total * 0.75),
  ].filter(i => i < total - 1 && i > 0);
  const cornerSet = new Set(cornerSlots);

  for (let i = 0; i < total; i++) {
    phases.push({
      index:    i,
      isCorner: cornerSet.has(i),
      isFinal:  i === total - 1,
      distance: distance / total,
      // フェーズ比率（0〜1）
      ratio:    i / (total - 1),
    });
  }
  return phases;
}

export function laneIndex(y) {
  return Math.max(1, Math.min(18, Math.round(y)));
}

/**
 * 脚質とフェーズ比率からスピード倍率を取得
 */
export function getStylePaceMultiplier(style, phaseRatio) {
  const paceArr = CONFIG.STYLE_PACE[style] ?? CONFIG.STYLE_PACE['差し'];
  const idx     = Math.min(paceArr.length - 1, Math.floor(phaseRatio * paceArr.length));
  return paceArr[idx];
}

export function calcStaminaCons(phase, horse, trackModifier) {
  const battleCost = horse.battleLosses * CONFIG.BATTLE_STAMINA_COST;
  const lane       = laneIndex(horse.y);
  const cornerCost = phase.isCorner && lane >= 4 ? CONFIG.CORNER_STAMINA_COST : 0;
  return (phase.distance * trackModifier * 0.012) + battleCost + cornerCost;
}

export function applyCornerLoss(phase, horse) {
  if (!phase.isCorner) return;
  const lane  = laneIndex(horse.y);
  const coeff = CONFIG.LANE_COEFF[lane];
  horse.distanceLoss += phase.distance * (coeff - 1);
}