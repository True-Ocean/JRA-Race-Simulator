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
  SAFE_GOAL_EVENT_FATIGUE_WEIGHT,
  SAFE_GOAL_STAMINA_PER_M_REF,
  SAFE_GOAL_STAMINA_PER_M_RANGE,
  START_BURST_STAMINA_FREE_CAP,
  NIGE_PACE_EXTRA_DRAIN_FLOOR,
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
  PROACTIVE_LATE_SPREAD_INTENT_MIN,
  LATERAL_SHIFT_SOFT_CAP,
  LATERAL_SHIFT_HARD_CAP,
  LATERAL_SHIFT_THROUGH_C3_CAP,
  START_LATERAL_SHIFT_CAP,
  GOAL_MIN_SPEED_RATIO,
  GOAL_MAX_SPEED_RATIO,
  GOAL_POST_SCROLL_MS,
  GOAL_POST_CLEAR_METERS,
  RACE_SUMMARY_HEADER_LINE,
  RACE_SUMMARY_SCENE_LABELS,
  GOAL_PROGRESS_MAX_POST_LINE,
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
} from './constants.js';

function staminaAccelAbilityMult(staminaRatio) {
  const r = Math.max(0, Math.min(1, staminaRatio));
  if (r >= 0.35) return 1.0;
  // 0.35 -> 1.0, 0.00 -> 0.62
  return 0.62 + (r / 0.35) * 0.38;
}

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

/**
 * 第3コーナー終了直後のスタミナ残量に基づく「外を使える余力」0〜1。
 * コース定義で corner4 が無い場合は、現在のスタミナ比率で代替する。
 */
function getPostC3StaminaSpreadBudget(horse) {
  const initial = horse.initialStamina > 0 ? horse.initialStamina : 1;
  const ratioAfter = Number.isFinite(horse.staminaRatioAfterC3)
    ? horse.staminaRatioAfterC3
    : horse.stamina / initial;
  const span = Math.max(0.001, 0.92 - POST_C3_STAMINA_SPREAD_FLOOR);
  return Math.max(0, Math.min(1, (ratioAfter - POST_C3_STAMINA_SPREAD_FLOOR) / span));
}

/**
 * 第4コーナー以降: 第3コーナー後のスタミナと脚質を踏まえた外膨らみ意図（0〜1）。
 * それ以前のフェーズでは差し/追込の closer 意図のみ（従来どおり）。
 */
function getEffectiveOuterSpreadIntent(horse, phase, last3fMin, last3fMax, last3fSpan) {
  const rawCloser = getCloserOuterSpreadIntent(horse, last3fMin, last3fMax, last3fSpan);
  if (!isAfterFourthCornerPhase(phase)) return rawCloser;
  const budget = getPostC3StaminaSpreadBudget(horse);
  let intent = rawCloser;
  if (horse.style === '先行') {
    intent = Math.max(intent, 0.38 * budget);
  } else if (isNigeStyle(horse.style)) {
    intent = Math.max(intent, 0.10 * budget);
  }
  return Math.max(0, Math.min(1, intent * (0.22 + 0.78 * budget)));
}

/**
 * 第4コーナー: 遠心力・末脚・第3コーナー後スタミナに基づく外への準備意図（0〜1）。
 */
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

function isNigeStyle(style) {
  return style === '逃げ' || style === '大逃げ';
}

function isOonigeStyle(style) {
  return style === '大逃げ';
}

function getOonigePhaseDrainMult(phase) {
  return isAfterFourthCornerPhase(phase)
    ? OONIGE_PHASE_DRAIN_LATE_MULT
    : OONIGE_PHASE_DRAIN_EARLY_MULT;
}

/**
 * スタート〜第3コーナーにかけて大逃げの「伸び」を徐々に強める係数（約 0.48〜1.82）。
 * 1.0 超はシーン進行に応じた伸びの増幅として利用する。セグメント優先、無ければ ratio で近似。
 */
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

/** 最終直線相当フェーズに入るまで「キック予備」を温存する（脚質共通・早期ドレイン軽減の参照） */
function isKickReserveReleased(phase) {
  if (!phase) return true;
  if (phase.isFinal) return true;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  if (segmentId === 'final') return true;
  const label = String(phase.segmentLabel ?? '');
  if (label.includes('最終直線')) return true;
  return phase.ratio >= FINAL_STRAIGHT_RATIO;
}

function getJockeyReliabilityNorm(horse) {
  const value = Number.isFinite(horse?.J_reliability) ? horse.J_reliability : 50;
  return Math.max(0, Math.min(1, value / 100));
}

function getJockeyAggressionNorm(horse) {
  const value = Number.isFinite(horse?.J_aggression) ? horse.J_aggression : 50;
  return Math.max(0, Math.min(1, value / 100));
}

/** 脚質に依存しない終盤ポテンシャル（持久・末脚・その日の脚）。早期スタミナ消費にのみ効く */
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

/**
 * 逃げ系「ペースを広げる」extraDrain に掛ける倍率。
 * 前が詰まっている・バトル中は 1。楽に先頭でターゲット差以上なら低くする。
 */
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
  return NIGE_PACE_EXTRA_DRAIN_FLOOR + (1 - NIGE_PACE_EXTRA_DRAIN_FLOOR) * t;
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

function shouldAllowRiskyInnerDive(horse, phase, allHorses) {
  if (!horse || !phase || !Array.isArray(allHorses)) return false;
  if (!(phase.isFinal || isAfterFourthCornerPhase(phase))) return false;
  if (isNigeStyle(horse.style)) return false;

  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  const requiredStamina =
    (horse.style === '差し' || horse.style === '追込') ? 0.18 : 0.28;
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

// =====================
//  シミュレーション（全フェーズ一括計算）
// =====================
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
      const isLateStraight = phase.isFinal || phase.ratio >= FINAL_STRAIGHT_RATIO;
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
          const tunedDashDrain = USE_SAFE_STAMINA_MODEL
            ? 0
            : dashDrain;
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
          const linkedDrainMult = 1 + burstDelta * OONIGE_DRAIN_BURST_LINK_GAIN * 10;
          const pressureDrain = 1 + horse.oonigePressure * (isOonige ? 0.30 : 0.44) + Math.max(0, gapNeedNorm) * (isOonige ? 0.22 : 0.30);
          const extraDrain =
            (Math.max(0, phase.distance) / 100) *
            (isOonige
              ? (0.60 + oonigeBoost * 4.2 + (isLeading ? 0.24 : 0))
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
          const safeDrain = USE_SAFE_STAMINA_MODEL
            ? 0
            : tunedDrain;
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
        const lateStaminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
        const lateRisk = Math.max(0, Math.min(1, (0.62 - lateStaminaRatio) / 0.62));
        const leadLoad = Math.max(0, Math.min(1, leadGapLate / 28));
        const paceLoad = Math.max(0, (horse.oonigePressure ?? horse.frontRunDrive ?? 0) * 0.65 + leadLoad * 0.35);
        let lateDrain =
          (Math.max(0, phase.distance) / 100) *
          OONIGE_LATE_DRAIN_BASE_PER_100M *
          (1 + lateRisk * 1.55 + paceLoad * OONIGE_LATE_DRAIN_LEAD_GAIN);
        if (
          isLeading &&
          leadGapLate >= OONIGE_LATE_CLEAR_LEAD_GAP &&
          !phaseTrafficBattlePre &&
          !earlyFrontBlockedPre
        ) {
          lateDrain *= OONIGE_LATE_CLEAR_LEAD_MULT;
        }
        const safeLateDrain = USE_SAFE_STAMINA_MODEL
          ? 0
          : lateDrain;
        subtractStaminaWithReserve(horse, safeLateDrain, phase, {
          trackField: 'staminaAccelCost',
          fatigueGain: 0.36,
        });
        horse.oonigePressure = Math.max(0, (horse.oonigePressure ?? 0) * 0.82);
      }
      const currentFrontGap = getFrontGap(horse, clampLane(horse.y), horses);
      const frontBlocked = currentFrontGap < (collisionMetrics.minXGap + FINAL_FRONT_BLOCK_EXTRA_GAP);
      if ((horse.laneChangeCooldownPhases ?? 0) > 0) {
        horse.laneChangeCooldownPhases -= 1;
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
      if (isAfterFourthCorner) {
        horse.targetLane = calcPostFourthWideTargetLane(horse, horse.targetLane, phase, horses, last3fNorm);
      }
      if (isEarlyInnerBurst && horse.targetLane > horse.y) {
        horse.targetLane = horse.y;
      }
      const outerSpreadIntent = getEffectiveOuterSpreadIntent(
        horse,
        phase,
        last3fMin,
        last3fMax,
        last3fSpan,
      );
      const allowProactiveLateSpread =
        isLateStraight && !frontBlocked && outerSpreadIntent > PROACTIVE_LATE_SPREAD_INTENT_MIN;
      if (isLateStraight && !frontBlocked && !allowProactiveLateSpread) {
        horse.targetLane = horse.y;
      } else if ((horse.laneChangeCooldownPhases ?? 0) > 0) {
        horse.targetLane = horse.y;
      }
      const laneChangeRate = getLaneChangeRate(phase, horse, last3fNorm);
      const desiredY   = horse.y + (horse.targetLane - horse.y) * laneChangeRate;
      const prevLaneY = horse.y;
      const laneCheck  = resolveLaneMovement(
        rng,
        horse,
        desiredY,
        adjustedAdvance,
        horses,
        phase,
        {
          frontBlocked,
          isLateStraight,
          isStartPhase,
          isEarlyInnerBurst,
          collisionMetrics,
          allowProactiveLateSpread,
        },
        phaseEventLogs,
        globalLogs,
        engagedHorseIds,
      );
      horse.y          = laneCheck.nextY;
      if (isThroughThirdCorner) {
        horse.y = Math.min(horse.y, INNER_HALF_LANE_MAX);
      }
      if (laneCheck.advanceMult != null) {
        adjustedAdvance *= laneCheck.advanceMult;
      }
      if (Number.isFinite(laneCheck.xNudge) && laneCheck.xNudge > 0) {
        horse.x += laneCheck.xNudge;
      }
      const laneShift = Math.abs(horse.y - prevLaneY);
      if (laneShift > 0.001) {
        const laneDrain = laneShift * STAMINA_LANE_CHANGE_COST;
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
          1 - Math.min(0.06, laneShift * 0.18 * (1.35 - staminaRatioLate * 0.5));
        adjustedAdvance *= lateralFatigueMult;
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
          earlyMult;
        if (
          isNigeStyle(horse.style) &&
          isLeadingPre &&
          !earlyFrontBlockedPre &&
          !phaseTrafficBattlePre &&
          runnerUpPre
        ) {
          const gapComfort = Math.max(0, Math.min(1, secondGapPre / 14));
          const accelLeadEase = 0.38 + 0.62 * (1 - gapComfort);
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

  if (snapshots.length > 0) {
    const lastEventLogs = snapshots[snapshots.length - 1].eventLogs;
    const phaseLabelForSummary = (phase) => {
      if (phase?.segmentLabel) return String(phase.segmentLabel);
      if (phase?.isFinal) return '最終直線';
      if (phase?.index === 0) return 'スタート';
      if (phase?.isCorner) {
        const r = Number.isFinite(phase?.ratio) ? phase.ratio : 0;
        if (r < 0.3) return '第1コーナー';
        if (r < 0.5) return '第2コーナー';
        if (r < 0.7) return '第3コーナー';
        return '第4コーナー';
      }
      const r = Number.isFinite(phase?.ratio) ? phase.ratio : 0;
      if (r < 0.2) return 'スタート〜1コーナー手前';
      if (r < 0.45) return '向正面';
      if (r < 0.65) return '3〜4コーナー中間';
      return '4コーナー〜直線';
    };

    lastEventLogs.push(RACE_SUMMARY_HEADER_LINE);
    for (let i = 0; i < Math.min(phases.length, snapshots.length); i++) {
      const phase = phases[i];
      const snap = snapshots[i];
      const label = phaseLabelForSummary(phase);
      const top3 = [...(snap?.horses ?? [])]
        .sort((a, b) => (b.x ?? 0) - (a.x ?? 0))
        .slice(0, 3)
        .map(h => h?.name ?? `ID:${h?.id ?? '?'}`);
      if (top3.length === 0) continue;
      const parts = top3.map((name, idx) => `${idx + 1} ${name}`);
      lastEventLogs.push(`${label}: ${parts.join(' / ')}`);
    }
  }

  return { results, logs: globalLogs, snapshots, phases };
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
  // 序盤でも接触回避の判定を緩めない。
  const allowBurstShortCircuit = false;
  const collisionMetrics = context?.collisionMetrics ?? null;
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
    : isLateStraight
      ? LATERAL_SHIFT_HARD_CAP
      : isThroughC3
        ? LATERAL_SHIFT_THROUGH_C3_CAP
        : LATERAL_SHIFT_SOFT_CAP;
  const speedPenalty = Math.max(0, Math.min(0.5, (speedRatio - 0.85) * 0.55));
  const frontBlockBoost = frontBlocked ? 1.30 : 1.0;
  const maxDelta = capBase * (1 - speedPenalty) * frontBlockBoost;
  const limitedDelta = Math.sign(desiredDelta) * Math.min(absDesiredDelta, Math.max(0.10, maxDelta));
  const limitedY = clampLane(baseY + limitedDelta);

  const allowProactiveLateStraight = Boolean(context?.allowProactiveLateSpread);
  if (isLateStraight && !frontBlocked && !allowProactiveLateStraight) {
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
        shouldBattle(rng, allHorses, horse, diagonalRearHorse)) {
      const result = resolveBattle(rng, horse, diagonalRearHorse, phase);
      applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
      const log = `[バトル:斜め後方割り込み] ${horse.name} が ${diagonalRearHorse.name} の前へ進出 → 勝者: ${result.winner.name}`;
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
      shouldBattle(rng, allHorses, horse, laneBlocker);
    if (canBattle) {
      const result = resolveWeightedBattle(rng, horse, laneBlocker, {
        cruise: 0.22,
        maneuv: 0.42,
        sustain: 0.20,
        stamina: 0.16,
      }, h => (isNigeStyle(h.style) || h.style === '先行') ? 2 : 0, {
        impactOptions: {
          loserAlreadyPenalized: true,
          winnerMult: INNER_CUTIN_WINNER_STAMINA_MULT,
          loserMult: INNER_CUTIN_LOSER_STAMINA_MULT,
        },
      });
      markInnerCutInBattlePair(horse, laneBlocker, phase);
      engagedHorseIds.add(horse.id);
      engagedHorseIds.add(laneBlocker.id);
      const log = `[バトル:内前争い] ${horse.name} が ${laneBlocker.name} の前を取りに行く → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
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
      shouldBattle(rng, allHorses, horse, laneBlocker)) {
    const result = resolveBattle(rng, horse, laneBlocker, phase);
    applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
    const log = `[バトル:進路争い] ${horse.name} が ${laneBlocker.name} に進路争い → 勝者: ${result.winner.name}`;
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

/** 内へシフト時: 自分よりレーンが内側で、真後ろ〜斜め内後ろの帯にいる馬だけを危険とする（同レーン直後ろは除外） */
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

/** 外へシフト時: 外側の斜め後ろ（対称） */
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

function isLaneInShiftPath(lane, fromLane, toLane, margin = 0.9) {
  const laneMin = Math.min(fromLane, toLane) - margin;
  const laneMax = Math.max(fromLane, toLane) + margin;
  return lane >= laneMin && lane <= laneMax;
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

function resolveForwardMovement(rng, horse, desiredAdvance, allHorses, minForwardGap, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  const nextX = horse.x + desiredAdvance;
  const frontCandidates = allHorses
    .filter(h =>
      h.id !== horse.id &&
      h.x > horse.x &&
      Math.abs(h.y - horse.y) < 0.8
    )
    .sort((a, b) => a.x - b.x);

  const front = frontCandidates[0];
  if (!front) {
    return { advance: desiredAdvance };
  }

  const requiredGap = getRequiredXGap(front, horse, minForwardGap, phase);
  const currentGap = front.x - horse.x;
  const maxAdvanceWithoutContact = Math.max(0, currentGap - requiredGap);
  if (desiredAdvance <= maxAdvanceWithoutContact) {
    return { advance: desiredAdvance };
  }

  const wantsOvertake = nextX > front.x - requiredGap;
  if (wantsOvertake &&
      !engagedHorseIds.has(horse.id) && !engagedHorseIds.has(front.id) &&
      shouldBattle(rng, allHorses, horse, front)) {
    const result = resolveBattle(rng, horse, front, phase);
    applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
    const laneGap = Math.abs(front.y - horse.y).toFixed(2);
    const frontGap = Math.max(0, front.x - horse.x).toFixed(1);
    const log = `[バトル:同レーン争い] ${horse.name} が ${front.name} を交わしに行く (前方差:${frontGap}, レーン差:${laneGap}) → 勝者: ${result.winner.name}`;
    globalLogs.push(log);
    phaseEventLogs.push(log);
    engagedHorseIds.add(horse.id);
    engagedHorseIds.add(front.id);
    if (result.winner.id === horse.id) {
      return { advance: desiredAdvance };
    }
  }

  let advance = maxAdvanceWithoutContact;
  if (isThroughThirdCornerPhase(phase) && desiredAdvance > maxAdvanceWithoutContact + 0.01) {
    advance *= 0.94;
  }
  return { advance };
}

function clampLane(v) {
  return Math.max(1, Math.min(LANE_WIDTH, v));
}

function getPhaseBufferMultiplier(phase) {
  if (!phase) return 1.0;
  if (isStartToHomePhase(phase) && phase.index > 0) return 1.15;
  if (isThroughThirdCornerPhase(phase)) return 1.0;
  if (isAfterFourthCornerPhase(phase)) return 0.9;
  return 1.0;
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

// =====================
//  レーン移動AI（8レーン対応）
// =====================
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

function calcPostFourthWideTargetLane(horse, baseTargetLane, phase, allHorses, last3fNorm = null) {
  const currentLane = clampLane(horse.y);
  const baseTarget = clampLane(baseTargetLane);
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  let outerSpreadIntent = 0;
  if (last3fNorm && Number.isFinite(last3fNorm.min) && Number.isFinite(last3fNorm.max)) {
    outerSpreadIntent = getEffectiveOuterSpreadIntent(
      horse,
      phase,
      last3fNorm.min,
      last3fNorm.max,
      last3fNorm.span,
    );
  }
  const candidates = [
    baseTarget,
    currentLane,
    currentLane + 1,
    currentLane - 1,
    currentLane + 2,
    currentLane - 2,
    currentLane + 3,
    currentLane - 3,
    currentLane + 4,
    currentLane - 4,
  ]
    .map(v => clampLane(v))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  let bestLane = baseTarget;
  let bestScore = -Infinity;
  for (const lane of candidates) {
    const frontGap = getFrontGap(horse, lane, allHorses);
    const density = allHorses.filter(h =>
      h.id !== horse.id &&
      Math.abs(h.x - horse.x) < 26 &&
      Math.abs(h.y - lane) < 0.92
    ).length;
    const staminaDiscountOnOuterMove = Math.max(0.15, staminaRatio) * 0.8;
    const moveCost = Math.abs(lane - currentLane) * 1.05 * (2.0 - staminaDiscountOnOuterMove);
    const outsideBias = lane * (0.55 + outerSpreadIntent * 1.1);
    const openLaneBonus = frontGap > MIN_FORWARD_GAP + 10 ? 6.2 : 0;
    const closerPrepBonus = outerSpreadIntent * 4.0;
    const score = Math.min(frontGap, 92) * 1.08 - density * 4.7 - moveCost + outsideBias + openLaneBonus
      + closerPrepBonus;
    if (score > bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }

  return bestLane;
}

function resolveLeadBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (phase.ratio > LEAD_BATTLE_PHASE_MAX) return;
  const sorted = [...horses].sort((a, b) => b.x - a.x);
  if (sorted.length < 2) return;
  const leadX = sorted[0].x;
  const leadPack = sorted.filter(h =>
    (leadX - h.x) <= 26 &&
    (isNigeStyle(h.style) || h.style === '先行') &&
    !engagedHorseIds.has(h.id)
  );
  if (leadPack.length < 2) return;

  let pair = null;
  for (let i = 0; i < leadPack.length; i++) {
    for (let j = i + 1; j < leadPack.length; j++) {
      if (Math.abs(leadPack[i].y - leadPack[j].y) < 1.4) {
        pair = [leadPack[i], leadPack[j]];
        break;
      }
    }
    if (pair) break;
  }
  if (!pair) return;
  const [a, b] = pair;
  if (!shouldBattle(rng, horses, a, b)) return;

  const result = resolveWeightedBattle(rng, a, b, {
    cruise: 0.45,
    maneuv: 0.35,
    sustain: 0.05,
    stamina: 0.15,
  });
  const log = `[バトル:先頭争い] ${a.name} vs ${b.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
  phaseEventLogs.push(log);
  globalLogs.push(log);
  engagedHorseIds.add(a.id);
  engagedHorseIds.add(b.id);
}

function resolveCornerPositionBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (!phase.isCorner) return;

  const candidates = horses
    .filter(h => !engagedHorseIds.has(h.id))
    .map(h => ({ horse: h, desired: getPreferredLaneByStyle(h, phase) }))
    .filter(item => item.desired < item.horse.y - 0.35)
    .sort((a, b) => b.horse.x - a.horse.x);

  for (const item of candidates) {
    const a = item.horse;
    const blocker = horses.find(h =>
      h.id !== a.id &&
      !engagedHorseIds.has(h.id) &&
      h.y < a.y &&
      (a.y - h.y) < 1.25 &&
      Math.abs(h.x - a.x) < 24
    );
    if (!blocker) continue;
    if (!shouldBattle(rng, horses, a, blocker)) continue;

    const result = resolveWeightedBattle(rng, a, blocker, {
      cruise: 0.20,
      maneuv: 0.55,
      sustain: 0.05,
      stamina: 0.20,
    });
    const log = `[バトル:コーナー争い] ${a.name} vs ${blocker.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
    phaseEventLogs.push(log);
    globalLogs.push(log);
    engagedHorseIds.add(a.id);
    engagedHorseIds.add(blocker.id);
    return;
  }
}

function resolveFinalStraightDuel(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (!(phase.isFinal || phase.ratio >= FINAL_DUEL_PHASE_MIN)) return;

  const sorted = [...horses].sort((a, b) => b.x - a.x);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (engagedHorseIds.has(a.id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (engagedHorseIds.has(b.id)) continue;
      if (Math.abs(a.x - b.x) > 18) continue;
      if (Math.abs(a.y - b.y) > 1.6) continue;
      if (!shouldBattle(rng, horses, a, b)) continue;

      const result = resolveWeightedBattle(rng, a, b, {
        cruise: 0.30,
        maneuv: 0.15,
        sustain: 0.45,
        stamina: 0.10,
      }, horse => (horse.style === '差し' || horse.style === '追込') ? 4 : 0);
      const log = `[バトル:直線争い] ${a.name} vs ${b.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
      phaseEventLogs.push(log);
      globalLogs.push(log);
      engagedHorseIds.add(a.id);
      engagedHorseIds.add(b.id);
      return;
    }
  }
}

function resolveWeightedBattle(rng, a, b, weights, styleBonusFn = () => 0, options = {}) {
  const eA = battleScore(rng, a, weights, styleBonusFn);
  const eB = battleScore(rng, b, weights, styleBonusFn);
  const winner = eA > eB ? a : b;
  const loser  = eA > eB ? b : a;
  const penaltyRecovery = getJockeyReliabilityNorm(loser) * 0.24;
  loser.battlePenalty = CONFIG.BATTLE_PENALTY + (1 - CONFIG.BATTLE_PENALTY) * penaltyRecovery;
  loser.battleLosses += 1;
  const impactOptions = options?.impactOptions ?? { loserAlreadyPenalized: false };
  if (options?.skipStaminaImpact !== true) {
    applyBattleStaminaImpact(winner, loser, impactOptions);
  }
  return {
    winner,
    loser,
    eA: Math.round(eA * 10) / 10,
    eB: Math.round(eB * 10) / 10,
  };
}

function applyBattleStaminaImpact(winner, loser, options = {}) {
  const loserAlreadyPenalized = Boolean(options.loserAlreadyPenalized);
  const winnerMult = Number.isFinite(options.winnerMult) ? options.winnerMult : 1.0;
  const loserMult = Number.isFinite(options.loserMult) ? options.loserMult : 1.0;
  const winnerReliabilityGuard = 1.03 - getJockeyReliabilityNorm(winner) * 0.14;
  const loserReliabilityGuard = 1.08 - getJockeyReliabilityNorm(loser) * 0.26;
  const winnerDrain = STAMINA_BATTLE_BASE_COST * winnerMult * winnerReliabilityGuard;
  const loserExtraDrainBase = loserAlreadyPenalized
    ? Math.max(0, STAMINA_BATTLE_LOSER_EXTRA - CONFIG.BATTLE_STAMINA_COST * 0.55)
    : STAMINA_BATTLE_LOSER_EXTRA;
  const loserExtraDrain = loserExtraDrainBase * loserMult * loserReliabilityGuard;

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

function isInnerCutInContestScenario(horse, laneBlocker, baseY, targetY, desiredAdvance, minXGap) {
  if (!laneBlocker) return false;
  const inwardDelta = baseY - targetY;
  if (inwardDelta < INNER_CUTIN_MIN_INWARD_DELTA) return false;
  // 「内側馬の前をかすめる」ケースのみ対象（内側で近い位置）
  if (laneBlocker.y > baseY - 0.04) return false;
  if (laneBlocker.y < targetY - 0.38) return false;
  const dx = laneBlocker.x - horse.x;
  const nearXBand = minXGap * 0.95;
  if (dx < -nearXBand || dx > nearXBand) return false;
  const projectedX = horse.x + Math.max(0, desiredAdvance) * 0.6;
  return projectedX > laneBlocker.x - minXGap * 0.35;
}

function canTriggerInnerCutInBattle(horse, laneBlocker, phase) {
  if (!horse || !laneBlocker || !phase) return false;
  if ((horse.innerCutInCooldownPhases ?? 0) > 0) return false;
  if ((laneBlocker.innerCutInCooldownPhases ?? 0) > 0) return false;
  const sameOpponentRecently =
    horse.lastInnerCutInOpponentId === laneBlocker.id &&
    (phase.index - (horse.lastInnerCutInPhase ?? -999)) <= INNER_CUTIN_REMATCH_COOLDOWN_PHASES;
  if (sameOpponentRecently) return false;
  return true;
}

function markInnerCutInBattlePair(a, b, phase) {
  if (!a || !b || !phase) return;
  a.innerCutInCooldownPhases = Math.max(a.innerCutInCooldownPhases ?? 0, INNER_CUTIN_BATTLE_COOLDOWN_PHASES);
  b.innerCutInCooldownPhases = Math.max(b.innerCutInCooldownPhases ?? 0, INNER_CUTIN_BATTLE_COOLDOWN_PHASES);
  a.lastInnerCutInOpponentId = b.id;
  b.lastInnerCutInOpponentId = a.id;
  a.lastInnerCutInPhase = phase.index;
  b.lastInnerCutInPhase = phase.index;
}

function battleScore(rng, horse, weights, styleBonusFn) {
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  return (
    horse.S_cruise * weights.cruise +
    horse.M_maneuv * weights.maneuv +
    horse.S_sustain * weights.sustain +
    (staminaRatio * 100) * weights.stamina +
    styleBonusFn(horse) +
    (rng() * 10 - 5)
  );
}

function getPreferredLaneByStyle(horse, phase) {
  const r = phase.ratio;
  const style = horse.style;
  // 第3コーナーまで: 脚質に関わらず最内を志向（脚質差は前後ポジションでのみ反映）
  if (isThroughThirdCornerPhase(phase)) {
    if (isNigeStyle(style)) return 1.0;
    if (style === '先行') return 1.05;
    if (style === '差し') return 1.15;
    if (style === '追込') return 1.20;
    return 1.10;
  }
  let pref;
  if (isOonigeStyle(style)) pref = r < 0.80 ? 1.45 : 2.4;
  else if (isNigeStyle(style)) pref = r < 0.80 ? 1.6 : 2.5;
  else if (style === '先行') pref = r < 0.80 ? 2.8 : 3.6;
  else if (style === '差し') pref = r < 0.60 ? 4.8 : (r < 0.80 ? 4.2 : 5.2);
  else if (style === '追込') pref = r < 0.60 ? 5.8 : (r < 0.80 ? 4.8 : 6.0);
  else pref = 3.8;

  if (isFourthCornerPhase(phase)) {
    const budget = getPostC3StaminaSpreadBudget(horse);
    if (budget > 0.02) {
      const styleWt =
        style === '差し' || style === '追込'
          ? 2.15
          : style === '先行'
            ? 1.48
            : isNigeStyle(style)
              ? 0.52
              : 0.68;
      pref += budget * styleWt;
    }
  }
  return pref;
}

function getLaneChangeRate(phase, horse = null, last3fNorm = null) {
  // スタート〜ホーム直線は一気に内へ寄せて隊列を作る
  if (isStartToHomePhase(phase)) return 0.98;
  if (phase.ratio < FORMATION_LOCK_PHASE) return 0.55;
  if (isThroughThirdCornerPhase(phase) && phase.ratio < 0.80) return 0.55;
  if (isFourthCornerPhase(phase) && horse) {
    const intent = getFourthCornerOutwardIntent(horse, phase, last3fNorm);
    if (intent > 0.38) return 0.46;
    if (intent > 0.22) return 0.36;
    return 0.26;
  }
  if (
    horse &&
    last3fNorm &&
    Number.isFinite(last3fNorm.min) &&
    Number.isFinite(last3fNorm.max) &&
    isAfterFourthCornerPhase(phase) &&
    !phase.isFinal &&
    phase.ratio < 0.80
  ) {
    const intent = getEffectiveOuterSpreadIntent(
      horse,
      phase,
      last3fNorm.min,
      last3fNorm.max,
      last3fNorm.span,
    );
    if (intent > 0.25) return 0.36;
    return 0.22;
  }
  if (phase.ratio < 0.80) return 0.12;
  return 0.20;
}

function getPhaseLaneBand(phase) {
  // 第3コーナーまで: 内半分まで段階的に寄せられるよう帯を INNER_HALF と揃える
  if (isThroughThirdCornerPhase(phase)) return [1, INNER_HALF_LANE_MAX];
  if (isAfterFourthCornerPhase(phase)) return [1, LANE_WIDTH];
  if (phase.ratio < 0.80) return [1, 7];
  if (phase.ratio < 0.92) return [1, 10];
  return [1, LANE_WIDTH];
}

function isBeforeFirstCornerPhase(phase) {
  if (!phase || phase.isCorner || phase.isFinal) return false;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  const segmentLabel = String(phase.segmentLabel ?? '');
  if (segmentId === 'start' || segmentId === 'home') return true;
  if (segmentLabel.includes('スタート') || segmentLabel.includes('ホーム直線')) return true;
  return phase.ratio < PRE_CORNER_PACK_PHASE_MAX;
}

function isStartToHomePhase(phase) {
  if (!phase || phase.isFinal) return false;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  const segmentLabel = String(phase.segmentLabel ?? '');
  if (segmentId === 'start' || segmentId === 'home') return true;
  if (segmentLabel.includes('スタート') || segmentLabel.includes('ホーム直線')) return true;
  return !phase.isCorner && phase.ratio < PRE_CORNER_PACK_PHASE_MAX;
}

/** 第3コーナー終了まで（向正面〜第3コーナー、スタート・ホーム含む）。第4コーナー手前の向正面は含めない。 */
function isThroughThirdCornerPhase(phase) {
  if (!phase || phase.isFinal) return false;
  const cornerNo = Number.isFinite(phase.cornerNo) ? phase.cornerNo : null;
  if (cornerNo != null) return cornerNo <= 3;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  if (segmentId === 'corner4' || segmentId === 'final') return false;
  if (
    segmentId === 'start' ||
    segmentId === 'home' ||
    segmentId === 'corner1' ||
    segmentId === 'corner2' ||
    segmentId === 'corner3' ||
    segmentId === 'back'
  ) {
    return true;
  }
  const segmentLabel = String(phase.segmentLabel ?? '');
  if (segmentLabel.includes('第4コーナー') || segmentLabel.includes('最終直線')) return false;
  if (segmentLabel.includes('スタート') || segmentLabel.includes('ホーム直線') || segmentLabel.includes('向正面')) {
    return true;
  }
  if (
    segmentLabel.includes('第1コーナー') ||
    segmentLabel.includes('第2コーナー') ||
    segmentLabel.includes('第3コーナー')
  ) {
    return true;
  }
  return phase.ratio < 0.75;
}

function isAfterFourthCornerPhase(phase) {
  if (!phase) return false;
  if (phase.isFinal) return true;
  const cornerNo = Number.isFinite(phase.cornerNo) ? phase.cornerNo : null;
  if (cornerNo != null) return cornerNo >= 4;
  return phase.ratio >= FINAL_STRAIGHT_RATIO;
}

/** 最終直線への取り回しを含めた「最後のコーナー」のみ true（最終直線フェーズは含めない） */
function isFourthCornerPhase(phase) {
  if (!phase || phase.isFinal) return false;
  const cornerNo = Number.isFinite(phase.cornerNo) ? phase.cornerNo : null;
  if (cornerNo === 4) return true;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  const label = String(phase.segmentLabel ?? '');
  return segmentId === 'corner4' || label.includes('第4コーナー');
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

  if (c4) {
    const outward = getFourthCornerOutwardIntent(horse, phase, last3fNorm);
    score += lane * outward * 1.42;
    const innerCrowd = allHorses.filter(h =>
      h.id !== horse.id &&
      Math.abs(h.x - horse.x) < 30 &&
      clampLane(h.y) <= clampLane(currentLane) + 0.45
    ).length;
    if (innerCrowd >= 2 && lane > currentLane - 0.05) {
      score += (lane - currentLane) * outward * 3.1;
    }
    if (frontGap < MIN_FORWARD_GAP + 10 && lane > currentLane) {
      score += (lane - currentLane) * outward * 3.8;
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
  if ((horse.style === '差し' || horse.style === '追込') && phase.ratio >= 0.80) {
    score -= lane * 0.35;
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
  if ((phase.isFinal || phase.ratio >= FINAL_STRAIGHT_RATIO) && frontGap > MIN_FORWARD_GAP + 10) {
    let prepContinue = 0;
    if (last3fNorm && Number.isFinite(last3fNorm.min) && Number.isFinite(last3fNorm.max)) {
      prepContinue = getEffectiveOuterSpreadIntent(
        horse,
        phase,
        last3fNorm.min,
        last3fNorm.max,
        last3fNorm.span,
      );
    } else {
      prepContinue = getPostC3StaminaSpreadBudget(horse) * 0.62;
    }
    const penaltyWt = 4.2 * Math.max(0.28, 1.0 - prepContinue * 0.52);
    score -= Math.abs(lane - currentLane) * penaltyWt;
  }
  return score;
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

/** (cx,cy) を中心に minXGap×minYGap の占有矩形とみなしたとき h と重なるか */
function horseFootprintsOverlapAt(cx, cy, h, minXGap, minYGap) {
  return Math.abs(h.x - cx) < minXGap && Math.abs(h.y - cy) < minYGap;
}

/**
 * 横移動して targetLane に着いたとき、経路上に他馬の「占有」がないか。
 * 第3コーナーまでは getCollisionMetrics の矩形判定のみ（縦隊が経路帯で一律ブロックされないようにする）。
 */
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

/**
 * 内側に「前後の馬の隙間（slot）」がある最内レーンを探す。
 * 自分より内側（lane が小さい側）の各候補レーンで、
 *   - 前方の最も近い馬まで minXGap 以上
 *   - 後方の最も近い馬まで minXGap 以上
 *   - 横移動先で他馬の占有矩形と重ならない（第3コーナーまでは isLaneOpenForShift）
 * の3条件を満たす最内のレーンを返す。なければ null。
 */
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

export {
  clampLane,
  applyBattleStaminaImpact,
  isNigeStyle,
  getJockeyReliabilityNorm,
  getJockeyAggressionNorm,
  isLaneInShiftPath,
};
