import {
  getStyleBlend,
  getKickBlend,
  getPaceIntroBlend,
} from './phase-context.js';

/**
 * フェーズ別巡航速度（S_formation / S_pace / S_kick をブレンド）
 */
export function resolvePhaseSpeed(horse, phase, ctx) {
  const sForm = Number.isFinite(horse.S_formation) ? horse.S_formation : horse.S_cruise;
  const sPace = Number.isFinite(horse.S_pace) ? horse.S_pace : horse.S_cruise;
  const sKick = Number.isFinite(horse.S_kick) ? horse.S_kick : sPace;

  const s = getStyleBlend(phase, ctx);
  const k = getKickBlend(phase, ctx);
  const p = getPaceIntroBlend(phase, ctx) * (1 - k);
  const sum = s + p + k;
  if (sum <= 0) return sPace;

  return (sForm * s + sPace * p + sKick * k) / sum;
}
