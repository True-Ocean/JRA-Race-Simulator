import {
  GOAL_LAST3F_SEC_CLAMP_MIN,
  GOAL_LAST3F_SEC_CLAMP_MAX,
  GOAL_LAST3F_FALLBACK_SEC,
  GOAL_LAST3F_DISTANCE_M,
  GOAL_SCENE_TRANSITION_MAX_ALPHA,
} from '../engine/constants.js';

function goalIntrinsicMpsFromLast3f(last3fSec) {
  const s = Number.isFinite(last3fSec)
    ? Math.max(GOAL_LAST3F_SEC_CLAMP_MIN, Math.min(GOAL_LAST3F_SEC_CLAMP_MAX, last3fSec))
    : GOAL_LAST3F_FALLBACK_SEC;
  return GOAL_LAST3F_DISTANCE_M / s;
}

function normalize01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
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
  normalize01,
  mapIdEntriesToMap,
  lastGoalRecordingFrame,
  drawGoalCourseFrame,
};
