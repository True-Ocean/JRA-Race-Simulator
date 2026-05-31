import { LANE_WIDTH } from './constants.js';
import { isNigeStyle, isOonigeStyle } from './horse-utils.js';

/** 0=先頭側, 1=後方側 — 脚質ごとの目標隊列位置レンジ（レースごとにサンプル） */
export const STYLE_FORMATION_TARGET_RANK = {
  '大逃げ': { min: 0.00, max: 0.08 },
  '逃げ': { min: 0.00, max: 0.18 },
  '先行': { min: 0.12, max: 0.38 },
  '差し': { min: 0.35, max: 0.72 },
  '追込': { min: 0.55, max: 0.92 },
};

/** settle 期: 差し・追込の前出し抑え込み */
export const FORMATION_FRONT_PENALTY_K = 9.5;
/** launch 期: 差し・追込の前出し抑え込み（settle より弱め） */
export const LAUNCH_CLOSER_FRONT_PENALTY_K = 6.0;
/** launch 期: 後方の軽い追い上げ */
export const LAUNCH_REAR_CATCHUP_K = 0.10;
/** settle 期: 後方の脚質適正追い上げ */
export const SETTLE_REAR_CATCHUP_K = 0.22;
/** settle 期: 逃げ・先行のリード維持 */
export const FORMATION_LEAD_HOLD_K = 0.06;
/** 縦位置が固まっているとみなす x 差（シミュ単位） */
export const FORMATION_CLUSTER_X_SPAN = 10;

const DEFAULT_FORMATION_RANGE = { min: 0.30, max: 0.65 };

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function isFrontRunnerStyle(style) {
  return isNigeStyle(style) || isOonigeStyle(style) || style === '先行';
}

export function isCloserStyle(style) {
  return style === '差し' || style === '追込';
}

/** 序盤移動順の脚質優先度（大きいほど先に処理） */
export function getStyleMovementPriority(style) {
  if (isOonigeStyle(style)) return 4;
  if (isNigeStyle(style)) return 3;
  if (style === '先行') return 2;
  if (style === '差し') return 1;
  if (style === '追込') return 0;
  return 1;
}

export function getFormationRange(style) {
  return STYLE_FORMATION_TARGET_RANK[style] ?? DEFAULT_FORMATION_RANGE;
}

export function getFormationTargetRank(horse) {
  if (Number.isFinite(horse?.formationTargetRank)) {
    return horse.formationTargetRank;
  }
  return getFormationRange(horse?.style).min;
}

/** 目標順位より後ろにいる度合い（大きいほど後方） */
export function calcFormationPositionDeficit(horse, packRankNorm, allHorses) {
  const { rankNorm } = calcFormationRangeOffset(packRankNorm, horse, allHorses);
  return rankNorm - getFormationTargetRank(horse);
}

export function toFormationRankNorm(packRankNorm) {
  return 1 - clamp01(packRankNorm);
}

/**
 * 隊列判定用 rankNorm。
 * スタート直後（隊列が固まっている）のみ目標順位を使い、広がったら実位置を優先する。
 */
export function resolveFormationRankNorm(horse, packRankNorm, allHorses) {
  const fromPack = toFormationRankNorm(packRankNorm);
  if (!Array.isArray(allHorses) || allHorses.length < 2) {
    return fromPack;
  }
  const xs = allHorses.map(h => h.x);
  const maxX = Math.max(...xs);
  const minX = Math.min(...xs);
  const packSpread = maxX - minX;
  if (
    packSpread < FORMATION_CLUSTER_X_SPAN
    && Number.isFinite(horse.formationTargetRank)
  ) {
    return clamp01(horse.formationTargetRank);
  }
  return fromPack;
}

export function getEffectiveFormationRange(horse) {
  const { min, max } = getFormationRange(horse?.style);
  const event = horse?.startEventType;
  if (event === 'good') {
    return {
      min: Math.max(0, min - 0.08),
      max: Math.max(min, max - 0.04),
    };
  }
  if (event === 'slow') {
    return {
      min,
      max: Math.min(1, max + 0.28),
    };
  }
  return { min, max };
}

export function calcFormationRangeOffset(packRankNorm, horse, allHorses = null) {
  const r = allHorses
    ? resolveFormationRankNorm(horse, packRankNorm, allHorses)
    : toFormationRankNorm(packRankNorm);
  const { min, max } = getEffectiveFormationRange(horse);
  return {
    min,
    max,
    rankNorm: r,
    overFront: Math.max(0, min - r),
    overRear: Math.max(0, r - max),
  };
}

function getStyleCatchUpK(style) {
  if (isOonigeStyle(style)) return 0.50;
  if (isNigeStyle(style)) return 0.46;
  if (style === '先行') return 0.38;
  if (style === '差し') return 0.06;
  if (style === '追込') return 0.04;
  return 0.10;
}

function getStyleCatchUpCap(style) {
  if (isOonigeStyle(style)) return 1.16;
  if (isNigeStyle(style)) return 1.14;
  if (style === '先行') return 1.11;
  return 1.06;
}

/** 目標より後ろにいる馬の追い上げ倍率（脚質共通） */
export function calcStyleCatchUpMult(rankNorm, horse, blend) {
  const target = getFormationTargetRank(horse);
  const behind = Math.max(0, rankNorm - target - 0.03);
  if (behind <= 0) return 1;
  const k = getStyleCatchUpK(horse?.style);
  return Math.min(getStyleCatchUpCap(horse?.style), 1 + k * behind * blend);
}

/**
 * 形成期: 目標より後ろの馬の前方ブロック緩和
 * @returns {{ gapMult: number, advanceFloor: number }}
 */
export function getFormationForwardRelief(horse, packRankNorm, allHorses) {
  const { rankNorm, overFront } = calcFormationRangeOffset(packRankNorm, horse, allHorses);
  const target = getFormationTargetRank(horse);
  const behind = Math.max(0, rankNorm - target - 0.04);
  const { max: styleMax } = getEffectiveFormationRange(horse);

  // 前団の逃げ・大逃げ: 目標位置にいてもポジション維持
  if (isOonigeStyle(horse?.style) && rankNorm <= 0.12 && behind <= 0.01) {
    return { gapMult: 0.78, advanceFloor: 0.42 };
  }
  if (isNigeStyle(horse?.style) && rankNorm <= 0.24 && behind <= 0.01) {
    return { gapMult: 0.72, advanceFloor: 0.48 };
  }
  // 先行: 脚質レンジ内にいれば維持（追い込みより前をキープ）
  if (horse?.style === '先行' && rankNorm <= styleMax + 0.10 && behind <= 0.01) {
    return { gapMult: 0.84, advanceFloor: 0.36 };
  }

  // 差し・追込が脚質レンジより前に出すぎ → 緩和なし
  if (isCloserStyle(horse?.style) && overFront > 0.03) {
    return { gapMult: 1, advanceFloor: 0 };
  }

  if (behind <= 0.01) {
    return { gapMult: 1, advanceFloor: 0 };
  }

  let gapMult = 1;
  let advanceFloor = 0;

  if (isOonigeStyle(horse?.style)) {
    gapMult = 0.68;
    advanceFloor = 0.58 + Math.min(0.06, behind * 0.18);
  } else if (isNigeStyle(horse?.style)) {
    gapMult = 0.66;
    advanceFloor = 0.58 + Math.min(0.08, behind * 0.26);
  } else if (horse?.style === '先行') {
    gapMult = 0.78;
    advanceFloor = 0.42 + Math.min(0.14, behind * 0.24);
    if (Array.isArray(allHorses) && allHorses.length > 1) {
      const closersAhead = allHorses.filter(h =>
        h.id !== horse.id &&
        isCloserStyle(h.style) &&
        (h.x ?? 0) > (horse.x ?? 0) - 2,
      ).length;
      if (closersAhead > 0) {
        advanceFloor = Math.max(advanceFloor, 0.46);
        gapMult = Math.min(gapMult, 0.74);
      }
      const leader = [...allHorses].sort((a, b) => b.x - a.x)[0];
      if (leader && (isNigeStyle(leader.style) || isOonigeStyle(leader.style))) {
        advanceFloor *= 0.92;
        gapMult = Math.min(gapMult, 0.88);
      }
    }
  } else if (isCloserStyle(horse?.style)) {
    gapMult = 0.98;
    advanceFloor = 0.08;
  }

  return { gapMult, advanceFloor: Math.min(0.62, advanceFloor) };
}

function calcLaunchAdvanceMult(packRankNorm, horse, blend, allHorses) {
  const offset = calcFormationRangeOffset(packRankNorm, horse, allHorses);
  const { overFront, overRear, rankNorm } = offset;
  const target = getFormationTargetRank(horse);
  let mult = 1;
  const frontMargin = isNigeStyle(horse.style) || isOonigeStyle(horse.style) ? 0.08 : 0.10;
  if (isFrontRunnerStyle(horse.style) && rankNorm <= target + frontMargin) {
    mult = Math.min(
      isNigeStyle(horse.style) ? 1.14 : 1.12,
      1 + (isNigeStyle(horse.style) ? 0.12 : 0.10) * blend,
    );
  } else {
    mult = Math.min(1.08, 1 + LAUNCH_REAR_CATCHUP_K * overRear * blend);
  }
  if (isCloserStyle(horse.style) && overFront > 0.04) {
    const frontPen = LAUNCH_CLOSER_FRONT_PENALTY_K * overFront * overFront * blend;
    mult *= Math.exp(-frontPen);
  }
  mult *= calcStyleCatchUpMult(rankNorm, horse, blend);
  return mult;
}

function calcSettleAdvanceMult(packRankNorm, horse, blend, allHorses) {
  const offset = calcFormationRangeOffset(packRankNorm, horse, allHorses);
  const { overFront, overRear, rankNorm } = offset;
  const target = getFormationTargetRank(horse);

  if (isFrontRunnerStyle(horse.style)) {
    const aheadMargin = isNigeStyle(horse.style) ? 0.10 : 0.08;
    const holdK = isNigeStyle(horse.style) ? FORMATION_LEAD_HOLD_K * 1.5 : FORMATION_LEAD_HOLD_K;
    if (rankNorm <= target + aheadMargin) {
      return Math.min(
        isNigeStyle(horse.style) ? 1.12 : 1.08,
        (1 + holdK * blend) * calcStyleCatchUpMult(rankNorm, horse, blend),
      );
    }
    const rearBoost = 1 + SETTLE_REAR_CATCHUP_K * overRear * blend;
    return Math.min(1.12, rearBoost * calcStyleCatchUpMult(rankNorm, horse, blend));
  }

  const effectiveOverFront = isCloserStyle(horse.style) ? overFront : overFront * 0.35;
  const frontPen = FORMATION_FRONT_PENALTY_K * effectiveOverFront * effectiveOverFront * blend;
  const frontMult = Math.exp(-frontPen);
  const rearBoost = 1 + SETTLE_REAR_CATCHUP_K * overRear * blend;
  return frontMult * Math.min(1.12, rearBoost);
}

/**
 * launch / settle ブレンドに応じた形成期 advance 倍率
 * @param {number} launchBlend
 * @param {number} settleBlend
 */
export function calcFormationAdvanceMult(
  packRankNorm,
  horse,
  launchBlend,
  settleBlend = 0,
  allHorses = null,
) {
  const launch = Number.isFinite(launchBlend) ? launchBlend : 0;
  const settle = Number.isFinite(settleBlend) ? settleBlend : 0;
  if (launch <= 0 && settle <= 0) return 1;

  const launchMult = launch > 0
    ? calcLaunchAdvanceMult(packRankNorm, horse, launch, allHorses)
    : 1;
  const settleMult = settle > 0
    ? calcSettleAdvanceMult(packRankNorm, horse, settle, allHorses)
    : 1;

  if (launch >= settle) {
    return launchMult;
  }
  return settleMult;
}

/** @deprecated launch/settle 分離版を使用 */
export function calcFormationAdvanceMultLegacy(packRankNorm, horse, formationBlend, allHorses = null) {
  return calcFormationAdvanceMult(packRankNorm, horse, 0, formationBlend, allHorses);
}

export function initFormationTarget(horse, rng) {
  const { min, max } = getFormationRange(horse.style);
  horse.formationTargetRank = clamp01(min + rng() * Math.max(0.001, max - min));
}

export function getFormationStylePaceMult(horse, styleBlend, startBurstFactor) {
  if (!Number.isFinite(styleBlend) || styleBlend <= 0) return 1;
  const burst = Number.isFinite(startBurstFactor) ? startBurstFactor - 1 : 0;
  return 1 + burst * 0.10 * styleBlend;
}

export function getFormationOrderBias(horse, currentPackRankNorm, styleBlend, allHorses = null) {
  if (!Number.isFinite(styleBlend) || styleBlend <= 0) return 0;
  const target = getFormationTargetRank(horse);
  const fade = styleBlend;
  const prior = (1 - target) * 38 * fade;
  const rankStyle = allHorses
    ? resolveFormationRankNorm(horse, currentPackRankNorm, allHorses)
    : toFormationRankNorm(currentPackRankNorm);
  const chase = (rankStyle - target) * 42 * fade;
  const { overFront, overRear } = calcFormationRangeOffset(
    currentPackRankNorm,
    horse,
    allHorses,
  );
  const frontPull = isCloserStyle(horse.style) ? overFront * 12 : overFront * 2;
  const rangePull = (overRear * 6 - frontPull) * fade;
  return prior + chase + rangePull;
}

export function getFormationPreferredLane(horse, styleBlend) {
  if (!Number.isFinite(styleBlend) || styleBlend <= 0) return null;
  const target = getFormationTargetRank(horse);
  const fade = styleBlend;
  const inner = 1 + (1 - target) * (LANE_WIDTH - 1) * 0.72;
  let lane = inner;
  if (isNigeStyle(horse.style)) {
    lane = Math.min(lane, isOonigeStyle(horse.style) ? 1.5 : 2.0);
  }
  return 1 + (lane - 1) * fade;
}

/** @deprecated getFormationStylePaceMult を使用 */
export function getFormationPaceMultiplier(horse, formationBlend, _ave3fMax, _ave3fSpan) {
  return getFormationStylePaceMult(horse, formationBlend, horse.startBurstFactor);
}

/**
 * 形成期: 先行・逃げが差し・追込より後ろに付くのを防ぐ（最低限の順位補正）
 */
export function enforceFrontRunnerAheadOfClosers(horses, minXGap = 38) {
  if (!Array.isArray(horses) || horses.length < 2) return;
  const safeGap = Math.max(12, minXGap * 0.50);
  for (const horse of horses) {
    if (!isFrontRunnerStyle(horse.style)) continue;
    for (const closer of horses) {
      if (closer.id === horse.id || !isCloserStyle(closer.style)) continue;
      const gap = (closer.x ?? 0) - (horse.x ?? 0);
      if (gap <= safeGap * 0.35 || gap > 48) continue;
      const targetX = (closer.x ?? 0) - safeGap;
      if (targetX > (horse.x ?? 0)) {
        horse.x = targetX;
      }
      break;
    }
  }
}
