import { createRng }      from './src/engine/rng.js';
import { calcAllParams, calcWaku } from './src/engine/params.js';
import { buildPhases, calcStaminaCons, applyCornerLoss, laneIndex, getStylePaceMultiplier }
                          from './src/engine/phase.js';
import { detectContacts, shouldBattle, resolveBattle }
                          from './src/engine/battle.js';
import { CONFIG }         from './src/config.js';
import { Renderer }       from './src/ui/renderer.js';
import {
  addAggregateRun,
  clearAggregateState,
  computeBucketKey,
  loadAggregateState,
  persistRaceBundleToSession,
  SESSION_KEY_OPEN_SCREEN,
  SESSION_KEY_OPEN_SIMULATOR,
  SESSION_KEY_SIMULATOR_STATE,
  SESSION_KEY_STATS_RETURN_SCREEN,
  SESSION_KEY_SUMMARY_STATE,
} from './src/stats/aggregate-store.js';
import { formatRaceInfo, resolveCourseDef } from './src/stats/race-display.js';

// JRA枠色（枠番1〜8）
const JRA_WAKU_COLORS = {
  1: { bg: '#FFFFFF', text: '#000000', label: '1枠' },
  2: { bg: '#000000', text: '#FFFFFF', label: '2枠' },
  3: { bg: '#FF0000', text: '#FFFFFF', label: '3枠' },
  4: { bg: '#0000FF', text: '#FFFFFF', label: '4枠' },
  5: { bg: '#FFFF00', text: '#000000', label: '5枠' },
  6: { bg: '#008000', text: '#FFFFFF', label: '6枠' },
  7: { bg: '#FF6600', text: '#FFFFFF', label: '7枠' },
  8: { bg: '#FF5FA2', text: '#000000', label: '8枠' },
};

const MIN_FORWARD_GAP = 38;
const LATERAL_BLOCK_X_GAP = 42;
const LATERAL_BLOCK_LANE_GAP = 1.15;
const DIAGONAL_REAR_BLOCK_X_GAP = 30;
const DIAGONAL_REAR_BLOCK_LANE_GAP = 1.05;
// 斜め後ろ判定の帯: isLaneInShiftPath 全体幅だと「同レーンの真後ろ」まで巻き込むため狭める
const DIAGONAL_REAR_INNER_BAND_OUTER_EPS = 0.16;
const DIAGONAL_REAR_INNER_BAND_INNER_MARGIN = 0.48;
const LANE_WIDTH = CONFIG.LANE_COUNT;
const INNER_HALF_LANE_MAX = Math.max(1, Math.floor(LANE_WIDTH * 0.5));
const LEAD_BATTLE_PHASE_MAX = 0.35;
const EARLY_LEAD_RATIO_MAX = 0.35;
const FINAL_DUEL_PHASE_MIN = 0.80;
const FORMATION_LOCK_PHASE = 0.40;
const PRE_CORNER_PACK_PHASE_MAX = 0.28;
const COLLISION_MIN_Y_GAP = 0.9;
const COLLISION_ITERATIONS = 3;
const COLLISION_ITERATIONS_EARLY = 7;
const COLLISION_EPS = 0.001;
const START_DELAY_BASE_RATE = 0.022;
const STUMBLE_BASE_RATE = 0.008;
const STUMBLE_PHASE_MAX = 0.55;
const EARLY_TROUBLE_DECAY_PER_100M = 0.88;
const EARLY_ORDER_TIE_NOISE = 1.2;
const EARLY_OUTER_NIGE_START_RATIO = 0.60;
const EARLY_OUTER_NIGE_ADV_GAIN_MAX = 0.18;
const EARLY_OUTER_NIGE_DRAIN_PER_100M = 0.45;
/** スタートフェーズのみ: STYLE_PACE 先頭バケットを 1.0 へ寄せる（逃げ・大逃げの一気離れ抑制） */
const START_PHASE_NIGE_PACE_BLEND = 0.58;
/** スタートフェーズのみ: 理想ギャップ追い込み（gapCatchBoost）に掛ける係数 */
const START_PHASE_GAP_CATCH_SCALE = 0.22;
/** スタートフェーズのみ: 外ライン逃げダッシュの強さ */
const START_PHASE_OUTER_NIGE_SCALE = 0.52;
const OONIGE_BURST_ROLL_MIN = 0.92;
const OONIGE_BURST_ROLL_MAX = 1.12;
const OONIGE_BURST_PHASE_JITTER_MIN = 0.97;
const OONIGE_BURST_PHASE_JITTER_MAX = 1.03;
const OONIGE_DRAIN_BURST_LINK_GAIN = 1.4;
const OONIGE_PHASE_DRAIN_EARLY_MULT = 0.88;
const OONIGE_PHASE_DRAIN_LATE_MULT = 1.10;
const FRONTRUN_ROLL_MIN = 0.94;
const FRONTRUN_ROLL_MAX = 1.10;
const OONIGE_LATE_DRAIN_BASE_PER_100M = 1.24;
const OONIGE_LATE_DRAIN_LEAD_GAIN = 1.08;
/** 安全策: 新スタミナモデル（イベント主導 + 距離微小消費）を段階導入 */
const USE_SAFE_STAMINA_MODEL = true;
/** 新モデル: 距離起因の微小消費（1m あたり） */
const SAFE_BASE_STAMINA_PER_M = 0.0038;
/** 新モデル: 進路変更イベント消費倍率 */
const SAFE_LANE_EVENT_DRAIN_MULT = 0.45;
/** 新モデル: コーナー外回しイベント消費倍率 */
const SAFE_CORNER_EVENT_DRAIN_MULT = 0.35;
/** 新モデル: 余剰加速イベント消費倍率 */
const SAFE_ACCEL_EVENT_DRAIN_MULT = 0.62;
/** 新モデル: 終盤でイベント疲労を速度へ反映する重み */
const SAFE_GOAL_EVENT_FATIGUE_WEIGHT = 0.42;
/** 新モデル: 終盤の stamina/m 正規化基準 */
const SAFE_GOAL_STAMINA_PER_M_REF = 0.030;
const SAFE_GOAL_STAMINA_PER_M_RANGE = 0.090;
/** スタート初速のうちこの倍率までは能力域とみなし、accel スタミナは超過分のみ課金 */
const START_BURST_STAMINA_FREE_CAP = 1.14;
/** 逃げ・大逃げの「ペース拡大」追加ドレイン: 楽先頭・クリア時の下限（1=従来同等） */
const NIGE_PACE_EXTRA_DRAIN_FLOOR = 0.34;
/** 外ラチ逃げダッシュ: 先頭で十分離れているときのドレイン倍率 */
const NIGE_OUTER_DASH_CLEAR_LEAD_MULT = 0.58;
/** 4角以降大逃げ: 楽に先頭をキープしているときの late ドレイン倍率 */
const OONIGE_LATE_CLEAR_LEAD_MULT = 0.62;
const OONIGE_LATE_CLEAR_LEAD_GAP = 20;
// ゴールシーンは「ゴールラインから 200m 手前〜ゴール」が画面に収まるイメージ。
// last_3f（最終3ハロン≈600m の通過秒）から intrinsic 速度を出し、スタミナ残量で毎フレーム上限を締める。
const GOAL_FURLONG_METERS = 200;
const GOAL_TIME_SCALE = 1.0;
const GOAL_DISTANCE_METERS = GOAL_FURLONG_METERS;
const GOAL_LAST3F_DISTANCE_M = 600;
const GOAL_LAST3F_SEC_CLAMP_MIN = 27;
const GOAL_LAST3F_SEC_CLAMP_MAX = 41;
const GOAL_LAST3F_FALLBACK_SEC = 33.5;

function goalIntrinsicMpsFromLast3f(last3fSec) {
  const s = Number.isFinite(last3fSec)
    ? Math.max(GOAL_LAST3F_SEC_CLAMP_MIN, Math.min(GOAL_LAST3F_SEC_CLAMP_MAX, last3fSec))
    : GOAL_LAST3F_FALLBACK_SEC;
  return GOAL_LAST3F_DISTANCE_M / s;
}

/** スタミナ残量だけでスピード上限を掛ける（last_3f とは独立に毎フレーム変化） */
function goalStaminaSpeedMult(staminaRatio) {
  const r = Math.max(0, Math.min(1, staminaRatio));
  // スタミナが残っている間は last_3f 由来の能力を素直に出し、
  // ほぼ枯渇した時だけ速度低下を入れる（速度への二重計上を避ける）。
  if (r >= 0.08) return 1.0;
  return 0.84 + (r / 0.08) * 0.16;
}

/** スタミナ低下の影響は「加速の乗りにくさ」として扱う（最高速への直接減衰は避ける）。 */
function staminaAccelAbilityMult(staminaRatio) {
  const r = Math.max(0, Math.min(1, staminaRatio));
  if (r >= 0.35) return 1.0;
  // 0.35 -> 1.0, 0.00 -> 0.62
  return 0.62 + (r / 0.35) * 0.38;
}

function normalize01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

const GOAL_X_PER_METER = 0.28;
const GOAL_LANE_CHANGE_PER_SEC = 4.2;
const GOAL_BLOCK_X_GAP = 10;
/** ゴールシーン同一レーン内で後方馬の x が前馬に食い込まないよう保つ最小間隔（シミュ x 単位） */
const GOAL_MIN_PACK_GAP_X = GOAL_BLOCK_X_GAP * 0.9;
const GOAL_NEAR_LANE_GAP_BASE = 0.95;
const GOAL_NEAR_LANE_GAP_MAX = 1.26;
const GOAL_LANE_CHANGE_COOLDOWN_MS = 520;
const FINAL_LANE_CHANGE_COOLDOWN_PHASES = 2;
const FINAL_FRONT_BLOCK_EXTRA_GAP = 6;
const FINAL_STRAIGHT_RATIO = 0.80;
/** 第3コーナー終了時点（第4コーナー開始フェーズ）のスタミナ比率がこれ未満だと外への先回り意欲を大きく抑える */
const POST_C3_STAMINA_SPREAD_FLOOR = 0.34;
/** 最終直線で前が空いていても横に振れると判断する外膨らみ意図の下限（getEffectiveOuterSpreadIntent） */
const PROACTIVE_LATE_SPREAD_INTENT_MIN = 0.24;
const LATERAL_SHIFT_SOFT_CAP = 0.42;
const LATERAL_SHIFT_HARD_CAP = 0.26;
// 第3コーナーまでは積極的な内寄せを許容するため横移動上限を緩める
const LATERAL_SHIFT_THROUGH_C3_CAP = 0.75;
const START_LATERAL_SHIFT_CAP = 2.40;
const GOAL_MIN_SPEED_RATIO = 0.58;
const GOAL_MAX_SPEED_RATIO = 1.95;
const GOAL_POST_SCROLL_MS = 700;
const GOAL_POST_CLEAR_METERS = GOAL_FURLONG_METERS * 1.25;
const RACE_SUMMARY_HEADER_LINE = 'ここまでのレースサマリ';
const RACE_SUMMARY_SCENE_LABELS = new Set([
  'スタート',
  'ホーム直線',
  '第1コーナー',
  '第2コーナー',
  '向正面',
  '第3コーナー',
  '第4コーナー',
  '最終直線',
  'スタート〜1コーナー手前',
  '3〜4コーナー中間',
  '4コーナー〜直線',
]);
// ゴールシーン progress の上限（画面外まで抜ける余地）
const GOAL_PROGRESS_MAX_POST_LINE = 1.78;
// ゴールシーン開始時、先頭馬は画面下辺から出現させる
const GOAL_ENTRY_LEADER_START_PROGRESS = 0.0;
// 画面外を含むゴール描画 progress 下限
const GOAL_PROGRESS_MIN = -1.10;
// 切替時のカット演出（フェード）時間
const GOAL_SCENE_TRANSITION_MS = 1500;
const GOAL_SCENE_TRANSITION_MAX_ALPHA = 0.82;
const GOAL_PROGRESS_TARGET_AT_FINISH = 1.06;
const GOAL_LEADER_ANCHOR_PROGRESS = 0.88;
// 仮想リーダーが上に抜けた時にYで見せる（旧: 0.88 で上方向が潰れていた）
const GOAL_ANCHOR_MAX_PROGRESS = 1.08;
const GOAL_PROGRESS_SPAN = 0.64;
// t < 2/3（ゴール接近の前半〜中盤）の間は相対差を大きく見せる
const GOAL_EARLY_PHASE_T = 2 / 3;
const GOAL_SPREAD_EARLY_MULT = 1.52;
const GOAL_ANCHOR_FOLLOW_SCALE = 0.92;
const GOAL_CAMERA_LERP = 0.085;
const GOAL_CAMERA_LERP_MAX = 0.16;
const GOAL_ANCHOR_DYNAMIC_BOOST = 0.12;
const STAMINA_LANE_CHANGE_COST = 0.45;
const STAMINA_ACCEL_COST = 0.10;
const STAMINA_EARLY_ACCEL_MULT = 1.10;
const STAMINA_BATTLE_BASE_COST = 0.8;
const STAMINA_BATTLE_LOSER_EXTRA = 1.6;
const STAMINA_BATTLE_TRACKER_GAIN = 0.2;
const INNER_CUTIN_BATTLE_COOLDOWN_PHASES = 2;
const INNER_CUTIN_REMATCH_COOLDOWN_PHASES = 4;
const INNER_CUTIN_MIN_INWARD_DELTA = 0.08;
const INNER_CUTIN_WINNER_STAMINA_MULT = 1.15;
const INNER_CUTIN_LOSER_STAMINA_MULT = 1.35;
const THROUGH_C3_LANE_CHANGE_TRIGGER_DELTA = 0.08;
const INNER_RAIL_GAP_OPTIONS = [0.5, 1.0, 1.5, 2.0];
const INNER_RAIL_GAP_WEIGHTS = [0.38, 0.34, 0.20, 0.08];
const INNER_POCKET_FRONT_GAP_RATIO = 0.55;
const INNER_POCKET_REAR_GAP_RATIO = 0.35;
const PRE_CORNER_INNER_COMPRESS_ITERS = 3;
const PRE_CORNER_FORCE_INNER_STEP = 0.55;
const PRE_CORNER_MIN_Y_GAP_MULT = 0.88;
const HOME_OUTER_REROUTE_STEPS = 3;
const COLLISION_FRONT_BUFFER_X = 10;
const COLLISION_REAR_BUFFER_X = 14;
const INNER_CUTIN_BUFFER_MULT = 1.25;
const PACK_DENSITY_PENALTY_QUAD = 1.1;
const STAMINA_CORNER_OUTER_PER_LANE = 0.30;
const GOAL_STAMINA_DRAIN_MULT = 1.35;
const GOAL_AI = {
  horizonSec: 1.0,
  predictStepSec: 0.10,
  switchCommitSec: 0.40,
  /** 進路切替に必要なスコア差（低いほど左右に振りやすい） */
  switchThresholdBase: 1.12,
  aggrBaseByStyle: { '逃げ': 0.36, '先行': 0.47, '差し': 0.66, '追込': 0.78 },
  aggrStaminaGain: 0.46,
  aggrLast3fGain: 0.58,
  laneMoveCostPerLane: 1.25,
  blockRiskWeight: 6.4,
  densityWeight: 4.8,
  projectedGapWeight: 1.25,
  burstAccelBonus: 1.10,
  // GOAL_DISTANCE が 200m のため「残り〇m」の窓を区間に合わせる（最後の直線ドライブ帯）
  burstWindowMetersToGoMin: 90,
  burstWindowMetersToGoMax: 205,
  burstCooldownSec: 0.80,
  burstDurationSec: 0.55,
  trafficPenaltyFloor: 0.72,
  goalDrainSprintCap: 1.45,
  visualLateStartT: 0.62,
  visualLateBoost: 0.34,
  /** 短期軌道予測での接触ペナルティ（進路スコアから減算） */
  collisionHorizonWeight: 5.5,
  /** 「進路上の遅い馬」を探す前方距離上限（シミュ x 単位）。これ以上前方は無視する */
  passSeekMaxForwardX: 40,
};

/** 差し/追込: 末脚が速くスタミナに余力があるほど外への先回り意欲が高い（0〜1） */
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
function runSimulation(raceData, options = {}, userTweaks = {}, marks = {}, renderer = null) {
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

function getBattleLogClass(logLine) {
  if (logLine === '＝＝＝＝＝＝＝＝[着順]＝＝＝＝＝＝＝＝') return 'log-entry placing';
  if (logLine === RACE_SUMMARY_HEADER_LINE) return 'log-entry scene-heading';
  if (logLine.startsWith('[出遅れ]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[好スタート]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[つまずき]')) return 'log-entry irregular irregular-stumble';
  if (logLine.startsWith('[着順]')) return 'log-entry placing';
  if (!logLine.startsWith('[バトル')) return 'log-entry';
  if (logLine.startsWith('[バトル:先頭争い]')) return 'log-entry battle battle-lead';
  if (logLine.startsWith('[バトル:コーナー争い]')) return 'log-entry battle battle-corner';
  if (logLine.startsWith('[バトル:直線争い]')) return 'log-entry battle battle-final';
  if (logLine.startsWith('[バトル:進路争い]')) return 'log-entry battle battle-lane';
  if (logLine.startsWith('[バトル:同レーン争い]')) return 'log-entry battle battle-block';
  return 'log-entry battle battle-default';
}

function getLogTagClass(logLine) {
  if (logLine.startsWith('[出遅れ]')) return 'log-tag irregular-start';
  if (logLine.startsWith('[好スタート]')) return 'log-tag irregular-start';
  if (logLine.startsWith('[つまずき]')) return 'log-tag irregular-stumble';
  if (logLine.startsWith('[着順]')) return 'log-tag placing';
  if (logLine.startsWith('[バトル:先頭争い]')) return 'log-tag battle-lead';
  if (logLine.startsWith('[バトル:コーナー争い]')) return 'log-tag battle-corner';
  if (logLine.startsWith('[バトル:直線争い]')) return 'log-tag battle-final';
  if (logLine.startsWith('[バトル:進路争い]')) return 'log-tag battle-lane';
  if (logLine.startsWith('[バトル:同レーン争い]')) return 'log-tag battle-block';
  if (logLine.startsWith('[バトル')) return 'log-tag battle-default';
  return 'log-tag';
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRaceSummarySceneLabel(logLine) {
  if (typeof logLine !== 'string') return null;
  for (const label of RACE_SUMMARY_SCENE_LABELS) {
    if (logLine.startsWith(`${label}:`)) return label;
  }
  return null;
}

function decorateHorseNames(text, horseMetaByName) {
  let html = escapeHtml(text);
  if (!horseMetaByName || horseMetaByName.size === 0) return html;

  const names = [...horseMetaByName.keys()].sort((a, b) => b.length - a.length);
  names.forEach(name => {
    const meta = horseMetaByName.get(name);
    if (!meta) return;
    const escapedName = escapeHtml(name);
    const re = new RegExp(escapeRegExp(escapedName), 'g');
    const waku = JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' };
    const badge = `<span class="horse-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`;
    html = html.replace(re, `${badge}<span class="horse-name">${escapedName}</span>`);
  });
  return html;
}

function formatSceneHeadingHtml(title, horseMetaByName) {
  return `<span class="scene-heading-label">${decorateHorseNames(String(title ?? ''), horseMetaByName)}</span>`;
}

function formatLogLineHtml(logLine, horseMetaByName) {
  if (logLine === RACE_SUMMARY_HEADER_LINE) {
    return formatSceneHeadingHtml(logLine, horseMetaByName);
  }
  const raceSummarySceneLabel = getRaceSummarySceneLabel(logLine);
  if (raceSummarySceneLabel) {
    const restText = logLine.slice(raceSummarySceneLabel.length + 1).trimStart();
    const bodyHtml = decorateHorseNames(restText, horseMetaByName);
    return `<span class="race-summary-scene">${escapeHtml(raceSummarySceneLabel)}</span>: ${bodyHtml}`;
  }

  const tagMatch = logLine.match(/^\[[^\]]+\]/);
  if (!tagMatch) return decorateHorseNames(logLine, horseMetaByName);

  const tagText = tagMatch[0];
  const restText = logLine.slice(tagText.length).trimStart();
  const tagClass = getLogTagClass(logLine);
  const tagHtml = `<span class="${tagClass}">${escapeHtml(tagText)}</span>`;
  const bodyHtml = decorateHorseNames(restText, horseMetaByName);
  return `${tagHtml} ${bodyHtml}`;
}

/** ホーム画面・着順掲示板（着順・馬番・馬名のみ） */
function formatHomePlacingRowInnerHtml(rank, horse, horseMetaByName) {
  const meta = horseMetaByName?.get(horse.name);
  const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
  const badgeHtml =
    meta && waku
      ? `<span class="summary-placing-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '<span class="summary-placing-badge" style="background:#1e3a5f;color:#fff;">-</span>';
  return `
      <span class="summary-placing-rank">${rank}着</span>
      ${badgeHtml}
      <span class="summary-placing-name">${escapeHtml(horse.name)}</span>
    `;
}

/** 右カラム #placing-panel とコース上オーバーレイ #placing-panel-overlay を同期 */
function syncPlacingPanelsHtml(html) {
  const main = document.getElementById('placing-panel');
  const overlay = document.getElementById('placing-panel-overlay');
  if (main) main.innerHTML = html;
  if (overlay) overlay.innerHTML = html;
}

function appendPlacingRowToPanels(rank, horse, horseMetaByName) {
  const rankClass =
    rank === 1 ? ' is-top1' : rank === 2 ? ' is-top2' : rank === 3 ? ' is-top3' : '';
  const makeDiv = () => {
    const div = document.createElement('div');
    div.className = `summary-placing-entry${rankClass}`;
    div.innerHTML = formatHomePlacingRowInnerHtml(rank, horse, horseMetaByName);
    return div;
  };
  const main = document.getElementById('placing-panel');
  const overlay = document.getElementById('placing-panel-overlay');
  if (main) {
    main.appendChild(makeDiv());
    main.scrollTop = main.scrollHeight;
  }
  if (overlay) {
    overlay.appendChild(makeDiv());
    /* オーバーレイは1着側を常に見えるよう先頭固定（下へスクロールで全頭確認） */
    overlay.scrollTop = 0;
  }
}

/** レースサマリ用ログ行かどうか（イベント抽出から除外する） */
function isRaceSummaryRelatedLine(line) {
  if (typeof line !== 'string') return true;
  if (line === RACE_SUMMARY_HEADER_LINE) return true;
  if (getRaceSummarySceneLabel(line)) return true;
  return false;
}

/**
 * 各馬に紐づくイベントログをスナップショットから抽出する。
 * 1ログ行に複数馬が含まれる場合（例: バトル行）は登場馬全員に同じ行を割り当てる。
 *
 * @returns {Map<string, Array<{ phaseLabel: string, text: string }>>}
 */
function extractHorseEventsBySnapshots(snapshots, phases, horseNames, getPhaseLabel) {
  const eventsByName = new Map();
  horseNames.forEach(name => {
    if (typeof name === 'string' && name.length > 0) {
      eventsByName.set(name, []);
    }
  });
  if (!Array.isArray(snapshots) || snapshots.length === 0) return eventsByName;

  const sortedNames = [...eventsByName.keys()].sort((a, b) => b.length - a.length);
  if (sortedNames.length === 0) return eventsByName;

  const escapedAlt = sortedNames.map(escapeRegExp).join('|');
  const namePattern = new RegExp(escapedAlt, 'g');

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const phase = phases?.[i] ?? null;
    const phaseLabel = phase ? (getPhaseLabel?.(phase) ?? '') : '';
    const lines = Array.isArray(snap?.eventLogs) ? snap.eventLogs : [];
    for (const line of lines) {
      if (isRaceSummaryRelatedLine(line)) continue;
      const matched = new Set();
      let m;
      namePattern.lastIndex = 0;
      while ((m = namePattern.exec(line)) !== null) {
        matched.add(m[0]);
        if (m.index === namePattern.lastIndex) namePattern.lastIndex++;
      }
      if (matched.size === 0) continue;
      matched.forEach(name => {
        const arr = eventsByName.get(name);
        if (arr) arr.push({ phaseLabel, text: line });
      });
    }
  }
  return eventsByName;
}

/** イベント1行のテキスト部分から、対象馬本人の馬名を強調表示用に整形する。 */
function formatHorseEventTextHtml(line, ownerName, horseMetaByName) {
  const fullHtml = formatLogLineHtml(line, horseMetaByName);
  return fullHtml;
}

/**
 * レースサマリー掲示板と同一ルールの着順ID列。
 * ゴール演出で記録した通過順を優先し、欠けがあれば simResults（到着順）で補完する。
 */
function buildSummaryPlacingOrderIds(finishOrderIds, simResults) {
  const orderedIds =
    Array.isArray(finishOrderIds) && finishOrderIds.length > 0
      ? [...finishOrderIds]
      : (simResults ?? []).map(h => h.id);
  const seen = new Set(orderedIds);
  if (Array.isArray(simResults)) {
    for (const r of simResults) {
      if (r && Number.isFinite(r.id) && !seen.has(r.id)) {
        orderedIds.push(r.id);
        seen.add(r.id);
      }
    }
  }
  return orderedIds;
}

function renderRaceSummaryScreen({
  raceData,
  simResults,
  finishOrderIds,
  horseMetaByName,
  snapshots,
  phases,
  getPhaseLabel,
}) {
  const screenEl = document.getElementById('race-summary-screen');
  if (!screenEl) return;

  const infoEl = document.getElementById('summary-race-info');
  if (infoEl) infoEl.innerHTML = formatRaceInfo(raceData);

  const placingsEl = document.getElementById('summary-placings');
  const eventsEl = document.getElementById('summary-horse-events');
  if (!placingsEl || !eventsEl) return;

  const resultsById = new Map();
  (simResults ?? []).forEach(h => {
    if (h && Number.isFinite(h.id)) resultsById.set(h.id, h);
  });

  const orderedIds = buildSummaryPlacingOrderIds(finishOrderIds, simResults);
  const sexAgeById = new Map(
    (raceData?.entries ?? []).map((entry, idx) => [idx, String(entry?.horse?.sex_age ?? '')]),
  );

  placingsEl.innerHTML = '';
  const placingItems = orderedIds.map((id, idx) => {
    const horse = resultsById.get(id);
    if (!horse) return null;
    const rank = idx + 1;
    const meta = horseMetaByName?.get(horse.name);
    const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
    const badgeHtml = meta && waku
      ? `<span class="summary-placing-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '<span class="summary-placing-badge" style="background:#1e3a5f;color:#fff;">-</span>';
    const sexAgeLabel = sexAgeById.get(id) || String(horse.sexAge ?? '');
    const sexAgeClass = sexAgeLabel.startsWith('牝')
      ? ' is-female'
      : sexAgeLabel.startsWith('牡')
        ? ' is-male'
        : '';
    const jockeyName = horse.jockeyName ? String(horse.jockeyName) : '—';
    const rankClass = rank === 1 ? ' is-top1' : rank === 2 ? ' is-top2' : rank === 3 ? ' is-top3' : '';
    const div = document.createElement('div');
    div.className = `summary-placing-entry${rankClass}`;
    div.innerHTML = `
      <span class="summary-placing-rank">${rank}着</span>
      ${badgeHtml}
      <div class="summary-placing-line">
        <span class="summary-placing-name">${escapeHtml(horse.name)}</span>
        <span class="summary-placing-meta">
          <span class="summary-placing-sex-age${sexAgeClass}">${escapeHtml(sexAgeLabel || '—')}</span>
          <span class="summary-placing-jockey">${escapeHtml(jockeyName)}</span>
        </span>
      </div>
    `;
    placingsEl.appendChild(div);
    return { id: horse.id, rank, horse };
  }).filter(Boolean);

  const horseNames = placingItems
    .map(item => item.horse.name)
    .filter(name => typeof name === 'string' && name.length > 0);
  const eventsByName = extractHorseEventsBySnapshots(snapshots, phases, horseNames, getPhaseLabel);

  eventsEl.innerHTML = '';
  placingItems.forEach(item => {
    const { rank, horse } = item;
    const block = document.createElement('div');
    const rankClass = rank === 1 ? ' is-top1' : rank <= 3 ? ' is-top3' : '';
    block.className = `summary-horse-block${rankClass}`;

    const meta = horseMetaByName?.get(horse.name);
    const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
    const badgeHtml = meta && waku
      ? `<span class="horse-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '';
    const head = document.createElement('div');
    head.className = 'summary-horse-head';
    head.innerHTML = `
      <span class="summary-horse-rank">${rank}着</span>
      ${badgeHtml}
      <span class="summary-horse-name">${escapeHtml(horse.name)}</span>
    `;
    block.appendChild(head);

    const list = document.createElement('div');
    list.className = 'summary-horse-events';
    const events = eventsByName.get(horse.name) ?? [];
    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'summary-horse-event-empty';
      empty.textContent = '目立ったイベントはありませんでした';
      list.appendChild(empty);
    } else {
      events.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'summary-horse-event';
        const phaseLabel = ev.phaseLabel ? `<span class="summary-event-phase">${escapeHtml(ev.phaseLabel)}</span>` : '';
        const bodyHtml = formatHorseEventTextHtml(ev.text, horse.name, horseMetaByName);
        row.innerHTML = `${phaseLabel}<span class="summary-event-body">${bodyHtml}</span>`;
        list.appendChild(row);
      });
    }
    block.appendChild(list);
    eventsEl.appendChild(block);
  });

  screenEl.hidden = false;
}

function hideRaceSummaryScreen() {
  const screenEl = document.getElementById('race-summary-screen');
  if (screenEl) screenEl.hidden = true;
}

function applyStartSlowMotion(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const slowZone = 0.36;
  const slowFactor = 0.58;
  if (p <= slowZone) return p * slowFactor;
  const slowOut = slowZone * slowFactor;
  const remainIn = 1 - slowZone;
  const remainOut = 1 - slowOut;
  return slowOut + ((p - slowZone) / remainIn) * remainOut;
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

// =====================
//  出馬表の初期描画（充実版）
// =====================
/** 残スタミナ表示: 実比率この％未満はバー0%、この％でバー100%（見せ方のスケール） */
const ENTRY_STAMINA_BAR_RAW_MIN = 60;
const ENTRY_STAMINA_BAR_RAW_MAX = 100;

/** 出馬表の脚質バッジ用クラス（index.html の .entry-style--* と対応） */
const ENTRY_STYLE_BADGE_CLASS = {
  大逃げ: 'entry-style--oonige',
  逃げ: 'entry-style--nige',
  先行: 'entry-style--senko',
  差し: 'entry-style--sashi',
  追込: 'entry-style--oikomi',
};

function getEntryStyleBadgeClass(style) {
  return ENTRY_STYLE_BADGE_CLASS[style] ?? 'entry-style--default';
}

/** プレレース編集で選べる脚質（シミュレーションが参照するラベルと一致） */
const PRE_RACE_STYLE_OPTIONS = ['大逃げ', '逃げ', '先行', '差し', '追込'];

function cloneRaceEntries(entries) {
  try {
    return structuredClone(entries);
  } catch {
    return JSON.parse(JSON.stringify(entries));
  }
}

function clampNumber(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round100(n) {
  return Math.round(n * 100) / 100;
}

/**
 * プレレース表の見やすさを保ちつつ、必要時のみ軽く縮小する
 */
function updatePreRaceTableFit() {
  const editor = document.getElementById('pre-race-editor');
  const wrap = document.querySelector('.pre-race-table-wrap');
  const inner = document.querySelector('.pre-race-table-inner');
  if (!editor || !wrap || !inner) return;
  if (editor.hidden) return;

  inner.style.zoom = '';
  inner.style.transform = '';
  inner.style.marginBottom = '';

  const availH = wrap.clientHeight;
  const nh = inner.scrollHeight;
  if (availH < 8 || nh < 1) return;

  const scaleByHeight = availH / nh;
  const scale = Math.max(0.9, Math.min(1, scaleByHeight));
  if (scale >= 0.999) return;

  inner.style.transform = `scale(${scale})`;
  inner.style.transformOrigin = 'top center';
  inner.style.marginBottom = `${-(nh * (1 - scale))}px`;
}

function schedulePreRaceTableFit() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => updatePreRaceTableFit());
  });
}

/**
 * 出走表プレレース編集 UI を構築する（runtimeRaceData.entries を直接更新）
 */
function mountPreRaceEditor(runtimeRaceData, onConfirm, onBeforeConfirm, options = {}) {
  const tbody = document.getElementById('pre-race-tbody');
  const infoEl = document.getElementById('pre-race-race-info');
  const btn = document.getElementById('btn-pre-race-confirm');
  if (!tbody || !btn) return;

  if (infoEl) {
    infoEl.innerHTML = formatRaceInfo(runtimeRaceData);
  }

  tbody.innerHTML = '';

  function makeStepperCell(get, set, min, max, step, fmt, normalizeValue = round100) {
    const td = document.createElement('td');
    td.className = 'pre-race-num-cell';
    const inner = document.createElement('div');
    inner.className = 'pre-race-stepper';
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '−';
    const val = document.createElement('span');
    val.className = 'pre-race-val';
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '+';
    const paint = () => {
      val.textContent = fmt(get());
    };
    const applyDelta = delta => {
      set(normalizeValue(clampNumber(get() + delta, min, max)));
      paint();
    };
    down.addEventListener('click', () => applyDelta(-step));
    up.addEventListener('click', () => applyDelta(step));
    paint();
    inner.append(down, val, up);
    td.appendChild(inner);
    return td;
  }

  const totalEntries = runtimeRaceData.entries.length;

  runtimeRaceData.entries.forEach(entry => {
    if (!entry.jockey) entry.jockey = {};
    const horse = entry.horse;
    const jockey = entry.jockey;
    if (!Number.isFinite(jockey.win_rate)) jockey.win_rate = 0;
    if (!Number.isFinite(jockey.top3_rate)) jockey.top3_rate = 0.5;

    const tr = document.createElement('tr');

    const waku = calcWaku(entry.gate, totalEntries);
    const wakuColors = JRA_WAKU_COLORS[waku] ?? { bg: '#888888', text: '#ffffff' };

    const tdGate = document.createElement('td');
    tdGate.className = 'pre-race-gate-cell';
    const gateBadge = document.createElement('span');
    gateBadge.className = 'entry-gate';
    gateBadge.textContent = String(entry.gate);
    gateBadge.style.background = wakuColors.bg;
    gateBadge.style.color = wakuColors.text;
    gateBadge.style.border = '1px solid rgba(255,255,255,0.3)';
    tdGate.appendChild(gateBadge);
    tr.appendChild(tdGate);

    const tdName = document.createElement('td');
    tdName.className = 'pre-race-name';
    tdName.textContent = horse.name ?? '';
    tdName.title = horse.name ?? '';
    tr.appendChild(tdName);

    const tdSexAge = document.createElement('td');
    tdSexAge.className = 'pre-race-readonly';
    const sexAgeLabel = horse.sex_age ?? '';
    const sexSpan = document.createElement('span');
    sexSpan.className = 'entry-demographics';
    sexSpan.textContent = sexAgeLabel;
    if (sexAgeLabel.startsWith('牝')) sexSpan.classList.add('is-female');
    else if (sexAgeLabel.startsWith('牡')) sexSpan.classList.add('is-male');
    tdSexAge.appendChild(sexSpan);
    tr.appendChild(tdSexAge);

    const tdWeightRo = document.createElement('td');
    tdWeightRo.className = 'pre-race-readonly';
    tdWeightRo.textContent = Number.isFinite(horse.weight) ? `${horse.weight}kg` : '—';
    tr.appendChild(tdWeightRo);

    const tdJockeyName = document.createElement('td');
    tdJockeyName.className = 'pre-race-jockey-name';
    tdJockeyName.textContent = jockey.name ?? '';
    tdJockeyName.title = jockey.name ?? '';
    tr.appendChild(tdJockeyName);

    const tdStyle = document.createElement('td');
    const styleWrap = document.createElement('span');
    const syncStyleBadgeClass = () => {
      styleWrap.className = `entry-style-inline pre-race-style-wrap ${getEntryStyleBadgeClass(horse.style)}`;
    };
    syncStyleBadgeClass();

    const sel = document.createElement('select');
    sel.className = 'pre-race-select';
    const styleSet = new Set(PRE_RACE_STYLE_OPTIONS);
    if (horse.style && !styleSet.has(horse.style)) {
      const o = document.createElement('option');
      o.value = horse.style;
      o.textContent = horse.style;
      sel.appendChild(o);
    }
    PRE_RACE_STYLE_OPTIONS.forEach(s => {
      const o = document.createElement('option');
      o.value = s;
      o.textContent = s;
      if (horse.style === s) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      horse.style = sel.value;
      syncStyleBadgeClass();
    });
    styleWrap.appendChild(sel);
    tdStyle.appendChild(styleWrap);
    tr.appendChild(tdStyle);

    tr.appendChild(
      makeStepperCell(
        () => horse.ave_3f,
        v => {
          horse.ave_3f = v;
        },
        32,
        42,
        0.1,
        v => round1(v).toFixed(1),
        round1,
      ),
    );

    tr.appendChild(
      makeStepperCell(
        () => horse.last_3f,
        v => {
          horse.last_3f = v;
        },
        30,
        37,
        0.1,
        v => round1(v).toFixed(1),
        round1,
      ),
    );

    tr.appendChild(
      makeStepperCell(
        () => jockey.win_rate,
        v => {
          jockey.win_rate = v;
        },
        0.05,
        0.45,
        0.01,
        v => `${Math.round(round100(v) * 100)}%`,
        round100,
      ),
    );

    tr.appendChild(
      makeStepperCell(
        () => jockey.top3_rate,
        v => {
          jockey.top3_rate = v;
        },
        0.3,
        0.7,
        0.01,
        v => `${Math.round(round100(v) * 100)}%`,
        round100,
      ),
    );

    tbody.appendChild(tr);
  });

  btn.addEventListener('click', () => {
    if (typeof onBeforeConfirm === 'function' && onBeforeConfirm() === false) return;
    onConfirm();
  });

  schedulePreRaceTableFit();
  const wrapEl = document.querySelector('.pre-race-table-wrap');
  if (wrapEl && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => schedulePreRaceTableFit());
    ro.observe(wrapEl);
  }
  window.addEventListener('resize', schedulePreRaceTableFit);

  if (options.openSimulatorDirect) {
    if (!(typeof onBeforeConfirm === 'function' && onBeforeConfirm() === false)) {
      onConfirm();
    }
  }
}

function renderEntryList(horses) {
  const listEl = document.getElementById('entry-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  horses.forEach(horse => {
    const waku = JRA_WAKU_COLORS[horse.waku] ?? { bg: '#888', text: '#fff' };
    const staminaDisplayPct = getStaminaDisplayBarPct(horse);
    const staminaBarClass = getStaminaBarClassName(staminaDisplayPct);
    const weightLabel = Number.isFinite(horse.weight) ? `${horse.weight}kg` : '';
    const profileLabel = [horse.sexAge, weightLabel].filter(Boolean).join(' ');
    const sexClass = horse.sexAge?.startsWith('牝')
      ? 'is-female'
      : horse.sexAge?.startsWith('牡')
        ? 'is-male'
        : '';

    const row = document.createElement('div');
    row.className        = 'entry-row';
    row.dataset.horseId  = horse.id;
    // 左端に枠色の帯を border-left で表示
    row.style.borderLeft = `5px solid ${waku.bg}`;
    row.style.boxShadow  = `inset 3px 0 8px rgba(0,0,0,0.18)`;
    row.innerHTML = `
      <div class="entry-gate" style="background:${waku.bg};color:${waku.text};border:1px solid rgba(255,255,255,0.3);">${horse.gate}</div>
      <div class="entry-meta-line">
        <span class="entry-name">${escapeHtml(horse.name)}</span>
        ${profileLabel ? `<span class="entry-demographics ${sexClass}">${escapeHtml(profileLabel)}</span>` : ''}
        <span class="entry-jockey-inline">🏇 ${escapeHtml(horse.jockeyName ?? '')}</span>
        <span class="entry-style-inline ${getEntryStyleBadgeClass(horse.style)}">${escapeHtml(horse.style)}</span>
      </div>
      <div class="entry-params">
        <div class="param-row param-row--stamina">
          <div class="param-bar-bg"><div class="param-bar ${staminaBarClass}" style="width:${staminaDisplayPct}%"></div></div>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

/** 初期スタミナに対する実残量％（0〜100） */
function getStaminaRemainRawPct(horse) {
  if (!horse || horse.initialStamina <= 0) return 0;
  const ratio = (horse.stamina / horse.initialStamina) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

/**
 * バー幅・表示用％（ENTRY_STAMINA_BAR_RAW_MIN〜MAX を 0〜100% に線形マップ）
 */
function getStaminaDisplayBarPct(horse) {
  const raw = getStaminaRemainRawPct(horse);
  const span = ENTRY_STAMINA_BAR_RAW_MAX - ENTRY_STAMINA_BAR_RAW_MIN;
  if (span <= 0) return raw;
  const t = (raw - ENTRY_STAMINA_BAR_RAW_MIN) / span;
  return Math.max(0, Math.min(100, Math.round(t * 100)));
}

/** 表示％（60〜100実残を 0〜100 にマップした値）で色分け。ラベル・バー幅と一致させる */
function getStaminaBarClassName(staminaDisplayPct) {
  if (staminaDisplayPct <= 25) return 'stamina-remain-bar is-critical';
  if (staminaDisplayPct < 50) return 'stamina-remain-bar is-warning';
  return 'stamina-remain-bar';
}

function updateEntryStaminaBars(horses) {
  horses.forEach(horse => {
    const rowEl = document.querySelector(`[data-horse-id="${horse.id}"]`);
    if (!rowEl) return;
    const displayPct = getStaminaDisplayBarPct(horse);
    const barEl = rowEl.querySelector('.stamina-remain-bar');
    if (barEl) {
      barEl.style.width = `${displayPct}%`;
      barEl.className = `param-bar ${getStaminaBarClassName(displayPct)}`;
    }
  });
}

// =====================
//  フェーズ手動進行コントローラー（ステップバイステップ）
// =====================
class PhaseController {
  constructor(
    snapshots,
    phases,
    renderer,
    initialHorses = [],
    horseMetaByName = new Map(),
    simResults = null,
  ) {
    this.snapshots   = snapshots;
    this.phases      = phases;
    this.renderer    = renderer;
    this.simResults  = simResults;
    this.initialHorses = initialHorses.map(h => ({ ...h }));
    this.horseMetaByName = horseMetaByName;
    this.currentIdx  = 0;
    this.lastRenderedHorses = null;
    this._logQueue   = [];
    this._logTimer   = null;
    this._goalRankLogged = new Set();
    this._goalRankOrder = [];
    this._goalPlacingHeaderLogged = false;
    this._goalLineDiffById = new Map();
    this._goalAllFinishedAtMs = null;
    this._goalCameraRawProgress = null;
    this._goalBattledPairs = new Set();

    this.btnAdvance = document.getElementById('btn-run');
    this.btnReset  = document.getElementById('btn-reset');
    this.logPanel  = document.getElementById('log-panel');
    this.indicator = document.getElementById('phase-indicator');
    this.isAnimating = false;
    this.advanceExternallyLocked = false;
    this.frameCount  = 24; // 1フェーズを細かく刻む
    this.frameMs     = 70; // 1コマの表示時間
  }

  _syncAdvanceButton() {
    if (!this.btnAdvance) return;
    this.btnAdvance.disabled = this.isAnimating || this.advanceExternallyLocked;
  }

  setAdvanceExternallyLocked(locked) {
    this.advanceExternallyLocked = Boolean(locked);
    this._syncAdvanceButton();
  }

  start() {
    this.currentIdx = 0;
    this.renderer.resetHorseRenderState();
    this._initializePlacingPanel();
    this._renderPhase(0);
    this.btnAdvance.textContent = '▶▶ 次のフェーズ';
    this._syncAdvanceButton();
  }

  _renderPhase(idx) {
    const snap  = this.snapshots[idx];
    const phase = this.phases[idx];
    const prev  = idx > 0 ? this.snapshots[idx - 1] : null;
    const fromForAnimation = this.lastRenderedHorses
      ?? prev?.horses
      ?? this.initialHorses;

    const phaseName = this.renderer.getPhaseName(phase);
    this.indicator.textContent = phaseName;
    this._appendSceneHeading(phaseName);

    // 馬カードをアニメーション付きで描画（前フェーズ位置から開始）
    // ログは最初の描画フレームと同タイミングで _enqueueLogs する（案A）
    this._animateHorses(fromForAnimation, snap.horses, phase, idx === 0, snap.eventLogs);

    updateEntryStaminaBars(fromForAnimation ?? snap.horses);

    // 最終フェーズの次は「ゴール判定」
    if (idx === this.snapshots.length - 1) {
      this.btnAdvance.textContent = '🏁 ゴール判定';
    }
  }

  // 馬カードをアニメーションで表示（段階的に進行度を上げる）
  _animateHorses(fromHorses, toHorses, phase, isFirstPhase = false, eventLogs = null) {
    this.isAnimating      = true;
    this._syncAdvanceButton();

    // 初回のみスタート演出（スタート隊列→第1フェーズ）
    if (isFirstPhase) {
      const holdFrames = 8;
      const moveFrames = this.frameCount;
      const totalFrames = holdFrames + moveFrames;
      const fromById = new Map((fromHorses ?? []).map(h => [h.id, h]));
      let frame = 0;
      const stepFirst = () => {
        frame++;
        const holdProgress = Math.min(1, frame / holdFrames);
        const rawMoveProgress = Math.max(0, Math.min(1, (frame - holdFrames) / moveFrames));
        const moveProgress = applyStartSlowMotion(rawMoveProgress);
        const gateOpenProgress = moveProgress <= 0.12
          ? 0
          : Math.max(0, Math.min(1, (moveProgress - 0.12) / 0.42));
        const gateSlide = moveProgress <= 0
          ? 0
          : Math.max(0, Math.min(1, (moveProgress - 0.10) / 0.65));
        const lateralProgress = gateSlide;
        const rendered = toHorses.map(to => {
          const from = fromById.get(to.id) ?? to;
          return {
            ...to,
            x: from.x + (to.x - from.x) * moveProgress,
            // ゲートが下がる演出に合わせて、横移動は少し遅れて開始する
            y: from.y + (to.y - from.y) * lateralProgress,
            stamina: from.stamina + (to.stamina - from.stamina) * moveProgress,
          };
        });

        this.renderer.draw(
          rendered,
          phase,
          moveProgress,
          {
            forceStartLineup: moveProgress <= 0.02,
            gateOpenProgress: moveProgress <= 0 ? holdProgress * 0.03 : gateOpenProgress,
            gateYOffset: gateSlide * this.renderer.H * 0.22,
            gateOpacity: 1 - gateSlide * 0.95,
          }
        );
        this.lastRenderedHorses = rendered.map(h => ({ ...h }));
        updateEntryStaminaBars(rendered);
        if (frame === 1 && Array.isArray(eventLogs) && eventLogs.length > 0) {
          this._enqueueLogs(eventLogs);
        }
        if (frame >= totalFrames) {
          this.lastRenderedHorses = toHorses.map(h => ({ ...h }));
          this.isAnimating = false;
          this._syncAdvanceButton();
          return;
        }
        setTimeout(stepFirst, this.frameMs);
      };
      setTimeout(stepFirst, this.frameMs);
      return;
    }

    const fromById = new Map((fromHorses ?? []).map(h => [h.id, h]));
    let frame = 0;
    const step = () => {
      frame++;
      const progress = Math.min(1, frame / this.frameCount);

      // 前フェーズ位置 -> 今フェーズ位置へ線形補間
      const tweened = toHorses.map(to => {
        const from = fromById.get(to.id) ?? to;
        return {
          ...to,
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
          stamina: from.stamina + (to.stamina - from.stamina) * progress,
        };
      });

      this.renderer.draw(tweened, phase, 1);
      this.lastRenderedHorses = tweened.map(h => ({ ...h }));
      updateEntryStaminaBars(tweened);
      if (frame === 1 && Array.isArray(eventLogs) && eventLogs.length > 0) {
        this._enqueueLogs(eventLogs);
      }
      if (progress >= 1) {
        this.lastRenderedHorses = toHorses.map(h => ({ ...h }));
        this.isAnimating = false;
        this._syncAdvanceButton();
        return;
      }
      setTimeout(step, this.frameMs);
    };
    setTimeout(step, this.frameMs);
  }

  // ログを1行ずつ時間差で表示
  _enqueueLogs(lines) {
    if (this._logTimer) {
      clearTimeout(this._logTimer);
      this._logTimer = null;
    }
    this._logQueue = [...lines];
    this._flushNextLog();
  }

  _flushNextLog() {
    if (this._logQueue.length === 0) return;
    const line = this._logQueue.shift();
    this._appendLog(line);
    this._logTimer = setTimeout(() => this._flushNextLog(), 80);
  }

  /** 着順枠の伸縮でログ欄が縮んでも、最新行が見えるよう末尾へスクロール */
  _scrollRaceLogToBottom() {
    if (!this.logPanel) return;
    const el = this.logPanel;
    const sync = () => {
      el.scrollTop = el.scrollHeight;
    };
    sync();
    requestAnimationFrame(() => {
      sync();
      requestAnimationFrame(sync);
    });
  }

  _appendLog(line) {
    const div  = document.createElement('div');
    div.className = getBattleLogClass(line);
    div.innerHTML = formatLogLineHtml(line, this.horseMetaByName);
    this.logPanel.appendChild(div);
    this.logPanel.scrollTop = this.logPanel.scrollHeight;
  }

  _appendSceneHeading(title) {
    const div = document.createElement('div');
    div.className = 'log-entry scene-heading';
    div.innerHTML = formatSceneHeadingHtml(title, this.horseMetaByName);
    this.logPanel.appendChild(div);
    this.logPanel.scrollTop = this.logPanel.scrollHeight;
  }

  _appendPlacingRow(rank, horse) {
    appendPlacingRowToPanels(rank, horse, this.horseMetaByName);
    this._scrollRaceLogToBottom();
  }

  _initializePlacingPanel() {
    syncPlacingPanelsHtml('');
  }

  _setPlacingLog(rank, horse) {
    this._appendPlacingRow(rank, horse);
  }

  _playGoalApproach(onDone) {
    if (!Array.isArray(this.simResults) || this.simResults.length === 0) {
      onDone?.();
      return;
    }

    const lastIdx = this.snapshots.length - 1;
    const finalSnap = this.snapshots[lastIdx];
    const phase = this.phases[lastIdx];
    const baseHorses = (this.lastRenderedHorses ?? finalSnap.horses).map(h => ({ ...h }));
    // 最終直線最後のコマでレンダラーが実際に描いた cy を progress 値に逆算して保持し、
    // ゴール演出 1 コマ目で同位置から開始できるようにする。
    const initialRenderProgressById = new Map();
    this.renderer.horseRenderState.forEach((state, id) => {
      if (Number.isFinite(state?.cy)) {
        initialRenderProgressById.set(id, this.renderer.yToProgress(state.cy));
      }
    });
    // ※ 段階(α): 事前確定着順 (arrivalTime) を演出にバイアスとして渡さない方針へ移行。
    //   従来は fastWeightById を作って surge を ±18% 揺らしていたが、これは
    //   「runSimulation の結果を答え合わせさせる」構造になっており、ゴールシーンが
    //   自律シミュレーションとして機能していなかった。fastWeight 系は完全撤廃する。
    //   ここで simResults の有無だけは sanity check として残す（馬データ自体が必要なため）。
    if (!Array.isArray(this.simResults) || this.simResults.length === 0) {
      onDone?.();
      return;
    }

    const resultsById = new Map(this.simResults.map(h => [h.id, h]));
    const last3fValues = this.simResults
      .map(h => h.last3f)
      .filter(v => Number.isFinite(v));
    const minLast3f = last3fValues.length ? Math.min(...last3fValues) : 33;
    const maxLast3f = last3fValues.length ? Math.max(...last3fValues) : minLast3f + 1;
    const last3fSpan = Math.max(0.001, maxLast3f - minLast3f);

    const xValues = baseHorses.map(h => h.x);
    const maxX = Math.max(...xValues, 1);
    // 最終直線フェーズの描画式と揃えて、ゴール演出開始時の座標ジャンプを防ぐ。
    const drawSpan = Math.max(140, maxX);
    const calcFinalMappedProgress = (x) => {
      const normalized = Math.max(0, Math.min(1, x / drawSpan));
      const easedProgress = Math.pow(normalized, 0.82);
      return Math.min(0.93, easedProgress * 0.88 + 0.06);
    };
    const baseGoalProgressById = new Map();
    baseHorses.forEach(horse => {
      const carried = initialRenderProgressById.get(horse.id);
      const baseProgress = Number.isFinite(carried)
        ? carried
        : calcFinalMappedProgress(horse.x);
      baseGoalProgressById.set(horse.id, baseProgress);
    });
    let baseLeaderProgress = -Infinity;
    baseGoalProgressById.forEach(progress => {
      if (progress > baseLeaderProgress) baseLeaderProgress = progress;
    });
    if (!Number.isFinite(baseLeaderProgress)) {
      baseLeaderProgress = GOAL_ENTRY_LEADER_START_PROGRESS;
    }
    const goalEntryOffset = GOAL_ENTRY_LEADER_START_PROGRESS - baseLeaderProgress;

    const simHorses = baseHorses.map(h => {
      const rawStaminaRatio = h.initialStamina > 0 ? h.stamina / h.initialStamina : 0.5;
      const staminaRatio = rawStaminaRatio;
      const res = resultsById.get(h.id) ?? h;
      const goalIntrinsicMps = goalIntrinsicMpsFromLast3f(res.last3f);
      const l3w = Number.isFinite(res.last3f)
        ? (maxLast3f - res.last3f) / last3fSpan
        : 0.5;
      const isCloser = h.style === '差し' || h.style === '追込';
      const startSpeedMult = Math.max(
        0.72,
        Math.min(
          1.06,
          0.78 + l3w * 0.14 + (isCloser ? 0.05 : 0),
        ),
      );
      return {
        ...h,
        goalMeters: 0,
        goalFinished: false,
        goalIntrinsicMps,
        targetLane: h.y,
        goalStartProgress: (baseGoalProgressById.get(h.id) ?? GOAL_ENTRY_LEADER_START_PROGRESS) + goalEntryOffset,
        // どれだけ下から入ってきても、最終的に全馬がゴール線を通過できるよう個別に進捗倍率を持たせる。
        goalProgressScale: 1,
        goalCurrentMps:
          goalIntrinsicMps * goalStaminaSpeedMult(staminaRatio) * startSpeedMult,
        // 進路AI（_planGoalRouteV2）が「現速度（リセット後）」ではなく
        // 「その馬がそのフレームで本来出したい速度」で判定できるよう、
        // targetMps を毎フレーム保存する専用フィールド。
        goalDesiredMps:
          goalIntrinsicMps * goalStaminaSpeedMult(staminaRatio) * startSpeedMult,
        goalAccelState: 0,
        goalLaneCost: 0,
        goalCommitUntilMs: 0,
        goalLaneCooldownUntilMs: 0,
        goalBurstRemainMs: 0,
        goalBurstCooldownUntilMs: 0,
        // 同レーン前方に詰まっている時間の積算（ms）。
        // 一定時間を超えたら _planGoalRouteV2 の進路変更閾値を緩める用途に使う。
        goalStuckMs: 0,
        // 直前にレーン変更を採用した時刻+短い窓。
        // この窓内は _enforceGoalPackSpacing の「隣接レーン押し戻し」を弱め、
        // 追い抜きの瞬間に肩が並ぶ動きを潰さないようにする。
        goalLaneEnterUntilMs: 0,
      };
    });

    simHorses.forEach(horse => {
      const startProgress = Number.isFinite(horse.goalStartProgress)
        ? horse.goalStartProgress
        : GOAL_ENTRY_LEADER_START_PROGRESS;
      const neededSpan = Math.max(
        GOAL_PROGRESS_SPAN,
        GOAL_PROGRESS_TARGET_AT_FINISH - startProgress,
      );
      horse.goalProgressScale = neededSpan / Math.max(1e-6, GOAL_PROGRESS_SPAN);
    });

    // ゴールシーン中は horse.x を「描画 progress と 1 対 1 で対応する量」に再束縛する。
    // これでシミュ側の AI / 衝突判定 / _enforceGoalPackSpacing が
    // 実際にレンダリングされている前後関係と一致するようになる。
    // RENDER_X_PER_PROGRESS は、progress 1 単位あたり何 sim-x 分かを表す係数。
    // 既存の GOAL_X_PER_METER と矛盾しないよう
    //   (GOAL_DISTANCE_METERS * GOAL_X_PER_METER) / GOAL_PROGRESS_SPAN
    // で定義する。これにより、scale=1 の時の毎フレーム dx が従来式と完全一致する。
    const RENDER_X_PER_PROGRESS =
      (GOAL_DISTANCE_METERS * GOAL_X_PER_METER) / Math.max(1e-6, GOAL_PROGRESS_SPAN);
    simHorses.forEach(horse => {
      horse.x = (horse.goalStartProgress ?? GOAL_ENTRY_LEADER_START_PROGRESS) * RENDER_X_PER_PROGRESS;
    });

    // ゴールシーンは「ゴール前 200m を全力で走破する程度の実時間」で見せる。
    // スタミナ減衰や演出バッファは掛けず、各馬の intrinsic mps（last_3f 由来）から
    // 200m を走り切る時間そのものを採用し、最も遅い馬に合わせて尺を決める。
    const durationMs =
      Math.max(
        ...simHorses.map(h => (GOAL_DISTANCE_METERS / Math.max(1e-6, h.goalIntrinsicMps)) * 1000),
        1,
      ) * GOAL_TIME_SCALE;
    const goalRng = createRng((this.raceData?.race_id ?? 1) + 7919);
    const transitionStartedAt = performance.now();
    const transitionHalfMs = GOAL_SCENE_TRANSITION_MS * 0.5;
    let goalSceneStarted = false;
    let startedAt = null;
    let lastTs = null;
    let goalFrameIndex = 0;

    this.isAnimating = true;
    this._syncAdvanceButton();
    this.indicator.textContent = this.renderer.getPhaseName(phase);
    this._goalRankLogged = new Set();
    this._goalRankOrder = [];
    this._goalPlacingHeaderLogged = false;
    this._goalLineDiffById = new Map();
    this._goalAllFinishedAtMs = null;
    this._goalCameraRawProgress = null;
    this._goalBattledPairs = new Set();

    const step = (ts) => {
      if (!goalSceneStarted) {
        const transitionElapsed = ts - transitionStartedAt;
        const transitionT = Math.max(
          0,
          Math.min(1, transitionElapsed / Math.max(1, GOAL_SCENE_TRANSITION_MS)),
        );
        if (transitionElapsed < transitionHalfMs) {
          this.renderer.draw(baseHorses, phase, 1, {
            sceneTransition: {
              t: transitionT,
              maxAlpha: GOAL_SCENE_TRANSITION_MAX_ALPHA,
            },
          });
          this.lastRenderedHorses = baseHorses.map(h => ({ ...h }));
          requestAnimationFrame(step);
          return;
        }

        goalSceneStarted = true;
        startedAt = ts;
        lastTs = ts;
        goalFrameIndex = 0;
        this.indicator.textContent = 'ゴールシーン';
        this._appendSceneHeading('ゴールシーン');
      }

      const isFirstGoalFrame = goalFrameIndex === 0;
      goalFrameIndex += 1;
      const rawDt = Math.max(0.001, Math.min(0.12, (ts - lastTs) / 1000));
      const dt = isFirstGoalFrame ? 0 : rawDt;
      lastTs = ts;
      const elapsed = ts - startedAt;
      const rawT = elapsed / durationMs;
      const t = Math.max(0, Math.min(1, rawT));
      this._goalRawT = t;
      const laneIntentById = new Map();
      const overtakePressureById = new Map();
      const frameEngaged = new Set();

      // フレーム冒頭の x / goalMeters をスナップショット。
      // _enforceGoalPackSpacing の押し戻しはこの値を下限としてクランプし、
      // フレーム間で goalMeters / x が「減る」ことを構造的に禁止する
      // （= 馬が後退して見える挙動を根本から無くす）。
      simHorses.forEach(h => {
        h._frameStartX = h.x;
        h._frameStartGoalMeters = h.goalMeters;
      });

      simHorses.sort((a, b) => b.x - a.x);
      simHorses.forEach(horse => {
        if (horse.goalFinished) {
          // ゴール後も画面上に抜けるまで前進を継続する。
          laneIntentById.set(horse.id, 0);
          overtakePressureById.set(horse.id, 0);
          const sr =
            horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0.5;
          const postGoalMinMps =
            horse.goalIntrinsicMps * goalStaminaSpeedMult(sr) * 1.06;
          horse.goalCurrentMps = Math.max(postGoalMinMps, horse.goalCurrentMps * 0.996);
          const progressedMeters = Math.max(postGoalMinMps * dt, horse.goalCurrentMps * dt);
          horse.goalMeters = Math.min(
            GOAL_DISTANCE_METERS + GOAL_POST_CLEAR_METERS * 3.2,
            horse.goalMeters + progressedMeters,
          );
          // x は描画 progress と一致させるため scale を反映して進める。
          horse.x += progressedMeters * GOAL_X_PER_METER * (horse.goalProgressScale ?? 1);
          return;
        }
        const result = resultsById.get(horse.id) ?? horse;
        const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0.5;
        const last3fWeight = Number.isFinite(result.last3f)
          ? (maxLast3f - result.last3f) / last3fSpan
          : 0.5;
        const baseMps =
          horse.goalIntrinsicMps * goalStaminaSpeedMult(staminaRatio);
        const styleBoost = horse.style === '追込' ? 0.16
          : horse.style === '差し' ? 0.13
            : horse.style === '先行' ? 0.04
              : 0;
        const styleTop = horse.style === '追込' ? 1.12
          : horse.style === '差し' ? 1.08
            : horse.style === '先行' ? 1.02
              : 0.98;
        const battleFatigue = Math.min(0.38, (horse.battleFatigue ?? 0) * 0.035);
        const distRatio = Math.min(1, (horse.goalMeters || 0) / GOAL_DISTANCE_METERS);
        const remainMeters = Math.max(0, GOAL_DISTANCE_METERS - (horse.goalMeters || 0));
        const isCloser = horse.style === '追込' || horse.style === '差し';
        const aggression = this._calcGoalAggression(horse, staminaRatio, last3fWeight, distRatio);
        const frontGapNow = this._goalFrontGap(simHorses, horse, clampLane(horse.y));
        const frontBlockedNow = frontGapNow < GOAL_BLOCK_X_GAP * 1.08;
        const urgePass = this._goalShouldSeekPass(simHorses, horse);
        // 「同レーン前方に詰まっている時間」を積算する。
        // 詰まっている間は時間が伸び、解消したら同じ速さで減衰させる。
        // _planGoalRouteV2 の閾値緩和に使う（一定時間以上詰まっていれば外を見る）。
        const stuckThisFrameMs = frontBlockedNow ? dt * 1000 : -dt * 1000 * 1.5;
        horse.goalStuckMs = Math.max(
          0,
          Math.min(2000, (horse.goalStuckMs ?? 0) + stuckThisFrameMs),
        );
        const lanePlan = this._planGoalRouteV2(simHorses, horse, {
          t,
          dt,
          elapsedMs: elapsed,
          aggression,
          staminaRatio,
          last3fWeight,
          frontBlocked: frontBlockedNow,
          urgeOvertake: urgePass,
          stuckMs: horse.goalStuckMs,
        });
        overtakePressureById.set(horse.id, lanePlan.pressure);
        const canChangeRoute = elapsed >= (horse.goalCommitUntilMs ?? 0) &&
          elapsed >= (horse.goalLaneCooldownUntilMs ?? 0);
        // 詰まっている時間が長いほど、進路変更に必要なスコア差を大きく緩める。
        // 1.2 秒を上限に、最大 0.55 まで閾値を下げる。
        const stuckEase = Math.min(0.55, (horse.goalStuckMs ?? 0) / 1200 * 0.55);
        const adaptiveThreshold = Math.max(
          // 詰まりが深刻な時は下限自体も少し下げる（0.55 -> 0.40）
          0.40,
          GOAL_AI.switchThresholdBase
            - aggression * 0.52
            + (1 - distRatio) * 0.14
            + (staminaRatio < 0.24 ? 0.12 : 0)
            - (urgePass ? 0.32 : 0)
            - stuckEase,
        );
        const laneRound = clampLane(horse.y);
        const frontSlower = this._goalFrontIsSlower(simHorses, horse, laneRound);
        const straightKeepBias = frontBlockedNow
          ? 0
          : urgePass
            ? 0.06
            : (frontSlower ? 0.16 : 0.36);
        const shouldSwitch = canChangeRoute &&
          lanePlan.lane !== laneRound &&
          lanePlan.gain > (adaptiveThreshold + straightKeepBias);
        if (shouldSwitch) {
          horse.targetLane = lanePlan.lane;
          horse.goalCommitUntilMs = elapsed + GOAL_AI.switchCommitSec * 1000;
          // 進路変更直後 ~0.6 秒は _enforceGoalPackSpacing の隣接レーン押し戻しを
          // 半分に弱める。これがないと、肩を並べに行った瞬間に押し戻されて
          // 「外に出ようとしたのに元のレーンに戻される」剛体ブロック挙動になる。
          horse.goalLaneEnterUntilMs = elapsed + 600;
          // 詰まり時間も 0 にリセット（同じ詰まりに二重で甘くしないため）。
          horse.goalStuckMs = 0;
        } else if (canChangeRoute) {
          // 進路変更を選ばなかった -> 中途半端な目標レーンを残さず現在地に固定。
          // これがないと過去の目標レーンに引きずられて細かく揺れ続けてしまう。
          horse.targetLane = horse.y;
        } else if (Math.abs((horse.targetLane ?? horse.y) - horse.y) < 0.08) {
          horse.targetLane = horse.y;
        }
        laneIntentById.set(horse.id, Math.max(-1, Math.min(1, (horse.targetLane - horse.y) / 2.2)));
        const laneDelta = horse.targetLane - horse.y;
        let laneShift = 0;
        if (Math.abs(laneDelta) > 0.01) {
          const cutInTarget = this._findGoalCutInRival(simHorses, horse, horse.targetLane);
          if (
            cutInTarget &&
            !frameEngaged.has(horse.id) &&
            !frameEngaged.has(cutInTarget.id) &&
            !this._hasGoalBattlePair(horse, cutInTarget)
          ) {
            if (shouldBattle(goalRng, simHorses, horse, cutInTarget)) {
              const result = resolveBattle(goalRng, horse, cutInTarget, phase);
              applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
              this._markGoalBattlePair(horse, cutInTarget);
              const battleType = this._classifyGoalBattleType(horse, cutInTarget, {
                isLaneChange: true,
              });
              const log = `[バトル:${battleType}] ${horse.name} vs ${cutInTarget.name} → 勝者: ${result.winner.name}`;
              this._appendLog(log);
              frameEngaged.add(horse.id);
              frameEngaged.add(cutInTarget.id);
              if (result.winner.id !== horse.id) {
                horse.targetLane = horse.y;
                horse.goalCurrentMps *= 0.985;
              }
            } else {
              horse.targetLane = horse.y;
              horse.goalCurrentMps *= 0.992;
            }
          }
          const speedRatio = horse.goalCurrentMps / Math.max(1e-6, baseMps);
          const speedLimited = speedRatio > 1.15 ? 0.58 : (speedRatio > 1 ? 0.74 : 1.0);
          const laneRate = GOAL_LANE_CHANGE_PER_SEC * speedLimited * (
            frontBlockedNow ? 1.0 : (urgePass ? 0.95 : 0.82)
          );
          const laneStep = Math.sign(laneDelta) * Math.min(Math.abs(laneDelta), laneRate * dt);
          const candidateY = clampLane(horse.y + laneStep);
          // 進路変更で「新たな同レーン重なり」を生む場合は、本フレームの寄せを保留する。
          // これがないと割り込んだ側ではなく後続側が _enforceGoalPackSpacing で
          // 強制的に後退させられて「後退する馬」に見える。
          if (this._goalLaneChangeWouldOverlap(simHorses, horse, candidateY)) {
            laneShift = 0;
          } else {
            laneShift = Math.abs(laneStep);
            horse.y = candidateY;
          }
        }
        if (laneShift > 0) {
          const aggressiveShift = Math.max(0, laneShift - 0.14);
          const laneDrain = laneShift * STAMINA_LANE_CHANGE_COST * 0.70 + aggressiveShift * 0.34;
          horse.goalLaneCost += laneDrain;
          horse.stamina = Math.max(0, horse.stamina - laneDrain);
          if (laneShift > 0.12) {
            horse.goalLaneCooldownUntilMs = elapsed + GOAL_LANE_CHANGE_COOLDOWN_MS;
          }
          if (!frontBlockedNow && laneShift > 0.05) {
            const rawLoss = Math.min(0.028, 0.006 + (laneShift - 0.05) * 0.14);
            const ease = (0.2 + staminaRatio * 0.5) * (0.25 + last3fWeight * 0.55);
            horse.goalCurrentMps *= Math.max(0.972, 1 - rawLoss * ease);
          }
        }

        const frontGapAfterLane = this._goalFrontGap(simHorses, horse, horse.y);
        const trafficPenalty = frontGapAfterLane < GOAL_BLOCK_X_GAP
          ? Math.max(GOAL_AI.trafficPenaltyFloor, frontGapAfterLane / GOAL_BLOCK_X_GAP)
          : 1.0;
        const furlongHint = (horse.goalMeters || 0) / GOAL_FURLONG_METERS;
        const lateBoost = 0.90
          + 0.22 * Math.pow(distRatio, 0.85)
          + 0.14 * Math.pow(distRatio, 0.72)
          + (isCloser ? 0.10 * Math.pow(Math.min(1, furlongHint), 0.5) : 0);
        // baseMps にスタミナを織り込み済みのため微調整のみ
        const staminaFineTuning = 0.97 + staminaRatio * 0.05;
        // 段階(α): 旧 surge は `0.90 + fastWeight * 0.16 + styleBoost` で
        // 事前確定着順 (arrivalTime) を直接バイアスに使っていた。これを撤廃し、
        // 残スタミナという「現在進行中のシミュ状態」だけで surge を組み立てる。
        // 値域は概ね従来と同等（0.92〜1.06 + styleBoost）に揃えてある。
        const surge = 0.92 + staminaRatio * 0.14 + styleBoost;
        const closingKick = 1
          + Math.pow(distRatio, 0.58) * (
            (isCloser ? 0.20 : 0.06) * (0.45 + last3fWeight * 0.28)
            + last3fWeight * 0.06
          )
          + Math.pow(distRatio, 1.05) * (
            (horse.style === '追込' ? 0.12 : 0) +
            (horse.style === '差し' ? 0.10 : 0) +
            last3fWeight * 0.04
          );
        // 段階(α) 追加: 残スタミナを「ゴール直前の末脚」として開放する係数。
        //   - distRatio が大きい（ゴール接近）ほど効きが強くなる（=上がり3Fの加速）
        //   - staminaRatio が低ければ開放できる余力がないためゼロに近づく
        //   - last3fWeight が高い末脚タイプは開放上限を高めにする
        // closingKick はスタミナ非依存（潜在能力）だったため、ここで「実際に
        // 余力を残せた馬だけが末脚を爆発させられる」という物理が成立する。
        const staminaUnleash =
          staminaRatio *
          (0.06 + 0.20 * Math.pow(distRatio, 0.55)) *
          (0.85 + last3fWeight * 0.30);
        const staminaKick = 1 + staminaUnleash;
        const staminaPerMeter = horse.stamina / Math.max(1, remainMeters);
        const spmNorm = normalize01(
          (staminaPerMeter - SAFE_GOAL_STAMINA_PER_M_REF) / SAFE_GOAL_STAMINA_PER_M_RANGE,
        );
        const eventFatigueNorm = normalize01((horse.eventFatigueScore ?? 0) * 0.065);
        const readiness = normalize01(spmNorm * 0.74 + (1 - eventFatigueNorm) * 0.26);
        const finalReadinessMult = USE_SAFE_STAMINA_MODEL
          ? 0.90 + 0.24 * readiness - eventFatigueNorm * SAFE_GOAL_EVENT_FATIGUE_WEIGHT * 0.08
          : 1.0;
        // スタミナ残量は baseMps 側（goalStaminaSpeedMult）で既に反映済み。
        // ここではバトルでの疲労分だけを純粋にペナルティとして反映し、
        // スタミナ二重計上で 200m 所要時間が伸びすぎる現象を解消する。
        const fatiguePenalty = Math.max(0.65, 1 - battleFatigue);
        const routeTax = Math.min(0.07, (horse.goalLaneCost ?? 0) * 0.0035);
        const routeTaxMult = 1 - routeTax * (1.15 - staminaRatio * 0.45);
        const targetMps =
          baseMps *
          lateBoost *
          staminaFineTuning *
          surge *
          styleTop *
          closingKick *
          staminaKick *
          finalReadinessMult *
          trafficPenalty *
          fatiguePenalty *
          routeTaxMult;
        // 進路AI が「その馬が本来出したい速度」で判定できるように、
        // 毎フレームの targetMps を保存しておく。
        // ブロック時に goalCurrentMps が前走馬速度へ寄せられても、
        // 「自分の野心速度」はここに残るので、進路AIが仕事を放棄しなくなる。
        horse.goalDesiredMps = targetMps;
        const accelBase = 2.3
          + last3fWeight * 1.9
          + (isCloser ? 1.1 : 0.2)
          + (isCloser ? 0.35 * last3fWeight * Math.sqrt(distRatio) : 0);
        const inBurstWindow = isCloser &&
          remainMeters >= GOAL_AI.burstWindowMetersToGoMin &&
          remainMeters <= GOAL_AI.burstWindowMetersToGoMax &&
          last3fWeight > 0.48 &&
          staminaRatio > 0.16 &&
          frontGapAfterLane > GOAL_BLOCK_X_GAP * 0.95;
        const canBurst = elapsed >= (horse.goalBurstCooldownUntilMs ?? 0) &&
          (horse.goalBurstRemainMs ?? 0) <= 0;
        if (inBurstWindow && canBurst) {
          horse.goalBurstRemainMs = GOAL_AI.burstDurationSec * 1000;
          horse.goalBurstCooldownUntilMs =
            elapsed + (GOAL_AI.burstDurationSec + GOAL_AI.burstCooldownSec) * 1000;
        }
        const burstActive = (horse.goalBurstRemainMs ?? 0) > 0;
        if (burstActive) {
          horse.goalBurstRemainMs = Math.max(0, horse.goalBurstRemainMs - dt * 1000);
        }
        const burstAccelBonus = burstActive
          ? GOAL_AI.burstAccelBonus * (0.55 + last3fWeight * 0.45)
          : 0;
        const accel = Math.max(0.55, accelBase * (0.64 + staminaRatio * 0.70) + burstAccelBonus);
        const mpsDiff = targetMps - horse.goalCurrentMps;
        const deltaV = Math.sign(mpsDiff) * Math.min(Math.abs(mpsDiff), accel * dt);
        const minMps = baseMps * GOAL_MIN_SPEED_RATIO;
        const maxMps = baseMps * GOAL_MAX_SPEED_RATIO;
        horse.goalCurrentMps = Math.max(minMps, Math.min(maxMps, horse.goalCurrentMps + deltaV));

        const accelDrain = Math.max(0, deltaV) * (1.2 + (isCloser ? 0.45 : 0.15));
        const speedDrain = horse.goalCurrentMps * 0.0115;
        const trafficDrain = (1 - trafficPenalty) * 0.85;
        const closersSprint = isCloser && distRatio > 0.28;
        const sprintStaminaMultRaw = closersSprint
          ? 1
            + 0.55 * last3fWeight * (0.35 + 0.65 * distRatio)
            + (deltaV > 0.015 ? 0.24 * last3fWeight * distRatio : 0)
            + (burstActive ? 0.14 + last3fWeight * 0.18 : 0)
          : 1;
        const sprintStaminaMult = Math.min(GOAL_AI.goalDrainSprintCap, sprintStaminaMultRaw);
        const goalDrain = (accelDrain + speedDrain + trafficDrain) * dt * GOAL_STAMINA_DRAIN_MULT * sprintStaminaMult;
        horse.stamina = Math.max(0, horse.stamina - goalDrain);

        // 前進量を「前方馬との最小間隔を踏み越えない範囲」に事前クランプする。
        // 後付けの押し出しではなく事前に前進量を絞ることで、
        // 「一旦進んでから後退するように見える」現象を根本から無くす。
        let progressedMeters = horse.goalCurrentMps * dt;
        const minForwardMeters = minMps * dt;
        const minPackGap = Math.max(5.5, GOAL_MIN_PACK_GAP_X);
        const blockingFront = this._goalFrontHorse(simHorses, horse, horse.y);
        if (blockingFront) {
          const allowedDx = (blockingFront.x - minPackGap) - horse.x;
          const scaleSelf = horse.goalProgressScale ?? 1;
          const xPerMeterSelf = Math.max(1e-6, GOAL_X_PER_METER * scaleSelf);
          const frontStartX = Number.isFinite(blockingFront._frameStartX)
            ? blockingFront._frameStartX
            : (blockingFront.x ?? 0);
          const frontAdvanceX = Math.max(0, (blockingFront.x ?? 0) - frontStartX);
          const followAdvanceMeters = frontAdvanceX / xPerMeterSelf;
          let maxAdvance;
          if (allowedDx <= 0) {
            // 既に最小間隔より内側でも停止はさせず、前走馬の進みへ追従する。
            maxAdvance = followAdvanceMeters;
          } else {
            const spacingAdvanceMeters = allowedDx / xPerMeterSelf;
            // 車間が許す限り、前走馬の流れには追従させる。
            maxAdvance = Math.max(spacingAdvanceMeters, followAdvanceMeters);
          }
          const shouldTryOvertakeBattle =
            progressedMeters > maxAdvance + 1e-6 &&
            !frameEngaged.has(horse.id) &&
            !frameEngaged.has(blockingFront.id) &&
            !this._hasGoalBattlePair(horse, blockingFront);
          if (shouldTryOvertakeBattle && shouldBattle(goalRng, simHorses, horse, blockingFront)) {
            const result = resolveBattle(goalRng, horse, blockingFront, phase);
            applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
            this._markGoalBattlePair(horse, blockingFront);
            const battleType = this._classifyGoalBattleType(horse, blockingFront, {
              isLaneChange: false,
            });
            const log = `[バトル:${battleType}] ${horse.name} vs ${blockingFront.name} → 勝者: ${result.winner.name}`;
            this._appendLog(log);
            frameEngaged.add(horse.id);
            frameEngaged.add(blockingFront.id);
            if (result.winner.id !== horse.id) {
              horse.goalCurrentMps *= 0.986;
            } else {
              horse.goalCurrentMps *= 1.004;
              blockingFront.goalCurrentMps = Math.max(0, blockingFront.goalCurrentMps * 0.996);
            }
          }
          if (progressedMeters > maxAdvance) {
            progressedMeters = maxAdvance;
            // 進路が塞がれた時は「停止」ではなく前走馬に追従する。
            // ただし旧実装のように goalCurrentMps を frontMps へ完全上書きすると、
            //   ① 自分の野心速度（targetMps への加速分）が毎フレーム消える
            //   ② 進路AI が selfMps == frontMps で必ず直進判定になる
            // という閉ループに陥り、後続全体が剛体ブロック化してしまう。
            // ここでは「上限を frontMps よりほんの少し上に締める」ソフトクランプにし、
            // 自分の速度が前走馬よりわずかに高い状態を許容する（=進路AI が機能する）。
            const frontMps = Number.isFinite(blockingFront.goalCurrentMps)
              ? blockingFront.goalCurrentMps
              : minMps;
            const blockedCeiling = Math.max(minMps, frontMps * 1.04);
            // 「下げる時だけ」反映する。すでに blockedCeiling より遅ければ自分の速度を尊重する。
            horse.goalCurrentMps = Math.max(
              minMps,
              Math.min(maxMps, Math.min(horse.goalCurrentMps, blockedCeiling)),
            );
          }
          progressedMeters = Math.max(progressedMeters, Math.min(minForwardMeters, maxAdvance));
        }
        horse.goalCurrentMps = Math.max(minMps, horse.goalCurrentMps);
        horse.goalMeters = Math.min(
          GOAL_DISTANCE_METERS + GOAL_POST_CLEAR_METERS * 3.2,
          horse.goalMeters + progressedMeters,
        );
        // x は描画 progress と 1 対 1 で対応させる。
        horse.x += progressedMeters * GOAL_X_PER_METER * (horse.goalProgressScale ?? 1);
      });

      this._enforceGoalPackSpacing(simHorses, elapsed);

      // 各馬の goalMeters 積み上げのみから progress を作る（グローバル演出による頭打ちはしない）
      const goalRenderProgressById = new Map();
      simHorses.forEach(horse => {
        const rawProgress = this._resolveGoalMappedProgress(
          horse,
          GOAL_DISTANCE_METERS,
          GOAL_PROGRESS_SPAN,
          null,
        );
        goalRenderProgressById.set(
          horse.id,
          Math.max(GOAL_PROGRESS_MIN, Math.min(GOAL_PROGRESS_MAX_POST_LINE, rawProgress)),
        );
      });
      const goalLineY = this._getScrollingGoalLineY();
      if (goalLineY != null) {
        simHorses.forEach(horse => {
          if (horse.goalFinished) return;
          const noseY = this._estimateGoalNoseY(
            horse,
            GOAL_DISTANCE_METERS,
            GOAL_PROGRESS_SPAN,
            goalRenderProgressById,
          );
          const diff = noseY - goalLineY;
          const prevDiff = this._goalLineDiffById.get(horse.id);
          this._goalLineDiffById.set(horse.id, diff);
          const crossedLine = (prevDiff == null && diff <= 0) || (prevDiff != null && prevDiff > 0 && diff <= 0);
          const reachedDistance = horse.goalMeters >= GOAL_DISTANCE_METERS;
          const isNearLine = diff <= this.renderer.cardH * 0.20;
          if (crossedLine || (reachedDistance && isNearLine)) {
            this._markHorseGoalFinished(horse);
          }
        });
      }

      this.renderer.draw(simHorses, phase, 1, {
        phaseLabel: 'ゴールシーン',
        furlong: { t },
        goalLine: rawT,
        sceneTransition: {
          t: Math.max(
            0,
            Math.min(1, (transitionHalfMs + elapsed) / Math.max(1, GOAL_SCENE_TRANSITION_MS)),
          ),
          maxAlpha: GOAL_SCENE_TRANSITION_MAX_ALPHA,
        },
        goalRun: {
          t,
          distanceMeters: GOAL_DISTANCE_METERS,
          progressSpan: GOAL_PROGRESS_SPAN,
          maxProgress: GOAL_PROGRESS_MAX_POST_LINE,
          minProgress: GOAL_PROGRESS_MIN,
          progressById: goalRenderProgressById,
          laneIntentById,
          overtakePressureById,
        },
      });
      this.lastRenderedHorses = simHorses.map(h => ({ ...h }));
      updateEntryStaminaBars(simHorses);

      const allFinished = simHorses.every(h => h.goalFinished);
      // 既定の演出尺を超えても残っている馬がいる場合、テレポートはせず
      // 「徐々にスピードを引き上げる」ことで自然にゴールラインを通過させる。
      // テレポート（goalMeters/x のジャンプ）はスムージングと噛み合わず
      // ゴール手前で馬が消えたように見えるため使用しない。
      const overdue = elapsed - durationMs;
      if (overdue > 0 && !allFinished) {
        const boostT = Math.min(1, overdue / Math.max(1, durationMs));
        const speedBoostMult = 1 + 0.55 * boostT; // 最大 1.55 倍まで段階的に
        simHorses.forEach(h => {
          if (h.goalFinished) return;
          const baseFloor = h.goalIntrinsicMps * speedBoostMult;
          if (h.goalCurrentMps < baseFloor) {
            h.goalCurrentMps = baseFloor;
          }
        });
      }
      if (simHorses.every(h => h.goalFinished) && this._goalAllFinishedAtMs == null) {
        this._goalAllFinishedAtMs = elapsed;
      }
      // 描画平滑化後の実座標で「馬体が完全に画面外へ抜けたか」を判定する。
      // 理論 progress だけで判定すると、見た目が残っているのに終了することがある。
      const allClearedTop = simHorses.every(horse => {
        const rendered = this.renderer.horseRenderState.get(horse.id);
        if (!rendered || !Number.isFinite(rendered.cy)) return false;
        const iconBottomY = rendered.cy + this.renderer.cardH * 0.5;
        return iconBottomY < -2;
      });
      const canFinish =
        this._goalAllFinishedAtMs != null &&
        allClearedTop &&
        elapsed >= this._goalAllFinishedAtMs + GOAL_POST_SCROLL_MS;
      if (canFinish) {
        this.isAnimating = false;
        this.lastRenderedHorses = simHorses.map(h => ({ ...h }));
        onDone?.();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _goalFrontHorse(horses, horse, lane, atX = horse.x) {
    const nearLaneGap = this._getGoalNearLaneGap();
    return horses
      .filter(h =>
        h.id !== horse.id &&
        h.x > atX &&
        Math.abs(h.y - lane) < nearLaneGap,
      )
      .sort((a, b) => a.x - b.x)[0] ?? null;
  }

  _goalFrontIsSlower(horses, horse, lane) {
    const front = this._goalFrontHorse(horses, horse, lane);
    if (!front) return false;
    // ブロック中は goalCurrentMps が前走馬速度に寄せられているため、現速度だけ
    // で比較すると「自分は速いのに前と同速 → 直進維持」と誤判定する。
    // ここも進路AI ゲートと同じく、野心速度 (goalDesiredMps) と現速度のうち
    // 大きい方を採用し、「自分が本当に出したい速度」で前走馬と比較する。
    const selfM = Math.max(horse.goalDesiredMps ?? 0, horse.goalCurrentMps ?? 0);
    const frontM = Math.max(front.goalDesiredMps ?? 0, front.goalCurrentMps ?? 0);
    return selfM > frontM * 1.04;
  }

  /**
   * 自分の「進路上」に自分より遅い馬がいるか（= 直進では追いつかれて詰まる）。
   * 同レーン判定は厳密に nearLaneGap 内だけにし、斜め前で別レーンを走っている
   * 関係ない馬では発火しないようにする（その馬は自分の進路を塞いでいない）。
   */
  _goalShouldSeekPass(horses, horse) {
    // ブロック中は goalCurrentMps が前走馬に寄せられて速度差が消えるため、
    // 「現速度」だけで判断すると追い抜き意欲が立ち上がらない。
    // 自分は野心速度 (goalDesiredMps) を尊重し、相手も野心と現速度の大きい方で
    // 比較することで「本当は速い後続」が前を抜きにいく動きを取り戻す。
    const selfM = Math.max(horse.goalDesiredMps ?? 0, horse.goalCurrentMps ?? 0);
    if (!Number.isFinite(selfM) || selfM < 1e-6) return false;
    const near = this._getGoalNearLaneGap();
    const maxDx = GOAL_AI.passSeekMaxForwardX;
    for (const o of horses) {
      if (o.id === horse.id || o.goalFinished) continue;
      const dx = o.x - horse.x;
      if (dx <= 0.5 || dx > maxDx) continue;
      if (Math.abs(o.y - horse.y) >= near) continue;
      const oM = Math.max(o.goalDesiredMps ?? 0, o.goalCurrentMps ?? 0);
      if (selfM > oM * 1.03) return true;
    }
    return false;
  }

  /**
   * ゴールシーン専用: 自分の前方近接バンド内で、横方向に minWidth 以上空いた切れ目
   * （= 「割って入れる隙間」）を 1 つだけ返す。
   *
   * 使い所は _planGoalRouteV2 のみ。判定は純粋な幾何計算で副作用を持たない。
   * @returns {{ center:number, width:number, low:number, high:number } | null}
   */
  _goalDetectInnerSqueezeAhead(horses, horse, options = {}) {
    const currentLane = clampLane(horse.y);
    // 既定値は 1.5 頭分（馬体幅 cardW = laneW * 0.6 → 1.5 頭 ≒ 0.9 レーン）。
    const minWidth = options.minWidth ?? 0.9;
    // 横方向探索範囲。これより外の馬は別世界として扱う。
    const lateralReach = options.lateralReach ?? 1.6;
    // X 方向の前方バンド: 直近すぎ（既に並走）と遠すぎ（視程外）を除外し
    // 「目の前」だけを切り出す。
    const xMin = horse.x + GOAL_BLOCK_X_GAP * 0.35;
    const xMax = horse.x + GOAL_BLOCK_X_GAP * 1.8;
    const cluster = horses
      .filter(o =>
        o.id !== horse.id &&
        !o.goalFinished &&
        o.x >= xMin && o.x <= xMax &&
        Math.abs(o.y - currentLane) < lateralReach,
      )
      .sort((a, b) => a.y - b.y);
    // 仮想壁として lateralReach の両端を加え、馬体間の横隙間を列挙する。
    // 片側が完全に空でも自然に「片側ガラ空き」として検出できる構造。
    const ys = [
      currentLane - lateralReach,
      ...cluster.map(o => o.y),
      currentLane + lateralReach,
    ];
    let best = null;
    for (let i = 0; i < ys.length - 1; i += 1) {
      const width = ys[i + 1] - ys[i];
      if (width < minWidth) continue;
      const center = (ys[i] + ys[i + 1]) / 2;
      // 「目の前」と言える範囲（自レーン±1.0）の隙間だけ採用する。
      // ここを越えるなら _planGoalRouteV2 の通常の外側候補で扱うべき領域。
      if (Math.abs(center - currentLane) > 1.0) continue;
      if (!best || width > best.width) {
        best = { center, width, low: ys[i], high: ys[i + 1] };
      }
    }
    return best;
  }

  /**
   * 進路変更（lane y の連続値遷移）が、新たな同レーン重なりを生むかどうかを判定する。
   * 既に重なっている相手は判定対象外（離脱方向の進路変更を妨げない）。
   */
  _goalLaneChangeWouldOverlap(horses, horse, candidateY) {
    const minPackGap = Math.max(5.5, GOAL_MIN_PACK_GAP_X);
    const sameLaneGap = 0.78;
    const currentY = horse.y;
    for (const o of horses) {
      if (o.id === horse.id) continue;
      const distNew = Math.abs(o.y - candidateY);
      if (distNew >= sameLaneGap) continue;
      if (Math.abs(o.x - horse.x) >= minPackGap) continue;
      // 既に同レーン重なりだった相手は無視する（脱出方向の進路変更まで止めない）。
      const distNow = Math.abs(o.y - currentY);
      if (distNow >= sameLaneGap) return true;
    }
    return false;
  }

  _enforceGoalPackSpacing(horses, elapsedMs = 0) {
    // 視覚上の馬体幅は cardW = laneW * 0.6 なので、laneDiff < 0.78 で必ず重なる。
    // 「強い間隔」を要求する閾値は安全側で 0.78、隣接気味の重なりも捌くため
    // 「弱い間隔」を 1.10 まで適用する。
    const sameLaneGap = 0.78;
    const adjacentLaneGap = 1.10;
    const minGap = Math.max(5.5, GOAL_MIN_PACK_GAP_X);
    const adjacentMinGap = minGap * 0.55;
    // レーン変更直後の馬は、追い抜きで肩を並べに行く瞬間の動きを優先する。
    // この間は隣接（同レーンではない）押し戻しを 0.55 倍まで弱める。
    // ※ 同レーンでの重なりは安全のため緩めない（馬体重なりは常に防ぐ）。
    const recentLaneChangeAdjacentScale = 0.55;
    // 1 フレームあたりの押し戻し量上限（フレーム冒頭値を下限とした単調クランプの中での上限）。
    // 実際のレースでは後退は起こり得ないため、押し戻しても「フレーム冒頭」より戻さない設計。
    const maxShavePerFrame = 0.45;
    for (let iter = 0; iter < 6; iter += 1) {
      let changed = false;
      const sorted = [...horses].sort((a, b) => a.x - b.x);
      for (const h of sorted) {
        let bestMaxX = Infinity;
        // h（後方馬）が直近にレーン変更を採用していれば、隣接押し戻しを弱める。
        const hRecentLaneChange = elapsedMs > 0 &&
          (h.goalLaneEnterUntilMs ?? 0) > elapsedMs;
        for (const o of horses) {
          if (o.id === h.id) continue;
          const laneDiff = Math.abs(o.y - h.y);
          if (laneDiff >= adjacentLaneGap) continue;
          if (o.x <= h.x) continue;
          const isAdjacent = laneDiff >= sameLaneGap;
          // 「同レーンの最小間隔」は常に維持。
          // 「隣接レーンの最小間隔」だけを、いずれかの馬が直近にレーン変更していれば緩める。
          const oRecentLaneChange = elapsedMs > 0 &&
            (o.goalLaneEnterUntilMs ?? 0) > elapsedMs;
          const adjacentScale = (isAdjacent && (hRecentLaneChange || oRecentLaneChange))
            ? recentLaneChangeAdjacentScale
            : 1;
          const gap = isAdjacent ? adjacentMinGap * adjacentScale : minGap;
          const candidateMaxX = o.x - gap;
          if (candidateMaxX < bestMaxX) bestMaxX = candidateMaxX;
        }
        if (!Number.isFinite(bestMaxX)) continue;
        if (h.x > bestMaxX + 1e-6) {
          const desiredShave = h.x - bestMaxX;
          const shave = Math.min(desiredShave, maxShavePerFrame);
          // フレーム冒頭値を下限として後退クランプ。
          // x / goalMeters はフレーム間で絶対に減らない（後退禁止）ため、
          // 「フレーム内で進みすぎた分だけを進まなかったことにする」挙動に置き換わる。
          const floorX = Number.isFinite(h._frameStartX) ? h._frameStartX : (h.x - shave);
          const newX = Math.max(h.x - shave, floorX);
          const actualShave = h.x - newX;
          if (actualShave > 1e-9) {
            h.x = newX;
            // x が progressScale 倍速で進む再束縛を踏まえて、
            // goalMeters の戻し量も scale を割って整合させる。
            const scale = h.goalProgressScale ?? 1;
            const floorGoalMeters = Number.isFinite(h._frameStartGoalMeters)
              ? h._frameStartGoalMeters
              : 0;
            h.goalMeters = Math.max(
              floorGoalMeters,
              (h.goalMeters ?? 0) - actualShave / Math.max(1e-6, GOAL_X_PER_METER * scale),
            );
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }

  _goalFrontGap(horses, horse, lane, atX = horse.x) {
    const front = this._goalFrontHorse(horses, horse, lane, atX);
    if (!front) return 999;
    return front.x - atX;
  }

  _getGoalNearLaneGap() {
    const t = Math.max(0, Math.min(1, this._goalRawT ?? 0));
    return GOAL_NEAR_LANE_GAP_BASE + (GOAL_NEAR_LANE_GAP_MAX - GOAL_NEAR_LANE_GAP_BASE) * t;
  }

  _goalLaneDensity(horses, horse, lane, atX = horse.x) {
    const nearLaneGap = this._getGoalNearLaneGap() + 0.08;
    return horses.reduce((acc, h) => {
      if (h.id === horse.id || Math.abs(h.y - lane) >= nearLaneGap) return acc;
      const dx = h.x - atX;
      if (Math.abs(dx) > 24) return acc;
      if (dx >= 0) return acc + (dx < 12 ? 1.25 : 0.8);
      return acc + 0.35;
    }, 0);
  }

  _findGoalCutInRival(horses, horse, targetLane) {
    const laneTo = clampLane(targetLane);
    const laneFrom = clampLane(horse.y);
    return horses.find(h => {
      if (h.id === horse.id) return false;
      const rearGap = horse.x - h.x;
      if (rearGap <= 0 || rearGap > DIAGONAL_REAR_BLOCK_X_GAP) return false;
      if (!isLaneInShiftPath(h.y, laneFrom, laneTo, 0.9)) return false;
      return Math.abs(h.x - horse.x) < LATERAL_BLOCK_X_GAP * 0.95;
    });
  }

  _getGoalBattlePairKey(a, b) {
    const idA = String(a?.id ?? '');
    const idB = String(b?.id ?? '');
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  }

  _hasGoalBattlePair(a, b) {
    return this._goalBattledPairs.has(this._getGoalBattlePairKey(a, b));
  }

  _markGoalBattlePair(a, b) {
    this._goalBattledPairs.add(this._getGoalBattlePairKey(a, b));
  }

  _classifyGoalBattleType(a, b, options = {}) {
    if (options?.isLaneChange) return '進路争い';
    const maxGoalMeters = Math.max(a?.goalMeters ?? 0, b?.goalMeters ?? 0);
    const remain = Math.max(0, GOAL_DISTANCE_METERS - maxGoalMeters);
    const neckAndNeck = Math.abs((a?.x ?? 0) - (b?.x ?? 0)) <= GOAL_BLOCK_X_GAP * 0.7;
    if (remain <= 35 && neckAndNeck) return 'ゴール前叩き合い';
    return '追い抜き争い';
  }

  _getScrollingGoalLineY() {
    // ゴールラインは表示後に固定し、馬だけが上方向へ進んで通過する。
    return this.renderer.H * 0.08;
  }

  _estimateGoalNoseY(horse, distanceMeters, progressSpan, progressById = null) {
    const mappedProgress = this._resolveGoalMappedProgress(
      horse,
      distanceMeters,
      progressSpan,
      progressById,
    );
    const cy = this.renderer.progressToY(mappedProgress);
    return cy - this.renderer.cardH * 0.49;
  }

  _resolveGoalMappedProgress(horse, distanceMeters, progressSpan, progressById = null) {
    const forced = progressById?.get(horse.id);
    if (Number.isFinite(forced)) {
      return Math.max(GOAL_PROGRESS_MIN, Math.min(GOAL_PROGRESS_MAX_POST_LINE, forced));
    }
    const advanceRatio = Math.max(0, Math.min(2.5, (horse.goalMeters ?? 0) / Math.max(1, distanceMeters)));
    const startProgress = Number.isFinite(horse.goalStartProgress)
      ? horse.goalStartProgress
      : 0.20;
    const progressScale = Number.isFinite(horse.goalProgressScale) ? horse.goalProgressScale : 1;
    const progress = startProgress + advanceRatio * progressSpan * progressScale;
    return Math.max(GOAL_PROGRESS_MIN, Math.min(GOAL_PROGRESS_MAX_POST_LINE, progress));
  }

  _buildGoalLogicProgressMap(horses, distanceMeters, progressSpan, t = 0) {
    const rawById = new Map();
    let leaderRaw = -Infinity;
    horses.forEach(horse => {
      const raw = this._resolveGoalMappedProgress(horse, distanceMeters, progressSpan, null);
      rawById.set(horse.id, raw);
      if (raw > leaderRaw) leaderRaw = raw;
    });
    if (!Number.isFinite(leaderRaw)) leaderRaw = GOAL_LEADER_ANCHOR_PROGRESS;

    if (!Number.isFinite(this._goalCameraRawProgress)) {
      this._goalCameraRawProgress = leaderRaw;
    } else {
      const tClamped = Math.max(0, Math.min(1, t));
      const followLerp = GOAL_CAMERA_LERP + (GOAL_CAMERA_LERP_MAX - GOAL_CAMERA_LERP) * tClamped;
      this._goalCameraRawProgress += (leaderRaw - this._goalCameraRawProgress) * followLerp;
    }

    const tClamped = Math.max(0, Math.min(1, t));
    const inEarlyFurlongPhase = t < GOAL_EARLY_PHASE_T;
    const earlySpread = inEarlyFurlongPhase ? GOAL_SPREAD_EARLY_MULT : 1;
    const dynamicScale =
      (GOAL_ANCHOR_FOLLOW_SCALE + GOAL_ANCHOR_DYNAMIC_BOOST * (1 - tClamped)) * earlySpread;

    const anchoredById = new Map();
    horses.forEach(horse => {
      const raw = rawById.get(horse.id) ?? GOAL_LEADER_ANCHOR_PROGRESS;
      const anchored =
        GOAL_LEADER_ANCHOR_PROGRESS + (raw - this._goalCameraRawProgress) * dynamicScale;
      anchoredById.set(horse.id, Math.max(0.05, Math.min(GOAL_ANCHOR_MAX_PROGRESS, anchored)));
    });
    return anchoredById;
  }

  _buildGoalVisualProgressMap(horses, logicProgressById, t = 0) {
    const tClamped = Math.max(0, Math.min(1, t));
    const lateT = Math.max(0, Math.min(1, (tClamped - GOAL_AI.visualLateStartT) / Math.max(1e-6, 1 - GOAL_AI.visualLateStartT)));
    const amplify = 1 + GOAL_AI.visualLateBoost * lateT;
    const visualById = new Map();
    horses.forEach(horse => {
      const logic = logicProgressById.get(horse.id) ?? GOAL_LEADER_ANCHOR_PROGRESS;
      const visual = GOAL_LEADER_ANCHOR_PROGRESS + (logic - GOAL_LEADER_ANCHOR_PROGRESS) * amplify;
      visualById.set(horse.id, Math.max(GOAL_PROGRESS_MIN, Math.min(GOAL_PROGRESS_MAX_POST_LINE, visual)));
    });
    return visualById;
  }

  _calcGoalAggression(horse, staminaRatio, last3fWeight, distRatio) {
    const base = GOAL_AI.aggrBaseByStyle[horse.style] ?? 0.5;
    const value =
      base +
      staminaRatio * GOAL_AI.aggrStaminaGain +
      last3fWeight * GOAL_AI.aggrLast3fGain +
      (1 - distRatio) * 0.18;
    return Math.max(0.2, Math.min(1.8, value));
  }

  _predictGoalX(horse, horizonSec = GOAL_AI.horizonSec) {
    const currentMps =
      horse.goalCurrentMps ??
      (horse.goalIntrinsicMps != null
        ? horse.goalIntrinsicMps * goalStaminaSpeedMult(
          horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0.5,
        )
        : goalIntrinsicMpsFromLast3f(horse.last3f));
    const deltaMeters = currentMps * horizonSec;
    // ゴールシーン中は horse.x が描画 progress と同期しているため、
    // 予測の前進量にも goalProgressScale を反映する必要がある。
    return horse.x + deltaMeters * GOAL_X_PER_METER * (horse.goalProgressScale ?? 1);
  }

  /**
   * 短期（horizon）で自他の直進予測を重ね、レーン接近＋前後距離が詰まるほどコストを加算する。
   */
  _goalMultiStepCollisionCost(horses, horse, testLane) {
    const stepSec = GOAL_AI.predictStepSec;
    const horizon = GOAL_AI.horizonSec;
    const n = Math.max(1, Math.round(horizon / stepSec));
    let selfMps = horse.goalCurrentMps;
    if (!Number.isFinite(selfMps)) {
      selfMps = Number.isFinite(horse.goalIntrinsicMps)
        ? horse.goalIntrinsicMps * 0.92
        : goalIntrinsicMpsFromLast3f(horse.last3f);
    }
    // ゴールシーン中は horse.x が描画 progress と同期している（goalProgressScale 倍速）。
    // 予測も同じ尺度で行わないと、自他の前後関係が描画と乖離してしまう。
    const selfScale = horse.goalProgressScale ?? 1;
    const selfVx = selfMps * GOAL_X_PER_METER * selfScale;
    const nearLaneBase = this._getGoalNearLaneGap() + 0.1;
    let cost = 0;
    for (let k = 1; k <= n; k += 1) {
      const time = stepSec * k;
      const sx = horse.x + selfVx * time;
      for (const o of horses) {
        if (o.id === horse.id || o.goalFinished) continue;
        let oMps = o.goalCurrentMps;
        if (!Number.isFinite(oMps)) {
          oMps = Number.isFinite(o.goalIntrinsicMps)
            ? o.goalIntrinsicMps * 0.92
            : goalIntrinsicMpsFromLast3f(o.last3f);
        }
        const oScale = o.goalProgressScale ?? 1;
        const ox = o.x + oMps * GOAL_X_PER_METER * oScale * time;
        const laneDist = Math.abs(testLane - o.y);
        const nearLane = nearLaneBase * (isNigeStyle(o.style) || o.style === '先行' ? 1.02 : 1);
        if (laneDist >= nearLane) continue;
        const laneFactor = 1 - laneDist / Math.max(1e-6, nearLane);
        const dx = ox - sx;
        const frontBand = GOAL_BLOCK_X_GAP * 1.38;
        const rearBand = GOAL_BLOCK_X_GAP * 0.92;
        if (dx > 0 && dx < frontBand) {
          cost += (1 - dx / frontBand) * laneFactor * (0.85 + 0.15 * k / n);
        } else if (dx <= 0 && dx > -rearBand) {
          cost += (1 - Math.abs(dx) / rearBand) * laneFactor * 0.42 * (0.85 + 0.15 * k / n);
        }
      }
    }
    return cost * GOAL_AI.collisionHorizonWeight;
  }

  _planGoalRouteV2(horses, horse, context = {}) {
    const currentLane = clampLane(horse.y);
    const staminaRatio = context.staminaRatio ?? 0.5;
    const last3fWeight = context.last3fWeight ?? 0.5;
    const aggression = context.aggression ?? 0.5;
    const frontBlocked = Boolean(context.frontBlocked);
    const urgeOvertake = Boolean(context.urgeOvertake);
    const stuckMs = Math.max(0, Math.min(2000, context.stuckMs ?? 0));
    const jockeyReliability = getJockeyReliabilityNorm(horse);
    const jockeyAggression = getJockeyAggressionNorm(horse);
    const riderAggression = Math.max(0, Math.min(1, aggression * 0.68 + jockeyAggression * 0.32));
    const horizonSec = GOAL_AI.horizonSec;

    // 進路が完全に空いている、または前方馬が自分以上に速い／実質追いつかない場合は
    // 直進が最適。ここで早期に確定することで、スタイルバイアスや aggression による
    // 「目の前が空いているのに左右に揺れる」現象を根本から防ぐ。
    const frontInCurrent = this._goalFrontHorse(horses, horse, currentLane);
    const farFrontThreshold = GOAL_AI.passSeekMaxForwardX;
    if (!frontInCurrent || (frontInCurrent.x - horse.x) > farFrontThreshold) {
      return { lane: currentLane, gain: 0, pressure: 0 };
    }
    // 「現速度」ではなく「その馬が本来出したい速度（=直近の targetMps）」で比較する。
    // ブロック時に goalCurrentMps が frontMps へ寄せられても、goalDesiredMps は
    // その馬の野心を保持しているので、AI が「直進維持」一択に固まらなくなる。
    // どちらかの値（野心 or 現速）が前走馬より明確に速ければ、別レーンの評価に進む。
    const selfDesired = Math.max(
      horse.goalDesiredMps ?? 0,
      horse.goalCurrentMps ?? 0,
    );
    const frontDesired = Math.max(
      frontInCurrent.goalDesiredMps ?? 0,
      frontInCurrent.goalCurrentMps ?? 0,
    );
    // 詰まり時間が長くなるほどゲートを甘くする（最低でも 0.97 倍までは緩める）。
    // 例: 0.6 秒詰まりで 1.005、1.2 秒で ~0.985 → 微差でも進路評価に進めるようになる。
    const gateRatio = Math.max(0.97, 1.02 - stuckMs / 1200 * 0.05);
    if (selfDesired <= frontDesired * gateRatio) {
      // 自分が出したい速度でも前方馬の方が速い -> 進路変更しても追いつけない。直進維持。
      return { lane: currentLane, gain: 0, pressure: 0 };
    }

    // === ゴール前「内突き」判定 ==========================================
    // 内側で詰まっていて、かつ「足・余力・バトル勝率」が揃っている馬だけが、
    // 目の前の 1.5 頭分の隙間に対してリスクを取って割り込む挙動を許可する。
    // この AI が呼ばれるのはゴールシーンだけなので、追加のシーン判定は不要。
    const isInnerTrapped =
      currentLane <= 4 &&
      frontBlocked &&
      stuckMs >= 400;
    // resolveBattle と同じ式（ノイズ無し）で勝率の指標を作る。
    // 期待値プラス（Δedge ≥ 2.0）でない限り内突きは選ばない。
    const battleEdgeOf = h =>
      (Number.isFinite(h.M_maneuv) ? h.M_maneuv : 50) * 0.6 +
      (Number.isFinite(h.S_cruise) ? h.S_cruise : 50) * 0.4;
    const selfEdge = battleEdgeOf(horse);
    const frontEdge = battleEdgeOf(frontInCurrent);
    const squeezeRequiredStamina = 0.30 + jockeyReliability * 0.03 - jockeyAggression * 0.04;
    const squeezeSpeedRatio = 1.06 + jockeyReliability * 0.015 - jockeyAggression * 0.025;
    const squeezeEdge = Math.max(0.8, Math.min(3.2, 2.0 + jockeyReliability * 1.4 - jockeyAggression * 1.6));
    const isCapableOfSqueeze =
      staminaRatio >= squeezeRequiredStamina &&   // 余力が残っている
      selfDesired >= frontDesired * squeezeSpeedRatio && // 出したい速度が明確に速い
      (selfEdge - frontEdge) >= squeezeEdge;      // 騎手の勝負気質に応じたリスク許容
    const squeeze = (isInnerTrapped && isCapableOfSqueeze)
      ? this._goalDetectInnerSqueezeAhead(horses, horse)
      : null;
    // 突けるなら割り込む先のレーン（整数）を確定。
    const squeezeLane = squeeze ? clampLane(Math.round(squeeze.center)) : null;

    const projectedX = this._predictGoalX(horse, horizonSec);
    const baseProjectedGap = this._goalFrontGap(horses, horse, currentLane, projectedX);
    const candidates = [
      currentLane,
      currentLane - 1,
      currentLane + 1,
      currentLane - 2,
      currentLane + 2,
      currentLane - 3,
      currentLane + 3,
    ]
      .map(v => clampLane(v))
      .filter((v, i, arr) => arr.indexOf(v) === i);
    const styleOutsideBiasBase = (horse.style === '差し' || horse.style === '追込') ? 0.58 : 0.16;
    const closerRoute = horse.style === '差し' || horse.style === '追込';
    const spreadBoost = closerRoute
      ? last3fWeight * 0.55 + staminaRatio * 0.35
      : staminaRatio * 0.12;
    const styleOutsideBias = styleOutsideBiasBase * (0.75 + Math.min(1, spreadBoost));
    const keepStraightFactor = closerRoute ? Math.max(0.35, 1.15 - spreadBoost * 0.55) : 1;
    const lowStamina = staminaRatio < 0.22;
    // 内側で詰まっている時の外脱出補助：
    // currentLane が浅い（=内側）ほど、かつ stuckMs が長いほど、外側候補の評価を持ち上げる。
    // インナー側へ動く候補にはボーナスを与えない（=押し込み合いの悪化を避ける）。
    // ただし squeeze（内突き）が成立している馬は、外に流すと意図と矛盾するため 0 に。
    const innerEscapeStrength = squeeze
      ? 0
      : Math.max(0, Math.min(1, stuckMs / 1000)) *         // 1.0 秒で最大
        Math.max(0, Math.min(1, (4 - currentLane) / 3)) *  // lane 1〜4 で線形に強くなる
        (frontBlocked ? 1 : 0.5);                          // 詰まっている時は満額

    let bestLane = currentLane;
    let bestScore = -Infinity;
    let currentScore = -Infinity;
    candidates.forEach(lane => {
      const staminaLanePenalty = lowStamina ? Math.abs(lane - currentLane) * 1.85 : 0;
      const projectedGap = this._goalFrontGap(horses, horse, lane, projectedX);
      const projectedDensity = this._goalLaneDensity(horses, horse, lane, projectedX);
      const moveCost = Math.abs(lane - currentLane) * GOAL_AI.laneMoveCostPerLane;
      const staminaRisk = Math.max(0, moveCost * 0.18 - staminaRatio * 0.35);
      const blockRisk = Math.max(0, 1 - Math.min(1, projectedGap / Math.max(1, GOAL_BLOCK_X_GAP * 1.3)));
      const safeLaneBonus = jockeyReliability * Math.max(0, projectedGap - baseProjectedGap) * 0.16;
      const styleBonus = lane * styleOutsideBias * (0.45 + last3fWeight * 0.55);
      const projectedGain = Math.min(projectedGap, 92) * GOAL_AI.projectedGapWeight;
      const keepStraightMult = urgeOvertake && !frontBlocked ? 0.36 : 1;
      const keepStraightPenalty = !frontBlocked
        ? Math.abs(lane - currentLane) * 2.9 * keepStraightFactor * keepStraightMult
        : 0;
      const passLaneBonus = urgeOvertake
        ? Math.max(0, projectedGap - baseProjectedGap) * 0.52
        : 0;
      const collisionHorizonCost = this._goalMultiStepCollisionCost(horses, horse, lane);
      // 外側候補のみ加点。lane が currentLane より内側 or 同じならゼロ。
      const innerEscapeBonus = lane > currentLane
        ? innerEscapeStrength * (lane - currentLane) * 1.6
        : 0;
      // 内突き（squeeze）が成立している馬だけに与える、隙間中心方向への強加点。
      // 隙間中心と一致する整数レーンで最大、隣レーンで半減、2 レーン以上ずれるとゼロ。
      // 隙間幅（width）が広いほどボーナスを伸ばす（1.5 頭分=0.9 で発火、上限を設けて暴走防止）。
      // styleOutsideBias / innerEscapeBonus の典型値を上回る程度の強度に設定し、
      // 「能力ゲートを抜けた馬は内突きを最優先」と planner に伝える。
      const splitThroughBonus = squeeze
        ? Math.max(0, 1.2 - Math.abs(lane - squeezeLane)) *
          Math.min(1.4, 0.6 + (squeeze.width - 0.9) * 1.6) *
          2.4
        : 0;
      const score =
        projectedGain -
        projectedDensity * GOAL_AI.densityWeight * (1 + jockeyReliability * 0.18) -
        blockRisk * GOAL_AI.blockRiskWeight * (1 + jockeyReliability * 0.28) -
        moveCost * (1 + jockeyReliability * 0.14 - jockeyAggression * 0.10) -
        staminaRisk -
        keepStraightPenalty -
        collisionHorizonCost -
        staminaLanePenalty +
        styleBonus +
        riderAggression * 0.8 +
        passLaneBonus * (0.85 + riderAggression * 0.35) +
        innerEscapeBonus * (0.9 + jockeyReliability * 0.3) +
        safeLaneBonus +
        splitThroughBonus * (0.78 + jockeyAggression * 0.45);
      if (Math.abs(lane - currentLane) < 0.01) currentScore = score;
      if (score > bestScore) {
        bestScore = score;
        bestLane = lane;
      }
    });
    return {
      lane: bestLane,
      gain: bestScore - currentScore,
      pressure: Math.max(0, Math.min(1, (bestScore - currentScore) / 6.0)),
    };
  }

  _markHorseGoalFinished(horse) {
    if (horse.goalFinished) return;
    horse.goalFinished = true;
    if (!this._goalRankLogged.has(horse.id)) {
      this._goalRankLogged.add(horse.id);
      this._goalRankOrder.push(horse.id);
      if (!this._goalPlacingHeaderLogged) this._goalPlacingHeaderLogged = true;
      const placing = this._goalRankOrder.length;
      this._setPlacingLog(placing, horse);
    }
  }

  _chooseGoalLane(horses, horse, t = 1) {
    const currentLane = clampLane(horse.y);
    const candidates = [
      currentLane,
      currentLane - 1,
      currentLane + 1,
      currentLane - 2,
      currentLane + 2,
      currentLane - 3,
      currentLane + 3,
      currentLane - 4,
      currentLane + 4,
    ]
      .map(v => clampLane(v))
      .filter((v, i, arr) => arr.indexOf(v) === i);

    let bestLane = currentLane;
    let bestScore = -Infinity;
    let currentScore = -Infinity;
    candidates.forEach(lane => {
      const frontGap = this._goalFrontGap(horses, horse, lane);
      const density = this._goalLaneDensity(horses, horse, lane);
      const moveCost = Math.abs(lane - currentLane) * (1.25 - Math.min(0.55, t * 0.55));
      const outsideBias = (horse.style === '差し' || horse.style === '追込')
        ? lane * 0.68
        : lane * 0.18;
      const openLaneBonus = frontGap > GOAL_BLOCK_X_GAP * 1.65 ? 4.5 : 0;
      const score = Math.min(frontGap, 84) * 1.34 - density * 5.8 - moveCost + outsideBias + openLaneBonus;
      if (Math.abs(lane - currentLane) < 0.01) {
        currentScore = score;
      }
      if (score > bestScore) {
        bestScore = score;
        bestLane = lane;
      }
    });
    return { lane: bestLane, score: bestScore, currentScore };
  }

  next(onFinish) {
    if (this.isAnimating) return;
    this.currentIdx++;
    if (this.currentIdx >= this.snapshots.length) {
      this._syncAdvanceButton();
      this._playGoalApproach(() => onFinish());
      return;
    }
    this._renderPhase(this.currentIdx);
  }
}

const SIMULATOR_BOOT =
  typeof document !== 'undefined' &&
  Boolean(document.getElementById('field-canvas'));

// =====================
//  エントリーポイント
// =====================
if (SIMULATOR_BOOT) {
Promise.all([
  fetch('./src/data/race-info.json').then(res => res.json()),
  fetch('./src/data/race-entries.json').then(res => res.json()),
  fetch('./src/data/courses.json').then(res => res.json()),
])
  .then(([raceInfoData, raceEntriesData, courseCatalog]) => {
    if (raceInfoData?.race_id !== raceEntriesData?.race_id) {
      throw new Error(`race_id mismatch: race-info=${raceInfoData?.race_id} race-entries=${raceEntriesData?.race_id}`);
    }
    const raceData = {
      race_id: raceInfoData.race_id,
      race_info: raceInfoData.race_info,
      entries: cloneRaceEntries(raceEntriesData.entries),
    };
    const courseDef = resolveCourseDef(raceData, courseCatalog);
    const runtimeRaceData = { ...raceData, courseDef };
    const phases        = buildPhases(runtimeRaceData.race_info.distance, courseDef);
    const track         = raceData.race_info.track;
    const condition     = raceData.race_info.condition;
    const renderer      = new Renderer('field-canvas', phases.length, track, condition, courseDef);

    /** calcAllParams のユーザー微調整（巡航・瞬発・持久） */
    const userTweaksState = {};
    runtimeRaceData.entries.forEach((_, idx) => {
      userTweaksState[idx] = { cruise: 0, maneuv: 0, sustain: 0 };
    });

    let initialHorses = [];
    let horseMetaByName = new Map();

    let controller = null;
    let simResults = null;
    let simLogs    = null;
    let simSnapshots = null;
    let lastFinishOrderIds = [];
    let lastRunReproducible = false;

    const btnRun   = document.getElementById('btn-run');
    const btnReset = document.getElementById('btn-reset');
    const btnShowSummary = document.getElementById('btn-show-summary');
    const btnBackToSimulator = document.getElementById('btn-back-to-simulator');
    const btnBackToPreRace = document.getElementById('btn-back-to-pre-race');
    const reproducibleToggle = document.getElementById('toggle-reproducible');
    const autoAdvanceToggle = document.getElementById('toggle-auto-advance');
    const raceInfoEl = document.getElementById('race-info');
    let lastSeed = runtimeRaceData.race_id;
    let autoAdvanceRafId = 0;
    let currentRaceUsedAutoAdvance = false;

    function stopAutoAdvanceLoop() {
      if (autoAdvanceRafId) {
        cancelAnimationFrame(autoAdvanceRafId);
        autoAdvanceRafId = 0;
      }
    }

    function isAutoDrivingRace() {
      return Boolean(controller && autoAdvanceToggle?.checked);
    }

    function syncSimulatorChromeForAutoMode() {
      const btnOpenStats = document.getElementById('btn-open-stats');
      const driving = isAutoDrivingRace();
      if (controller && driving) {
        controller.setAdvanceExternallyLocked(true);
        btnRun.disabled = true;
        btnReset.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = true;
        if (reproducibleToggle) reproducibleToggle.disabled = true;
        if (btnBackToPreRace && !btnBackToPreRace.hidden) btnBackToPreRace.disabled = true;
      } else if (controller) {
        controller.setAdvanceExternallyLocked(false);
        btnReset.disabled = false;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = false;
        if (reproducibleToggle) reproducibleToggle.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
        controller._syncAdvanceButton();
      } else {
        if (btnOpenStats) btnOpenStats.disabled = false;
        if (reproducibleToggle) reproducibleToggle.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
      }
    }

    function scheduleAutoAdvanceLoop() {
      if (!controller || !autoAdvanceToggle?.checked) return;
      stopAutoAdvanceLoop();
      const tick = () => {
        if (!controller || !autoAdvanceToggle?.checked) {
          autoAdvanceRafId = 0;
          syncSimulatorChromeForAutoMode();
          return;
        }
        if (!controller.isAnimating) {
          controller.next(completeRaceAfterGoal);
        }
        autoAdvanceRafId = requestAnimationFrame(tick);
      };
      autoAdvanceRafId = requestAnimationFrame(tick);
    }

    function completeRaceAfterGoal() {
      stopAutoAdvanceLoop();
      if (controller && Array.isArray(controller._goalRankOrder)) {
        lastFinishOrderIds = [...controller._goalRankOrder];
      }
      setTimeout(() => {
        const shouldAggregate =
          Array.isArray(simResults) &&
          simResults.length &&
          (!lastRunReproducible || currentRaceUsedAutoAdvance);
        if (shouldAggregate) {
          const orderIds = buildSummaryPlacingOrderIds(lastFinishOrderIds, simResults);
          addAggregateRun({
            runtimeRaceData,
            userTweaks: userTweaksState,
            marks: {},
            source: currentRaceUsedAutoAdvance ? 'auto' : 'manual',
            orderIds,
          });
        }
        btnRun.disabled = true;
        btnReset.disabled = false;
        btnRun.textContent = '✅ レース終了';
        if (btnShowSummary) btnShowSummary.disabled = false;
        const btnOpenStatsEnd = document.getElementById('btn-open-stats');
        if (btnOpenStatsEnd) btnOpenStatsEnd.disabled = false;
        if (reproducibleToggle) reproducibleToggle.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
        controller = null;
        currentRaceUsedAutoAdvance = false;
      }, 300);
    }

    const currentOptions = () => {
      const reproducible = Boolean(reproducibleToggle?.checked);
      if (reproducible) {
        lastSeed = runtimeRaceData.race_id;
      } else {
        lastSeed = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
      }
      return { reproducible, seed: lastSeed };
    };

    const refreshRaceInfo = () => {
      if (raceInfoEl) raceInfoEl.innerHTML = formatRaceInfo(runtimeRaceData);
    };

    function applyComputedHorsesToUi() {
      initialHorses = calcAllParams(runtimeRaceData, userTweaksState, {});
      horseMetaByName = new Map();
      runtimeRaceData.entries.forEach((entry, idx) => {
        if (initialHorses[idx]) {
          initialHorses[idx].jockeyName = entry.jockey.name;
          horseMetaByName.set(initialHorses[idx].name, {
            gate: initialHorses[idx].gate,
            waku: initialHorses[idx].waku,
          });
        }
      });
      renderEntryList(initialHorses);
      updateEntryStaminaBars(initialHorses);
      renderer.resetHorseRenderState();
      renderer.draw(initialHorses, phases[0], 0);
      refreshRaceInfo();
      persistRaceBundleToSession(runtimeRaceData, userTweaksState, {});
    }

    function resetSimulatorToIdle() {
      stopAutoAdvanceLoop();
      currentRaceUsedAutoAdvance = false;
      btnRun.disabled   = false;
      btnReset.disabled = true;
      btnRun.textContent = '▶ レース開始';
      if (btnShowSummary) btnShowSummary.disabled = true;
      document.getElementById('phase-indicator').textContent = 'スタート';
      document.getElementById('log-panel').innerHTML =
        '<div class="log-entry" style="color:#334;">待機中...</div>';
      syncPlacingPanelsHtml('');

      renderer.resetHorseRenderState();
      renderer.draw(initialHorses, phases[0], 0);
      updateEntryStaminaBars(initialHorses);
      controller = null;
      simResults = null;
      simLogs = null;
      simSnapshots = null;
      lastFinishOrderIds = [];
      hideRaceSummaryScreen();
      try {
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_STATE);
        sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
      } catch {
        /* ignore */
      }
      const btnOpenStatsIdle = document.getElementById('btn-open-stats');
      if (btnOpenStatsIdle) btnOpenStatsIdle.disabled = false;
      if (reproducibleToggle) reproducibleToggle.disabled = false;
      if (btnBackToPreRace) btnBackToPreRace.disabled = false;
    }

    /** index.html のスマホ・狭幅ブレークポイントと揃える */
    function scrollCourseIntoViewOnNarrowLayout() {
      if (!window.matchMedia('(max-width: 1024px)').matches) return;
      const fieldWrap = document.getElementById('field-wrap');
      if (!fieldWrap) return;
      const run = () => {
        fieldWrap.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
      };
      requestAnimationFrame(() => requestAnimationFrame(run));
    }

    let raceControlsBound = false;
    function bindRaceControlsOnce() {
      if (raceControlsBound) return;
      raceControlsBound = true;

      btnRun.addEventListener('click', () => {
        if (!controller) {
          try {
            sessionStorage.removeItem(SESSION_KEY_SIMULATOR_STATE);
            sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
          } catch {
            /* ignore */
          }
          btnReset.disabled = false;
          if (btnShowSummary) btnShowSummary.disabled = true;
          document.getElementById('log-panel').innerHTML = '';
          syncPlacingPanelsHtml('');
          btnRun.textContent = '▶▶ 次のフェーズ';

          const simOptions = currentOptions();
          lastRunReproducible = simOptions.reproducible;
          refreshRaceInfo();
          const sim  = runSimulation(runtimeRaceData, simOptions, userTweaksState, {}, renderer);
          simResults = sim.results;
          simLogs    = sim.logs;
          simSnapshots = sim.snapshots;
          lastFinishOrderIds = [];

          runtimeRaceData.entries.forEach((entry, idx) => {
            if (simResults[idx]) {
              // idで対応する結果を探す
            }
          });
          simResults.forEach(horse => {
            const entry = runtimeRaceData.entries.find((_, i) => i === horse.id);
            if (entry) horse.jockeyName = entry.jockey.name;
          });

          controller = new PhaseController(
            sim.snapshots,
            phases,
            renderer,
            initialHorses,
            horseMetaByName,
            sim.results,
          );
          controller.start();
          scrollCourseIntoViewOnNarrowLayout();
          currentRaceUsedAutoAdvance = Boolean(autoAdvanceToggle?.checked);
          if (autoAdvanceToggle?.checked) {
            syncSimulatorChromeForAutoMode();
            scheduleAutoAdvanceLoop();
          }
          return;
        }

        controller.next(completeRaceAfterGoal);
      });

      btnReset.addEventListener('click', () => {
        resetSimulatorToIdle();
      });

      btnShowSummary?.addEventListener('click', () => {
        if (!simResults || !simSnapshots) return;
        renderRaceSummaryScreen({
          raceData: runtimeRaceData,
          simResults,
          finishOrderIds: lastFinishOrderIds,
          horseMetaByName,
          snapshots: simSnapshots,
          phases,
          getPhaseLabel: (phase) => renderer.getPhaseName(phase),
        });
      });

      btnBackToSimulator?.addEventListener('click', () => {
        hideRaceSummaryScreen();
      });

      const saveStatsReturnScreen = (screen) => {
        try {
          sessionStorage.setItem(SESSION_KEY_STATS_RETURN_SCREEN, screen);
        } catch {
          /* ignore */
        }
      };

      const saveSummaryStateForReturn = () => {
        if (!simResults || !simSnapshots) return;
        const payload = {
          simResults,
          finishOrderIds: Array.isArray(lastFinishOrderIds) ? [...lastFinishOrderIds] : [],
          snapshots: simSnapshots,
        };
        try {
          sessionStorage.setItem(SESSION_KEY_SUMMARY_STATE, JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      };

      const saveSimulatorStateForReturn = () => {
        if (!Array.isArray(simResults) || simResults.length === 0 || controller) return;
        const payload = {
          simResults,
          simLogs,
          snapshots: simSnapshots,
          finishOrderIds: Array.isArray(lastFinishOrderIds) ? [...lastFinishOrderIds] : [],
          ui: {
            phaseText: document.getElementById('phase-indicator')?.textContent ?? 'スタート',
            logHtml: document.getElementById('log-panel')?.innerHTML ?? '',
            placingHtml: document.getElementById('placing-panel')?.innerHTML ?? '',
            btnRunText: btnRun.textContent ?? '✅ レース終了',
            btnRunDisabled: Boolean(btnRun.disabled),
            btnResetDisabled: Boolean(btnReset.disabled),
            btnShowSummaryDisabled: Boolean(btnShowSummary?.disabled),
          },
        };
        try {
          sessionStorage.setItem(SESSION_KEY_SIMULATOR_STATE, JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      };

      const openStatsPage = (returnScreen = 'simulator') => {
        saveStatsReturnScreen(returnScreen);
        saveSimulatorStateForReturn();
        if (returnScreen === 'summary') {
          saveSummaryStateForReturn();
        } else {
          try {
            sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
          } catch {
            /* ignore */
          }
        }
        persistRaceBundleToSession(runtimeRaceData, userTweaksState, {});
        window.location.assign('stats.html');
      };
      document.getElementById('btn-open-stats')?.addEventListener('click', () => openStatsPage('simulator'));
      document.getElementById('btn-open-stats-summary')?.addEventListener('click', () => openStatsPage('summary'));
    }

    reproducibleToggle?.addEventListener('change', () => {
      refreshRaceInfo();
    });

    autoAdvanceToggle?.addEventListener('change', () => {
      if (autoAdvanceToggle.checked && controller) {
        currentRaceUsedAutoAdvance = true;
        syncSimulatorChromeForAutoMode();
        scheduleAutoAdvanceLoop();
      } else {
        stopAutoAdvanceLoop();
        syncSimulatorChromeForAutoMode();
      }
    });

    btnBackToPreRace?.addEventListener('click', () => {
      resetSimulatorToIdle();
      hideRaceSummaryScreen();
      const preRaceEl = document.getElementById('pre-race-editor');
      if (preRaceEl) preRaceEl.hidden = false;
      if (btnBackToPreRace) btnBackToPreRace.hidden = true;
      schedulePreRaceTableFit();
    });

    function preRaceBeforeConfirm() {
      const nextKey = computeBucketKey(runtimeRaceData, userTweaksState, {});
      const agg = loadAggregateState();
      if (agg.runs.length > 0 && agg.bucketKey && agg.bucketKey !== nextKey) {
        const ok = window.confirm(
          'パラメータ（出走内容や微調整）が変わります。これまでの集計はリセットされ、シミュレータ画面へ進みます。よろしいですか？',
        );
        if (!ok) return false;
        clearAggregateState();
      }
      return true;
    }

    const openScreen =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(SESSION_KEY_OPEN_SCREEN)
        : '';
    const openSimulatorDirect =
      openScreen === 'simulator' ||
      openScreen === 'summary' ||
      (typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(SESSION_KEY_OPEN_SIMULATOR) === '1');
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY_OPEN_SIMULATOR);
      sessionStorage.removeItem(SESSION_KEY_OPEN_SCREEN);
    }

    const openSimulatorScreen = () => {
      const preRaceEl = document.getElementById('pre-race-editor');
      if (preRaceEl) preRaceEl.hidden = true;
      if (btnBackToPreRace) btnBackToPreRace.hidden = false;
      applyComputedHorsesToUi();
      bindRaceControlsOnce();
    };

    mountPreRaceEditor(
      runtimeRaceData,
      openSimulatorScreen,
      preRaceBeforeConfirm,
      { openSimulatorDirect },
    );

    const openPreRaceScreen = () => {
      resetSimulatorToIdle();
      hideRaceSummaryScreen();
      const preRaceEl = document.getElementById('pre-race-editor');
      if (preRaceEl) preRaceEl.hidden = false;
      if (btnBackToPreRace) btnBackToPreRace.hidden = true;
      schedulePreRaceTableFit();
    };

    const tryRestoreSummaryScreen = () => {
      if (openScreen !== 'summary' || !simResults || !simSnapshots) return false;
      renderRaceSummaryScreen({
        raceData: runtimeRaceData,
        simResults,
        finishOrderIds: lastFinishOrderIds,
        horseMetaByName,
        snapshots: simSnapshots,
        phases,
        getPhaseLabel: (phase) => renderer.getPhaseName(phase),
      });
      return true;
    };

    const restoreSimulatorStateFromSession = () => {
      if (typeof sessionStorage === 'undefined') return false;
      const raw = sessionStorage.getItem(SESSION_KEY_SIMULATOR_STATE);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.simResults) || !Array.isArray(parsed?.snapshots)) return false;
        simResults = parsed.simResults;
        simLogs = Array.isArray(parsed.simLogs) ? parsed.simLogs : null;
        simSnapshots = parsed.snapshots;
        lastFinishOrderIds = Array.isArray(parsed.finishOrderIds) ? parsed.finishOrderIds : [];
        const ui = parsed.ui ?? {};
        document.getElementById('phase-indicator').textContent = ui.phaseText ?? 'ゴール';
        if (typeof ui.logHtml === 'string') {
          document.getElementById('log-panel').innerHTML = ui.logHtml;
        }
        if (typeof ui.placingHtml === 'string') {
          syncPlacingPanelsHtml(ui.placingHtml);
        }
        btnRun.textContent = typeof ui.btnRunText === 'string' ? ui.btnRunText : '✅ レース終了';
        btnRun.disabled = ui.btnRunDisabled !== undefined ? Boolean(ui.btnRunDisabled) : true;
        btnReset.disabled = ui.btnResetDisabled !== undefined ? Boolean(ui.btnResetDisabled) : false;
        if (btnShowSummary) {
          btnShowSummary.disabled =
            ui.btnShowSummaryDisabled !== undefined ? Boolean(ui.btnShowSummaryDisabled) : false;
        }
        return true;
      } catch {
        return false;
      }
    };

    if (openScreen === 'pre-race') {
      openPreRaceScreen();
    } else if (openScreen === 'summary') {
      openSimulatorScreen();
      const simulatorRestored = restoreSimulatorStateFromSession();
      let restored = false;
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem(SESSION_KEY_SUMMARY_STATE);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.simResults) && Array.isArray(parsed?.snapshots)) {
              simResults = parsed.simResults;
              simSnapshots = parsed.snapshots;
              lastFinishOrderIds = Array.isArray(parsed.finishOrderIds) ? parsed.finishOrderIds : [];
              restored = tryRestoreSummaryScreen();
            }
          } catch {
            /* ignore parse error */
          }
        }
        sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
      }
      if (!restored && simulatorRestored) restored = tryRestoreSummaryScreen();
    } else {
      openSimulatorScreen();
      restoreSimulatorStateFromSession();
    }

  })
  .catch(err => {
    console.error('JSONの読み込みに失敗しました:', err);
  });
}

export { runSimulation, resolveCourseDef, formatRaceInfo };
