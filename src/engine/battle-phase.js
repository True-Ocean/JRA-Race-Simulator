import { CONFIG } from '../config.js';
import { shouldBattle } from './battle.js';
import {
  LEAD_BATTLE_PHASE_MAX,
  FINAL_DUEL_PHASE_MIN,
  INNER_CUTIN_BATTLE_COOLDOWN_PHASES,
  INNER_CUTIN_REMATCH_COOLDOWN_PHASES,
  INNER_CUTIN_MIN_INWARD_DELTA,
} from './constants.js';
import {
  isNigeStyle,
  getJockeyReliabilityNorm,
  applyBattleStaminaImpact,
} from './horse-utils.js';
import { getPreferredLaneByStyle } from './lane-preference.js';

function battleScore(rng, horse, weights, styleBonusFn) {
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  return (
    horse.S_cruise * weights.cruise +
    horse.M_maneuv * weights.maneuv +
    horse.S_sustain * weights.sustain +
    (staminaRatio * 100) * weights.stamina +
    styleBonusFn(horse) +
    (rng() * 10 - 5)
  );
}

function resolveWeightedBattle(rng, a, b, weights, styleBonusFn = () => 0, options = {}) {
  const eA = battleScore(rng, a, weights, styleBonusFn);
  const eB = battleScore(rng, b, weights, styleBonusFn);
  const winner = eA > eB ? a : b;
  const loser  = eA > eB ? b : a;
  const penaltyRecovery = getJockeyReliabilityNorm(loser) * 0.24;
  loser.battlePenalty = CONFIG.BATTLE_PENALTY + (1 - CONFIG.BATTLE_PENALTY) * penaltyRecovery;
  loser.battleLosses += 1;
  const impactOptions = options?.impactOptions ?? { loserAlreadyPenalized: false };
  if (options?.skipStaminaImpact !== true) {
    applyBattleStaminaImpact(winner, loser, impactOptions);
  }
  return {
    winner,
    loser,
    eA: Math.round(eA * 10) / 10,
    eB: Math.round(eB * 10) / 10,
  };
}

function isInnerCutInContestScenario(horse, laneBlocker, baseY, targetY, desiredAdvance, minXGap) {
  if (!laneBlocker) return false;
  const inwardDelta = baseY - targetY;
  if (inwardDelta < INNER_CUTIN_MIN_INWARD_DELTA) return false;
  // 「内側馬の前をかすめる」ケースのみ対象（内側で近い位置）
  if (laneBlocker.y > baseY - 0.04) return false;
  if (laneBlocker.y < targetY - 0.38) return false;
  const dx = laneBlocker.x - horse.x;
  const nearXBand = minXGap * 0.95;
  if (dx < -nearXBand || dx > nearXBand) return false;
  const projectedX = horse.x + Math.max(0, desiredAdvance) * 0.6;
  return projectedX > laneBlocker.x - minXGap * 0.35;
}

function canTriggerInnerCutInBattle(horse, laneBlocker, phase) {
  if (!horse || !laneBlocker || !phase) return false;
  if ((horse.innerCutInCooldownPhases ?? 0) > 0) return false;
  if ((laneBlocker.innerCutInCooldownPhases ?? 0) > 0) return false;
  const sameOpponentRecently =
    horse.lastInnerCutInOpponentId === laneBlocker.id &&
    (phase.index - (horse.lastInnerCutInPhase ?? -999)) <= INNER_CUTIN_REMATCH_COOLDOWN_PHASES;
  if (sameOpponentRecently) return false;
  return true;
}

function markInnerCutInBattlePair(a, b, phase) {
  if (!a || !b || !phase) return;
  a.innerCutInCooldownPhases = Math.max(a.innerCutInCooldownPhases ?? 0, INNER_CUTIN_BATTLE_COOLDOWN_PHASES);
  b.innerCutInCooldownPhases = Math.max(b.innerCutInCooldownPhases ?? 0, INNER_CUTIN_BATTLE_COOLDOWN_PHASES);
  a.lastInnerCutInOpponentId = b.id;
  b.lastInnerCutInOpponentId = a.id;
  a.lastInnerCutInPhase = phase.index;
  b.lastInnerCutInPhase = phase.index;
}

function resolveLeadBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (phase.ratio > LEAD_BATTLE_PHASE_MAX) return;
  const sorted = [...horses].sort((a, b) => b.x - a.x);
  if (sorted.length < 2) return;
  const leadX = sorted[0].x;
  const leadPack = sorted.filter(h =>
    (leadX - h.x) <= 26 &&
    (isNigeStyle(h.style) || h.style === '先行') &&
    !engagedHorseIds.has(h.id)
  );
  if (leadPack.length < 2) return;

  let pair = null;
  for (let i = 0; i < leadPack.length; i++) {
    for (let j = i + 1; j < leadPack.length; j++) {
      if (Math.abs(leadPack[i].y - leadPack[j].y) < 1.4) {
        pair = [leadPack[i], leadPack[j]];
        break;
      }
    }
    if (pair) break;
  }
  if (!pair) return;
  const [a, b] = pair;
  if (!shouldBattle(rng, horses, a, b)) return;

  const result = resolveWeightedBattle(rng, a, b, {
    cruise: 0.45,
    maneuv: 0.35,
    sustain: 0.05,
    stamina: 0.15,
  });
  const log = `[バトル:先頭争い] ${a.name} vs ${b.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
  phaseEventLogs.push(log);
  globalLogs.push(log);
  engagedHorseIds.add(a.id);
  engagedHorseIds.add(b.id);
}

function resolveCornerPositionBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (!phase.isCorner) return;

  const candidates = horses
    .filter(h => !engagedHorseIds.has(h.id))
    .map(h => ({ horse: h, desired: getPreferredLaneByStyle(h, phase) }))
    .filter(item => item.desired < item.horse.y - 0.35)
    .sort((a, b) => b.horse.x - a.horse.x);

  for (const item of candidates) {
    const a = item.horse;
    const blocker = horses.find(h =>
      h.id !== a.id &&
      !engagedHorseIds.has(h.id) &&
      h.y < a.y &&
      (a.y - h.y) < 1.25 &&
      Math.abs(h.x - a.x) < 24
    );
    if (!blocker) continue;
    if (!shouldBattle(rng, horses, a, blocker)) continue;

    const result = resolveWeightedBattle(rng, a, blocker, {
      cruise: 0.20,
      maneuv: 0.55,
      sustain: 0.05,
      stamina: 0.20,
    });
    const log = `[バトル:コーナー争い] ${a.name} vs ${blocker.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
    phaseEventLogs.push(log);
    globalLogs.push(log);
    engagedHorseIds.add(a.id);
    engagedHorseIds.add(blocker.id);
    return;
  }
}

function resolveFinalStraightDuel(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (!(phase.isFinal || phase.ratio >= FINAL_DUEL_PHASE_MIN)) return;

  const sorted = [...horses].sort((a, b) => b.x - a.x);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (engagedHorseIds.has(a.id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (engagedHorseIds.has(b.id)) continue;
      if (Math.abs(a.x - b.x) > 18) continue;
      if (Math.abs(a.y - b.y) > 1.6) continue;
      if (!shouldBattle(rng, horses, a, b)) continue;

      const result = resolveWeightedBattle(rng, a, b, {
        cruise: 0.30,
        maneuv: 0.15,
        sustain: 0.45,
        stamina: 0.10,
      }, horse => (horse.style === '差し' || horse.style === '追込') ? 4 : 0);
      const log = `[バトル:直線争い] ${a.name} vs ${b.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
      phaseEventLogs.push(log);
      globalLogs.push(log);
      engagedHorseIds.add(a.id);
      engagedHorseIds.add(b.id);
      return;
    }
  }
}

export {
  battleScore,
  resolveWeightedBattle,
  isInnerCutInContestScenario,
  canTriggerInnerCutInBattle,
  markInnerCutInBattlePair,
  resolveLeadBattle,
  resolveCornerPositionBattle,
  resolveFinalStraightDuel,
};
