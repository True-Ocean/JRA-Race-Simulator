import { POST_C3_STAMINA_SPREAD_FLOOR } from './constants.js';
import { clampLane } from './horse-utils.js';
import { getFormationPreferredLane } from './formation.js';
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
  const r = phase.ratio ?? 0;
  const formationLane = getFormationPreferredLane(horse, r);
  if (formationLane != null) {
    return formationLane;
  }
  if (isThroughThirdCornerPhase(phase) && r < 0.80 && horse.settledLane !== undefined) {
    return clampLane(horse.settledLane);
  }
  return clampLane(horse.y);
}

export {
  getPostC3StaminaSpreadBudget,
  getPreferredLaneByStyle,
};
