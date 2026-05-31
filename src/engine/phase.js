import { CONFIG } from '../config.js';

export function calcPhaseCount(distance) {
  return Math.max(5, Math.round(distance / 270));
}

export function buildPhases(distance, courseDef = null) {
  if (courseDef?.segments?.length) {
    return buildPhasesFromCourse(distance, courseDef);
  }

  const total = calcPhaseCount(distance);
  const phases = [];

  const cornerSlots = [
    Math.floor(total * 0.15),
    Math.floor(total * 0.35),
    Math.floor(total * 0.55),
    Math.floor(total * 0.75),
  ].filter(i => i < total - 1 && i > 0);
  const cornerSet = new Set(cornerSlots);

  for (let i = 0; i < total; i++) {
    const progressStart = i / Math.max(1, total - 1);
    const progressEnd = (i + 1) / Math.max(1, total - 1);
    phases.push({
      index: i,
      isCorner: cornerSet.has(i),
      isFinal: i === total - 1,
      distance: distance / total,
      ratio: progressStart,
      progressStart,
      progressEnd,
      metersStart: distance * progressStart,
      metersEnd: distance * progressEnd,
      segmentId: cornerSet.has(i) ? `corner-${i}` : (i === 0 ? 'start' : (i === total - 1 ? 'final' : 'straight')),
      segmentLabel: `Phase ${i + 1}`,
      kind: cornerSet.has(i) ? 'corner' : (i === 0 ? 'start' : (i === total - 1 ? 'final' : 'straight')),
      cornerNo: null,
      simRole: null,
    });
  }
  return phases;
}

function buildPhasesFromCourse(distance, courseDef) {
  const segments = courseDef.segments.filter(s => typeof s.ratio === 'number' && s.ratio > 0);
  const ratioSum = segments.reduce((acc, s) => acc + s.ratio, 0);
  const safeRatioSum = ratioSum > 0 ? ratioSum : 1;
  const lastCornerNo = Math.max(0, ...segments.map(s => s.cornerNo ?? 0));

  let cumulative = 0;
  return segments.map((segment, index) => {
    const normRatio = segment.ratio / safeRatioSum;
    const progressStart = cumulative;
    cumulative += normRatio;
    const progressEnd = cumulative;
    const phaseRatio = segments.length > 1 ? index / (segments.length - 1) : 1;
    const cornerNo = segment.cornerNo ?? null;
    return {
      index,
      distance: distance * normRatio,
      ratio: phaseRatio,
      progressStart,
      progressEnd,
      metersStart: distance * progressStart,
      metersEnd: distance * progressEnd,
      segmentId: segment.id ?? `segment-${index}`,
      segmentLabel: segment.label ?? segment.id ?? `Segment ${index + 1}`,
      kind: segment.kind ?? 'straight',
      cornerNo,
      simRole: segment.simRole ?? null,
      isCorner: segment.kind === 'corner',
      isFinal: segment.kind === 'final' || (cornerNo !== null && cornerNo === lastCornerNo && index === segments.length - 1),
    };
  });
}

export function laneIndex(y) {
  return Math.max(1, Math.min(18, Math.round(y)));
}

/**
 * @deprecated 脚質テーブルは廃止。常に 1（隊列形成期は formation.getFormationStylePaceMult を使用）
 */
export function getStylePaceMultiplier(_style, _phaseRatio) {
  return 1;
}

export function calcStaminaCons(phase, horse, trackModifier) {
  const battleCost = horse.battleLosses * CONFIG.BATTLE_STAMINA_COST;
  const lane = laneIndex(horse.y);
  const cornerCost = phase.isCorner && lane >= 4 ? CONFIG.CORNER_STAMINA_COST : 0;
  return (phase.distance * trackModifier * 0.009) + battleCost + cornerCost;
}

export function applyCornerLoss(phase, horse) {
  if (!phase.isCorner) return;
  const lane = laneIndex(horse.y);
  const coeff = CONFIG.LANE_COEFF[lane];
  horse.distanceLoss += phase.distance * (coeff - 1);
}
