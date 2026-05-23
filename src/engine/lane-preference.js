import { POST_C3_STAMINA_SPREAD_FLOOR } from './constants.js';
import { isNigeStyle, isOonigeStyle } from './horse-utils.js';
import { isThroughThirdCornerPhase } from './phase-helpers.js';

function getPostC3StaminaSpreadBudget(horse) {
  const initial = horse.initialStamina > 0 ? horse.initialStamina : 1;
  const ratioAfter = Number.isFinite(horse.staminaRatioAfterC3)
    ? horse.staminaRatioAfterC3
    : horse.stamina / initial;
  const span = Math.max(0.001, 0.92 - POST_C3_STAMINA_SPREAD_FLOOR);
  return Math.max(0, Math.min(1, (ratioAfter - POST_C3_STAMINA_SPREAD_FLOOR) / span));
}

function getPreferredLaneByStyle(horse, phase) {
  const r = phase.ratio;
  const style = horse.style;
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

  return pref;
}

export {
  getPostC3StaminaSpreadBudget,
  getPreferredLaneByStyle,
};
