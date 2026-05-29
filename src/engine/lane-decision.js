import {
  MIN_FORWARD_GAP,
  FINAL_FRONT_BLOCK_EXTRA_GAP,
  LANE_WIDTH,
  PACK_DENSITY_PENALTY_QUAD,
  LATERAL_SHIFT_HARD_CAP,
  LATERAL_SHIFT_BLOCKED_CAP,
  LATERAL_SHIFT_CORNER4_CAP,
  LOCAL_FRONT_MAX_X,
  LANE_COMMIT_PHASES,
  FINAL_STRAIGHT_X_BAND,
  FINAL_STRAIGHT_SPREAD_BLOCK_EXTRA,
  SPUR_ENTRY_ADVANCE_MULT_CAP,
  SPUR_ENTRY_VERTICAL_BOOST,
} from './constants.js';
import { clampLane, getJockeyAggressionNorm, getJockeyReliabilityNorm } from './horse-utils.js';
import { getPostC3StaminaSpreadBudget, getPreferredLaneByStyle } from './lane-preference.js';
import {
  isFourthCornerPhase,
  isFinalStraightPhase,
} from './phase-helpers.js';

function normalize01(v) {
  return Math.max(0, Math.min(1, v));
}

function calcLast3fWeight(horse, last3fNorm) {
  if (!last3fNorm || !Number.isFinite(last3fNorm.min) || !Number.isFinite(last3fNorm.max)) {
    return 0.5;
  }
  const span = Math.max(0.001, last3fNorm.span ?? (last3fNorm.max - last3fNorm.min));
  if (!Number.isFinite(horse.last3f)) return 0.5;
  return normalize01((last3fNorm.max - horse.last3f) / span);
}

function calcPackRankNorm(horse, allHorses) {
  if (!allHorses?.length) return 0.5;
  const sorted = [...allHorses].sort((a, b) => a.x - b.x);
  const idx = sorted.findIndex(h => h.id === horse.id);
  if (idx < 0) return 0.5;
  const n = Math.max(1, sorted.length - 1);
  return normalize01(idx / n);
}

/** 縦位置順位（0=先頭） */
function getRunningOrderRank(horse, allHorses) {
  const sorted = [...allHorses].sort((a, b) => b.x - a.x);
  const idx = sorted.findIndex(h => h.id === horse.id);
  return idx < 0 ? Math.floor(allHorses.length / 2) : idx;
}

function countPackTrafficAhead(horse, allHorses, maxForwardX = LOCAL_FRONT_MAX_X, maxLaneDist = 1.35) {
  const lane = clampLane(horse.y);
  return allHorses.filter(h =>
    h.id !== horse.id
    && h.x > horse.x + 0.5
    && (h.x - horse.x) < maxForwardX
    && Math.abs(h.y - lane) < maxLaneDist,
  ).length;
}

function isInLocalPackTraffic(horse, allHorses, maxForwardX = LOCAL_FRONT_MAX_X) {
  const lane = clampLane(horse.y);
  return countPackTrafficAhead(horse, allHorses, maxForwardX, 1.35) > 0
    || allHorses.some(h =>
      h.id !== horse.id
      && Math.abs(h.x - horse.x) < maxForwardX
      && Math.abs(h.y - lane) < 1.35,
    );
}

/** 近傍の真前方クリア距離（遠くの先頭は見ない） */
function getLocalPackFrontGap(horse, lane, allHorses, maxForwardX = LOCAL_FRONT_MAX_X) {
  let bestGap = 999;
  for (const h of allHorses) {
    if (h.id === horse.id) continue;
    if (h.x <= horse.x + 0.5) continue;
    const dx = h.x - horse.x;
    if (dx > maxForwardX) continue;
    if (Math.abs(h.y - lane) >= 0.95) continue;
    if (dx < bestGap) bestGap = dx;
  }
  return bestGap;
}

function findFrontHorseInLane(horse, lane, allHorses, atX = horse.x, maxForwardX = LOCAL_FRONT_MAX_X) {
  let best = null;
  let bestDx = Infinity;
  for (const h of allHorses) {
    if (h.id === horse.id) continue;
    if (h.x <= atX + 0.5) continue;
    const dx = h.x - atX;
    if (dx > maxForwardX) continue;
    if (Math.abs(h.y - lane) >= 0.95) continue;
    if (dx < bestDx) {
      bestDx = dx;
      best = h;
    }
  }
  return best;
}

/** 前方が塞がれていない好位置のみ横移動を弱める（先頭でも前詰まりなら動ける） */
function shouldFreezeStretchLane(horse, allHorses, minXGap) {
  const lane = clampLane(horse.y);
  const localGap = getLocalPackFrontGap(horse, lane, allHorses);
  const blockGap = minXGap + FINAL_FRONT_BLOCK_EXTRA_GAP;
  if (localGap < blockGap) return false;
  const rank = getRunningOrderRank(horse, allHorses);
  if (rank <= 2) return true;
  return false;
}

/** 第4コーナー終了時点の位置を仕掛け入口の基準として記録 */
function snapshotCorner4ExitState(allHorses) {
  if (!allHorses?.length) return;
  for (const horse of allHorses) {
    const lane = clampLane(horse.y);
    horse.corner4ExitLane = lane;
    horse.corner4ExitX = horse.x;
    horse.corner4ExitPathMeters = horse.pathMeters ?? 0;
    horse.corner4ExitRank = getRunningOrderRank(horse, allHorses);
    horse.corner4ExitFrontGap = getLocalPackFrontGap(horse, lane, allHorses);
  }
}

/** 4角出口と前方ギャップから目指す仕掛けレーン（脚質非依存） */
function getSpurEntrySituationPreferredLane(horse, allHorses) {
  const currentLane = clampLane(horse.y);
  const exitLane = Number.isFinite(horse.corner4ExitLane)
    ? horse.corner4ExitLane
    : currentLane;
  let bestLane = currentLane;
  let bestGap = getLocalPackFrontGap(horse, currentLane, allHorses);
  const maxProbe = 8;
  for (let d = 0; d <= maxProbe; d += 1) {
    const lane = clampLane(currentLane + d);
    if (lane > LANE_WIDTH) break;
    const gap = getLocalPackFrontGap(horse, lane, allHorses);
    if (gap > bestGap + 0.4) {
      bestGap = gap;
      bestLane = lane;
    }
  }
  return clampLane(bestLane * 0.68 + exitLane * 0.32);
}

function shouldSeekSpurEntryLane(horse, ctx, allHorses, minXGap) {
  if (!isFinalStraightPhase(ctx.phase)) return false;
  if (shouldFreezeStretchLane(horse, allHorses, minXGap)) return false;
  const preferred = getSpurEntrySituationPreferredLane(horse, allHorses);
  const delta = preferred - ctx.currentLane;
  if (ctx.frontBlocked) return true;
  if (Math.abs(delta) >= 0.28) return true;
  if (ctx.chaseUrgency > 0.12 && (ctx.frontBlocked || ctx.canPassFront)) return true;
  if (ctx.midPack && ctx.last3fWeight > 0.22) return true;
  return isStretchSpreadCandidate(horse, ctx, allHorses);
}

function capSpurEntryLaneDelta(currentLane, targetLane, horse, ctx) {
  const rank = ctx.runningRank;
  let maxStep = rank <= 2 ? 1.35 : (rank <= 6 ? 3.15 : 4.05);
  if (isFinalStraightPhase(ctx.phase) && (ctx.frontBlocked || ctx.chaseUrgency > 0.14)) {
    maxStep += 0.45 + ctx.last3fWeight * 0.55 + getPostC3StaminaSpreadBudget(horse) * 0.48;
  }
  const delta = targetLane - currentLane;
  if (delta <= maxStep) return targetLane;
  return clampLane(currentLane + maxStep);
}

function scoreSpurEntryLane(horse, lane, ctx, stylePreferred) {
  const base = scoreLaneCandidate(horse, lane, { ...ctx, spurEntryIntent: true });
  const stylePull = -Math.abs(lane - stylePreferred) * (3.1 + ctx.chaseUrgency * 0.95);
  const exitLane = Number.isFinite(horse.corner4ExitLane) ? horse.corner4ExitLane : ctx.currentLane;
  const exitPenalty = lane < exitLane - 0.15 && ctx.frontBlocked
    ? (exitLane - lane) * 1.2
    : 0;
  return base + stylePull - exitPenalty;
}

function getStretchBlockExtra(phase, options = {}) {
  if (Number.isFinite(options.frontBlockExtra)) return options.frontBlockExtra;
  return isFinalStraightPhase(phase)
    ? FINAL_STRAIGHT_SPREAD_BLOCK_EXTRA
    : FINAL_FRONT_BLOCK_EXTRA_GAP;
}

function buildLaneDecisionContext(horse, phase, allHorses, options = {}) {
  const currentLane = clampLane(horse.y);
  const minXGap = options.minXGap ?? MIN_FORWARD_GAP;
  const blockExtra = getStretchBlockExtra(phase, options);
  const inPack = isInLocalPackTraffic(horse, allHorses);
  const frontGap = getLocalPackFrontGap(horse, currentLane, allHorses);
  const frontBlocked = inPack && frontGap < (minXGap + blockExtra);
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  const staminaAfterC3 = Number.isFinite(horse.staminaRatioAfterC3)
    ? horse.staminaRatioAfterC3
    : staminaRatio;
  const last3fNorm = options.last3fNorm ?? null;
  const last3fWeight = calcLast3fWeight(horse, last3fNorm);
  const packRankNorm = calcPackRankNorm(horse, allHorses);
  const runningRank = getRunningOrderRank(horse, allHorses);
  const maneuvNorm = normalize01((horse.M_maneuv ?? 50) / 100);
  const jockeyAggression = getJockeyAggressionNorm(horse);
  const jockeyReliability = getJockeyReliabilityNorm(horse);
  const speedAdvance = Math.max(0, options.speedAdvance ?? horse.lastAdvance ?? 0);
  const speedRatio = horse.S_cruise > 0 ? speedAdvance / horse.S_cruise : 1;

  const frontHorse = findFrontHorseInLane(horse, currentLane, allHorses);
  const frontSpeed = frontHorse?.lastAdvance ?? frontHorse?.S_cruise ?? 0;
  const selfSpeed = speedAdvance > 0.01 ? speedAdvance : (horse.S_cruise ?? 50) * 0.02;
  const canPassFront = frontHorse != null && selfSpeed > frontSpeed * 1.02;

  const reserveBonus = Math.max(0, staminaAfterC3 - staminaRatio) * 0.35;
  const staminaBudget = getPostC3StaminaSpreadBudget(horse);

  const midPack = packRankNorm > 0.14 && packRankNorm < 0.86;
  const chaseUrgency = Math.max(
    0,
    Math.min(
      1.75,
      last3fWeight * 0.48
        + staminaRatio * 0.26
        + staminaBudget * 0.16
        + reserveBonus
        + (canPassFront ? 0.18 : 0)
        + maneuvNorm * 0.12
        + jockeyAggression * 0.12
        + (frontBlocked && midPack ? last3fWeight * 0.24 : 0),
    ),
  );

  const isCorner = Boolean(phase?.isCorner) || isFourthCornerPhase(phase);
  const centrifugalFactor = isCorner
    ? (isFourthCornerPhase(phase) ? 1.0 : 0.55)
    : (phase?.isFinal ? 0.42 : 0.35);

  return {
    horse,
    phase,
    allHorses,
    currentLane,
    frontGap,
    frontBlocked,
    staminaRatio,
    staminaAfterC3,
    last3fWeight,
    packRankNorm,
    runningRank,
    maneuvNorm,
    jockeyAggression,
    jockeyReliability,
    speedRatio,
    canPassFront,
    chaseUrgency,
    centrifugalFactor,
    minXGap,
    midPack,
  };
}

function scoreLaneCandidate(horse, lane, ctx) {
  const currentLane = ctx.currentLane;
  const gapHere = getLocalPackFrontGap(horse, lane, ctx.allHorses);
  const gapGain = gapHere - ctx.frontGap;
  const moveDelta = Math.abs(lane - currentLane);

  const nearCount = ctx.allHorses.filter(h =>
    h.id !== horse.id
    && Math.abs(h.x - horse.x) < 22
    && Math.abs(h.y - lane) < 0.9,
  ).length;
  const densityPenalty = (nearCount * nearCount) * PACK_DENSITY_PENALTY_QUAD;

  const pathValue = Math.min(gapHere, 40) * 1.15
    + Math.max(0, gapGain) * ctx.chaseUrgency * 1.55;

  const moveCost = moveDelta * (
    1.85 - ctx.staminaRatio * 0.85 - ctx.maneuvNorm * 0.35
  ) * (1 + ctx.speedRatio * 0.24);

  const innerBiasWeight = isFinalStraightPhase(ctx.phase) ? 0.02 : (isFourthCornerPhase(ctx.phase) ? 0.06 : 0.14);
  const innerBias = (LANE_WIDTH - lane) * innerBiasWeight;

  const centrifugalBias = isFourthCornerPhase(ctx.phase) && !isFinalStraightPhase(ctx.phase)
    ? lane * ctx.centrifugalFactor * (ctx.speedRatio ** 2) * 0.28
    : 0;

  const spreadIntent = ctx.spreadIntent ?? ctx.frontBlocked;
  const blockedOuterBonus = spreadIntent && lane > currentLane
    ? (lane - currentLane) * ctx.chaseUrgency * (ctx.frontBlocked ? 3.65 : 3.15)
    : 0;

  const midPackOuterBonus = spreadIntent && ctx.midPack && lane > currentLane
    ? (lane - currentLane) * ctx.last3fWeight * (isFinalStraightPhase(ctx.phase) ? 3.05 : 1.85)
    : 0;

  const clearStraightPenalty = !ctx.frontBlocked && !ctx.spurEntryIntent && moveDelta > 0.02
    ? moveDelta * 3.4
    : 0;

  let zigzagPenalty = 0;
  const commitDir = horse.laneCommitDir ?? 0;
  const commitRemain = horse.laneCommitPhases ?? 0;
  if (commitRemain > 0 && commitDir !== 0 && moveDelta > 0.05) {
    const moveDir = lane > currentLane ? 1 : -1;
    if (moveDir !== commitDir) {
      zigzagPenalty = moveDelta * (4.8 + commitRemain * 0.6);
    }
  }

  return (
    pathValue
    - moveCost
    - densityPenalty
    + innerBias
    + centrifugalBias
    + blockedOuterBonus
    + midPackOuterBonus
    - clearStraightPenalty
    - zigzagPenalty
  );
}

/** 最終直線で外へ広がる判断（真前の1頭との関係のみ） */
function isStretchSpreadCandidate(horse, ctx, allHorses) {
  if (ctx.frontBlocked) return true;
  const sameLaneAhead = countPackTrafficAhead(horse, allHorses, LOCAL_FRONT_MAX_X, 1.05) > 0;
  if (!sameLaneAhead) return false;
  return ctx.canPassFront
    || ctx.chaseUrgency > 0.20
    || (ctx.midPack && ctx.last3fWeight > 0.32);
}

/** 1フェーズで動かせる最大レーン幅（後方一括広がり＝L字を防ぐ） */
function capStretchLaneDelta(currentLane, targetLane, horse, ctx) {
  const rank = ctx.runningRank;
  const maxStep = rank <= 2 ? 1.2 : (rank <= 6 ? 2.65 : 3.15);
  const delta = targetLane - currentLane;
  if (delta <= maxStep) return targetLane;
  return clampLane(currentLane + maxStep);
}

/**
 * 真前の1頭を抜くための目標レーン（最終直線用・脚質非依存）
 */
function calcLocalPassTargetLane(horse, phase, allHorses, baseTargetLane, last3fNorm, options = {}) {
  const currentLane = clampLane(horse.y);
  const minXGap = options.minXGap ?? MIN_FORWARD_GAP;

  if (shouldFreezeStretchLane(horse, allHorses, minXGap)) {
    return currentLane;
  }

  const ctx = buildLaneDecisionContext(horse, phase, allHorses, {
    last3fNorm,
    minXGap,
    speedAdvance: options.speedAdvance,
  });
  ctx.spreadIntent = isStretchSpreadCandidate(horse, ctx, allHorses);

  if (!ctx.spreadIntent) {
    return currentLane;
  }

  const rank = ctx.runningRank;
  const maxProbe = rank <= 2 ? 2 : (rank <= 6 ? 6 : 7);

  let bestLane = currentLane;
  let bestScore = scoreLaneCandidate(horse, currentLane, ctx);

  for (let d = 1; d <= maxProbe; d += 1) {
    const lane = clampLane(currentLane + d);
    if (lane > LANE_WIDTH) break;
    const score = scoreLaneCandidate(horse, lane, ctx);
    if (score > bestScore + 0.03) {
      bestScore = score;
      bestLane = lane;
    }
  }

  if (rank <= 2 && bestLane - currentLane > 1.15) {
    bestLane = clampLane(currentLane + 1);
  }

  const frontInLane = findFrontHorseInLane(horse, currentLane, allHorses);
  if (frontInLane) {
    const dx = frontInLane.x - horse.x;
    if (dx > 0.5 && dx < LOCAL_FRONT_MAX_X) {
      const slipLane = clampLane(Math.max(currentLane + 1, frontInLane.y + 1.05));
      const slipScore = scoreLaneCandidate(horse, slipLane, ctx);
      if (slipScore >= bestScore - 0.08 && slipLane > bestLane) {
        bestLane = slipLane;
      }
    }
  }

  bestLane = capStretchLaneDelta(currentLane, bestLane, horse, ctx);

  if (Math.abs(bestLane - currentLane) < 0.06) {
    return currentLane;
  }
  return clampLane(bestLane);
}

/**
 * 最終直線入口: 4角出口と能力から仕掛けレーンを決定（能動的・脚質反映）
 */
function calcSpurEntryTargetLane(horse, phase, allHorses, last3fNorm, options = {}) {
  const currentLane = clampLane(horse.y);
  const minXGap = options.minXGap ?? MIN_FORWARD_GAP;

  if (shouldFreezeStretchLane(horse, allHorses, minXGap)) {
    return currentLane;
  }

  const ctx = buildLaneDecisionContext(horse, phase, allHorses, {
    last3fNorm,
    minXGap,
    speedAdvance: options.speedAdvance,
  });
  const situationPreferred = getSpurEntrySituationPreferredLane(horse, allHorses);
  ctx.spurEntryIntent = shouldSeekSpurEntryLane(horse, ctx, allHorses, minXGap);

  if (!ctx.spurEntryIntent && Math.abs(situationPreferred - currentLane) < 0.22) {
    return currentLane;
  }

  const rank = ctx.runningRank;
  const maxProbe = rank <= 2 ? 3 : 8;
  const minProbe = 0;

  let bestLane = currentLane;
  let bestScore = scoreSpurEntryLane(horse, currentLane, ctx, situationPreferred);
  const prefScore = scoreSpurEntryLane(horse, situationPreferred, ctx, situationPreferred);
  if (prefScore > bestScore + 0.02) {
    bestScore = prefScore;
    bestLane = situationPreferred;
  }

  for (let d = minProbe; d <= maxProbe; d += 1) {
    const laneOut = clampLane(currentLane + d);
    if (laneOut > LANE_WIDTH) break;
    const scoreOut = scoreSpurEntryLane(horse, laneOut, ctx, situationPreferred);
    if (scoreOut > bestScore + 0.02) {
      bestScore = scoreOut;
      bestLane = laneOut;
    }
    if (d > 0) {
      const laneIn = clampLane(currentLane - d);
      if (laneIn >= 1) {
        const scoreIn = scoreSpurEntryLane(horse, laneIn, ctx, situationPreferred);
        if (scoreIn > bestScore + 0.02) {
          bestScore = scoreIn;
          bestLane = laneIn;
        }
      }
    }
  }

  if (ctx.frontBlocked || isStretchSpreadCandidate(horse, ctx, allHorses)) {
    const passLane = calcLocalPassTargetLane(
      horse,
      phase,
      allHorses,
      bestLane,
      last3fNorm,
      options,
    );
    if (passLane > bestLane) {
      bestLane = clampLane(bestLane * 0.22 + passLane * 0.78);
    }
  } else if (situationPreferred > bestLane) {
    bestLane = clampLane(bestLane * 0.40 + situationPreferred * 0.60);
  }

  bestLane = capSpurEntryLaneDelta(currentLane, bestLane, horse, ctx);

  if (Math.abs(bestLane - currentLane) < 0.06) {
    return currentLane;
  }
  return clampLane(bestLane);
}

/** 最終直線入口: 状況に応じた縦の繰り上がり倍率（脚質非依存） */
function calcSpurEntryAdvanceMult(horse, phase, allHorses, last3fNorm, options = {}) {
  if (!isFinalStraightPhase(phase)) return 1;
  const minXGap = options.minXGap ?? MIN_FORWARD_GAP;
  if (shouldFreezeStretchLane(horse, allHorses, minXGap)) return 1;

  const ctx = buildLaneDecisionContext(horse, phase, allHorses, {
    last3fNorm,
    minXGap,
    speedAdvance: options.speedAdvance,
  });
  const staminaGate = getPostC3StaminaSpreadBudget(horse);

  if (staminaGate < 0.06 && ctx.staminaRatio < 0.18) return 1;

  let mult = 1
    + ctx.last3fWeight * 0.19
    + ctx.staminaAfterC3 * 0.14
    + staminaGate * 0.17
    + ctx.packRankNorm * 0.12
    + ctx.maneuvNorm * 0.09
    + (ctx.canPassFront ? 0.08 : 0);

  const spurLane = Number.isFinite(horse.spurEntryTargetLane)
    ? horse.spurEntryTargetLane
    : clampLane(horse.y);
  const spurGap = getLocalPackFrontGap(horse, spurLane, allHorses);
  if (spurGap > ctx.frontGap + 2.5) mult += 0.09;

  const exitLane = horse.corner4ExitLane;
  if (Number.isFinite(exitLane)) {
    const laneShift = Math.abs(clampLane(horse.y) - exitLane);
    if (laneShift > 0.35) mult += 0.05;
    if (laneShift > 0.95) mult += 0.05;
  }

  if (ctx.frontBlocked) mult += 0.07;

  mult = 1 + (mult - 1) * SPUR_ENTRY_VERTICAL_BOOST;
  return Math.min(SPUR_ENTRY_ADVANCE_MULT_CAP, mult);
}

/**
 * @deprecated L字の原因となるx帯一括すり分け。呼び出し禁止。
 */
function applyFinalStraightXBandStagger() {
  // intentionally no-op
}

/** ゴール演出用: 各馬の stretchFanLane にローカル進路目標を格納 */
function assignStretchFanLanesForPack(allHorses, options = {}) {
  const phase = options.phase ?? { isFinal: true, segmentId: 'final', segmentLabel: '最終直線入口' };
  const last3fNorm = options.last3fNorm ?? null;
  const minXGap = options.minXGap ?? MIN_FORWARD_GAP;
  allHorses.forEach(horse => {
    horse.stretchFanLane = calcSpurEntryTargetLane(
      horse,
      phase,
      allHorses,
      last3fNorm,
      { minXGap },
    );
  });
}

function computeStretchFanTargetLane(horse, allHorses, options = {}) {
  const phase = options.phase ?? { isFinal: true, segmentId: 'final', segmentLabel: '最終直線入口' };
  return calcSpurEntryTargetLane(
    horse,
    phase,
    allHorses,
    options.last3fNorm ?? null,
    { minXGap: options.minXGap },
  );
}

function calcLateStretchTargetLane(horse, phase, allHorses, baseTargetLane, last3fNorm, options = {}) {
  if (isFourthCornerPhase(phase) && !isFinalStraightPhase(phase)) {
    return clampLane(horse.y);
  }
  if (!isFinalStraightPhase(phase)) {
    return clampLane(baseTargetLane);
  }
  return calcSpurEntryTargetLane(
    horse,
    phase,
    allHorses,
    last3fNorm,
    options,
  );
}

function getLaneDecisionMeta(horse, phase, allHorses, last3fNorm, minXGap, speedAdvance) {
  if (isFourthCornerPhase(phase) && !isFinalStraightPhase(phase)) {
    return {
      seekOutsideLane: false,
      gapGain: 0,
      chaseUrgency: 0,
      lateralCap: LATERAL_SHIFT_CORNER4_CAP,
    };
  }

  if (!isFinalStraightPhase(phase)) {
    return {
      seekOutsideLane: false,
      gapGain: 0,
      chaseUrgency: 0,
      lateralCap: LATERAL_SHIFT_HARD_CAP,
    };
  }

  const ctx = buildLaneDecisionContext(horse, phase, allHorses, {
    last3fNorm,
    minXGap,
    speedAdvance,
    frontBlockExtra: FINAL_FRONT_BLOCK_EXTRA_GAP,
  });

  if (shouldFreezeStretchLane(horse, allHorses, minXGap)) {
    return {
      seekOutsideLane: false,
      gapGain: 0,
      chaseUrgency: ctx.chaseUrgency,
      lateralCap: LATERAL_SHIFT_HARD_CAP,
      ctx,
    };
  }

  const gapAtOuter = getLocalPackFrontGap(horse, clampLane(ctx.currentLane + 1), allHorses);
  const gapGain = Math.max(0, gapAtOuter - ctx.frontGap);

  const spurTarget = Number.isFinite(horse.spurEntryTargetLane)
    ? horse.spurEntryTargetLane
    : getSpurEntrySituationPreferredLane(horse, allHorses);
  const seekOutsideLane = shouldSeekSpurEntryLane(horse, ctx, allHorses, minXGap)
    || spurTarget > ctx.currentLane + 0.1;

  const lateralCap = seekOutsideLane
    ? LATERAL_SHIFT_BLOCKED_CAP * (0.88 + Math.min(0.48, ctx.chaseUrgency * 0.26 + gapGain * 0.12))
    : LATERAL_SHIFT_HARD_CAP;

  return {
    seekOutsideLane,
    gapGain,
    chaseUrgency: ctx.chaseUrgency,
    lateralCap,
    ctx,
  };
}

function calcCentrifugalDrift(horse, phase, speedAdvance = 0) {
  if (!isFourthCornerPhase(phase) && !phase?.isFinal) return 0;

  const currentLane = clampLane(horse.y);
  const laneNorm = (currentLane - 1) / Math.max(1, LANE_WIDTH - 1);
  const speedRatio = horse.S_cruise > 0
    ? Math.max(0, Math.min(1.35, (speedAdvance || horse.lastAdvance || 0) / horse.S_cruise))
    : 0.5;
  if (speedRatio < 0.15) return 0;

  const curveStrength = isFourthCornerPhase(phase) && !isFinalStraightPhase(phase)
    ? 0.85
    : (isFinalStraightPhase(phase) ? 0.68 : 0.38);
  const drift = curveStrength * (speedRatio ** 2) * (0.16 + laneNorm * 0.88) * 0.52;
  return Math.max(0, drift);
}

function getLaneChangeRateForStretch(phase, horse, allHorses, last3fNorm, speedAdvance) {
  if (!isFinalStraightPhase(phase) || !allHorses?.length) return null;
  const meta = getLaneDecisionMeta(
    horse,
    phase,
    allHorses,
    last3fNorm,
    MIN_FORWARD_GAP,
    speedAdvance,
  );
  const spurTarget = Number.isFinite(horse.spurEntryTargetLane)
    ? horse.spurEntryTargetLane
    : null;
  const laneDelta = spurTarget != null
    ? Math.abs(spurTarget - clampLane(horse.y))
    : 0;
  if (!meta.seekOutsideLane) {
    return 0.50 + Math.min(0.28, laneDelta * 0.10);
  }
  const ctx = meta.ctx;
  if (ctx?.midPack) {
    if (meta.chaseUrgency > 0.45) return 0.94;
    if (meta.chaseUrgency > 0.28) return 0.86;
    return 0.78;
  }
  if (meta.chaseUrgency > 0.50) return 0.88;
  if (meta.chaseUrgency > 0.28) return 0.78;
  return 0.68;
}

function recordLaneCommit(horse, prevLane, nextLane) {
  const delta = nextLane - prevLane;
  if (Math.abs(delta) < 0.08) return;
  const dir = delta > 0 ? 1 : -1;
  if ((horse.laneCommitDir ?? 0) !== 0 && horse.laneCommitDir !== dir) {
    horse.laneChangeCooldownPhases = Math.max(horse.laneChangeCooldownPhases ?? 0, 3);
  }
  horse.laneCommitDir = dir;
  horse.laneCommitPhases = LANE_COMMIT_PHASES;
}

function calcGoalChaseUrgency(horse, staminaRatio, last3fWeight, packRankNorm = 0.5) {
  const maneuvNorm = normalize01((horse.M_maneuv ?? 50) / 100);
  const jockeyAggression = getJockeyAggressionNorm(horse);
  return Math.max(
    0.2,
    Math.min(
      1.8,
      last3fWeight * 0.40
        + staminaRatio * 0.35
        + packRankNorm * 0.15
        + maneuvNorm * 0.15
        + jockeyAggression * 0.12,
    ),
  );
}

export {
  getStretchBlockExtra,
  buildLaneDecisionContext,
  scoreLaneCandidate,
  getLocalPackFrontGap,
  isInLocalPackTraffic,
  snapshotCorner4ExitState,
  getSpurEntrySituationPreferredLane,
  shouldSeekSpurEntryLane,
  assignStretchFanLanesForPack,
  computeStretchFanTargetLane,
  calcLocalPassTargetLane,
  calcSpurEntryTargetLane,
  calcSpurEntryAdvanceMult,
  calcLateStretchTargetLane,
  getLaneDecisionMeta,
  calcCentrifugalDrift,
  getLaneChangeRateForStretch,
  calcGoalChaseUrgency,
  calcPackRankNorm,
  calcLast3fWeight,
  getRunningOrderRank,
  shouldFreezeStretchLane,
  isStretchSpreadCandidate,
  capStretchLaneDelta,
  capSpurEntryLaneDelta,
  applyFinalStraightXBandStagger,
  recordLaneCommit,
};
