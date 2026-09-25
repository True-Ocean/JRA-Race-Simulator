import { CONFIG } from '../config.js';

export function buildPhases(distance, courseDef = null) {
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error('レース距離が不正です。');
  }
  if (!Array.isArray(courseDef?.segments) || courseDef.segments.length === 0
    || courseDef.segments.some(s => !s || !Number.isFinite(s.ratio) || s.ratio <= 0)
    || !Number.isFinite(courseDef.segments.reduce((sum, s) => sum + s.ratio, 0))) {
    throw new Error('コースの区間定義がありません、または不正です。courses.json を確認してください。');
  }
  if (courseDef.distance != null && courseDef.distance !== distance) {
    throw new Error('レース距離とコース定義の距離が一致しません。');
  }
  return buildPhasesFromCourse(distance, courseDef);
}

function buildPhasesFromCourse(distance, courseDef) {
  const segments = courseDef.segments;
  const ratioSum = segments.reduce((acc, s) => acc + s.ratio, 0);
  const safeRatioSum = ratioSum > 0 ? ratioSum : 1;
  const lastCornerNo = Math.max(0, ...segments.map(s => s.cornerNo ?? 0));

  let cumulative = 0;
  return segments.map((segment, index) => {
    const normRatio = segment.ratio / safeRatioSum;
    const progressStart = cumulative;
    cumulative += normRatio;
    const progressEnd = cumulative;
    const cornerNo = segment.cornerNo ?? null;
    return {
      index,
      distance: distance * normRatio,
      /** コース区間の距離累計による走行距離比 */
      ratio: progressStart,
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
