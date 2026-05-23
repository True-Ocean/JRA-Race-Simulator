import {
  FINAL_STRAIGHT_RATIO,
  PRE_CORNER_PACK_PHASE_MAX,
  INNER_HALF_LANE_MAX,
  LANE_WIDTH,
} from './constants.js';

function isKickReserveReleased(phase) {
  if (!phase) return true;
  if (phase.isFinal) return true;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  if (segmentId === 'final') return true;
  const label = String(phase.segmentLabel ?? '');
  if (label.includes('最終直線')) return true;
  return phase.ratio >= FINAL_STRAIGHT_RATIO;
}

function getPhaseBufferMultiplier(phase) {
  if (!phase) return 1.0;
  if (isStartToHomePhase(phase) && phase.index > 0) return 1.15;
  if (isThroughThirdCornerPhase(phase)) return 1.0;
  if (isAfterFourthCornerPhase(phase)) return 0.9;
  return 1.0;
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

function isFourthCornerPhase(phase) {
  if (!phase || phase.isFinal) return false;
  const cornerNo = Number.isFinite(phase.cornerNo) ? phase.cornerNo : null;
  if (cornerNo === 4) return true;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  const label = String(phase.segmentLabel ?? '');
  return segmentId === 'corner4' || label.includes('第4コーナー');
}

export {
  isKickReserveReleased,
  getPhaseBufferMultiplier,
  getPhaseLaneBand,
  isBeforeFirstCornerPhase,
  isStartToHomePhase,
  isThroughThirdCornerPhase,
  isAfterFourthCornerPhase,
  isFourthCornerPhase,
};
