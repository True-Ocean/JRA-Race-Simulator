import {
  MIN_FORWARD_GAP,
  FORMATION_LOCK_PHASE,
  FINAL_STRAIGHT_RATIO,
  FINAL_FRONT_BLOCK_EXTRA_GAP,
  INNER_HALF_LANE_MAX,
  LANE_WIDTH,
  POST_C3_STAMINA_SPREAD_FLOOR,
  PACK_DENSITY_PENALTY_QUAD,
} from './constants.js';
import { isNigeStyle, clampLane } from './horse-utils.js';
import {
  getPostC3StaminaSpreadBudget,
  getPreferredLaneByStyle,
} from './lane-preference.js';
import {
  calcLateStretchTargetLane,
  getLaneChangeRateForStretch,
} from './lane-decision.js';
import {
  isThroughThirdCornerPhase,
  isFourthCornerPhase,
  isAfterFourthCornerPhase,
  isFinalStraightPhase,
  isStartToHomePhase,
  getPhaseLaneBand,
} from './phase-helpers.js';
import {
  getFrontGap,
  isLaneOpenForShift,
  isInnerLaneOpenAhead,
  findInnermostOpenSlotLane,
  clampHorseLaneByPhase,
  getInnerRailLaneFloor,
} from './collision.js';

function getCloserOuterSpreadIntent(horse, last3fMin, last3fMax, last3fSpan) {
  if (horse.style !== '差し' && horse.style !== '追込') return 0;
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  const span = Math.max(0.001, last3fSpan ?? (last3fMax - last3fMin));
  const last3fWeight = Number.isFinite(horse.last3f)
    ? (last3fMax - horse.last3f) / span
    : 0.5;
  const w = Math.max(0, Math.min(1, last3fWeight));
  return Math.max(0, Math.min(1, w * (0.35 + staminaRatio * 0.85)));
}

function getEffectiveOuterSpreadIntent(horse, phase, last3fMin, last3fMax, last3fSpan) {
  if (!isAfterFourthCornerPhase(phase)) {
    return getCloserOuterSpreadIntent(horse, last3fMin, last3fMax, last3fSpan);
  }
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  const span = Math.max(0.001, last3fSpan ?? (last3fMax - last3fMin));
  const last3fWeight = Number.isFinite(horse.last3f)
    ? (last3fMax - horse.last3f) / span
    : 0.5;
  const budget = getPostC3StaminaSpreadBudget(horse);
  return Math.max(
    0,
    Math.min(
      1,
      last3fWeight * 0.42 + staminaRatio * 0.38 + budget * 0.35,
    ),
  );
}

function getFourthCornerOutwardIntent(horse, phase, last3fNorm = null) {
  let out = 0.10 + getPostC3StaminaSpreadBudget(horse) * 0.22;
  if (
    last3fNorm &&
    Number.isFinite(last3fNorm.min) &&
    Number.isFinite(last3fNorm.max)
  ) {
    out = Math.max(
      out,
      getEffectiveOuterSpreadIntent(
        horse,
        phase,
        last3fNorm.min,
        last3fNorm.max,
        last3fNorm.span,
      ),
    );
  }
  return Math.max(0, Math.min(1, out));
}

function calcTargetLane(horse, phase, allHorses, collisionMetrics = null, last3fNorm = null) {
  const currentLane = clampLane(horse.y);
  let preferredLane = getPreferredLaneByStyle(horse, phase);
  if (
    !isThroughThirdCornerPhase(phase) &&
    !phase.isFinal &&
    phase.ratio >= FORMATION_LOCK_PHASE &&
    phase.ratio < 0.80 &&
    horse.settledLane !== undefined
  ) {
    // 序盤で決まった隊列を道中は維持し、極端な横移動を抑える（第3コーナーまでは内寄せ優先のため無効化）
    preferredLane = horse.settledLane * 0.75 + preferredLane * 0.25;
  }
  const [laneMin, laneMax] = getPhaseLaneBand(phase);
  const horseLaneFloor = getInnerRailLaneFloor(horse, laneMin, phase, allHorses);
  const clampToBand = v => Math.max(laneMin, Math.min(laneMax, clampLane(v)));

  // 第3コーナーまでは「前後の馬の隙間（slot）」を最内優先で取りに行く
  if (isThroughThirdCornerPhase(phase) && currentLane > horseLaneFloor + 0.01) {
    const slot = findInnermostOpenSlotLane(horse, allHorses, horseLaneFloor, collisionMetrics, phase);
    if (slot != null && slot < currentLane - 0.01) {
      return clampToBand(slot);
    }
  }

  const c4Extras = isFourthCornerPhase(phase)
    ? [
        preferredLane - 2,
        preferredLane + 2,
        preferredLane + 3,
        currentLane + 2,
        currentLane + 3,
      ]
    : [];
  const candidates = [
    preferredLane,
    preferredLane - 1,
    preferredLane + 1,
    ...(phase.isFinal || phase.ratio >= FINAL_STRAIGHT_RATIO ? [preferredLane - 2, preferredLane + 2] : []),
    currentLane,
    currentLane - 1,
    currentLane + 1,
    ...(phase.isFinal || phase.ratio >= FINAL_STRAIGHT_RATIO ? [currentLane - 2, currentLane + 2, currentLane - 3, currentLane + 3] : []),
    ...c4Extras,
  ]
    .map(clampToBand)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  let bestLane = clampToBand(currentLane);
  let bestScore = -Infinity;

  for (const lane of candidates) {
    const score = scoreLaneOption(
      horse,
      lane,
      preferredLane,
      phase,
      allHorses,
      currentLane,
      collisionMetrics,
      last3fNorm,
    );
    if (score > bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }

  // 内側が空いている場合は、基本的に1段ずつ内へ詰める
  // （終盤の急な外持ち出しを優先したいケース以外）
  const canPreferInner = phase.ratio < 0.92 && !isFourthCornerPhase(phase);
  if (canPreferInner && currentLane > horseLaneFloor + 0.01) {
    const innerLane = clampToBand(Math.max(horseLaneFloor, currentLane - 1));
    if (
      innerLane < currentLane - 0.01 &&
      isLaneOpenForShift(horse, innerLane, allHorses, phase, collisionMetrics) &&
      isInnerLaneOpenAhead(horse, innerLane, allHorses, phase, collisionMetrics)
    ) {
      bestLane = Math.min(bestLane, innerLane);
    }
  }
  return bestLane;
}

function calcStartPhaseTargetLane(horse, allHorses, collisionMetrics = null, phase = null) {
  const currentLane = clampLane(horse.y);
  // 第3コーナーまでは脚質に依らず最内志向に統一（前後位置の差は脚質差で自然発生）
  const styleLaneFloor = getInnerRailLaneFloor(horse, 1.0, phase, allHorses);

  if (currentLane <= styleLaneFloor + 0.05) return currentLane;

  // 1) 前後の隙間（slot）を最内優先で取る
  const slot = findInnermostOpenSlotLane(horse, allHorses, styleLaneFloor, collisionMetrics, phase);
  if (slot != null && slot < currentLane - 0.01) return slot;

  let bestLane = currentLane;
  for (let lane = currentLane - 1; lane >= styleLaneFloor; lane--) {
    if (!isLaneOpenForShift(horse, lane, allHorses, phase, collisionMetrics)) continue;
    if (!isInnerLaneOpenAhead(horse, lane, allHorses, phase, collisionMetrics)) continue;
    bestLane = lane;
    if (bestLane <= styleLaneFloor) break;
  }

  // 逃げ馬は内に潜りすぎるより「前の空き」を優先する。
  if (isNigeStyle(horse.style) && bestLane === currentLane) {
    const frontGapNow = getFrontGap(horse, currentLane, allHorses);
    const outerLane = clampLane(currentLane + 1);
    const minXGap = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
    if (
      frontGapNow < minXGap + 6 &&
      outerLane !== currentLane &&
      isLaneOpenForShift(horse, outerLane, allHorses, phase, collisionMetrics)
    ) {
      return outerLane;
    }
  }

  return bestLane;
}

function calcPreCornerPackTargetLane(horse, phase, allHorses, collisionMetrics = null) {
  const currentLane = clampLane(horse.y);
  const [laneMin, laneMax] = getPhaseLaneBand(phase);
  const clampToBand = v => Math.max(laneMin, Math.min(laneMax, clampLane(v)));
  const minAllowedLane = clampToBand(getInnerRailLaneFloor(horse, laneMin, phase, allHorses));

  // 1) 前後の隙間（slot）を最内優先で取る
  const slot = findInnermostOpenSlotLane(horse, allHorses, minAllowedLane, collisionMetrics, phase);
  if (slot != null && slot < currentLane - 0.01) return clampToBand(slot);

  let bestLane = currentLane;
  for (let lane = currentLane - 1; lane >= minAllowedLane; lane -= 1) {
    const candidate = clampToBand(lane);
    if (candidate >= bestLane - 0.01) continue;
    if (!isLaneOpenForShift(horse, candidate, allHorses, phase, collisionMetrics)) break;
    if (!isInnerLaneOpenAhead(horse, candidate, allHorses, phase, collisionMetrics)) continue;
    bestLane = candidate;
    if (bestLane <= minAllowedLane + 0.15) break;
  }

  if (bestLane < currentLane - 0.01) return bestLane;

  const fallback = calcTargetLane(horse, phase, allHorses, collisionMetrics, null);
  return Math.min(fallback, clampToBand(currentLane));
}

function calcEarlyInnerPriorityLane(horse, baseTargetLane, phase, allHorses, collisionMetrics = null) {
  const currentLane = clampLane(horse.y);
  const [laneMin, laneMax] = getPhaseLaneBand(phase);
  const clampToBand = v => Math.max(laneMin, Math.min(laneMax, clampLane(v)));
  const baseTarget = clampToBand(baseTargetLane);
  const innerMost = Math.max(
    1,
    Math.min(INNER_HALF_LANE_MAX, getInnerRailLaneFloor(horse, laneMin, phase, allHorses)),
  );

  // 1) 前後の隙間（slot）を最内優先で取る
  const slot = findInnermostOpenSlotLane(horse, allHorses, innerMost, collisionMetrics, phase);
  if (slot != null && slot < currentLane - 0.01) {
    return Math.min(clampToBand(slot), currentLane);
  }

  // 2) 連続的に内が空いているレーンを段階的に詰める
  let bestLane = baseTarget;
  for (let lane = currentLane - 1; lane >= innerMost; lane--) {
    const candidate = clampToBand(lane);
    if (candidate >= bestLane - 0.01) continue;
    if (!isLaneOpenForShift(horse, candidate, allHorses, phase, collisionMetrics)) continue;
    if (!isInnerLaneOpenAhead(horse, candidate, allHorses, phase, collisionMetrics)) continue;
    bestLane = candidate;
    if (bestLane <= innerMost + 0.05) break;
  }

  return Math.min(bestLane, currentLane);
}

function calcPostFourthWideTargetLane(horse, baseTargetLane, phase, allHorses, last3fNorm = null, options = {}) {
  return calcLateStretchTargetLane(
    horse,
    phase,
    allHorses,
    baseTargetLane,
    last3fNorm,
    options,
  );
}

function getLaneChangeRate(phase, horse = null, last3fNorm = null, allHorses = null) {
  // スタート〜ホーム直線は一気に内へ寄せて隊列を作る
  if (isStartToHomePhase(phase)) return 0.98;
  if (phase.ratio < FORMATION_LOCK_PHASE) return 0.55;
  if (isThroughThirdCornerPhase(phase) && phase.ratio < 0.80) return 0.55;
  if (horse && isFinalStraightPhase(phase) && allHorses) {
    const stretchRate = getLaneChangeRateForStretch(
      phase,
      horse,
      allHorses,
      last3fNorm,
      horse.lastAdvance,
    );
    if (stretchRate != null) return stretchRate;
  }
  if (phase.ratio < 0.80) return 0.12;
  return 0.20;
}

function scoreLaneOption(
  horse,
  lane,
  preferredLane,
  phase,
  allHorses,
  currentLane,
  collisionMetrics = null,
  last3fNorm = null,
) {
  const through = isThroughThirdCornerPhase(phase);
  const c4 = isFourthCornerPhase(phase);
  const frontGap = getFrontGap(horse, lane, allHorses);
  const nearCount = allHorses.filter(h =>
    h.id !== horse.id &&
    Math.abs(h.x - horse.x) < 28 &&
    Math.abs(h.y - lane) < 0.9
  ).length;

  let score = 0;
  score += Math.min(frontGap, 60) * 0.85;                       // 前方クリア距離
  score -= Math.abs(lane - preferredLane) * (through ? 1.4 : 2.8); // 脚質方針との差
  const densityPenalty = (nearCount * nearCount) * (through ? PACK_DENSITY_PENALTY_QUAD * 0.6 : PACK_DENSITY_PENALTY_QUAD);
  score -= densityPenalty;                                       // 密集回避（過密レーンを二乗で強く嫌う）

  // 距離ロス観点では基本的に内有利（コーナーで増幅）。第3コーナーまでは内志向を強める。
  // 第4コーナーは直線の取り回し優先のため、内有利を大きく弱める（距離ロスは applyCornerLoss 側）。
  const innerBiasMult = through ? 2.6 : 1;
  let innerBias = (LANE_WIDTH - lane) * (phase.isCorner ? 0.9 : 0.35) * innerBiasMult;
  if (c4) innerBias *= 0.24;
  score += innerBias;

  const afterC4 = isAfterFourthCornerPhase(phase);
  if (c4 || afterC4) {
    const outward = getFourthCornerOutwardIntent(horse, phase, last3fNorm);
    const frontBlockedHere = frontGap < MIN_FORWARD_GAP + FINAL_FRONT_BLOCK_EXTRA_GAP;
    if (frontBlockedHere && lane > currentLane) {
      score += (lane - currentLane) * outward * 2.8;
    }
    const innerCrowd = allHorses.filter(h =>
      h.id !== horse.id &&
      Math.abs(h.x - horse.x) < 30 &&
      clampLane(h.y) <= clampLane(currentLane) + 0.45
    ).length;
    if (innerCrowd >= 2 && lane > currentLane - 0.05 && frontBlockedHere) {
      score += (lane - currentLane) * outward * 2.4;
    }
  }

  // 第3コーナーまでの追加ボーナス: 内側にスペースがあるほど積極的に寄せる
  if (through) {
    const innerNeighbors = allHorses.filter(h =>
      h.id !== horse.id &&
      Math.abs(h.x - horse.x) < 32 &&
      h.y < lane - 0.85
    ).length;
    if (innerNeighbors === 0) score += (LANE_WIDTH - lane) * 0.6;
    if (lane < currentLane - 0.01 && isLaneOpenForShift(horse, lane, allHorses, phase, collisionMetrics)) score += 8;
  }

  // 差し・追込は序盤で外待機、終盤で前進優先（第3コーナーまでは内寄せと矛盾しないよう弱める）
  if (
    !through &&
    (horse.style === '差し' || horse.style === '追込') &&
    phase.ratio < 0.65
  ) {
    score += lane * 0.55;
  }
  // 逃げ/先行はスタート〜序盤で内のポジション取りを優先。
  // 空いていない場合は無理に寄せないように抑制する。
  if ((isNigeStyle(horse.style) || horse.style === '先行') && phase.ratio < 0.25) {
    if (lane < currentLane && isInnerLaneOpenAhead(horse, lane, allHorses, phase, collisionMetrics)) {
      score += 12;
    }
    if (lane > currentLane) {
      score -= 5;
    }
  }

  if (frontGap < MIN_FORWARD_GAP + 4) score -= 12;
  return score;
}

export {
  getCloserOuterSpreadIntent,
  getPostC3StaminaSpreadBudget,
  getEffectiveOuterSpreadIntent,
  getFourthCornerOutwardIntent,
  calcTargetLane,
  calcStartPhaseTargetLane,
  calcPreCornerPackTargetLane,
  calcEarlyInnerPriorityLane,
  calcPostFourthWideTargetLane,
  getPreferredLaneByStyle,
  getLaneChangeRate,
  scoreLaneOption,
};
