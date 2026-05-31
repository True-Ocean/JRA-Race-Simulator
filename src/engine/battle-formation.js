import { isFormationPhase } from './phase-context.js';
import { isNigeStyle, isOonigeStyle } from './horse-utils.js';

/** 形成期バトル: 脚質ボーナス（逃げ・先行を優遇） */
export function getStyleBattleBonus(horse, phase, phaseCtx = null) {
  const ctx = phaseCtx ?? phase?._phaseCtx;
  const inFormation = phase && ctx ? isFormationPhase(phase, ctx) : false;
  if (isOonigeStyle(horse?.style)) return inFormation ? 14 : 6;
  if (isNigeStyle(horse?.style)) return inFormation ? 14 : 6;
  if (horse?.style === '先行') return inFormation ? 5 : 2;
  if (horse?.style === '差し') return inFormation ? -2 : 0;
  if (horse?.style === '追込') return inFormation ? -4 : 0;
  return 0;
}

/**
 * 形成期は S_formation 中心、それ以外は従来式
 */
export function calcBattleEfficiency(horse, phase, phaseCtx = null, rngJitter = 0) {
  const ctx = phaseCtx ?? phase?._phaseCtx;
  const inFormation = phase && ctx ? isFormationPhase(phase, ctx) : false;
  const styleBonus = getStyleBattleBonus(horse, phase, ctx);
  if (inFormation) {
    const maneuv = Math.max(horse.M_maneuv ?? 0, (horse.J_reliability ?? 50) * 0.35);
    return (
      horse.S_formation * 0.52 +
      maneuv * 0.22 +
      horse.S_cruise * 0.12 +
      styleBonus +
      rngJitter
    );
  }
  return (
    horse.M_maneuv * 0.6 +
    horse.S_cruise * 0.4 +
    styleBonus +
    rngJitter
  );
}

/** 逃げが先頭付近で内を取るだけのときはコーナー争いを避ける */
export function shouldSkipCornerBattleForFrontRunner(attacker, blocker) {
  if (!attacker || !blocker) return false;
  if (!isNigeStyle(attacker.style) && !isOonigeStyle(attacker.style)) return false;
  return (attacker.x ?? 0) >= (blocker.x ?? 0) - 4;
}

/** 形成期: 逃げが前にいるとき後方からのバトル発生率を下げる */
export function getFormationBattleRateMult(attacker, defender, phase, phaseCtx = null) {
  const ctx = phaseCtx ?? phase?._phaseCtx;
  if (!phase || !ctx || !isFormationPhase(phase, ctx)) return 1;
  if (!isNigeStyle(defender?.style) && !isOonigeStyle(defender?.style)) return 1;
  const dx = (defender.x ?? 0) - (attacker.x ?? 0);
  if (dx < 1) return 1;
  if (dx > 18) return 1;
  return Math.max(0.2, 1 - dx / 24);
}

/** 逃げの外枠スタート補正（0〜1、外ほど大） */
export function getNigeOuterGateBurstBonus(horse, totalEntries) {
  if (!isNigeStyle(horse?.style) || !Number.isFinite(horse?.gate) || totalEntries <= 1) return 0;
  return ((horse.gate - 1) / (totalEntries - 1)) * 0.20;
}
