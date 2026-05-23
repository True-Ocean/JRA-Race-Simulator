import { createRng } from './rng.js';
import { calcAllParams } from './params.js';
import {
  buildPhases,
  calcStaminaCons,
  applyCornerLoss,
  laneIndex,
  getStylePaceMultiplier,
} from './phase.js';
import { detectContacts, shouldBattle, resolveBattle } from './battle.js';
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
  FORMATION_LOCK_PHASE,
  PRE_CORNER_PACK_PHASE_MAX,
  COLLISION_MIN_Y_GAP,
  COLLISION_ITERATIONS,
  COLLISION_ITERATIONS_EARLY,
  COLLISION_EPS,
  START_DELAY_BASE_RATE,
  STUMBLE_BASE_RATE,
  STUMBLE_PHASE_MAX,
  EARLY_TROUBLE_DECAY_PER_100M,
  EARLY_ORDER_TIE_NOISE,
  EARLY_OUTER_NIGE_START_RATIO,
  EARLY_OUTER_NIGE_ADV_GAIN_MAX,
  EARLY_OUTER_NIGE_DRAIN_PER_100M,
  START_PHASE_NIGE_PACE_BLEND,
  START_PHASE_GAP_CATCH_SCALE,
  START_PHASE_OUTER_NIGE_SCALE,
  OONIGE_BURST_ROLL_MIN,
  OONIGE_BURST_ROLL_MAX,
  OONIGE_BURST_PHASE_JITTER_MIN,
  OONIGE_BURST_PHASE_JITTER_MAX,
  OONIGE_DRAIN_BURST_LINK_GAIN,
  OONIGE_PHASE_DRAIN_EARLY_MULT,
  OONIGE_PHASE_DRAIN_LATE_MULT,
  FRONTRUN_ROLL_MIN,
  FRONTRUN_ROLL_MAX,
  OONIGE_LATE_DRAIN_BASE_PER_100M,
  OONIGE_LATE_DRAIN_LEAD_GAIN,
  USE_SAFE_STAMINA_MODEL,
  SAFE_BASE_STAMINA_PER_M,
  SAFE_LANE_EVENT_DRAIN_MULT,
  SAFE_CORNER_EVENT_DRAIN_MULT,
  SAFE_ACCEL_EVENT_DRAIN_MULT,
  SAFE_NIGE_PACE_DRAIN_MULT,
  SAFE_NIGE_EARLY_PACE_PHASE_MULT,
  SAFE_NIGE_LATE_PACE_PHASE_MULT,
  SAFE_OONIGE_EARLY_PACE_PHASE_MULT,
  OONIGE_CRUISE_SECOND_GAP_MIN,
  OONIGE_CRUISE_GAP_NEED_MAX,
  OONIGE_CRUISE_DRAIN_MULT_MIN,
  OONIGE_CRUISE_DRAIN_MULT_MAX,
  OONIGE_CRUISE_BURST_LINK_SCALE,
  SAFE_GOAL_EVENT_FATIGUE_WEIGHT,
  SAFE_GOAL_STAMINA_PER_M_REF,
  SAFE_GOAL_STAMINA_PER_M_RANGE,
  START_BURST_STAMINA_FREE_CAP,
  NIGE_PACE_EXTRA_DRAIN_FLOOR,
  NIGE_PACE_LEAD_HOLD_DRAIN_FLOOR,
  NIGE_ACCEL_LEAD_EASE_MIN,
  KICK_RESERVE_FLOOR_NIGE_MAX,
  KICK_RESERVE_FLOOR_OONIGE_MAX,
  KICK_EARLY_DRAIN_NIGE_MULT,
  CHASE_GAP_CLOSE_PER_PHASE,
  CHASE_GAP_CLOSE_PRESSURE_GAIN,
  NIGE_OUTER_DASH_CLEAR_LEAD_MULT,
  OONIGE_LATE_CLEAR_LEAD_MULT,
  OONIGE_LATE_CLEAR_LEAD_GAP,
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
  STAMINA_EARLY_ACCEL_MULT,
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
  getRunningOrderRank,
  shouldFreezeStretchLane,
  isStretchSpreadCandidate,
  buildLaneDecisionContext,
} from './lane-decision.js';
function staminaAccelAbilityMult(staminaRatio) {
  const r = Math.max(0, Math.min(1, staminaRatio));
  if (r >= 0.35) return 1.0;
  // 0.35 -> 1.0, 0.00 -> 0.62
  return 0.62 + (r / 0.35) * 0.38;
}

function getOonigePhaseDrainMult(phase) {
  return isAfterFourthCornerPhase(phase)
    ? OONIGE_PHASE_DRAIN_LATE_MULT
    : OONIGE_PHASE_DRAIN_EARLY_MULT;
}

function getOonigeLeadStretchRamp(phase) {
  if (!phase) return 1;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  const label = String(phase.segmentLabel ?? '');

  if (segmentId || label) {
    if (segmentId === 'start' || label.includes('スタート')) return 0.56;
    if (segmentId === 'home' || label.includes('ホーム直線')) return 0.80;
    if (segmentId === 'corner1' || label.includes('第1コーナー')) return 0.98;
    if (segmentId === 'corner2' || label.includes('第2コーナー')) return 1.14;
    if (segmentId === 'back' || label.includes('向正面')) return 1.38;
    if (segmentId === 'corner3' || label.includes('第3コーナー')) return 1.82;
    return 1.12;
  }

  const r = Number.isFinite(phase.ratio) ? phase.ratio : 0;
  const t = Math.max(0, Math.min(1, r / 0.62));
  const s = t * t * (3 - 2 * t);
  return 0.48 + 1.34 * s;
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
  if (isOonigeStyle(horse.style)) {
    floorR = Math.min(floorR, KICK_RESERVE_FLOOR_OONIGE_MAX);
  } else if (isNigeStyle(horse.style)) {
    floorR = Math.min(floorR, KICK_RESERVE_FLOOR_NIGE_MAX);
    mult = Math.min(0.99, mult * KICK_EARLY_DRAIN_NIGE_MULT);
  }
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

function getNigePaceExtraDrainMult({
  isLeading,
  gapNeedNorm,
  oonigePressure,
  frontBlocked,
  inTrafficBattle,
}) {
  if (inTrafficBattle || frontBlocked) return 1.0;
  if (!isLeading) return 0.92;
  const posNeed = Math.max(0, gapNeedNorm);
  const pressure = Math.max(0, Math.min(1, Number.isFinite(oonigePressure) ? oonigePressure : 0));
  let squeeze = posNeed * 0.88 + pressure * 0.36;
  if (posNeed <= 0.02) squeeze *= 0.38;
  const t = Math.max(0, Math.min(1, squeeze));
  const dynamic = NIGE_PACE_EXTRA_DRAIN_FLOOR + (1 - NIGE_PACE_EXTRA_DRAIN_FLOOR) * t;
  return Math.max(dynamic, NIGE_PACE_LEAD_HOLD_DRAIN_FLOOR);
}

/**
 * 大逃げが先頭で十分離れているときの巡航ドレイン倍率。
 * 向正面〜中盤で oonigeBoost に連動した過剰消費を抑える。
 */
function calcOonigeCruiseEase(isLeading, secondGap, gapNeedNorm) {
  if (!isLeading) return 1;
  if (secondGap < OONIGE_CRUISE_SECOND_GAP_MIN) return 1;
  if (gapNeedNorm > OONIGE_CRUISE_GAP_NEED_MAX) return 1;
  const comfort = Math.max(
    0,
    Math.min(1, (secondGap - OONIGE_CRUISE_SECOND_GAP_MIN) / 18),
  );
  return OONIGE_CRUISE_DRAIN_MULT_MAX
    - comfort * (OONIGE_CRUISE_DRAIN_MULT_MAX - OONIGE_CRUISE_DRAIN_MULT_MIN);
}

/** 競争圧: 2着の詰め・僅差・ペース圧（0〜1） */
function calcChasePressure({
  isLeading,
  secondGap,
  gapNeedNorm,
  oonigePressure,
  prevSecondGap,
}) {
  if (!isLeading) return 0;
  let p = 0;
  const pressure = Math.max(0, Math.min(1, Number.isFinite(oonigePressure) ? oonigePressure : 0));
  p = Math.max(p, pressure * 0.4);
  if (gapNeedNorm > 0.04) {
    p = Math.max(p, Math.min(1, gapNeedNorm * 0.9));
  }
  if (secondGap < 9) {
    p = Math.max(p, ((9 - secondGap) / 9) * 0.75);
  }
  if (Number.isFinite(prevSecondGap) && prevSecondGap > secondGap + 0.4) {
    const closed = (prevSecondGap - secondGap) / Math.max(0.5, CHASE_GAP_CLOSE_PER_PHASE);
    p = Math.max(p, Math.min(1, closed * CHASE_GAP_CLOSE_PRESSURE_GAIN));
  }
  return Math.max(0, Math.min(1, p));
}

/** ペースドレイン倍率: 巡航 ease と競争圧から補間（1=フル消費） */
function calcPaceDrainMultFromPressure(cruiseEase, chasePressure) {
  const chase = Math.max(0, Math.min(1, chasePressure));
  const ease = Math.max(0, Math.min(1, cruiseEase));
  return ease + (1 - ease) * chase;
}

/** USE_SAFE_STAMINA_MODEL 時、逃げ・大逃げ専用ペースドレインを段階的に復活させる */
function scaleSafeNigePaceDrain(rawDrain, phase, { isOonige = false } = {}) {
  if (!Number.isFinite(rawDrain) || rawDrain <= 0) return 0;
  if (!USE_SAFE_STAMINA_MODEL) return rawDrain;
  let d = rawDrain * SAFE_NIGE_PACE_DRAIN_MULT;
  if (!phase) return d;
  if (isAfterFourthCornerPhase(phase)) {
    d *= SAFE_NIGE_LATE_PACE_PHASE_MULT;
  } else if (Number(phase.ratio) <= 0.55) {
    d *= isOonige ? SAFE_OONIGE_EARLY_PACE_PHASE_MULT : SAFE_NIGE_EARLY_PACE_PHASE_MULT;
  }
  return d;
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
  if (horse.stumbleCooldown === undefined) horse.stumbleCooldown = 0;

  let mult = 1.0;

  if (phase.index === 0 && !horse.startIrregularChecked) {
    horse.startIrregularChecked = true;
    const startDelayRate = calcStartDelayRate(horse);
    if (rng() < startDelayRate) {
      const lossRatio = 0.22 + rng() * 0.16;
      mult *= (1 - lossRatio);
      horse.startTroubleScore = (horse.startTroubleScore ?? 0) + 1.0;
      const lossPct = Math.round(lossRatio * 100);
      const log = `[出遅れ] ${horse.name} がスタートで遅れる（-${lossPct}%）`;
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
      const lossPct = Math.round(lossRatio * 100);
      const log = `[つまずき] ${horse.name} がつまずく（-${lossPct}%）`;
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

function calcEarlyPhaseOrderScore(horse, rng, ave3fMax, ave3fSpan) {
  const styleBase = isOonigeStyle(horse.style) ? 112
    : isNigeStyle(horse.style) ? 100
    : horse.style === '先行' ? 77
      : horse.style === '差し' ? 48
        : 34;
  const ave3fScore = Number.isFinite(horse.ave3f)
    ? (ave3fMax - horse.ave3f) / Math.max(0.001, ave3fSpan)
    : 0.5;
  const launchSkill = (horse.S_cruise * 0.30 + horse.M_maneuv * 0.20) / 100;
  const styleBurst = isOonigeStyle(horse.style) ? 0.33
    : isNigeStyle(horse.style) ? 0.24
    : horse.style === '先行' ? 0.10
      : 0;
  const projectedBurst = horse.startBurstFactor ?? (
    0.72 + ave3fScore * 0.68 + launchSkill * 0.22 + styleBurst
  );
  const burstBonus = (projectedBurst - 1.0) * 22;
  const lane = clampLane(horse.y);
  const innerLaneBonus = (LANE_WIDTH - lane) * 0.7;
  const outerLanePressureNorm = calcOuterNigePressureNorm(lane);
  const outerNigeBonus = isNigeStyle(horse.style)
    ? outerLanePressureNorm * (isOonigeStyle(horse.style) ? 6.4 : 5.0)
    : 0;
  const troublePenalty = (horse.startTroubleScore ?? 0) * 17;
  const tieNoise = (rng() - 0.5) * EARLY_ORDER_TIE_NOISE;
  return styleBase + burstBonus + innerLaneBonus + outerNigeBonus - troublePenalty + tieNoise;
}

function calcOuterNigePressureNorm(lane) {
  const clampedLane = clampLane(lane);
  const outerStartLane = 1 + (LANE_WIDTH - 1) * EARLY_OUTER_NIGE_START_RATIO;
  const maxOuterSpan = Math.max(0.5, LANE_WIDTH - outerStartLane);
  return Math.max(0, Math.min(1, (clampedLane - outerStartLane) / maxOuterSpan));
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

export function runSimulation(raceData, options = {}, userTweaks = {}, marks = {}, renderer = null) {
  const seedBase = options.seed ?? raceData.race_id;
  const rng      = createRng(seedBase);
  const horses    = calcAllParams(raceData, userTweaks, marks);
  const courseDef = raceData.courseDef ?? null;
  const phases    = buildPhases(raceData.race_info.distance, courseDef);
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
    horse.staminaBaseCost = 0;
    horse.staminaEventCost = 0;
    horse.eventFatigueScore = 0;
    horse.recentEventLoad = 0;
    horse.battleFatigue = 0;
    horse.startTroubleScore = 0;
    horse.staminaRatioAfterC3 = null;
    horse.stretchFanLane = null;
    horse.laneCommitDir = 0;
    horse.laneCommitPhases = 0;
    const ave3fWeight = Number.isFinite(horse.ave3f)
      ? (ave3fMax - horse.ave3f) / ave3fSpan
      : 0.5;
    const last3fWeight = Number.isFinite(horse.last3f)
      ? (last3fMax - horse.last3f) / last3fSpan
      : 0.5;
    const sustainWeight = Math.max(0, Math.min(1, horse.S_sustain / 100));
    const maneuvWeight = Math.max(0, Math.min(1, horse.M_maneuv / 100));
    const frontRunDrive = Math.max(
      0,
      Math.min(1, ave3fWeight * 0.44 + sustainWeight * 0.30 + maneuvWeight * 0.16 + last3fWeight * 0.10),
    );
    horse.frontRunDrive = isNigeStyle(horse.style) ? frontRunDrive : 0;
    horse.oonigeDrive = Math.max(
      0,
      Math.min(1, ave3fWeight * 0.48 + last3fWeight * 0.20 + sustainWeight * 0.32),
    );
    horse.oonigeLeadStreak = 0;
    horse.oonigeBurstRoll = isNigeStyle(horse.style)
      ? FRONTRUN_ROLL_MIN + rng() * (FRONTRUN_ROLL_MAX - FRONTRUN_ROLL_MIN)
      : 1.0;
    horse.oonigePressure = isNigeStyle(horse.style) ? horse.frontRunDrive : 0;
    horse.phasePrevSecondGap = undefined;
    horse.phasePrevLeadGapLate = undefined;
    initUniversalKickProfile(horse, rng, last3fMin, last3fMax, last3fSpan);
  });

  for (const phase of phases) {
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
    // ① フェーズ特化バトル判定
    const threshold      = phase.distance * 0.8;
    const contacts       = detectContacts(horses, threshold);
    const phaseEventLogs = [];
    const engagedHorseIds = new Set();
    const isEarlyOrderingPhase = isStartToHomePhase(phase);
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

    resolveLeadBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds);
    resolveCornerPositionBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds);
    resolveFinalStraightDuel(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds);

    if (isFinalStraightPhase(phase)) {
      for (const h of horses) {
        h.spurEntryStartRank = getRunningOrderRank(h, horses);
        h.spurEntryClimbLogged = false;
      }
    }

    for (const { a, b } of contacts) {
      if (engagedHorseIds.has(a.id) || engagedHorseIds.has(b.id)) continue;
      if (!shouldBattle(rng, horses, a, b)) continue;
      const result = resolveBattle(rng, a, b, phase);
      applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
      const log = `[バトル:進路争い] ${result.winner.name} vs ${result.loser.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
      engagedHorseIds.add(a.id);
      engagedHorseIds.add(b.id);
      break;
    }

    // ② 各馬の移動（衝突回避 + ブロック時バトル）
    const order = isEarlyOrderingPhase
      ? [...horses].sort((a, b) => {
        const scoreA = calcEarlyPhaseOrderScore(a, rng, ave3fMax, ave3fSpan);
        const scoreB = calcEarlyPhaseOrderScore(b, rng, ave3fMax, ave3fSpan);
        if (Math.abs(scoreA - scoreB) > 1e-6) return scoreB - scoreA;
        if (Math.abs(a.x - b.x) > 1e-6) return b.x - a.x;
        return a.y - b.y;
      })
      : [...horses].sort((a, b) => b.x - a.x);
    for (const horse of order) {
      const staminaMod = horse.stamina > 0
        ? CONFIG.STAMINA_MODIFIER_FULL
        : CONFIG.STAMINA_MODIFIER_EMPTY;

      const horseLanePre = clampLane(horse.y);
      const earlyFrontGapPre = getFrontGap(horse, horseLanePre, horses);
      const earlyFrontBlockedPre =
        earlyFrontGapPre < (collisionMetrics.minXGap + FINAL_FRONT_BLOCK_EXTRA_GAP);
      const phaseTrafficBattlePre = engagedHorseIds.has(horse.id);
      const sortedByFrontPre = [...horses].sort((a, b) => b.x - a.x);
      const leaderPre = sortedByFrontPre[0] ?? null;
      const runnerUpPre = sortedByFrontPre[1] ?? null;
      const leadGapPre = Math.max(0, (leaderPre?.x ?? horse.x) - horse.x);
      const isLeadingPre = Boolean(leaderPre && leaderPre.id === horse.id && leadGapPre <= 8);
      const secondGapPre =
        isLeadingPre && runnerUpPre ? Math.max(0, horse.x - runnerUpPre.x) : 0;

      let paceMult = getStylePaceMultiplier(horse.style, phase.ratio);
      if (phase.index === 0 && isNigeStyle(horse.style)) {
        paceMult = 1 + (paceMult - 1) * START_PHASE_NIGE_PACE_BLEND;
      }
      const V_eff    = horse.S_cruise * staminaMod * horse.battlePenalty * paceMult;
      const desiredAdvance = V_eff * (phase.distance / 80);
      const irregularMult = applyIrregularEvents(
        rng,
        horse,
        phase,
        phaseEventLogs,
        globalLogs,
      );
      let adjustedAdvance = desiredAdvance * irregularMult;

      if (isAfterFourthCornerPhase(phase)) {
        const last3fW = calcLast3fWeight(horse, last3fNorm);
        const staminaR = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
        const localGap = getLocalPackFrontGap(horse, horseLanePre, horses);
        const blockedLocal = localGap < (collisionMetrics.minXGap + FINAL_FRONT_BLOCK_EXTRA_GAP);
        let stretchKick = last3fW * (0.06 + staminaR * 0.11) * (blockedLocal ? 1.2 : 0.55);
        if (isFourthCornerPhase(phase) && !isFinalStraightPhase(phase)) {
          stretchKick *= CORNER4_STRETCH_KICK_SCALE;
        } else if (isFinalStraightPhase(phase)) {
          stretchKick *= SPUR_ENTRY_STRETCH_KICK_MULT;
          const isCloserStyle = horse.style === '差し' || horse.style === '追込';
          if (isCloserStyle) {
            stretchKick *= 1.20 + last3fW * 0.22;
          }
        }
        adjustedAdvance *= (1 + stretchKick);
        if (stretchKick > 0.02) {
          const kickDrain = (Math.max(0, phase.distance) / 100) * stretchKick * 0.85;
          subtractStaminaWithReserve(horse, kickDrain, phase, {
            trackField: 'staminaAccelCost',
            fatigueGain: 0.24,
          });
        }
      }

      // スタート直後は能力差 + 反応差で前後にばらつきを作る
      // （以降フェーズは通常ロジックに戻す）
      if (phase.index === 0) {
        if (horse.startBurstFactor === undefined) {
          // ave3fが短いほどスタート初速を高める（逃げ適性を強く反映）
          const ave3fScore = Number.isFinite(horse.ave3f)
            ? (ave3fMax - horse.ave3f) / ave3fSpan
            : 0.5;
          const launchSkill = (horse.S_cruise * 0.30 + horse.M_maneuv * 0.20) / 100;
          // 大逃げも逃げと同程度にし、スタート直後の過剰ダッシュを抑える（ステップ3）
          const earlyRunnerBonus = isNigeStyle(horse.style)
            ? 0.24
            : horse.style === '先行'
              ? 0.10
              : 0;
          const baseMult = 0.72
            + ave3fScore * 0.68   // スタートはave3fを強く反映
            + launchSkill * 0.22
            + earlyRunnerBonus;
          const randomMult = 0.88 + rng() * 0.28; // 中程度のばらつき（0.88〜1.16）
          horse.startBurstFactor = baseMult * randomMult;
          if (horse.startBurstFactor >= 1.22) {
            const gainPct = Math.round((horse.startBurstFactor - 1) * 100);
            const log = `[好スタート] ${horse.name} がスタートダッシュを決める（+${gainPct}%）`;
            globalLogs.push(log);
            phaseEventLogs.push(log);
          }
        }
        adjustedAdvance *= horse.startBurstFactor;
      }

      // 序盤で隊列を固めるため、一定フェーズで現レーンを基準化
      if (horse.settledLane === undefined && phase.ratio >= FORMATION_LOCK_PHASE) {
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
      if (
        isLateStraight
        && (isNigeStyle(horse.style) || horse.style === '先行')
        && isLeadingPre
      ) {
        const chaserNear = horses.some(h =>
          h.id !== horse.id
          && h.x < horse.x + 2
          && h.x > horse.x - 42,
        );
        if (chaserNear) {
          const holdDrain =
            (Math.max(0, phase.distance) / 100)
            * (0.55 + (horse.oonigePressure ?? horse.frontRunDrive ?? 0) * 0.9);
          subtractStaminaWithReserve(horse, holdDrain, phase, {
            trackField: 'staminaAccelCost',
            fatigueGain: 0.32,
          });
        }
      }
      const isOonige = isOonigeStyle(horse.style);
      if (isEarlyInnerBurst && isNigeStyle(horse.style)) {
        const outerLanePressureNorm = calcOuterNigePressureNorm(horse.y);
        if (outerLanePressureNorm > 0) {
          const nigeGainMult = isOonigeStyle(horse.style) ? 1.24 : 1.0;
          let dashGain = EARLY_OUTER_NIGE_ADV_GAIN_MAX * nigeGainMult * outerLanePressureNorm;
          if (phase.index === 0) {
            dashGain *= START_PHASE_OUTER_NIGE_SCALE;
          }
          adjustedAdvance *= (1 + dashGain);
          let dashDrain =
            (Math.max(0, phase.distance) / 100) *
            EARLY_OUTER_NIGE_DRAIN_PER_100M *
            (0.6 + 0.8 * outerLanePressureNorm) *
            (isOonige ? 1.04 : 1.0);
          if (
            isLeadingPre &&
            secondGapPre >= 7 &&
            !phaseTrafficBattlePre &&
            !earlyFrontBlockedPre
          ) {
            dashDrain *= NIGE_OUTER_DASH_CLEAR_LEAD_MULT;
          }
          let tunedDashDrain = scaleSafeNigePaceDrain(dashDrain, phase, { isOonige });
          if (isOonige && isLeadingPre) {
            const gapNeedDash = Math.max(-0.45, Math.min(1, (14 - secondGapPre) / 14));
            const cruiseEase = calcOonigeCruiseEase(isLeadingPre, secondGapPre, gapNeedDash);
            const chaseP = calcChasePressure({
              isLeading: isLeadingPre,
              secondGap: secondGapPre,
              gapNeedNorm: gapNeedDash,
              oonigePressure: horse.oonigePressure,
              prevSecondGap: horse.phasePrevSecondGap,
            });
            tunedDashDrain *= calcPaceDrainMultFromPressure(cruiseEase, chaseP);
          }
          subtractStaminaWithReserve(horse, tunedDashDrain, phase, {
            trackField: 'staminaAccelCost',
            fatigueGain: 0.22,
          });
        }
      }
      if (isNigeStyle(horse.style) && !isAfterFourthCorner && phase.ratio <= 0.78) {
        const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
        const staminaGate = Math.max(0, Math.min(1, (staminaRatio - 0.22) / 0.60));
        if (staminaGate > 0) {
          const sortedByFront = [...horses].sort((a, b) => b.x - a.x);
          const leader = sortedByFront[0] ?? null;
          const runnerUp = sortedByFront[1] ?? null;
          const leadX = leader?.x ?? horse.x;
          const leadGap = Math.max(0, leadX - horse.x);
          const isLeading = leadGap <= 8;
          const secondGap = isLeading && runnerUp ? Math.max(0, horse.x - runnerUp.x) : 0;
          horse.oonigeLeadStreak = isLeading
            ? (horse.oonigeLeadStreak ?? 0) + 1
            : 0;
          const isEarlyBand = phase.ratio <= 0.35;
          const isMiddleBand = phase.ratio <= 0.55;
          const oonigeLeadRamp = isOonige ? getOonigeLeadStretchRamp(phase) : 1;
          const frontDrive = Math.max(horse.frontRunDrive ?? 0, isOonige ? horse.oonigeDrive : 0);
          // 大逃げ: ratio ティアだと後半セグメントが最弱になるため、ランプで伸びを駆動する
          const baseBoost = isOonige
            ? (0.028 + oonigeLeadRamp * 0.142)
            : (isEarlyBand ? 0.042 : isMiddleBand ? 0.030 : 0.018);
          const abilityBoost =
            frontDrive *
            (isOonige ? (0.052 + oonigeLeadRamp * 0.055) : 0.052);
          const leadBoost = isLeading
            ? (
                isOonige
                  ? (0.014 + oonigeLeadRamp * 0.048)
                  : (isMiddleBand ? 0.014 : 0.010)
              )
            : 0;
          const targetGapBase = isOonige
            ? (14 + frontDrive * 26) * (0.72 + oonigeLeadRamp * 0.34)
            : (8 + frontDrive * 18);
          const targetGapPhaseMult = isOonige
            ? (0.78 + oonigeLeadRamp * 0.38)
            : (isEarlyBand ? 0.95 : isMiddleBand ? 1.20 : 1.10);
          const targetLeadGap = targetGapBase * targetGapPhaseMult * (horse.oonigeBurstRoll ?? 1.0);
          const gapNeed = targetLeadGap - secondGap;
          const gapNeedNorm = Math.max(-0.45, Math.min(1, gapNeed / Math.max(8, targetLeadGap)));
          const desiredPressure = Math.max(
            0,
            Math.min(
              1,
              (isOonige ? 0.24 : 0.20) +
              frontDrive * (isOonige ? 0.62 : 0.48) +
              (isLeading ? (isOonige ? 0.09 : 0.06) : 0) +
              Math.max(0, gapNeedNorm) * (isOonige ? 0.50 : 0.42),
            ),
          );
          const prevPressure = Number.isFinite(horse.oonigePressure) ? horse.oonigePressure : frontDrive;
          const pressureFollow = isEarlyBand ? 0.22 : 0.16;
          const pressure = prevPressure + (desiredPressure - prevPressure) * pressureFollow;
          horse.oonigePressure = Math.max(0, Math.min(1, pressure));
          const pressureBoost = (isOonige ? 0.78 : 0.74) + horse.oonigePressure * (isOonige ? 0.60 : 0.46);
          const gapCatchCoeff = isOonige
            ? (0.34 + Math.min(oonigeLeadRamp, 1.95) * 0.36)
            : 0.28;
          let gapCatchBoost = 1 + Math.max(0, gapNeedNorm) * gapCatchCoeff;
          if (phase.index === 0) {
            gapCatchBoost =
              1 + (gapCatchBoost - 1) * START_PHASE_GAP_CATCH_SCALE;
          }
          // スタミナ枯れで gate=0 になると第3コーナーでも伸びが消える。先頭×高ランプ時は下限を設ける
          let staminaGateEff = staminaGate;
          if (isOonige && isLeading && oonigeLeadRamp >= 1.0) {
            const rampTail = Math.max(0, oonigeLeadRamp - 1);
            const gateFloor = Math.min(0.82, 0.26 + rampTail * 0.62);
            staminaGateEff = Math.max(staminaGate, gateFloor);
          }
          const oonigeBoostBase =
            (baseBoost + abilityBoost + leadBoost) * staminaGateEff * pressureBoost * gapCatchBoost;
          const phaseJitter =
            OONIGE_BURST_PHASE_JITTER_MIN +
            rng() * (OONIGE_BURST_PHASE_JITTER_MAX - OONIGE_BURST_PHASE_JITTER_MIN);
          const oonigeRoll = Number.isFinite(horse.oonigeBurstRoll) ? horse.oonigeBurstRoll : 1.0;
          let oonigeBoost = oonigeBoostBase * oonigeRoll * phaseJitter;
          if (isOonige) {
            oonigeBoost *= oonigeLeadRamp;
          }
          adjustedAdvance *= (1 + oonigeBoost);
          const streakPenalty = Math.min(0.25, (horse.oonigeLeadStreak ?? 0) * 0.03);
          const burstDelta = Math.max(0, oonigeBoost - oonigeBoostBase);
          let paceDrainMult = 1;
          if (isOonige && isLeading) {
            const cruiseEase = calcOonigeCruiseEase(isLeading, secondGap, gapNeedNorm);
            const chaseP = calcChasePressure({
              isLeading,
              secondGap,
              gapNeedNorm,
              oonigePressure: horse.oonigePressure,
              prevSecondGap: horse.phasePrevSecondGap,
            });
            paceDrainMult = calcPaceDrainMultFromPressure(cruiseEase, chaseP);
          }
          if (isLeading) {
            horse.phasePrevSecondGap = secondGap;
          }
          const burstLinkScale = USE_SAFE_STAMINA_MODEL && isOonige && paceDrainMult < 0.45
            ? OONIGE_CRUISE_BURST_LINK_SCALE
            : 10;
          const linkedDrainMult = 1 + burstDelta * OONIGE_DRAIN_BURST_LINK_GAIN * burstLinkScale;
          const pressureDrain = 1 + horse.oonigePressure * (isOonige ? 0.30 : 0.44) + Math.max(0, gapNeedNorm) * (isOonige ? 0.22 : 0.30);
          const oonigeBoostDrainCoeff = isOonige && USE_SAFE_STAMINA_MODEL && paceDrainMult < 0.45
            ? 0.85
            : 4.2;
          const extraDrain =
            (Math.max(0, phase.distance) / 100) *
            (isOonige
              ? (0.60 + oonigeBoost * oonigeBoostDrainCoeff + (isLeading ? 0.24 : 0))
              : (0.82 + oonigeBoost * 5.2 + (isLeading ? 0.30 : 0))) *
            (1 + streakPenalty) *
            linkedDrainMult *
            pressureDrain;
          const paceExtraDrainMult = getNigePaceExtraDrainMult({
            isLeading,
            gapNeedNorm,
            oonigePressure: horse.oonigePressure,
            frontBlocked: earlyFrontBlockedPre,
            inTrafficBattle: phaseTrafficBattlePre,
          });
          const tunedDrain = extraDrain * paceExtraDrainMult;
          let safeDrain = scaleSafeNigePaceDrain(tunedDrain, phase, { isOonige });
          if (isOonige) {
            safeDrain *= paceDrainMult;
          }
          subtractStaminaWithReserve(horse, safeDrain, phase, {
            trackField: 'staminaAccelCost',
            fatigueGain: 0.42,
          });
        } else {
          horse.oonigeLeadStreak = 0;
          horse.oonigePressure = Math.max(0, (horse.oonigePressure ?? horse.frontRunDrive ?? 0) * 0.86);
        }
      } else if (horse.oonigeLeadStreak > 0) {
        horse.oonigeLeadStreak = 0;
        horse.oonigePressure = Math.max(0, (horse.oonigePressure ?? horse.frontRunDrive ?? 0) * 0.90);
      }
      if (isOonigeStyle(horse.style) && isAfterFourthCorner) {
        const sortedByFront = [...horses].sort((a, b) => b.x - a.x);
        const leader = sortedByFront[0] ?? null;
        const runnerUp = sortedByFront[1] ?? null;
        const isLeading = leader?.id === horse.id;
        const leadGapLate = isLeading && runnerUp ? Math.max(0, horse.x - runnerUp.x) : 0;
        const prevLeadGapLate = horse.phasePrevLeadGapLate;
        horse.phasePrevLeadGapLate = isLeading ? leadGapLate : undefined;
        const lateStaminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
        const lateRisk = Math.max(0, Math.min(1, (0.62 - lateStaminaRatio) / 0.62));
        const leadLoad = Math.max(0, Math.min(1, leadGapLate / 28));
        const paceLoad = Math.max(0, (horse.oonigePressure ?? horse.frontRunDrive ?? 0) * 0.65 + leadLoad * 0.35);
        let lateChase = 0;
        if (isLeading && Number.isFinite(prevLeadGapLate) && prevLeadGapLate > leadGapLate + 0.5) {
          lateChase = Math.min(
            1,
            ((prevLeadGapLate - leadGapLate) / CHASE_GAP_CLOSE_PER_PHASE) * CHASE_GAP_CLOSE_PRESSURE_GAIN,
          );
        }
        if (isLeading && leadGapLate < 10) {
          lateChase = Math.max(lateChase, (10 - leadGapLate) / 10 * 0.65);
        }
        let lateDrain =
          (Math.max(0, phase.distance) / 100) *
          OONIGE_LATE_DRAIN_BASE_PER_100M *
          (1 + lateRisk * 1.55 + paceLoad * OONIGE_LATE_DRAIN_LEAD_GAIN + lateChase * 1.35);
        if (
          isLeading &&
          leadGapLate >= OONIGE_LATE_CLEAR_LEAD_GAP &&
          lateChase < 0.2 &&
          !phaseTrafficBattlePre &&
          !earlyFrontBlockedPre
        ) {
          lateDrain *= OONIGE_LATE_CLEAR_LEAD_MULT;
        }
        let safeLateDrain = scaleSafeNigePaceDrain(lateDrain, phase, { isOonige: true });
        if (isLeading) {
          const lateCruise = calcOonigeCruiseEase(isLeading, leadGapLate, -0.2);
          safeLateDrain *= calcPaceDrainMultFromPressure(lateCruise, lateChase);
        }
        subtractStaminaWithReserve(horse, safeLateDrain, phase, {
          trackField: 'staminaAccelCost',
          fatigueGain: 0.36,
        });
        horse.oonigePressure = Math.max(0, (horse.oonigePressure ?? 0) * 0.82);
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
      horse.targetLane = isStartPhase
        ? calcStartPhaseTargetLane(horse, horses, collisionMetrics, phase)
        : isPreCornerPack
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
            collisionMetrics,
            seekOutsideLane,
            lateralCap: laneDecisionMeta?.lateralCap,
          },
          phaseEventLogs,
          globalLogs,
          engagedHorseIds,
        );
        horse.y = laneCheck.nextY;
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
        if (laneCheck.advanceMult != null && stretchStep === 0) {
          adjustedAdvance *= laneCheck.advanceMult;
        }
        if (Number.isFinite(laneCheck.xNudge) && laneCheck.xNudge > 0 && stretchStep === 0) {
          horse.x += laneCheck.xNudge;
        }
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

      if (
        isFinalStraight
        && Number.isFinite(horse.spurEntryStartRank)
      ) {
        const rankNow = getRunningOrderRank(horse, horses);
        const gained = horse.spurEntryStartRank - rankNow;
        if (gained >= 1 && !horse.spurEntryClimbLogged) {
          horse.spurEntryClimbLogged = true;
          const log = `[仕掛け:繰り上がり] ${horse.name} が直線入口で ${gained} 順繰り上がり（${horse.spurEntryStartRank + 1}→${rankNow + 1}番手）`;
          globalLogs.push(log);
          phaseEventLogs.push(log);
        }
      }

      const accelAmount = Math.max(0, frameAdvance - prevAdvance);
      if (accelAmount > 0.001) {
        const earlyMult = isNigeStyle(horse.style) && phase.ratio <= 0.35 ? STAMINA_EARLY_ACCEL_MULT : 1.0;
        let baselineStaminaAdvance = V_eff * (phase.distance / 80) * irregularMult;
        if (phase.index === 0 && Number.isFinite(horse.startBurstFactor)) {
          baselineStaminaAdvance *= Math.min(horse.startBurstFactor, START_BURST_STAMINA_FREE_CAP);
        }
        const taxableAccel = Math.max(0, accelAmount - baselineStaminaAdvance);
        let accelDrain =
          (taxableAccel < 0.02 ? 0 : taxableAccel) *
          STAMINA_ACCEL_COST *
          earlyMult *
          getWeightStaminaMult(horse);
        if (
          isNigeStyle(horse.style) &&
          isLeadingPre &&
          !earlyFrontBlockedPre &&
          !phaseTrafficBattlePre &&
          runnerUpPre
        ) {
          const gapComfort = Math.max(0, Math.min(1, secondGapPre / 14));
          const accelLeadEase = NIGE_ACCEL_LEAD_EASE_MIN + (1 - NIGE_ACCEL_LEAD_EASE_MIN) * (1 - gapComfort);
          accelDrain *= accelLeadEase;
        }
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
      if (phase.isCorner) {
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

      const cons = USE_SAFE_STAMINA_MODEL
        ? Math.max(0, phase.distance) * trackMod * SAFE_BASE_STAMINA_PER_M
        : calcStaminaCons(phase, horse, trackMod);
      subtractStaminaWithReserve(horse, cons, phase, {
        category: 'base',
      });

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

    if (isBeforeFirstCornerPhase(phase) && phase.index > 0) {
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

    if (phase.ratio <= EARLY_LEAD_RATIO_MAX) {
      const leader = [...horses].sort((a, b) => b.x - a.x)[0];
      if (leader) {
        totalEarlyPhases += 1;
        earlyLeadCounts.set(leader.id, (earlyLeadCounts.get(leader.id) ?? 0) + 1);
        earlyLeaderTimeline.push(`P${phase.index + 1}:${leader.name}`);
        if (prevEarlyLeaderId !== null && prevEarlyLeaderId !== leader.id) {
          earlyLeaderSwitches += 1;
          const log = `[序盤先頭] フェーズ${phase.index + 1}で先頭交代 → ${leader.name}`;
          globalLogs.push(log);
          phaseEventLogs.push(log);
        } else if (prevEarlyLeaderId === null) {
          const log = `[序盤先頭] フェーズ${phase.index + 1}先頭 → ${leader.name}`;
          globalLogs.push(log);
          phaseEventLogs.push(log);
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
    const V_final     = horse.S_cruise * (horse.stamina > 0 ? 1.0 : 0.7);
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
