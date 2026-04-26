import { CONFIG } from '../config.js';

export function calcPhaseCount(distance) {
  return Math.max(5, Math.round(distance / 270));
}

export function buildPhases(distance, courseDef = null) {
  if (courseDef?.segments?.length) {
    return buildPhasesFromCourse(distance, courseDef);
  }

  const total  = calcPhaseCount(distance);
  const phases = [];

  // コーナーフェーズのインデックス（全フェーズ数に対して均等配置）
  const cornerSlots = [
    Math.floor(total * 0.15),
    Math.floor(total * 0.35),
    Math.floor(total * 0.55),
    Math.floor(total * 0.75),
  ].filter(i => i < total - 1 && i > 0);
  const cornerSet = new Set(cornerSlots);

  for (let i = 0; i < total; i++) {
    phases.push({
      index:    i,
      isCorner: cornerSet.has(i),
      isFinal:  i === total - 1,
      distance: distance / total,
      // フェーズ比率（0〜1）
      ratio:    i / (total - 1),
    });
  }
  return phases;
}

function buildPhasesFromCourse(distance, courseDef) {
  const segments = courseDef.segments.filter(s => typeof s.ratio === 'number' && s.ratio > 0);
  const ratioSum = segments.reduce((acc, s) => acc + s.ratio, 0);
  const safeRatioSum = ratioSum > 0 ? ratioSum : 1;
  const lastCornerNo = Math.max(0, ...segments.map(s => s.cornerNo ?? 0));

  return segments.map((segment, index) => {
    const normRatio = segment.ratio / safeRatioSum;
    const phaseRatio = segments.length > 1 ? index / (segments.length - 1) : 1;
    const cornerNo = segment.cornerNo ?? null;
    return {
      index,
      distance: distance * normRatio,
      ratio: phaseRatio,
      segmentId: segment.id ?? `segment-${index}`,
      segmentLabel: segment.label ?? segment.id ?? `Segment ${index + 1}`,
      kind: segment.kind ?? 'straight',
      cornerNo,
      isCorner: segment.kind === 'corner',
      isFinal: segment.kind === 'final' || (cornerNo !== null && cornerNo === lastCornerNo && index === segments.length - 1),
    };
  });
}

export function laneIndex(y) {
  return Math.max(1, Math.min(18, Math.round(y)));
}

/**
 * 脚質とフェーズ比率からスピード倍率を取得
 */
export function getStylePaceMultiplier(style, phaseRatio) {
  const paceArr = CONFIG.STYLE_PACE[style] ?? CONFIG.STYLE_PACE['差し'];
  const idx     = Math.min(paceArr.length - 1, Math.floor(phaseRatio * paceArr.length));
  return paceArr[idx];
}

export function calcStaminaCons(phase, horse, trackModifier) {
  const battleCost = horse.battleLosses * CONFIG.BATTLE_STAMINA_COST;
  const lane       = laneIndex(horse.y);
  const cornerCost = phase.isCorner && lane >= 4 ? CONFIG.CORNER_STAMINA_COST : 0;
  return (phase.distance * trackModifier * 0.012) + battleCost + cornerCost;
}

export function applyCornerLoss(phase, horse) {
  if (!phase.isCorner) return;
  const lane  = laneIndex(horse.y);
  const coeff = CONFIG.LANE_COEFF[lane];
  horse.distanceLoss += phase.distance * (coeff - 1);
}