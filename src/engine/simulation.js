import { buildBattleLogLine } from './battle-log.js';
import { createRng } from './rng.js';
import { calcHorsesWithRatingAdjustments } from './rating-adjustments.js';
import {
  buildPhases,
  calcStaminaCons,
  applyCornerLoss,
  laneIndex,
} from './phase.js';
import {
  initFormationTarget,
  getFormationStylePaceMult,
  getFormationOrderBias,
  calcFormationAdvanceMult,
  getStyleMovementPriority,
  getFormationTargetRank,
  isFrontRunnerStyle,
  enforceFrontRunnerAheadOfClosers,
} from './formation.js';
import { getFormationBattleRateMult } from './battle-formation.js';
import {
  createPhaseContext,
  getLaunchBlend,
  getSettleBlend,
  getStyleBlend,
  getKickBlend,
  shouldPreserveForwardX,
  isFormationPhase,
} from './phase-context.js';
import { resolvePhaseSpeed } from './phase-speed.js';
import {
  buildBattleProximityLimits,
  detectContacts,
  shouldBattle,
  resolveBattle,
} from './battle.js';
import { CONFIG } from '../config.js';
import {
  MIN_FORWARD_GAP,
  LATERAL_BLOCK_X_GAP,
  LATERAL_BLOCK_LANE_GAP,
  DIAGONAL_REAR_BLOCK_X_GAP,
  DIAGONAL_REAR_BLOCK_LANE_GAP,
  DIAGONAL_REAR_INNER_BAND_OUTER_EPS,
  DIAGONAL_REAR_INNER_BAND_INNER_MARGIN,
  LANE_WIDTH,
  INNER_HALF_LANE_MAX,
  LEAD_BATTLE_PHASE_MAX,
  EARLY_LEAD_RATIO_MAX,
  FINAL_DUEL_PHASE_MIN,
  COLLISION_MIN_Y_GAP,
  COLLISION_ITERATIONS,
  COLLISION_ITERATIONS_EARLY,
  COLLISION_EPS,
  START_DELAY_BASE_RATE,
  STUMBLE_BASE_RATE,
  STUMBLE_PHASE_MAX,
  EARLY_TROUBLE_DECAY_PER_100M,
  EARLY_ORDER_TIE_NOISE,
  USE_SAFE_STAMINA_MODEL,
  USE_PATH_BASED_STAMINA,
  SAFE_BASE_STAMINA_PER_M,
  SAFE_LANE_EVENT_DRAIN_MULT,
  SAFE_CORNER_EVENT_DRAIN_MULT,
  SAFE_ACCEL_EVENT_DRAIN_MULT,
  SAFE_GOAL_EVENT_FATIGUE_WEIGHT,
  SAFE_GOAL_STAMINA_PER_M_REF,
  SAFE_GOAL_STAMINA_PER_M_RANGE,
  START_BURST_STAMINA_FREE_CAP,
  GOAL_FURLONG_METERS,
  GOAL_TIME_SCALE,
  GOAL_DISTANCE_METERS,
  GOAL_LAST3F_DISTANCE_M,
  GOAL_LAST3F_SEC_CLAMP_MIN,
  GOAL_LAST3F_SEC_CLAMP_MAX,
  GOAL_LAST3F_FALLBACK_SEC,
  GOAL_X_PER_METER,
  GOAL_LANE_CHANGE_PER_SEC,
  GOAL_BLOCK_X_GAP,
  GOAL_MIN_PACK_GAP_X,
  GOAL_NEAR_LANE_GAP_BASE,
  GOAL_NEAR_LANE_GAP_MAX,
  GOAL_LANE_CHANGE_COOLDOWN_MS,
  FINAL_LANE_CHANGE_COOLDOWN_PHASES,
  FINAL_FRONT_BLOCK_EXTRA_GAP,
  FINAL_STRAIGHT_RATIO,
  POST_C3_STAMINA_SPREAD_FLOOR,
  LATERAL_SHIFT_SOFT_CAP,
  LATERAL_SHIFT_HARD_CAP,
  LATERAL_SHIFT_THROUGH_C3_CAP,
  START_LATERAL_SHIFT_CAP,
  GOAL_MIN_SPEED_RATIO,
  GOAL_MAX_SPEED_RATIO,
  GOAL_POST_SCROLL_MS,
  GOAL_POST_CLEAR_METERS,
  GOAL_PROGRESS_MAX_POST_LINE,
  SPUR_ENTRY_STRETCH_KICK_MULT,
  GOAL_ENTRY_LEADER_START_PROGRESS,
  GOAL_PROGRESS_MIN,
  GOAL_SCENE_TRANSITION_MS,
  GOAL_SCENE_TRANSITION_MAX_ALPHA,
  GOAL_PROGRESS_TARGET_AT_FINISH,
  GOAL_LEADER_ANCHOR_PROGRESS,
  GOAL_ANCHOR_MAX_PROGRESS,
  GOAL_PROGRESS_SPAN,
  GOAL_EARLY_PHASE_T,
  GOAL_SPREAD_EARLY_MULT,
  GOAL_ANCHOR_FOLLOW_SCALE,
  GOAL_CAMERA_LERP,
  GOAL_CAMERA_LERP_MAX,
  GOAL_ANCHOR_DYNAMIC_BOOST,
  STAMINA_LANE_CHANGE_COST,
  STAMINA_ACCEL_COST,
  STAMINA_BATTLE_BASE_COST,
  STAMINA_BATTLE_LOSER_EXTRA,
  STAMINA_BATTLE_TRACKER_GAIN,
  INNER_CUTIN_BATTLE_COOLDOWN_PHASES,
  INNER_CUTIN_REMATCH_COOLDOWN_PHASES,
  INNER_CUTIN_MIN_INWARD_DELTA,
  INNER_CUTIN_WINNER_STAMINA_MULT,
  INNER_CUTIN_LOSER_STAMINA_MULT,
  THROUGH_C3_LANE_CHANGE_TRIGGER_DELTA,
  INNER_RAIL_GAP_OPTIONS,
  INNER_RAIL_GAP_WEIGHTS,
  INNER_POCKET_FRONT_GAP_RATIO,
  INNER_POCKET_REAR_GAP_RATIO,
  PRE_CORNER_INNER_COMPRESS_ITERS,
  PRE_CORNER_FORCE_INNER_STEP,
  PRE_CORNER_MIN_Y_GAP_MULT,
  HOME_OUTER_REROUTE_STEPS,
  COLLISION_FRONT_BUFFER_X,
  COLLISION_REAR_BUFFER_X,
  INNER_CUTIN_BUFFER_MULT,
  PACK_DENSITY_PENALTY_QUAD,
  STAMINA_CORNER_OUTER_PER_LANE,
  GOAL_STAMINA_DRAIN_MULT,
  GOAL_AI,
  CENTRIFUGAL_DRIFT_STAMINA_MULT,
  STRETCH_LANE_SUBSTEPS,
  CORNER4_STRETCH_KICK_SCALE,
} from './constants.js';
import {
  applyPathBudget,
  calcPathSegmentMeters,
  calcPathStaminaDrain,
} from './path-stamina.js';
import {
  clampLane,
  isNigeStyle,
  isOonigeStyle,
  getJockeyReliabilityNorm,
  applyBattleStaminaImpact,
  getWeightStaminaMult,
} from './horse-utils.js';
import {
  isKickReserveReleased,
  isBeforeFirstCornerPhase,
  isStartToHomePhase,
  isThroughThirdCornerPhase,
  isAfterFourthCornerPhase,
  isFourthCornerPhase,
  isFinalStraightPhase,
} from './phase-helpers.js';
import {
  resolveLeadBattle,
  resolveCornerPositionBattle,
  resolveFinalStraightDuel,
} from './battle-phase.js';
import {
  resolveLaneMovement,
  resolveForwardMovement,
  resolveHorseOverlaps,
  compressPreCornerToInnerLanes,
  rerouteRearContactsToOuterLane,
  enforceInnerHalfTrack,
  getFrontGap,
} from './collision.js';
import {
  calcTargetLane,
  calcStartPhaseTargetLane,
  calcPreCornerPackTargetLane,
  calcEarlyInnerPriorityLane,
  getLaneChangeRate,
} from './lane-ai.js';
import {
  getLaneDecisionMeta,
  calcCentrifugalDrift,
  getLocalPackFrontGap,
  calcLast3fWeight,
  recordLaneCommit,
  calcLocalPassTargetLane,
  calcSpurEntryTargetLane,
  calcSpurEntryAdvanceMult,
  snapshotCorner4ExitState,
  shouldFreezeStretchLane,
  isStretchSpreadCandidate,
  buildLaneDecisionContext,
  calcPackRankNorm,
} from './lane-decision.js';
function staminaAccelAbilityMult(staminaRatio) {
  const r = Math.max(0, Math.min(1, staminaRatio));
  if (r >= 0.35) return 1.0;
  // 0.35 -> 1.0, 0.00 -> 0.62
  return 0.62 + (r / 0.35) * 0.38;
}

function initUniversalKickProfile(horse, rng, last3fMin, last3fMax, last3fSpan) {
  const span = Math.max(0.001, last3fSpan);
  const last3fW = Number.isFinite(horse.last3f)
    ? (last3fMax - horse.last3f) / span
    : 0.5;
  const sustainN = Math.max(0, Math.min(1, horse.S_sustain / 100));
  let mult = 0.855 + sustainN * 0.095 + last3fW * 0.075 + (rng() - 0.5) * 0.055;
  mult = Math.max(0.795, Math.min(0.99, mult));
  let floorR = 0.05 + sustainN * 0.135 + last3fW * 0.09 + (rng() - 0.5) * 0.045;
  floorR = Math.max(0.042, Math.min(0.27, floorR));
  horse.kickEarlyDrainMult = mult;
  horse.kickReserveFloorRatio = floorR;
  horse.kickDayRoll = 0.962 + rng() * 0.076;
}

function applyUniversalReserveDrain(horse, rawDrain, phase) {
  if (!Number.isFinite(rawDrain) || rawDrain <= 0) return 0;
  if (!horse || horse.initialStamina <= 0) return rawDrain;
  let d = rawDrain;
  if (!isKickReserveReleased(phase)) {
    d *= (horse.kickEarlyDrainMult ?? 1) * (horse.kickDayRoll ?? 1);
    const floor = horse.initialStamina * (horse.kickReserveFloorRatio ?? 0);
    const maxDrain = Math.max(0, horse.stamina - floor);
    d = Math.min(d, maxDrain);
  }
  return d;
}

function recordHorsePathSegment(horse, prevX, prevY, phase, trackMod) {
  const segM = calcPathSegmentMeters(prevX, prevY, horse.x, horse.y, phase.distance);
  if (segM <= 0) return;
  horse.pathMeters = (horse.pathMeters ?? 0) + segM;
  if (!USE_PATH_BASED_STAMINA) return;
  const drain = calcPathStaminaDrain(segM, trackMod, horse.y, phase);
  subtractStaminaWithReserve(horse, drain, phase, {
    trackField: 'staminaPathCost',
    category: 'base',
  });
}

function subtractStaminaWithReserve(horse, rawDrain, phase, trackFieldOrOptions = null) {
  let trackField = null;
  let fatigueGain = 0;
  let category = 'event';
  if (typeof trackFieldOrOptions === 'string' || trackFieldOrOptions == null) {
    trackField = trackFieldOrOptions;
  } else if (typeof trackFieldOrOptions === 'object') {
    trackField = trackFieldOrOptions.trackField ?? null;
    fatigueGain = Number.isFinite(trackFieldOrOptions.fatigueGain)
      ? trackFieldOrOptions.fatigueGain
      : 0;
    category = trackFieldOrOptions.category ?? category;
  }
  const d = applyUniversalReserveDrain(horse, rawDrain, phase);
  if (d <= 0) return;
  horse.stamina = Math.max(0, horse.stamina - d);
  if (trackField && horse[trackField] !== undefined) horse[trackField] += d;
  if (category === 'base') {
    horse.staminaBaseCost = (horse.staminaBaseCost ?? 0) + d;
  } else {
    horse.staminaEventCost = (horse.staminaEventCost ?? 0) + d;
  }
  if (fatigueGain > 0) {
    horse.eventFatigueScore = (horse.eventFatigueScore ?? 0) + d * fatigueGain;
    horse.recentEventLoad = (horse.recentEventLoad ?? 0) + d * fatigueGain;
  }
}

function sampleInnerRailGap(rng) {
  const totalWeight = INNER_RAIL_GAP_WEIGHTS.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (totalWeight <= 0) return 0;
  let threshold = rng() * totalWeight;
  for (let i = 0; i < INNER_RAIL_GAP_OPTIONS.length; i++) {
    const weight = Math.max(0, INNER_RAIL_GAP_WEIGHTS[i] ?? 0);
    threshold -= weight;
    if (threshold <= 0) return INNER_RAIL_GAP_OPTIONS[i];
  }
  return INNER_RAIL_GAP_OPTIONS[INNER_RAIL_GAP_OPTIONS.length - 1] ?? 0;
}

function applyIrregularEvents(rng, horse, phase, phaseEventLogs, globalLogs) {
  if (horse.startIrregularChecked === undefined) horse.startIrregularChecked = false;
  if (horse.startEventType === undefined) horse.startEventType = null;
  if (horse.stumbleCooldown === undefined) horse.stumbleCooldown = 0;

  let mult = 1.0;

  if (phase.index === 0 && !horse.startIrregularChecked) {
    horse.startIrregularChecked = true;
    const startDelayRate = calcStartDelayRate(horse);
    if (rng() < startDelayRate) {
      const lossRatio = 0.22 + rng() * 0.16;
      mult *= (1 - lossRatio);
      horse.startEventType = 'slow';
      horse.startTroubleScore = (horse.startTroubleScore ?? 0) + 1.0;
      const log = `[出遅れ] ${horse.name}`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
    }
  }

  if (horse.stumbleCooldown > 0) {
    horse.stumbleCooldown -= 1;
    return mult;
  }

  if (phase.ratio <= STUMBLE_PHASE_MAX) {
    const stumbleRate = calcStumbleRate(horse);
    if (rng() < stumbleRate) {
      const lossRatio = 0.12 + rng() * 0.14;
      mult *= (1 - lossRatio);
      horse.stumbleCooldown = 2;
      subtractStaminaWithReserve(horse, 1.0 + rng() * 2.0, phase, null);
      horse.startTroubleScore = (horse.startTroubleScore ?? 0) + 0.65;
      const log = `[つまずき] ${horse.name}`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
    }
  }

  return mult;
}

function calcStartDelayRate(horse) {
  const maneuvWeakness = Math.max(0, (100 - horse.M_maneuv) / 100);
  const reliability = getJockeyReliabilityNorm(horse);
  const styleAdj = isOonigeStyle(horse.style) ? 0.82
    : isNigeStyle(horse.style) ? 0.86
    : horse.style === '先行' ? 0.92
      : horse.style === '差し' ? 1.05
        : 1.12;
  const reliabilityGuard = 1.08 - reliability * 0.28;
  const rate = START_DELAY_BASE_RATE * (0.65 + maneuvWeakness * 0.9) * styleAdj * reliabilityGuard;
  return Math.max(0.004, Math.min(0.055, rate));
}

function calcEarlyPhaseOrderScore(horse, rng, allHorses, phase, phaseCtx) {
  const launchBlend = getLaunchBlend(phase, phaseCtx);
  const settleBlend = getSettleBlend(phase, phaseCtx);
  const styleBlend = Math.min(1, launchBlend + settleBlend);
  const launchSkill = (horse.S_formation * 0.30 + horse.M_maneuv * 0.20) / 100;
  const styleBurst = isOonigeStyle(horse.style) ? 0.28
    : isNigeStyle(horse.style) ? 0.20
      : 0;
  const projectedBurst = horse.startBurstFactor ?? (
    0.78 + launchSkill * 0.28 + styleBurst
  );
  const burstBonus = (projectedBurst - 1.0) * 22;
  const troublePenalty = (horse.startTroubleScore ?? 0) * 17;
  const tieNoise = (rng() - 0.5) * EARLY_ORDER_TIE_NOISE;
  const packRank = allHorses?.length ? calcPackRankNorm(horse, allHorses) : 0.5;

  if (launchBlend > settleBlend) {
    const styleLead = getStyleMovementPriority(horse.style) * 9;
    const frontRunnerBoost = isFrontRunnerStyle(horse.style) ? 14 : 0;
    const target = Number.isFinite(horse.formationTargetRank)
      ? horse.formationTargetRank
      : 0.5;
    const prior = (1 - target) * 24 * launchBlend;
    return 34 + burstBonus + styleLead + frontRunnerBoost + prior - troublePenalty + tieNoise;
  }

  const lane = clampLane(horse.y);
  const innerLaneBonus = (LANE_WIDTH - lane) * 0.35;
  const formationBias = getFormationOrderBias(horse, packRank, styleBlend, allHorses);
  return 34 + burstBonus + innerLaneBonus - troublePenalty + tieNoise + formationBias;
}

function sortEarlyPhaseMovementOrder(horses, rng, phase, phaseCtx) {
  const launchBlend = getLaunchBlend(phase, phaseCtx);
  const settleBlend = getSettleBlend(phase, phaseCtx);
  const styleBlend = Math.min(1, launchBlend + settleBlend);
  if (styleBlend > 0.01) {
    if (launchBlend >= settleBlend) {
      // launch: 目標順位が前の馬から（逃げ→先行→…）
      return [...horses].sort((a, b) => {
        const ta = getFormationTargetRank(a);
        const tb = getFormationTargetRank(b);
        if (Math.abs(ta - tb) > 0.001) return ta - tb;
        const pri = getStyleMovementPriority(b.style) - getStyleMovementPriority(a.style);
        if (pri !== 0) return pri;
        return b.x - a.x;
      });
    }
    // settle: 前から（リード維持・後方の minXGap ブロック回避）
    return [...horses].sort((a, b) => {
      if (Math.abs(a.x - b.x) > 1e-6) return b.x - a.x;
      const pri = getStyleMovementPriority(b.style) - getStyleMovementPriority(a.style);
      if (pri !== 0) return pri;
      return a.y - b.y;
    });
  }
  return [...horses].sort((a, b) => {
    const scoreA = calcEarlyPhaseOrderScore(a, rng, horses, phase, phaseCtx);
    const scoreB = calcEarlyPhaseOrderScore(b, rng, horses, phase, phaseCtx);
    if (Math.abs(scoreA - scoreB) > 1e-6) return scoreB - scoreA;
    if (Math.abs(a.x - b.x) > 1e-6) return b.x - a.x;
    return a.y - b.y;
  });
}

function calcStumbleRate(horse) {
  const maneuvWeakness = Math.max(0, (100 - horse.M_maneuv) / 100);
  const reliability = getJockeyReliabilityNorm(horse);
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  const fatigue = Math.max(0, 1 - staminaRatio);
  const reliabilityGuard = 1.06 - reliability * 0.22;
  const rate = STUMBLE_BASE_RATE * (0.7 + maneuvWeakness * 0.8 + fatigue * 0.45) * reliabilityGuard;
  return Math.max(0.002, Math.min(0.03, rate));
}

export function runSimulation(raceData, options = {}, ratingAdjustments = {}, renderer = null) {
  const seedBase = options.seed ?? raceData.race_id;
  const rng      = createRng(seedBase);
  const horses    = calcHorsesWithRatingAdjustments(raceData, ratingAdjustments);
  const courseDef = raceData.courseDef ?? null;
  const phases    = buildPhases(raceData.race_info.distance, courseDef);
  const phaseCtx  = createPhaseContext(raceData.race_info.distance, courseDef, phases);
  const track     = raceData.race_info.track;
  const condition = raceData.race_info.condition;
  const trackMod  = CONFIG.TRACK_MODIFIER[track]?.[condition] ?? 1.0;
  const ave3fValues = horses.map(h => h.ave3f).filter(v => Number.isFinite(v));
  const ave3fMin = ave3fValues.length ? Math.min(...ave3fValues) : 0;
  const ave3fMax = ave3fValues.length ? Math.max(...ave3fValues) : 1;
  const ave3fSpan = Math.max(0.001, ave3fMax - ave3fMin);
  const last3fValues = horses.map(h => h.last3f).filter(Number.isFinite);
  const last3fMin = last3fValues.length ? Math.min(...last3fValues) : 33;
  const last3fMax = last3fValues.length ? Math.max(...last3fValues) : last3fMin + 1;
  const last3fSpan = Math.max(0.001, last3fMax - last3fMin);
  const last3fNorm = { min: last3fMin, max: last3fMax, span: last3fSpan };

  const globalLogs = [];
  const snapshots  = [];
  const earlyLeadCounts = new Map();
  const earlyLeaderTimeline = [];
  let earlyLeaderSwitches = 0;
  let totalEarlyPhases = 0;
  let prevEarlyLeaderId = null;
  horses.forEach(horse => {
    horse.lastAdvance = 0;
    horse.innerRailGap = sampleInnerRailGap(rng);
    horse.laneChangeCooldownPhases = 0;
    horse.innerCutInCooldownPhases = 0;
    horse.lastInnerCutInPhase = -999;
    horse.lastInnerCutInOpponentId = null;
    horse.staminaLaneCost = 0;
    horse.staminaAccelCost = 0;
    horse.staminaBattleCost = 0;
    horse.staminaCornerCost = 0;
    horse.staminaPathCost = 0;
    horse.staminaBaseCost = 0;
    horse.staminaEventCost = 0;
    horse.eventFatigueScore = 0;
    horse.recentEventLoad = 0;
    horse.battleFatigue = 0;
    horse.startEventType = null;
    horse.startTroubleScore = 0;
    horse.staminaRatioAfterC3 = null;
    horse.stretchFanLane = null;
    horse.laneCommitDir = 0;
    horse.laneCommitPhases = 0;
    initUniversalKickProfile(horse, rng, last3fMin, last3fMax, last3fSpan);
    initFormationTarget(horse, rng);
  });

  for (const phase of phases) {
    phase._phaseCtx = phaseCtx;
    horses.forEach(horse => {
      horse.pathAtPhaseStart = horse.pathMeters ?? 0;
    });
    const segmentIdLower = String(phase.segmentId ?? '').toLowerCase();
    const isCorner4Entry =
      segmentIdLower === 'corner4' ||
      (Number.isFinite(phase.cornerNo) && phase.cornerNo === 4);
    if (isCorner4Entry) {
      for (const h of horses) {
        if (h.staminaRatioAfterC3 == null && h.initialStamina > 0) {
          h.staminaRatioAfterC3 = h.stamina / h.initialStamina;
        }
      }
    }
    const xValues = horses.map(h => h.x);
    const maxX = Math.max(...xValues, 1);
    const xSpan = Math.max(140, maxX);
    const collisionMetrics = renderer
      ? renderer.getCollisionMetrics(xSpan, phase)
      : { minXGap: MIN_FORWARD_GAP, minYGap: COLLISION_MIN_Y_GAP };
    // ① フェーズ特化バトル判定（描画の隣接距離に合わせた物理近接のみ）
    const battleProximityLimits = buildBattleProximityLimits(collisionMetrics);
    const contacts = detectContacts(horses, battleProximityLimits);
    const phaseEventLogs = [];
    const engagedHorseIds = new Set();
    const isEarlyOrderingPhase = getStyleBlend(phase, phaseCtx) > 0.01;
    if (isEarlyOrderingPhase) {
      horses.forEach(horse => {
        const decay = Math.pow(
          EARLY_TROUBLE_DECAY_PER_100M,
          Math.max(0, phase.distance) / 100,
        );
        horse.startTroubleScore = Math.max(0, (horse.startTroubleScore ?? 0) * decay);
      });
    }
    horses.forEach(horse => {
      horse.recentEventLoad = (horse.recentEventLoad ?? 0) * 0.72;
      horse.eventFatigueScore = (horse.eventFatigueScore ?? 0) * 0.94;
    });

    resolveLeadBattle(
      rng,
      horses,
      phase,
      phaseEventLogs,
      globalLogs,
      engagedHorseIds,
      battleProximityLimits,
    );
    resolveCornerPositionBattle(
      rng,
      horses,
      phase,
      phaseEventLogs,
      globalLogs,
      engagedHorseIds,
      battleProximityLimits,
    );
    resolveFinalStraightDuel(
      rng,
      horses,
      phase,
      phaseEventLogs,
      globalLogs,
      engagedHorseIds,
      battleProximityLimits,
    );

    for (const { a, b } of contacts) {
      if (engagedHorseIds.has(a.id) || engagedHorseIds.has(b.id)) continue;
      const front = a.x >= b.x ? a : b;
      const rear = a.x >= b.x ? b : a;
      const formationRateMult = getFormationBattleRateMult(rear, front, phase, phaseCtx);
      if (!shouldBattle(rng, horses, a, b, battleProximityLimits, { formationRateMult })) continue;
      const result = resolveBattle(rng, a, b, phase, { phaseCtx });
      applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
      const log = buildBattleLogLine('進路争い', result.winner, result.loser);
      globalLogs.push(log);
      phaseEventLogs.push(log);
      engagedHorseIds.add(a.id);
      engagedHorseIds.add(b.id);
      break;
    }

    // ② 各馬の移動（衝突回避 + ブロック時バトル）
    const order = isEarlyOrderingPhase
      ? sortEarlyPhaseMovementOrder(horses, rng, phase, phaseCtx)
      : [...horses].sort((a, b) => b.x - a.x);
    for (const horse of order) {
      const staminaMod = horse.stamina > 0
        ? CONFIG.STAMINA_MODIFIER_FULL
        : CONFIG.STAMINA_MODIFIER_EMPTY;

      const horseLanePre = clampLane(horse.y);
      const packRankNow = calcPackRankNorm(horse, horses);

      const launchBlend = getLaunchBlend(phase, phaseCtx);
      const settleBlend = getSettleBlend(phase, phaseCtx);
      const styleBlend = getStyleBlend(phase, phaseCtx);
      const kickBlend = getKickBlend(phase, phaseCtx);
      let paceMult = getFormationStylePaceMult(horse, styleBlend, horse.startBurstFactor);
      const baseSpeed = resolvePhaseSpeed(horse, phase, phaseCtx);
      const V_eff    = baseSpeed * staminaMod * horse.battlePenalty * paceMult;
      const desiredAdvance = V_eff * (phase.distance / 80);
      const irregularMult = applyIrregularEvents(
        rng,
        horse,
        phase,
        phaseEventLogs,
        globalLogs,
      );
      let adjustedAdvance = desiredAdvance * irregularMult;

      if (kickBlend > 0.01) {
        const last3fW = calcLast3fWeight(horse, last3fNorm);
        const staminaR = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
        const localGap = getLocalPackFrontGap(horse, horseLanePre, horses);
        const blockedLocal = localGap < (collisionMetrics.minXGap + FINAL_FRONT_BLOCK_EXTRA_GAP);
        let stretchKick = last3fW * (0.06 + staminaR * 0.11) * (blockedLocal ? 1.2 : 0.55);
        if (isFourthCornerPhase(phase) && !isFinalStraightPhase(phase)) {
          stretchKick *= CORNER4_STRETCH_KICK_SCALE;
        } else if (isFinalStraightPhase(phase)) {
          stretchKick *= SPUR_ENTRY_STRETCH_KICK_MULT;
          if (blockedLocal) {
            stretchKick *= 1.08 + last3fW * 0.12;
          }
        }
        adjustedAdvance *= (1 + stretchKick * kickBlend);
        if (stretchKick > 0.02) {
          const kickDrain = (Math.max(0, phase.distance) / 100) * stretchKick * kickBlend * 0.85;
          subtractStaminaWithReserve(horse, kickDrain, phase, {
            trackField: 'staminaAccelCost',
            fatigueGain: 0.24,
          });
        }
      }

      if (phase.index === 0) {
        if (horse.startBurstFactor === undefined) {
          const launchManeuv = isNigeStyle(horse.style)
            ? Math.max(horse.M_maneuv, (horse.J_reliability ?? 50) * 0.50, 26)
            : horse.style === '先行'
              ? Math.max(horse.M_maneuv, (horse.J_reliability ?? 50) * 0.45, 22)
              : Math.max(horse.M_maneuv, (horse.J_reliability ?? 50) * 0.4);
          const launchSkill = (horse.S_formation * 0.30 + launchManeuv * 0.20) / 100;
          const reliability = getJockeyReliabilityNorm(horse);
          const baseMult = 0.76
            + launchSkill * 0.32
            + (reliability - 0.5) * 0.12;
          const randomMult = 0.88 + rng() * 0.28;
          horse.startBurstFactor = baseMult * randomMult;
          // スタートイベントは「出遅れ/好スタート」のどちらか1回のみ。
          if (horse.startEventType === 'slow') {
            horse.startBurstFactor = Math.min(horse.startBurstFactor, 1.0);
          } else if (horse.startBurstFactor >= 1.22 && horse.startEventType == null) {
            const log = `[好スタート] ${horse.name}`;
            globalLogs.push(log);
            phaseEventLogs.push(log);
            horse.startEventType = 'good';
          }
        }
        adjustedAdvance *= horse.startBurstFactor;
      }

      if (styleBlend > 0) {
        adjustedAdvance *= calcFormationAdvanceMult(
          packRankNow,
          horse,
          launchBlend,
          settleBlend,
          horses,
        );
      }

      if (horse.settledLane === undefined && styleBlend <= 0.01) {
        horse.settledLane = clampLane(horse.y);
      }

      // スタートフェーズでは「空いていれば内へ詰める」挙動を優先する
      const isStartPhase = phase.index === 0;
      const isEarlyInnerBurst = isStartToHomePhase(phase);
      const isThroughThirdCorner = isThroughThirdCornerPhase(phase);
      const isAfterFourthCorner = isAfterFourthCornerPhase(phase);
      const isFinalStraight = isFinalStraightPhase(phase);
      const isCorner4Only = isFourthCornerPhase(phase) && !isFinalStraight;
      const isLateStraight = isFinalStraight;
      if (isLateStraight && horse.style === '先行') {
        const sortedByFrontPre = [...horses].sort((a, b) => b.x - a.x);
        const leaderPre = sortedByFrontPre[0] ?? null;
        const leadGapPre = Math.max(0, (leaderPre?.x ?? horse.x) - horse.x);
        const isLeadingPre = Boolean(leaderPre && leaderPre.id === horse.id && leadGapPre <= 8);
        if (isLeadingPre) {
          const chaserNear = horses.some(h =>
            h.id !== horse.id
            && h.x < horse.x + 2
            && h.x > horse.x - 42,
          );
          if (chaserNear) {
            const holdDrain = (Math.max(0, phase.distance) / 100) * 0.55;
            subtractStaminaWithReserve(horse, holdDrain, phase, {
              trackField: 'staminaAccelCost',
              fatigueGain: 0.32,
            });
          }
        }
      }
      const currentFrontGap = isAfterFourthCornerPhase(phase)
        ? getLocalPackFrontGap(horse, clampLane(horse.y), horses)
        : getFrontGap(horse, clampLane(horse.y), horses);
      const frontBlocked = currentFrontGap < (collisionMetrics.minXGap + FINAL_FRONT_BLOCK_EXTRA_GAP);
      if ((horse.laneChangeCooldownPhases ?? 0) > 0) {
        horse.laneChangeCooldownPhases -= 1;
      }
      if ((horse.laneCommitPhases ?? 0) > 0) {
        horse.laneCommitPhases -= 1;
        if (horse.laneCommitPhases <= 0) {
          horse.laneCommitDir = 0;
        }
      }
      if ((horse.innerCutInCooldownPhases ?? 0) > 0) {
        horse.innerCutInCooldownPhases -= 1;
      }
      const isPreCornerPack = isBeforeFirstCornerPhase(phase);
      const useLaunchLanePlan = launchBlend > 0.01 && (isStartPhase || isStartToHomePhase(phase));
      horse.targetLane = useLaunchLanePlan
        ? calcStartPhaseTargetLane(horse, horses, collisionMetrics, phase)
        : isPreCornerPack || settleBlend > 0.01
          ? calcPreCornerPackTargetLane(horse, phase, horses, collisionMetrics)
          : calcTargetLane(horse, phase, horses, collisionMetrics, last3fNorm);
      if (isThroughThirdCorner) {
        horse.targetLane = calcEarlyInnerPriorityLane(horse, horse.targetLane, phase, horses, collisionMetrics);
      }
      if (isThroughThirdCorner) {
        horse.targetLane = Math.min(horse.targetLane, INNER_HALF_LANE_MAX);
      }
      if (isFinalStraight) {
        horse.spurEntryTargetLane = calcSpurEntryTargetLane(
          horse,
          phase,
          horses,
          last3fNorm,
          { minXGap: collisionMetrics.minXGap, speedAdvance: adjustedAdvance },
        );
      }

      const stretchLaneSteps = isFinalStraight
        ? STRETCH_LANE_SUBSTEPS
        : (isCorner4Only ? 1 : 1);
      const prevLaneYBeforeStretch = horse.y;
      let driftShift = 0;
      let pathPrevX = horse.x;
      let pathPrevY = horse.y;
      for (let stretchStep = 0; stretchStep < stretchLaneSteps; stretchStep += 1) {
        const probeLane = isFinalStraight
          ? clampLane(horse.spurEntryTargetLane ?? horse.y)
          : clampLane(horse.y);
        const frontGapStep = getLocalPackFrontGap(horse, probeLane, horses);
        const frontBlockedStep = frontGapStep < (collisionMetrics.minXGap + FINAL_FRONT_BLOCK_EXTRA_GAP);
        if (isCorner4Only) {
          horse.targetLane = horse.y;
        } else if (isFinalStraight) {
          horse.targetLane = horse.spurEntryTargetLane ?? calcSpurEntryTargetLane(
            horse,
            phase,
            horses,
            last3fNorm,
            { minXGap: collisionMetrics.minXGap, speedAdvance: adjustedAdvance },
          );
        }
        if (isEarlyInnerBurst && horse.targetLane > horse.y) {
          horse.targetLane = horse.y;
        }
        const laneDecisionMeta = (isFinalStraight || isCorner4Only)
          ? getLaneDecisionMeta(
            horse,
            phase,
            horses,
            last3fNorm,
            collisionMetrics.minXGap,
            adjustedAdvance,
          )
          : null;
        const seekOutsideLane = Boolean(laneDecisionMeta?.seekOutsideLane);
        if (isFinalStraight && seekOutsideLane) {
          const passPull = calcLocalPassTargetLane(
            horse,
            phase,
            horses,
            horse.targetLane,
            last3fNorm,
            { minXGap: collisionMetrics.minXGap, speedAdvance: adjustedAdvance },
          );
          if (passPull > horse.targetLane) {
            horse.targetLane = clampLane(horse.targetLane * 0.35 + passPull * 0.65);
          }
        } else if ((horse.laneChangeCooldownPhases ?? 0) > 0 && stretchStep === 0) {
          horse.targetLane = horse.y;
        }
        const laneChangeRate = getLaneChangeRate(phase, horse, last3fNorm, horses);
        const desiredY = horse.y + (horse.targetLane - horse.y) * laneChangeRate;
        const yBeforeLane = horse.y;
        const laneCheck = resolveLaneMovement(
          rng,
          horse,
          desiredY,
          adjustedAdvance,
          horses,
          phase,
          {
            frontBlocked: frontBlockedStep,
            isLateStraight,
            isStartPhase,
            isEarlyInnerBurst,
            allowBurstShortCircuit: launchBlend > 0.01,
            collisionMetrics,
            battleProximityLimits,
            seekOutsideLane,
            lateralCap: laneDecisionMeta?.lateralCap,
          },
          phaseEventLogs,
          globalLogs,
          engagedHorseIds,
        );
        let nextY = laneCheck.nextY;
        let laneDelta = nextY - yBeforeLane;
        if (styleBlend > 0.01 && Math.abs(laneDelta) > 1e-6) {
          const pathBudget = applyPathBudget(adjustedAdvance, laneDelta, phase.distance);
          laneDelta *= pathBudget.lateralScale;
          nextY = clampLane(yBeforeLane + laneDelta);
          adjustedAdvance = pathBudget.advance;
        } else if (laneCheck.advanceMult != null && stretchStep === 0) {
          adjustedAdvance *= laneCheck.advanceMult;
        }
        horse.y = nextY;
        if (isThroughThirdCorner) {
          horse.y = Math.min(horse.y, INNER_HALF_LANE_MAX);
        }
        if (stretchStep === stretchLaneSteps - 1 && (isCorner4Only || isFinalStraight)) {
          const yBeforeDrift = horse.y;
          const drift = calcCentrifugalDrift(horse, phase, adjustedAdvance);
          if (drift > 0.001) {
            horse.y = clampLane(horse.y + drift);
            driftShift += Math.abs(horse.y - yBeforeDrift);
          }
        }
        if (Number.isFinite(laneCheck.xNudge) && laneCheck.xNudge > 0 && stretchStep === 0) {
          horse.x += laneCheck.xNudge;
        }
        recordHorsePathSegment(horse, pathPrevX, pathPrevY, phase, trackMod);
        pathPrevX = horse.x;
        pathPrevY = horse.y;
      }
      const laneShift = Math.abs(horse.y - prevLaneYBeforeStretch);
      if (laneShift > 0.08 && isFinalStraight) {
        recordLaneCommit(horse, prevLaneYBeforeStretch, horse.y);
      }
      if (laneShift > 0.001) {
        const activeLaneShift = Math.max(0, laneShift - driftShift);
        const activeDrain = activeLaneShift * STAMINA_LANE_CHANGE_COST;
        const driftDrain = driftShift * STAMINA_LANE_CHANGE_COST * CENTRIFUGAL_DRIFT_STAMINA_MULT;
        const laneDrain = activeDrain + driftDrain;
        const safeLaneDrain = USE_SAFE_STAMINA_MODEL
          ? laneDrain * SAFE_LANE_EVENT_DRAIN_MULT
          : laneDrain;
        subtractStaminaWithReserve(horse, safeLaneDrain, phase, {
          trackField: 'staminaLaneCost',
          fatigueGain: 0.20,
        });
        if (isLateStraight && laneShift > 0.12) {
          horse.laneChangeCooldownPhases = Math.max(
            horse.laneChangeCooldownPhases ?? 0,
            FINAL_LANE_CHANGE_COOLDOWN_PHASES,
          );
        }
      }
      if (isLateStraight && laneShift > 0.04) {
        const staminaRatioLate = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
        const lateralFatigueMult =
          1 - Math.min(0.04, laneShift * 0.11 * (1.35 - staminaRatioLate * 0.5));
        adjustedAdvance *= lateralFatigueMult;
      }

      if (isFinalStraight) {
        const spurMult = calcSpurEntryAdvanceMult(
          horse,
          phase,
          horses,
          last3fNorm,
          { minXGap: collisionMetrics.minXGap, speedAdvance: adjustedAdvance },
        );
        adjustedAdvance *= spurMult;
      }

      // 前方間隔チェック（前が塞がれていて仕掛ける場合はバトル）
      const forwardCheck = resolveForwardMovement(
        rng,
        horse,
        adjustedAdvance,
        horses,
        collisionMetrics.minXGap,
        phase,
        phaseEventLogs,
        globalLogs,
        engagedHorseIds,
        battleProximityLimits,
      );
      const prevAdvance = horse.lastAdvance ?? 0;
      let frameAdvance = forwardCheck.advance;
      const staminaRatioNow = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
      const accelIntent = Math.max(0, frameAdvance - prevAdvance);
      if (accelIntent > 0.001) {
        const accelMultByStamina = staminaAccelAbilityMult(staminaRatioNow);
        frameAdvance = prevAdvance + accelIntent * accelMultByStamina;
      }
      horse.x += frameAdvance;
      recordHorsePathSegment(horse, pathPrevX, pathPrevY, phase, trackMod);

      const accelAmount = Math.max(0, frameAdvance - prevAdvance);
      if (accelAmount > 0.001) {
        let baselineStaminaAdvance = V_eff * (phase.distance / 80) * irregularMult;
        if (phase.index === 0 && Number.isFinite(horse.startBurstFactor)) {
          baselineStaminaAdvance *= Math.min(horse.startBurstFactor, START_BURST_STAMINA_FREE_CAP);
        }
        const taxableAccel = Math.max(0, accelAmount - baselineStaminaAdvance);
        const accelDrain =
          (taxableAccel < 0.02 ? 0 : taxableAccel) *
          STAMINA_ACCEL_COST *
          getWeightStaminaMult(horse);
        const safeAccelDrain = USE_SAFE_STAMINA_MODEL
          ? accelDrain * SAFE_ACCEL_EVENT_DRAIN_MULT
          : accelDrain;
        subtractStaminaWithReserve(horse, safeAccelDrain, phase, {
          trackField: 'staminaAccelCost',
          fatigueGain: 0.28,
        });
      }
      horse.lastAdvance = frameAdvance;

      applyCornerLoss(phase, horse);
      if (phase.isCorner && !USE_PATH_BASED_STAMINA) {
        const lane = laneIndex(horse.y);
        const outerDrain = Math.max(0, lane - 3) * STAMINA_CORNER_OUTER_PER_LANE;
        if (outerDrain > 0) {
          const safeOuterDrain = USE_SAFE_STAMINA_MODEL
            ? outerDrain * SAFE_CORNER_EVENT_DRAIN_MULT
            : outerDrain;
          subtractStaminaWithReserve(horse, safeOuterDrain, phase, {
            trackField: 'staminaCornerCost',
            fatigueGain: 0.18,
          });
        }
      }

      if (!USE_PATH_BASED_STAMINA) {
        const cons = USE_SAFE_STAMINA_MODEL
          ? Math.max(0, phase.distance) * trackMod * SAFE_BASE_STAMINA_PER_M
          : calcStaminaCons(phase, horse, trackMod);
        subtractStaminaWithReserve(horse, cons, phase, {
          category: 'base',
        });
      }

      horse.battleLosses  = 0;
      horse.battlePenalty = 1.0;

      // レースログはバトル関連のみを表示するため、通常の進行ログは出力しない
    }

    // バトル等で予備ラインを割った場合に同期（脚質共通）
    horses.forEach(horse => {
      if (isKickReserveReleased(phase)) return;
      const floor = horse.initialStamina * (horse.kickReserveFloorRatio ?? 0);
      if (horse.stamina < floor) horse.stamina = floor;
    });

    const xBeforeOverlap = shouldPreserveForwardX(phase, phaseCtx)
      ? horses.map(h => h.x ?? 0)
      : null;

    if (phase.index > 0 && getStyleBlend(phase, phaseCtx) > 0.01) {
      compressPreCornerToInnerLanes(horses, phase, collisionMetrics);
    }

    // ③ 全馬の最終位置を解消して重なりを防ぐ（非接触保証）
    const throughC3Overlap = isThroughThirdCornerPhase(phase);
    const overlapBase = {
      minXGap: collisionMetrics.minXGap,
      minYGap: collisionMetrics.minYGap,
      iterations: throughC3Overlap ? COLLISION_ITERATIONS_EARLY : COLLISION_ITERATIONS,
      keepOrder: true,
      freezeY: throughC3Overlap ? false : phase.ratio < 0.18,
    };
    resolveHorseOverlaps(horses, { ...overlapBase, phase });
    if (isStartToHomePhase(phase) && phase.index > 0) {
      rerouteRearContactsToOuterLane(horses, collisionMetrics);
      resolveHorseOverlaps(horses, {
        ...overlapBase,
        iterations: 1,
        freezeY: false,
        phase,
      });
    }
    if (isFinalStraightPhase(phase)) {
      for (const horse of horses) {
        if (shouldFreezeStretchLane(horse, horses, collisionMetrics.minXGap)) continue;
        const spurTarget = horse.spurEntryTargetLane ?? calcSpurEntryTargetLane(
          horse,
          phase,
          horses,
          last3fNorm,
          { minXGap: collisionMetrics.minXGap },
        );
        const passTarget = calcLocalPassTargetLane(
          horse,
          phase,
          horses,
          spurTarget,
          last3fNorm,
          { minXGap: collisionMetrics.minXGap },
        );
        const target = clampLane(Math.max(spurTarget, passTarget));
        const delta = target - horse.y;
        if (delta < 0.05) continue;
        const capped = delta > 3.5 ? clampLane(horse.y + 3.5) : target;
        horse.y = clampLane(horse.y * 0.32 + capped * 0.68);
      }
      resolveHorseOverlaps(horses, {
        minXGap: collisionMetrics.minXGap,
        minYGap: Math.max(0.82, collisionMetrics.minYGap),
        iterations: 3,
        keepOrder: true,
        freezeY: false,
        phase,
      });
    }
    if (throughC3Overlap) {
      enforceInnerHalfTrack(horses, phase);
      resolveHorseOverlaps(horses, {
        ...overlapBase,
        iterations: COLLISION_ITERATIONS_EARLY,
        phase,
      });
    }
    if (xBeforeOverlap) {
      horses.forEach((horse, i) => {
        horse.x = Math.max(horse.x ?? 0, xBeforeOverlap[i] ?? 0);
      });
    }
    if (isFormationPhase(phase, phaseCtx)) {
      enforceFrontRunnerAheadOfClosers(horses, collisionMetrics.minXGap);
      resolveHorseOverlaps(horses, {
        ...overlapBase,
        iterations: 1,
        phase,
      });
    }

    if (phase.ratio <= EARLY_LEAD_RATIO_MAX) {
      const leader = [...horses].sort((a, b) => b.x - a.x)[0];
      if (leader) {
        totalEarlyPhases += 1;
        earlyLeadCounts.set(leader.id, (earlyLeadCounts.get(leader.id) ?? 0) + 1);
        earlyLeaderTimeline.push(`P${phase.index + 1}:${leader.name}`);
        if (prevEarlyLeaderId !== null && prevEarlyLeaderId !== leader.id) {
          earlyLeaderSwitches += 1;
        }
        prevEarlyLeaderId = leader.id;
      }
    }

    if (isFourthCornerPhase(phase) && !isFinalStraightPhase(phase)) {
      snapshotCorner4ExitState(horses);
    }

    snapshots.push({
      phaseIndex: phase.index,
      isCorner:   phase.isCorner,
      isFinal:    phase.isFinal,
      ratio:      phase.ratio,
      eventLogs:  phaseEventLogs,
      horses:     horses.map(h => ({ ...h })),
    });
  }

  // ③ 最終タイム算出
  const results = horses.map(horse => {
    const staminaBonus = horse.initialStamina > 0
      ? (horse.stamina / horse.initialStamina) * 0.1 : 0;
    const V_final     = (horse.S_kick ?? horse.S_pace ?? horse.S_cruise) * (horse.stamina > 0 ? 1.0 : 0.7);
    const arrivalTime = (raceData.race_info.distance + horse.distanceLoss)
                      / (V_final * (1 + staminaBonus));
    return { ...horse, arrivalTime };
  });
  results.sort((a, b) => a.arrivalTime - b.arrivalTime);

  return { results, logs: globalLogs, snapshots, phases };
}
export {
  clampLane,
  applyBattleStaminaImpact,
  isNigeStyle,
  getJockeyReliabilityNorm,
  getJockeyAggressionNorm,
  isLaneInShiftPath,
} from './horse-utils.js';
