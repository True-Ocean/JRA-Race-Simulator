import {
  GOAL_LAST3F_SEC_CLAMP_MIN,
  GOAL_LAST3F_SEC_CLAMP_MAX,
  GOAL_LAST3F_FALLBACK_SEC,
  GOAL_LAST3F_DISTANCE_M,
  GOAL_SCENE_TRANSITION_MAX_ALPHA,
  GOAL_BLOCK_X_GAP,
  GOAL_STAMINA_BURN_TARGET_RATIO,
  GOAL_STAMINA_BURN_RESERVE_MULT,
  GOAL_STAMINA_BURN_DIST_START,
  GOAL_STAMINA_BURN_MAX_FRAME_FRAC,
  GOAL_FRONT_RUNNER_HOLD_DRAIN_PER_SEC,
  GOAL_EFFORT_BURN_WEIGHT,
  GOAL_TIGHT_LEAD_HOLD_MULT,
} from '../engine/constants.js';

function goalIntrinsicMpsFromLast3f(last3fSec) {
  const s = Number.isFinite(last3fSec)
    ? Math.max(GOAL_LAST3F_SEC_CLAMP_MIN, Math.min(GOAL_LAST3F_SEC_CLAMP_MAX, last3fSec))
    : GOAL_LAST3F_FALLBACK_SEC;
  return GOAL_LAST3F_DISTANCE_M / s;
}

/** スタミナ残量だけでスピード上限を掛ける（last_3f とは独立に毎フレーム変化） */
function goalStaminaSpeedMult(staminaRatio) {
  const r = Math.max(0, Math.min(1, staminaRatio));
  if (r >= 0.28) return 1.0;
  if (r >= 0.10) return 0.93 + ((r - 0.10) / 0.18) * 0.07;
  return 0.82 + (r / 0.10) * 0.11;
}

function normalize01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** 進路が空いているほど 1（自律ゴールシーンの燃焼・末脚判定用） */
function calcGoalPathQuality(frontGap, trafficPenalty, stuckMs) {
  const gapQ = normalize01(frontGap / Math.max(1, GOAL_BLOCK_X_GAP * 1.4));
  const trafficQ = Math.max(0, Math.min(1, Number.isFinite(trafficPenalty) ? trafficPenalty : 1));
  const stuckQ = 1 - normalize01((stuckMs ?? 0) / 1100);
  return Math.max(0, Math.min(1, gapQ * 0.42 + trafficQ * 0.43 + stuckQ * 0.15));
}

/**
 * ゴールまでに余剰スタミナを使い切るための追加ドレイン（着順非依存・リアルタイム）
 */
function calcGoalBurnApproachRamp(distRatio) {
  const d = Math.max(0, Math.min(1, distRatio));
  if (d <= GOAL_STAMINA_BURN_DIST_START) return 0;
  const t = (d - GOAL_STAMINA_BURN_DIST_START) / Math.max(0.001, 1 - GOAL_STAMINA_BURN_DIST_START);
  return t * t * (3 - 2 * t);
}

/** 実行圧: 脚を入れて走っている度合い（0〜1） */
function calcGoalEffortNorm(goalDesiredMps, goalCurrentMps, deltaV) {
  const desired = Number.isFinite(goalDesiredMps) ? goalDesiredMps : 0;
  const current = Number.isFinite(goalCurrentMps) ? goalCurrentMps : 0;
  const gap = Math.max(0, desired - current);
  const chaseEffort = Math.min(1, gap / 4.2);
  const accelEffort = Math.min(1, Math.max(0, deltaV) / 0.11);
  return Math.max(0, Math.min(1, chaseEffort * 0.48 + accelEffort * 0.52));
}

function calcGoalReserveBurnDrain({
  stamina,
  initialStamina,
  remainMeters,
  goalCurrentMps,
  staminaRatio,
  pathQuality,
  distRatio,
  effortNorm,
  dt,
}) {
  if (!Number.isFinite(dt) || dt <= 0 || pathQuality < 0.08) return 0;
  const approachRamp = calcGoalBurnApproachRamp(distRatio);
  if (approachRamp <= 0) return 0;
  const effort = Math.max(0, Math.min(1, Number.isFinite(effortNorm) ? effortNorm : 0));
  const effortBlend = 1 - GOAL_EFFORT_BURN_WEIGHT + effort * GOAL_EFFORT_BURN_WEIGHT;
  if (effortBlend < 0.06) return 0;
  const initial = initialStamina > 0 ? initialStamina : 1;
  const targetRemain = initial * GOAL_STAMINA_BURN_TARGET_RATIO;
  const burnable = Math.max(0, stamina - targetRemain);
  if (burnable <= 0) return 0;
  const metersLeft = Math.max(8, remainMeters);
  const mps = Math.max(5, Number.isFinite(goalCurrentMps) ? goalCurrentMps : 12);
  const estSecLeft = Math.max(5, metersLeft / mps);
  const burnPerSec =
    (burnable / estSecLeft) *
    GOAL_STAMINA_BURN_RESERVE_MULT *
    pathQuality *
    approachRamp *
    effortBlend *
    (0.38 + staminaRatio * 0.42);
  const raw = burnPerSec * dt;
  return Math.min(raw, burnable * GOAL_STAMINA_BURN_MAX_FRAME_FRAC);
}

/** 先頭逃げ・大逃げが前を空けて粘るときの追加ドレイン */
function calcGoalFrontRunnerHoldDrain({
  initialStamina,
  staminaRatio,
  pathQuality,
  distRatio,
  dt,
  isLeadingPack,
  frontGap,
  effortNorm,
}) {
  if (!isLeadingPack || pathQuality < 0.18 || !Number.isFinite(dt) || dt <= 0) return 0;
  const initial = initialStamina > 0 ? initialStamina : 1;
  const approachRamp = calcGoalBurnApproachRamp(distRatio);
  if (approachRamp <= 0) return 0;
  const effort = Math.max(0, Math.min(1, Number.isFinite(effortNorm) ? effortNorm : 0.5));
  const tightLead = Number.isFinite(frontGap) && frontGap < GOAL_BLOCK_X_GAP * 1.35;
  const tightMult = tightLead ? GOAL_TIGHT_LEAD_HOLD_MULT : 1;
  return (
    initial *
    GOAL_FRONT_RUNNER_HOLD_DRAIN_PER_SEC *
    pathQuality *
    approachRamp *
    tightMult *
    (0.32 + staminaRatio * 0.68) *
    (0.4 + effort * 0.6) *
    dt
  );
}

function mapIdEntriesToMap(entries) {
  if (entries instanceof Map) return entries;
  if (Array.isArray(entries)) return new Map(entries);
  if (entries && typeof entries === 'object') return new Map(Object.entries(entries));
  return new Map();
}

function lastGoalRecordingFrame(recording) {
  if (!Array.isArray(recording) || recording.length === 0) return null;
  return recording[recording.length - 1];
}

/** ゴール演出の記録フレームをコース Canvas に描画（全馬ゴール後の空コース含む） */
function drawGoalCourseFrame(renderer, frame, phase) {
  if (!frame || !renderer || !phase) return false;
  const horses = (frame.horses ?? []).map(h => ({ ...h }));
  if (frame.kind === 'transition') {
    renderer.draw(horses, phase, 1, {
      sceneTransition: {
        t: frame.transitionT ?? 0,
        maxAlpha: GOAL_SCENE_TRANSITION_MAX_ALPHA,
      },
    });
    return true;
  }
  const goalRun = frame.drawOptions?.goalRun ?? {};
  renderer.draw(horses, phase, 1, {
    phaseLabel: goalRun.phaseLabel ?? 'ゴールシーン',
    furlong: goalRun.furlong ?? { t: frame.rawT ?? 0 },
    goalLine: goalRun.goalLine ?? frame.rawT ?? 0,
    sceneTransition: frame.drawOptions?.sceneTransition ?? undefined,
    goalRun: {
      ...goalRun,
      progressById: mapIdEntriesToMap(goalRun.progressById),
      laneIntentById: mapIdEntriesToMap(goalRun.laneIntentById),
      overtakePressureById: mapIdEntriesToMap(goalRun.overtakePressureById),
    },
  });
  return true;
}

export {
  goalIntrinsicMpsFromLast3f,
  goalStaminaSpeedMult,
  normalize01,
  calcGoalPathQuality,
  calcGoalEffortNorm,
  calcGoalReserveBurnDrain,
  calcGoalFrontRunnerHoldDrain,
  mapIdEntriesToMap,
  lastGoalRecordingFrame,
  drawGoalCourseFrame,
};
