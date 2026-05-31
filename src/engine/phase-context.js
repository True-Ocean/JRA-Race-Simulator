import {
  FORMATION_END_PROGRESS,
  FORMATION_FADE_PROGRESS,
  FORMATION_MIN_METERS,
  FORMATION_MAX_METERS,
  KICK_REMAINING_METERS,
  KICK_FADE_METERS,
  PACE_FADE_PROGRESS,
  LAUNCH_PHASE_COUNT_FALLBACK,
} from './constants.js';
import { FORMATION_CLUSTER_X_SPAN, isCloserStyle } from './formation.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function getPhaseProgressEnd(phase) {
  if (Number.isFinite(phase?.progressEnd)) return phase.progressEnd;
  return Number.isFinite(phase?.ratio) ? phase.ratio : 0;
}

function getPhaseProgressStart(phase) {
  if (Number.isFinite(phase?.progressStart)) return phase.progressStart;
  return Number.isFinite(phase?.ratio) ? phase.ratio : 0;
}

function getPhaseProgressMid(phase) {
  return (getPhaseProgressStart(phase) + getPhaseProgressEnd(phase)) / 2;
}

function findFirstCornerPhase(phases) {
  if (!Array.isArray(phases)) return null;
  return phases.find(p => p?.kind === 'corner' || p?.isCorner) ?? null;
}

function findProgressStartOfRole(phases, role) {
  const match = phases?.find(p => resolveEffectiveSimRole(p, phases) === role);
  return match ? getPhaseProgressStart(match) : null;
}

function findProgressEndOfRole(phases, role) {
  const matching = phases?.filter(p => resolveEffectiveSimRole(p, phases) === role) ?? [];
  if (!matching.length) return null;
  return Math.max(...matching.map(getPhaseProgressEnd));
}

/** legacy formation / 未設定を launch|settle|pace|kick に正規化 */
export function resolveEffectiveSimRole(phase, phases) {
  const role = phase?.simRole;
  if (role === 'launch' || role === 'settle' || role === 'pace' || role === 'kick') {
    return role;
  }
  if (role === 'formation') {
    const formationPhases = phases.filter(p => p.simRole === 'formation');
    const launchCount = Math.min(LAUNCH_PHASE_COUNT_FALLBACK, formationPhases.length);
    const idx = formationPhases.indexOf(phase);
    if (idx >= 0 && idx < launchCount) return 'launch';
    return 'settle';
  }
  if (role === 'pace' || role === 'kick') return role;
  return null;
}

function resolveLaunchEndProgress(phases, courseDef, totalDistance) {
  const fromRole = findProgressEndOfRole(phases, 'launch');
  if (fromRole != null) return clamp01(fromRole);

  const fromSettleStart = findProgressStartOfRole(phases, 'settle');
  if (fromSettleStart != null) return clamp01(fromSettleStart);

  const bounds = courseDef?.simBoundaries;
  if (bounds && Number.isFinite(bounds.launchThroughSegmentIndex) && phases?.length) {
    const idx = Math.max(0, Math.min(phases.length - 1, Math.floor(bounds.launchThroughSegmentIndex)));
    return clamp01(getPhaseProgressEnd(phases[idx]));
  }

  if (phases?.length >= 2) {
    return clamp01(getPhaseProgressEnd(phases[Math.min(LAUNCH_PHASE_COUNT_FALLBACK - 1, phases.length - 1)]));
  }
  if (phases?.length === 1) {
    return clamp01(getPhaseProgressEnd(phases[0]));
  }

  return clamp01(Math.max(0.08, FORMATION_MIN_METERS * 0.35 / Math.max(1, totalDistance)));
}

function resolveSettleEndProgress(phases, courseDef, totalDistance, launchEnd) {
  const fromRole = findProgressEndOfRole(phases, 'settle');
  if (fromRole != null) return clamp01(fromRole);

  const fromPaceStart = findProgressStartOfRole(phases, 'pace');
  if (fromPaceStart != null) return clamp01(fromPaceStart);

  const bounds = courseDef?.simBoundaries;
  if (bounds && Number.isFinite(bounds.settleThroughSegmentIndex) && phases?.length) {
    const idx = Math.max(0, Math.min(phases.length - 1, Math.floor(bounds.settleThroughSegmentIndex)));
    return clamp01(getPhaseProgressEnd(phases[idx]));
  }

  if (bounds?.formationEndRule === 'beforeFirstCorner') {
    const firstCorner = findFirstCornerPhase(phases);
    if (firstCorner) {
      return clamp01(getPhaseProgressEnd(firstCorner));
    }
  }

  if (bounds && Number.isFinite(bounds.formationThroughSegmentIndex) && phases?.length) {
    const idx = Math.max(0, Math.min(phases.length - 1, Math.floor(bounds.formationThroughSegmentIndex)));
    return clamp01(getPhaseProgressEnd(phases[idx]));
  }

  const meterTarget = Math.max(
    FORMATION_MIN_METERS,
    Math.min(FORMATION_MAX_METERS, totalDistance * FORMATION_END_PROGRESS),
  );
  const fromMeters = meterTarget / Math.max(1, totalDistance);
  return clamp01(Math.max(launchEnd, fromMeters));
}

function resolvePaceStartProgress(phases, settleEnd) {
  const fromRole = findProgressStartOfRole(phases, 'pace');
  if (fromRole != null) return clamp01(fromRole);
  return clamp01(settleEnd);
}

function resolveSimBoundaries(totalDistance, courseDef, phases) {
  const launchEndProgress = resolveLaunchEndProgress(phases, courseDef, totalDistance);
  const settleEndProgress = Math.max(
    launchEndProgress,
    resolveSettleEndProgress(phases, courseDef, totalDistance, launchEndProgress),
  );
  const paceStartProgress = resolvePaceStartProgress(phases, settleEndProgress);
  const bounds = courseDef?.simBoundaries ?? {};

  return {
    launchEndProgress,
    settleEndProgress,
    paceStartProgress,
    launchFadeProgress: bounds.launchFadeProgress ?? FORMATION_FADE_PROGRESS,
    settleFadeProgress: bounds.settleFadeProgress ?? FORMATION_FADE_PROGRESS,
    paceFadeProgress: bounds.paceFadeProgress ?? PACE_FADE_PROGRESS,
    kickRemainingMeters: bounds.kickRemainingMeters ?? KICK_REMAINING_METERS,
    kickFadeMeters: bounds.kickFadeMeters ?? KICK_FADE_METERS,
    /** @deprecated settleEndProgress の別名 */
    formationEndProgress: settleEndProgress,
    formationFadeProgress: bounds.settleFadeProgress ?? FORMATION_FADE_PROGRESS,
  };
}

/**
 * @param {number} totalDistance
 * @param {object|null} courseDef
 * @param {object[]} phases
 */
export function createPhaseContext(totalDistance, courseDef, phases) {
  const boundaries = resolveSimBoundaries(totalDistance, courseDef, phases);
  return {
    totalDistance,
    courseDef,
    phases,
    ...boundaries,
  };
}

/** 序盤終端までのブレンド（フェードアウト付き） */
function getActiveBlendBeforeEnd(phase, endProgress, fadeProgress) {
  if (!phase || endProgress == null) return 0;
  const fade = fadeProgress ?? FORMATION_FADE_PROGRESS;
  const pStart = getPhaseProgressStart(phase);
  const pEnd = getPhaseProgressEnd(phase);

  if (pStart >= endProgress) return 0;
  if (pEnd <= endProgress - fade) return 1;
  const overhang = pEnd - endProgress;
  if (overhang <= 0) return 1;
  return 1 - smoothstep(overhang / Math.max(0.001, fade));
}

/** 区間 [windowStart, windowEnd) 内のブレンド */
function getActiveBlendInRange(phase, windowStart, windowEnd, fadeProgress) {
  if (!phase || windowEnd == null) return 0;
  const fade = fadeProgress ?? FORMATION_FADE_PROGRESS;
  const pStart = getPhaseProgressStart(phase);
  const pEnd = getPhaseProgressEnd(phase);

  if (pStart >= windowEnd) return 0;
  if (pEnd <= windowStart) return 0;

  let blend = 1;
  if (pStart < windowStart) {
    blend = Math.min(blend, smoothstep((pEnd - windowStart) / Math.max(0.001, pEnd - pStart)));
  }
  if (pEnd > windowEnd) {
    const overhang = pEnd - windowEnd;
    blend = Math.min(blend, overhang <= 0 ? 1 : 1 - smoothstep(overhang / Math.max(0.001, fade)));
  }
  return clamp01(blend);
}

/** ① 脚質優先期（スタート＋次フェーズ） */
export function getLaunchBlend(phase, ctx) {
  if (!phase || !ctx) return 0;
  return getActiveBlendBeforeEnd(phase, ctx.launchEndProgress, ctx.launchFadeProgress);
}

/** ② 隊列安定期（逃げ・先行維持 / 差し・追込抑え） */
export function getSettleBlend(phase, ctx) {
  if (!phase || !ctx) return 0;
  return getActiveBlendInRange(
    phase,
    ctx.launchEndProgress ?? 0,
    ctx.settleEndProgress,
    ctx.settleFadeProgress,
  );
}

/** 脚質系ブレンド（launch + settle） */
export function getStyleBlend(phase, ctx) {
  return Math.min(1, getLaunchBlend(phase, ctx) + getSettleBlend(phase, ctx));
}

/** @deprecated getStyleBlend を使用 */
export function getFormationBlend(phase, ctx) {
  return getStyleBlend(phase, ctx);
}

/** ③ Ave-3F 導入（settle 終了後ファジーに 0→1） */
export function getPaceIntroBlend(phase, ctx) {
  if (!phase || !ctx) return 0;
  const start = ctx.paceStartProgress ?? ctx.settleEndProgress ?? 0;
  const fade = ctx.paceFadeProgress ?? PACE_FADE_PROGRESS;
  const mid = getPhaseProgressMid(phase);
  if (mid <= start) return 0;
  if (mid >= start + fade) return 1;
  return smoothstep((mid - start) / Math.max(0.001, fade));
}

/** 上り3F期のブレンド 0=無効, 1=フル */
export function getKickBlend(phase, ctx) {
  if (!phase || !ctx) return 0;
  if (phase.simRole === 'kick' || phase.kind === 'final' || phase.isFinal) {
    return 1;
  }
  if (resolveEffectiveSimRole(phase, ctx.phases) === 'kick') {
    return 1;
  }
  const remain = getMetersRemainingAtPhaseStart(phase, ctx.totalDistance);
  const kickStart = ctx.kickRemainingMeters ?? KICK_REMAINING_METERS;
  const fade = ctx.kickFadeMeters ?? KICK_FADE_METERS;
  if (remain <= kickStart) return 1;
  if (remain >= kickStart + fade) return 0;
  return 1 - smoothstep((remain - kickStart) / Math.max(1, fade));
}

/** 中盤ペース（Ave-3F）期のブレンド — kick と style と独立に正規化される */
export function getPaceBlend(phase, ctx) {
  const paceIn = getPaceIntroBlend(phase, ctx);
  const k = getKickBlend(phase, ctx);
  return paceIn * (1 - k);
}

export function getMetersRemainingAtPhaseStart(phase, totalDistance) {
  return totalDistance * (1 - getPhaseProgressStart(phase));
}

export function isLaunchPhase(phase, ctx) {
  return getLaunchBlend(phase, ctx) > 0.001;
}

export function isSettlePhase(phase, ctx) {
  return getSettleBlend(phase, ctx) > 0.001;
}

export function isFormationPhase(phase, ctx) {
  return getStyleBlend(phase, ctx) > 0.001;
}

export function isKickPhase(phase, ctx) {
  return getKickBlend(phase, ctx) > 0.001;
}

export function isPacePhase(phase, ctx) {
  return getPaceIntroBlend(phase, ctx) > 0.001;
}

/** overlap 巻き戻し防止が必要な序盤か */
export function shouldPreserveForwardX(phase, ctx) {
  return isFormationPhase(phase, ctx);
}

/** スタート直後ペロトンの前方ブロック免除（launch 期のみ・逃げ・先行・逃げ系） */
export function isRearPelotonForwardExempt(horse, allHorses, phase, ctx) {
  if (!isLaunchPhase(phase, ctx)) return false;
  if (!Array.isArray(allHorses) || allHorses.length < 2) return false;
  if (isCloserStyle(horse?.style)) return false;
  const minX = Math.min(...allHorses.map(h => h.x ?? 0));
  return (horse.x ?? 0) <= minX + FORMATION_CLUSTER_X_SPAN;
}

/** 逃げが先頭集団を追うときの前方ブロック緩和（形成期） — @deprecated getFormationForwardRelief を使用 */
export function isNigeLeadChaseForwardExempt(horse, allHorses, phase, ctx) {
  return false;
}

/** @deprecated settleEndProgress */
export function resolveFormationEndProgress(totalDistance, courseDef, phases) {
  return resolveSimBoundaries(totalDistance, courseDef, phases).settleEndProgress;
}

export { FORMATION_CLUSTER_X_SPAN, resolveSimBoundaries };
