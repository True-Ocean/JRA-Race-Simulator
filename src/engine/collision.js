import {
  buildBattleProximityLimits,
  isPairBattleProximity,
  shouldBattle,
  resolveBattle,
} from './battle.js';
import { buildBattleLogLine } from './battle-log.js';
import {
  MIN_FORWARD_GAP,
  LATERAL_BLOCK_X_GAP,
  LATERAL_BLOCK_LANE_GAP,
  DIAGONAL_REAR_BLOCK_X_GAP,
  DIAGONAL_REAR_INNER_BAND_OUTER_EPS,
  DIAGONAL_REAR_INNER_BAND_INNER_MARGIN,
  COLLISION_MIN_Y_GAP,
  COLLISION_ITERATIONS,
  COLLISION_EPS,
  INNER_CUTIN_WINNER_STAMINA_MULT,
  INNER_CUTIN_LOSER_STAMINA_MULT,
  COLLISION_FRONT_BUFFER_X,
  COLLISION_REAR_BUFFER_X,
  INNER_CUTIN_BUFFER_MULT,
  LATERAL_SHIFT_SOFT_CAP,
  LATERAL_SHIFT_HARD_CAP,
  LATERAL_SHIFT_BLOCKED_CAP,
  LATERAL_SHIFT_THROUGH_C3_CAP,
  START_LATERAL_SHIFT_CAP,
  THROUGH_C3_LANE_CHANGE_TRIGGER_DELTA,
  INNER_HALF_LANE_MAX,
  LANE_WIDTH,
  INNER_POCKET_FRONT_GAP_RATIO,
  INNER_POCKET_REAR_GAP_RATIO,
  PRE_CORNER_INNER_COMPRESS_ITERS,
  PRE_CORNER_FORCE_INNER_STEP,
  PRE_CORNER_MIN_Y_GAP_MULT,
  HOME_OUTER_REROUTE_STEPS,
  PACK_DENSITY_PENALTY_QUAD,
} from './constants.js';
import {
  clampLane,
  isNigeStyle,
  isOonigeStyle,
  isLaneInShiftPath,
  applyBattleStaminaImpact,
} from './horse-utils.js';
import {
  isThroughThirdCornerPhase,
  isStartToHomePhase,
  isAfterFourthCornerPhase,
  isFinalStraightPhase,
  getPhaseBufferMultiplier,
} from './phase-helpers.js';
import { isRearPelotonForwardExempt, isFormationPhase } from './phase-context.js';
import { getFormationForwardRelief, calcFormationRangeOffset, isFrontRunnerStyle, getFormationTargetRank, getEffectiveFormationRange } from './formation.js';
import { calcPackRankNorm } from './lane-decision.js';
import {
  getFormationBattleRateMult,
  getStyleBattleBonus,
} from './battle-formation.js';
import {
  resolveWeightedBattle,
  isInnerCutInContestScenario,
  canTriggerInnerCutInBattle,
  markInnerCutInBattlePair,
} from './battle-phase.js';

function isInnerShiftDiagonalRearThreat(horse, fromLane, toLane, h, maxRearGap) {
  const from = clampLane(fromLane);
  const to = clampLane(toLane);
  if (to >= from - 0.02) return false;
  if (h.id === horse.id) return false;
  const rearGap = horse.x - h.x;
  if (rearGap <= 0 || rearGap > maxRearGap) return false;
  const hy = h.y;
  if (hy >= from - DIAGONAL_REAR_INNER_BAND_OUTER_EPS) return false;
  if (hy < to - DIAGONAL_REAR_INNER_BAND_INNER_MARGIN) return false;
  return true;
}

function isOuterShiftDiagonalRearThreat(horse, fromLane, toLane, h, maxRearGap) {
  const from = clampLane(fromLane);
  const to = clampLane(toLane);
  if (to <= from + 0.02) return false;
  if (h.id === horse.id) return false;
  const rearGap = horse.x - h.x;
  if (rearGap <= 0 || rearGap > maxRearGap) return false;
  const hy = h.y;
  if (hy <= from + DIAGONAL_REAR_INNER_BAND_OUTER_EPS) return false;
  if (hy > to + DIAGONAL_REAR_INNER_BAND_INNER_MARGIN) return false;
  return true;
}

function findDiagonalRearHorse(horse, desiredY, allHorses) {
  const targetLane = clampLane(desiredY);
  const fromLane = clampLane(horse.y);
  const maxGap = DIAGONAL_REAR_BLOCK_X_GAP;
  if (targetLane < fromLane - 0.02) {
    return allHorses.find(h => isInnerShiftDiagonalRearThreat(horse, fromLane, targetLane, h, maxGap));
  }
  if (targetLane > fromLane + 0.02) {
    return allHorses.find(h => isOuterShiftDiagonalRearThreat(horse, fromLane, targetLane, h, maxGap));
  }
  return null;
}

function resolveLaneMovement(
  rng,
  horse,
  desiredY,
  desiredAdvance,
  allHorses,
  phase,
  context,
  phaseEventLogs,
  globalLogs,
  engagedHorseIds,
) {
  const isLateStraight = Boolean(context?.isLateStraight);
  const frontBlocked = Boolean(context?.frontBlocked);
  const isStartPhase = Boolean(context?.isStartPhase);
  const isEarlyInnerBurst = Boolean(context?.isEarlyInnerBurst);
  const isThroughC3 = isThroughThirdCornerPhase(phase);
  const allowBurstShortCircuit = Boolean(context?.allowBurstShortCircuit);
  const collisionMetrics = context?.collisionMetrics ?? null;
  const battleProximityLimits =
    context?.battleProximityLimits ?? buildBattleProximityLimits(collisionMetrics);
  const minXGapForCollision = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
  const minYGapForCollision = collisionMetrics?.minYGap ?? COLLISION_MIN_Y_GAP;
  const baseY = clampLane(horse.y);
  const desiredDelta = desiredY - baseY;
  const absDesiredDelta = Math.abs(desiredDelta);
  const laneChangeTriggerDelta = isThroughC3 ? THROUGH_C3_LANE_CHANGE_TRIGGER_DELTA : 0.18;
  const wantsLaneChange = absDesiredDelta > laneChangeTriggerDelta;
  if (!wantsLaneChange) {
    return { nextY: baseY, advanceMult: 1 };
  }

  const predictedSpeed = Math.max(0, desiredAdvance);
  const speedRatio = horse.S_cruise > 0 ? predictedSpeed / horse.S_cruise : 1;
  const capBase = allowBurstShortCircuit
    ? START_LATERAL_SHIFT_CAP
    : Number.isFinite(context?.lateralCap)
      ? context.lateralCap
      : isLateStraight && (frontBlocked || Boolean(context?.seekOutsideLane))
        ? LATERAL_SHIFT_BLOCKED_CAP
        : isLateStraight
          ? LATERAL_SHIFT_HARD_CAP
          : isThroughC3
            ? LATERAL_SHIFT_THROUGH_C3_CAP
            : LATERAL_SHIFT_SOFT_CAP;
  const speedPenalty = Math.max(0, Math.min(0.5, (speedRatio - 0.85) * 0.55));
  const seekOutside = Boolean(context?.seekOutsideLane);
  const frontBlockBoost = frontBlocked && seekOutside ? 1.35 : (frontBlocked ? 1.15 : 1.0);
  const maxDelta = capBase * (1 - speedPenalty) * frontBlockBoost;
  const limitedDelta = Math.sign(desiredDelta) * Math.min(absDesiredDelta, Math.max(0.10, maxDelta));
  const limitedY = clampLane(baseY + limitedDelta);

  if (isLateStraight && !frontBlocked) {
    return { nextY: baseY, advanceMult: 1 };
  }

  const skipDiagRearForInnerThroughC3 =
    isThroughThirdCornerPhase(phase) && limitedY < baseY - 0.02;
  const diagonalRearHorse =
    allowBurstShortCircuit || skipDiagRearForInnerThroughC3
      ? null
      : findDiagonalRearHorse(horse, limitedY, allHorses);
  if (diagonalRearHorse) {
    if (!engagedHorseIds.has(horse.id) && !engagedHorseIds.has(diagonalRearHorse.id) &&
        isPairBattleProximity(horse, diagonalRearHorse, battleProximityLimits) &&
        shouldBattle(rng, allHorses, horse, diagonalRearHorse, battleProximityLimits)) {
      const result = resolveBattle(rng, horse, diagonalRearHorse, phase);
      applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
      const log = buildBattleLogLine('斜め後方割り込み', result.winner, result.loser);
      globalLogs.push(log);
      phaseEventLogs.push(log);
      engagedHorseIds.add(horse.id);
      engagedHorseIds.add(diagonalRearHorse.id);
      if (result.winner.id !== horse.id) {
        return { nextY: baseY, advanceMult: 0.93 };
      }
    } else {
      return { nextY: baseY, advanceMult: 0.96 };
    }
  }

  const blockerXGap = allowBurstShortCircuit ? LATERAL_BLOCK_X_GAP * 0.62 : LATERAL_BLOCK_X_GAP;
  const blockerLaneMargin = allowBurstShortCircuit ? 0.62 : LATERAL_BLOCK_LANE_GAP;
  const laneBlocker =
    isThroughC3 && collisionMetrics
      ? allHorses.find(h => {
        if (h.id === horse.id) return false;
        const frontHorse = h.x >= horse.x ? h : horse;
        const backHorse = h.x >= horse.x ? horse : h;
        const requiredGap = getRequiredXGap(
          frontHorse,
          backHorse,
          minXGapForCollision,
          phase,
          { isInnerCutIn: limitedY < baseY - 0.02 },
        );
        return (
          Math.abs(h.x - horse.x) < requiredGap &&
          Math.abs(h.y - limitedY) < minYGapForCollision
        );
      })
      : allHorses.find(h =>
        h.id !== horse.id &&
        Math.abs(h.x - horse.x) < blockerXGap &&
        isLaneInShiftPath(h.y, baseY, limitedY, blockerLaneMargin)
      );

  if (!laneBlocker) {
    // 移動先で他馬とカード（minXGap × minYGap）が重なる場合は手前で抑制する
    const wouldOverlap = allHorses.some(h => {
      if (h.id === horse.id) return false;
      const frontHorse = h.x >= horse.x ? h : horse;
      const backHorse = h.x >= horse.x ? horse : h;
      const requiredGap = getRequiredXGap(
        frontHorse,
        backHorse,
        minXGapForCollision,
        phase,
        { isInnerCutIn: limitedY < baseY - 0.02 },
      );
      return (
        Math.abs(h.x - horse.x) < requiredGap &&
        Math.abs(h.y - limitedY) < minYGapForCollision &&
        // 元位置で既にすれ違っている馬は対象外（移動で離れる方向ならOK）
        Math.abs(h.y - limitedY) <= Math.abs(h.y - baseY) + 0.02
      );
    });
    if (wouldOverlap) {
      // 半分だけ寄せて後続フェーズに持ち越す
      const halfY = clampLane(baseY + limitedDelta * 0.5);
      const stillOverlap = allHorses.some(h => {
        if (h.id === horse.id) return false;
        const frontHorse = h.x >= horse.x ? h : horse;
        const backHorse = h.x >= horse.x ? horse : h;
        const requiredGap = getRequiredXGap(
          frontHorse,
          backHorse,
          minXGapForCollision,
          phase,
          { isInnerCutIn: halfY < baseY - 0.02 },
        );
        return (
          Math.abs(h.x - horse.x) < requiredGap &&
          Math.abs(h.y - halfY) < minYGapForCollision &&
          Math.abs(h.y - halfY) <= Math.abs(h.y - baseY) + 0.02
        );
      });
      if (stillOverlap) {
        return { nextY: baseY, advanceMult: 0.98 };
      }
      return { nextY: halfY, advanceMult: 0.98 };
    }
    return {
      nextY: limitedY,
      advanceMult: absDesiredDelta > Math.abs(limitedDelta) + 0.05 ? 0.98 : 1,
    };
  }

  if (allowBurstShortCircuit) {
    // スタート〜ホームのみ: 隊列形成を優先し、完全停止させず内へ寄せる。
    const fallbackInnerY = clampLane(baseY + (limitedY - baseY) * 0.55);
    if (fallbackInnerY < baseY - 0.05) {
      return { nextY: fallbackInnerY, advanceMult: 0.99 };
    }
  }

  const shouldTryInnerCutIn =
    isInnerCutInContestScenario(horse, laneBlocker, baseY, limitedY, desiredAdvance, minXGapForCollision);
  if (shouldTryInnerCutIn) {
    const canBattle =
      canTriggerInnerCutInBattle(horse, laneBlocker, phase) &&
      !engagedHorseIds.has(horse.id) &&
      !engagedHorseIds.has(laneBlocker.id) &&
      isPairBattleProximity(horse, laneBlocker, battleProximityLimits) &&
      shouldBattle(rng, allHorses, horse, laneBlocker, battleProximityLimits);
    if (canBattle) {
      const result = resolveWeightedBattle(rng, horse, laneBlocker, {
        cruise: 0.22,
        maneuv: 0.42,
        sustain: 0.20,
        stamina: 0.16,
      }, h => getStyleBattleBonus(h, phase), {
        phase,
        impactOptions: {
          loserAlreadyPenalized: true,
          winnerMult: INNER_CUTIN_WINNER_STAMINA_MULT,
          loserMult: INNER_CUTIN_LOSER_STAMINA_MULT,
        },
      });
      markInnerCutInBattlePair(horse, laneBlocker, phase);
      engagedHorseIds.add(horse.id);
      engagedHorseIds.add(laneBlocker.id);
      const log = buildBattleLogLine('内前争い', result.winner, result.loser);
      globalLogs.push(log);
      phaseEventLogs.push(log);
      if (result.winner.id === horse.id) {
        const targetFrontX = laneBlocker.x + minXGapForCollision * 0.28;
        const xNudge = Math.max(0, Math.min(
          Math.max(0, desiredAdvance) * 0.55,
          targetFrontX - horse.x,
        ));
        return { nextY: limitedY, advanceMult: 0.985, xNudge };
      }
      return { nextY: baseY, advanceMult: 0.93 };
    }
    // 連戦抑制・同フェーズ多発を避けるため、バトル不可時は強行せず並走寄りで維持
    return { nextY: baseY, advanceMult: 0.97 };
  }

  // 進路変更を強行したいときは既存バトル判定を利用
  if (!engagedHorseIds.has(horse.id) && !engagedHorseIds.has(laneBlocker.id) &&
      isPairBattleProximity(horse, laneBlocker, battleProximityLimits) &&
      shouldBattle(rng, allHorses, horse, laneBlocker, battleProximityLimits)) {
    const result = resolveBattle(rng, horse, laneBlocker, phase);
    applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
    const log = buildBattleLogLine('進路争い', result.winner, result.loser);
    globalLogs.push(log);
    phaseEventLogs.push(log);
    engagedHorseIds.add(horse.id);
    engagedHorseIds.add(laneBlocker.id);
    if (result.winner.id === horse.id) {
      return { nextY: limitedY, advanceMult: 0.97 };
    }
  }

  return { nextY: baseY, advanceMult: 0.95 };
}

function getHorseBufferX(horse, phase) {
  const mult = getPhaseBufferMultiplier(phase);
  let front = COLLISION_FRONT_BUFFER_X;
  let rear = COLLISION_REAR_BUFFER_X;
  if (isNigeStyle(horse?.style) || horse?.style === '先行') front += 2;
  if (horse?.style === '差し' || horse?.style === '追込') rear += 2;
  return { front: front * mult, rear: rear * mult };
}

function getRequiredXGap(frontHorse, backHorse, baseMinXGap, phase, options = {}) {
  const frontBuf = getHorseBufferX(frontHorse, phase);
  const backBuf = getHorseBufferX(backHorse, phase);
  let required = baseMinXGap + frontBuf.rear + backBuf.front;
  if (options?.isInnerCutIn) required *= INNER_CUTIN_BUFFER_MULT;
  const ctx = phase?._phaseCtx;
  if (ctx && isFormationPhase(phase, ctx) && options?.allHorses && backHorse) {
    const relief = getFormationForwardRelief(
      backHorse,
      calcPackRankNorm(backHorse, options.allHorses),
      options.allHorses,
    );
    required *= relief.gapMult;
  }
  return required;
}

function resolveHorseOverlaps(horses, options = {}) {
  const minXGap = options.minXGap ?? MIN_FORWARD_GAP;
  const minYGap = options.minYGap ?? COLLISION_MIN_Y_GAP;
  const iterations = options.iterations ?? COLLISION_ITERATIONS;
  const keepOrder = options.keepOrder ?? true;
  const freezeY = options.freezeY ?? false;
  const phase = options.phase ?? null;
  if (!Array.isArray(horses) || horses.length < 2) return;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < horses.length; i++) {
      const a = horses[i];
      for (let j = i + 1; j < horses.length; j++) {
        const b = horses[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        const front = dx >= 0 ? b : a;
        const back = dx >= 0 ? a : b;
        const requiredXGap = getRequiredXGap(front, back, minXGap, options.phase ?? null);
        if (adx >= requiredXGap || ady >= minYGap) continue;

        const pushX = (requiredXGap - adx) / 2;
        const pushY = freezeY ? 0 : (minYGap - ady) / 2;
        const sx = dx === 0 ? (i % 2 === 0 ? -1 : 1) : Math.sign(dx);
        const sy = dy === 0 ? (i % 2 === 0 ? -1 : 1) : Math.sign(dy);

        // 前後方向を優先し、レーン方向で補助的に分離する
        a.x -= pushX * sx;
        b.x += pushX * sx;
        if (!freezeY) {
          a.y = clampHorseLaneByPhase(a, a.y - pushY * sy, phase, horses);
          b.y = clampHorseLaneByPhase(b, b.y + pushY * sy, phase, horses);
        }
        moved = true;
      }
    }

    if (keepOrder) enforceForwardOrder(horses, minXGap);
    horses.forEach(h => {
      h.y = clampHorseLaneByPhase(h, h.y, phase, horses);
      if (h.x < 0) h.x = 0;
    });
    if (!moved) break;
  }
}

function enforceForwardOrder(horses, minXGap) {
  const byFront = [...horses].sort((a, b) => b.x - a.x);
  for (let i = 1; i < byFront.length; i++) {
    const front = byFront[i - 1];
    const back = byFront[i];
    const gap = front.x - back.x;
    if (gap + COLLISION_EPS >= minXGap) continue;
    back.x = Math.max(0, front.x - minXGap);
  }
}

function resolveForwardMovement(
  rng,
  horse,
  desiredAdvance,
  allHorses,
  minForwardGap,
  phase,
  phaseEventLogs,
  globalLogs,
  engagedHorseIds,
  proximityLimits = null,
) {
  const battleProximityLimits =
    proximityLimits ?? buildBattleProximityLimits(null);
  if (isRearPelotonForwardExempt(horse, allHorses, phase, phase?._phaseCtx)) {
    return { advance: desiredAdvance };
  }
  const packRank = calcPackRankNorm(horse, allHorses);
  const relief = getFormationForwardRelief(horse, packRank, allHorses);
  const { rankNorm } = calcFormationRangeOffset(packRank, horse, allHorses);
  const target = getFormationTargetRank(horse);
  const behindTarget = Math.max(0, rankNorm - target - 0.03);
  const { max: styleMax } = getEffectiveFormationRange(horse);
  const leader = [...allHorses].sort((a, b) => b.x - a.x)[0];
  const leaderGap = leader && leader.id !== horse.id
    ? (leader.x ?? 0) - (horse.x ?? 0)
    : 0;
  const isFrontGroupMaintain =
    isFrontRunnerStyle(horse.style) &&
    relief.advanceFloor > 0 &&
    relief.gapMult < 1 &&
    (
      (horse.style === '先行' && rankNorm <= styleMax + 0.10 && behindTarget <= 0.05)
      || (horse.style !== '先行' && rankNorm <= 0.28)
    );
  const needsStyleCatchUp = isFrontRunnerStyle(horse.style) && behindTarget > 0.06;
  const canUseChaseRelief = relief.advanceFloor > 0 && leaderGap > 1.5 && leaderGap <= 120;
  const canApplyReliefFloor = isFrontGroupMaintain || canUseChaseRelief || needsStyleCatchUp;
  const nextX = horse.x + desiredAdvance;
  const spurLaneIntent = isFinalStraightPhase(phase)
    && Number.isFinite(horse.spurEntryTargetLane);
  const laneMatchTol = spurLaneIntent ? 1.15 : 0.85;
  const targetLane = Number.isFinite(horse.spurEntryTargetLane)
    ? clampLane(horse.spurEntryTargetLane)
    : clampLane(horse.y);
  const frontCandidates = allHorses
    .filter(h =>
      h.id !== horse.id &&
      h.x > horse.x &&
      (spurLaneIntent
        ? (Math.abs(h.y - targetLane) < laneMatchTol || Math.abs(h.y - horse.y) < 0.8)
        : Math.abs(h.y - horse.y) < laneMatchTol)
    )
    .sort((a, b) => a.x - b.x);

  const front = frontCandidates[0];
  if (!front) {
    return { advance: desiredAdvance };
  }

  const requiredGap = getRequiredXGap(front, horse, minForwardGap, phase, { allHorses });
  const currentGap = front.x - horse.x;
  const maxAdvanceWithoutContact = Math.max(0, currentGap - requiredGap);
  if (desiredAdvance <= maxAdvanceWithoutContact) {
    return { advance: desiredAdvance };
  }

  const wantsOvertake = nextX > front.x - requiredGap;
  const inBattleRange = currentGap <= battleProximityLimits.maxDx;
  if (wantsOvertake &&
      inBattleRange &&
      isPairBattleProximity(horse, front, battleProximityLimits) &&
      !engagedHorseIds.has(horse.id) && !engagedHorseIds.has(front.id) &&
      shouldBattle(rng, allHorses, horse, front, battleProximityLimits, {
        formationRateMult: getFormationBattleRateMult(horse, front, phase, phase?._phaseCtx),
      })) {
    const result = resolveBattle(rng, horse, front, phase, { phaseCtx: phase?._phaseCtx });
    applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
    const log = buildBattleLogLine('同レーン争い', result.winner, result.loser);
    globalLogs.push(log);
    phaseEventLogs.push(log);
    engagedHorseIds.add(horse.id);
    engagedHorseIds.add(front.id);
    if (result.winner.id === horse.id) {
      return { advance: desiredAdvance };
    }
  }

  let advance = maxAdvanceWithoutContact;
  if (canApplyReliefFloor) {
    const floorMult = needsStyleCatchUp && horse.style === '先行'
      ? Math.max(relief.advanceFloor, 0.38)
      : needsStyleCatchUp && isFrontRunnerStyle(horse.style)
        ? Math.max(relief.advanceFloor, 0.44)
        : relief.advanceFloor;
    if (advance < desiredAdvance * floorMult) {
      advance = Math.max(advance, desiredAdvance * floorMult);
    }
  }
  if (isThroughThirdCornerPhase(phase) && desiredAdvance > maxAdvanceWithoutContact + 0.01) {
    advance *= 0.94;
  }
  return { advance };
}

function getFrontGap(horse, lane, allHorses) {
  const front = allHorses
    .filter(h =>
      h.id !== horse.id &&
      h.x > horse.x &&
      Math.abs(h.y - lane) < 0.8
    )
    .sort((a, b) => a.x - b.x)[0];
  if (!front) return 999;
  return front.x - horse.x;
}

function horseFootprintsOverlapAt(cx, cy, h, minXGap, minYGap) {
  return Math.abs(h.x - cx) < minXGap && Math.abs(h.y - cy) < minYGap;
}

function isLaneOpenForShift(horse, targetLane, allHorses, phase = null, collisionMetrics = null) {
  const toLane = clampLane(targetLane);
  const useFootprint =
    phase != null &&
    isThroughThirdCornerPhase(phase) &&
    collisionMetrics != null &&
    Number.isFinite(collisionMetrics.minXGap) &&
    Number.isFinite(collisionMetrics.minYGap);
  if (useFootprint) {
    const minX = collisionMetrics.minXGap;
    const minY = collisionMetrics.minYGap;
    return !allHorses.some(h =>
      h.id !== horse.id && horseFootprintsOverlapAt(horse.x, toLane, h, minX, minY)
    );
  }
  const fromLane = clampLane(horse.y);
  return !allHorses.some(h =>
    h.id !== horse.id &&
    Math.abs(h.x - horse.x) < LATERAL_BLOCK_X_GAP &&
    isLaneInShiftPath(h.y, fromLane, toLane, 0.85)
  );
}

function isInnerLaneOpenAhead(horse, targetLane, allHorses, phase = null, collisionMetrics = null) {
  const fromLane = clampLane(horse.y);
  const toLane = clampLane(targetLane);
  const through = phase ? isThroughThirdCornerPhase(phase) : false;
  const xForward = through ? 18 : 34;
  const useFootprint =
    through &&
    collisionMetrics != null &&
    Number.isFinite(collisionMetrics.minXGap) &&
    Number.isFinite(collisionMetrics.minYGap);
  if (useFootprint) {
    const minX = collisionMetrics.minXGap;
    const minY = collisionMetrics.minYGap;
    return !allHorses.some(h =>
      h.id !== horse.id &&
      h.x >= horse.x - 10 &&
      h.x <= horse.x + xForward &&
      horseFootprintsOverlapAt(horse.x, toLane, h, minX, minY)
    );
  }
  return !allHorses.some(h =>
    h.id !== horse.id &&
    h.x >= horse.x - 10 &&
    h.x <= horse.x + xForward &&
    isLaneInShiftPath(h.y, fromLane, toLane, 0.82)
  );
}

function findInnermostOpenSlotLane(horse, allHorses, laneMin, collisionMetrics, phase, options = {}) {
  const minXGap = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
  const minYGap = collisionMetrics?.minYGap ?? COLLISION_MIN_Y_GAP;
  const aggressivePreCorner = Boolean(options?.aggressivePreCorner);
  const ownBuffer = getHorseBufferX(horse, phase);
  const cur = clampLane(horse.y);
  const start = Math.max(1, Math.ceil(laneMin));
  const end = Math.floor(cur - 0.01);
  // 内側ほど望ましいので start から end の順（最内 → 自分の手前）に走査して即返す
  for (let lane = start; lane <= end; lane++) {
    if (!isLaneOpenForShift(horse, lane, allHorses, phase, collisionMetrics)) continue;
    let frontGap = Infinity;
    let rearGap = Infinity;
    const laneBand = Math.max(0.85, minYGap);
    for (const h of allHorses) {
      if (h.id === horse.id) continue;
      if (Math.abs(h.y - lane) >= laneBand) continue;
      const dx = h.x - horse.x;
      if (dx > 0 && dx < frontGap) frontGap = dx;
      else if (dx < 0 && -dx < rearGap) rearGap = -dx;
    }
    const fullFrontMin = (aggressivePreCorner ? minXGap * 0.90 : minXGap) + ownBuffer.front * 0.35;
    const fullRearMin = (aggressivePreCorner ? minXGap * 0.78 : minXGap) + ownBuffer.rear * 0.30;
    const hasFullSlot = frontGap >= fullFrontMin && rearGap >= fullRearMin;
    if (hasFullSlot) return lane;
    const hasPocketSlot = canInsertIntoInnerPocket(frontGap, rearGap, minXGap, ownBuffer, aggressivePreCorner);
    if (hasPocketSlot) return lane;
  }
  return null;
}

function canInsertIntoInnerPocket(frontGap, rearGap, minXGap, ownBuffer = null, aggressivePreCorner = false) {
  if (!Number.isFinite(frontGap) || !Number.isFinite(rearGap)) return false;
  const frontBuf = ownBuffer?.front ?? 0;
  const rearBuf = ownBuffer?.rear ?? 0;
  const minFront = minXGap * (aggressivePreCorner ? 0.45 : INNER_POCKET_FRONT_GAP_RATIO) + frontBuf * 0.22;
  const minRear = minXGap * (aggressivePreCorner ? 0.25 : INNER_POCKET_REAR_GAP_RATIO) + rearBuf * 0.18;
  return frontGap >= minFront && rearGap >= minRear;
}

function shouldAllowRiskyInnerDive(horse, phase, allHorses) {
  if (!horse || !phase || !Array.isArray(allHorses)) return false;
  if (!(phase.isFinal || isAfterFourthCornerPhase(phase))) return false;
  if (isNigeStyle(horse.style)) return false;

  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  const requiredStamina = 0.22;
  if (staminaRatio < requiredStamina) return false;

  const currentLane = clampLane(horse.y);
  const frontGap = getFrontGap(horse, currentLane, allHorses);
  if (frontGap > MIN_FORWARD_GAP + 3) return false;

  const underPressure = allHorses.some(h =>
    h.id !== horse.id &&
    h.x > horse.x - 8 &&
    h.x < horse.x + 26 &&
    Math.abs(h.y - currentLane) < 0.92
  );
  if (!underPressure) return false;

  const probeInnerLane = Math.max(1, currentLane - 1.0);
  if (!isInnerLaneOpenAhead(horse, probeInnerLane, allHorses, phase, null)) return false;

  return true;
}

function getInnerRailLaneFloor(horse, laneMin = 1, phase = null, allHorses = null) {
  const configuredGap = Number.isFinite(horse?.innerRailGap) ? horse.innerRailGap : 0;
  const configuredFloor = 1 + Math.max(0, configuredGap);
  const baseFloor = Math.max(clampLane(laneMin), clampLane(configuredFloor));
  if (baseFloor <= clampLane(laneMin) + 0.001) return baseFloor;
  if (!shouldAllowRiskyInnerDive(horse, phase, allHorses)) return baseFloor;
  return clampLane(laneMin);
}

function clampHorseLaneByPhase(horse, lane, phase = null, allHorses = null, laneMax = LANE_WIDTH) {
  const minLane = getInnerRailLaneFloor(horse, 1, phase, allHorses);
  const cappedMax = Math.max(minLane, Math.min(laneMax, LANE_WIDTH));
  return Math.max(minLane, Math.min(cappedMax, clampLane(lane)));
}

function enforceInnerHalfTrack(horses, phase = null) {
  horses.forEach(h => {
    h.y = clampHorseLaneByPhase(h, h.y, phase, horses, INNER_HALF_LANE_MAX);
  });
}

function compressPreCornerToInnerLanes(horses, phase, collisionMetrics) {
  const minXGap = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
  const minYGapBase = collisionMetrics?.minYGap ?? COLLISION_MIN_Y_GAP;
  const minYGap = Math.max(0.72, minYGapBase * PRE_CORNER_MIN_Y_GAP_MULT);
  for (let iter = 0; iter < PRE_CORNER_INNER_COMPRESS_ITERS; iter++) {
    let moved = false;
    const order = [...horses].sort((a, b) => {
      const dy = clampLane(b.y) - clampLane(a.y); // 外側馬を優先して先に内へ寄せる
      if (Math.abs(dy) > 0.01) return dy;
      return b.x - a.x;
    });
    for (const horse of order) {
      const laneFloor = getInnerRailLaneFloor(horse, 1, phase, horses);
      const currentLane = clampHorseLaneByPhase(horse, horse.y, phase, horses, INNER_HALF_LANE_MAX);
      if (currentLane <= laneFloor + 0.01) continue;
      const slot = findInnermostOpenSlotLane(
        horse,
        horses,
        laneFloor,
        { minXGap, minYGap },
        phase,
        { aggressivePreCorner: true },
      );
      let targetLane = slot != null
        ? Math.min(currentLane, clampLane(slot))
        : Math.max(laneFloor, currentLane - PRE_CORNER_FORCE_INNER_STEP);
      if (targetLane >= currentLane - 0.01) continue;
      if (!isLaneOpenForShift(horse, targetLane, horses, phase, { minXGap, minYGap })) {
        const halfLane = Math.max(laneFloor, currentLane - (currentLane - targetLane) * 0.5);
        if (!isLaneOpenForShift(horse, halfLane, horses, phase, { minXGap, minYGap })) continue;
        targetLane = halfLane;
      }
      horse.y = clampHorseLaneByPhase(horse, targetLane, phase, horses, INNER_HALF_LANE_MAX);
      moved = true;
    }
    enforceInnerHalfTrack(horses, phase);
    resolveHorseOverlaps(horses, {
      minXGap,
      minYGap,
      iterations: 1,
      keepOrder: true,
      freezeY: false,
      phase,
    });
    if (!moved) break;
  }
}

function rerouteRearContactsToOuterLane(horses, collisionMetrics) {
  const minXGap = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
  const minYGap = collisionMetrics?.minYGap ?? COLLISION_MIN_Y_GAP;
  const laneMax = Math.min(INNER_HALF_LANE_MAX, LANE_WIDTH);
  const byRearFirst = [...horses].sort((a, b) => a.x - b.x);
  for (const horse of byRearFirst) {
    const blocker = horses.find(h => {
      if (h.id === horse.id) return false;
      if (h.x < horse.x) return false;
      const requiredGap = getRequiredXGap(h, horse, minXGap, null, { isInnerCutIn: true });
      return (
        (h.x - horse.x) < requiredGap &&
        Math.abs(h.y - horse.y) < minYGap * 0.98
      );
    });
    if (!blocker) continue;
    for (let step = 1; step <= HOME_OUTER_REROUTE_STEPS; step++) {
      const candidateLane = clampLane(horse.y + step);
      if (candidateLane > laneMax + 0.01) break;
      const occupied = horses.some(h =>
        h.id !== horse.id &&
        Math.abs(h.x - horse.x) < minXGap &&
        Math.abs(h.y - candidateLane) < minYGap
      );
      if (occupied) continue;
      horse.y = candidateLane;
      break;
    }
  }
}

export {
  isInnerShiftDiagonalRearThreat,
  isOuterShiftDiagonalRearThreat,
  findDiagonalRearHorse,
  resolveLaneMovement,
  getHorseBufferX,
  getRequiredXGap,
  resolveHorseOverlaps,
  enforceForwardOrder,
  resolveForwardMovement,
  getFrontGap,
  horseFootprintsOverlapAt,
  isLaneOpenForShift,
  isInnerLaneOpenAhead,
  findInnermostOpenSlotLane,
  canInsertIntoInnerPocket,
  shouldAllowRiskyInnerDive,
  getInnerRailLaneFloor,
  clampHorseLaneByPhase,
  enforceInnerHalfTrack,
  compressPreCornerToInnerLanes,
  rerouteRearContactsToOuterLane,
};
