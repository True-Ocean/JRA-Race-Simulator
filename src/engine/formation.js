import { FORMATION_LOCK_PHASE, LANE_WIDTH } from './constants.js';
import { isNigeStyle, isOonigeStyle } from './horse-utils.js';

/** 0=先頭側, 1=後方側 — 脚質ごとの目標隊列位置レンジ（レースごとにサンプル） */
export const STYLE_FORMATION_TARGET_RANK = {
  '大逃げ': { min: 0.00, max: 0.08 },
  '逃げ': { min: 0.00, max: 0.18 },
  '先行': { min: 0.12, max: 0.38 },
  '差し': { min: 0.35, max: 0.72 },
  '追込': { min: 0.55, max: 0.92 },
};

const DEFAULT_FORMATION_RANGE = { min: 0.30, max: 0.65 };

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function getFormationRange(style) {
  return STYLE_FORMATION_TARGET_RANK[style] ?? DEFAULT_FORMATION_RANGE;
}

/**
 * レース開始時: 脚質レンジ内で目標パーセンタイルを1点サンプル
 */
export function initFormationTarget(horse, rng, ave3fMax, ave3fSpan) {
  const { min, max } = getFormationRange(horse.style);
  let target = min + rng() * Math.max(0.001, max - min);
  if (Number.isFinite(horse.ave3f) && Number.isFinite(ave3fMax) && ave3fSpan > 0) {
    const ave3fW = (ave3fMax - horse.ave3f) / ave3fSpan;
    target -= (ave3fW - 0.5) * 0.06;
  }
  horse.formationTargetRank = clamp01(target);
}

/** 隊列形成期のみ: 序盤の ave3f 由来の微ペース（脚質テーブル非依存） */
export function getFormationPaceMultiplier(horse, phaseRatio, ave3fMax, ave3fSpan) {
  if (phaseRatio >= FORMATION_LOCK_PHASE) return 1;
  const t = 1 - phaseRatio / FORMATION_LOCK_PHASE;
  if (t <= 0) return 1;
  const ave3fW = Number.isFinite(horse.ave3f) && ave3fSpan > 0
    ? (ave3fMax - horse.ave3f) / ave3fSpan
    : 0.5;
  const burst = Number.isFinite(horse.startBurstFactor) ? horse.startBurstFactor - 1 : 0;
  const delta = (ave3fW - 0.5) * 0.14 + burst * 0.12;
  return 1 + delta * t;
}

/**
 * 隊列形成期の縦位置バイアス（高いほど前に出やすい）
 * @param {number} currentPackRankNorm 0=先頭, 1=後方
 */
export function getFormationOrderBias(horse, currentPackRankNorm, phaseRatio) {
  if (phaseRatio >= FORMATION_LOCK_PHASE) return 0;
  const target = Number.isFinite(horse.formationTargetRank)
    ? horse.formationTargetRank
    : 0.5;
  const fade = 1 - phaseRatio / FORMATION_LOCK_PHASE;
  const prior = (1 - target) * 38 * fade;
  const rank = Number.isFinite(currentPackRankNorm) ? currentPackRankNorm : 0.5;
  const chase = (rank - target) * 42 * fade;
  return prior + chase;
}

/** 隊列形成期のレーン目標（内=前寄り脚質ほど内）— ratio が上がると無効化 */
export function getFormationPreferredLane(horse, phaseRatio) {
  if (phaseRatio >= FORMATION_LOCK_PHASE) return null;
  const target = Number.isFinite(horse.formationTargetRank)
    ? horse.formationTargetRank
    : 0.5;
  const fade = 1 - phaseRatio / FORMATION_LOCK_PHASE;
  const inner = 1 + (1 - target) * (LANE_WIDTH - 1) * 0.72;
  let lane = inner;
  if (isNigeStyle(horse.style)) {
    lane = Math.min(lane, isOonigeStyle(horse.style) ? 1.5 : 2.0);
  }
  return 1 + (lane - 1) * fade;
}
