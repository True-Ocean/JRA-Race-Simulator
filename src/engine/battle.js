import { CONFIG } from '../config.js';
import {
  MIN_FORWARD_GAP,
  BATTLE_PROXIMITY_X_MULT,
  BATTLE_PROXIMITY_Y_FALLBACK,
  GOAL_BLOCK_X_GAP,
  GOAL_NEAR_LANE_GAP_MAX,
  GOAL_BATTLE_PROXIMITY_X_MULT,
  BATTLE_CROWD_MIN_NEARBY,
} from './constants.js';
import { ensureBattleWinnerAheadX, getWeightStaminaMult } from './horse-utils.js';
import { randFloat } from './rng.js';
import { calcBattleEfficiency } from './battle-formation.js';

/**
 * バトル発動に使う前後・横方向の許容距離（シミュ x / レーン y）
 * @param {object|null} collisionMetrics - Renderer.getCollisionMetrics の戻り値
 */
export function buildBattleProximityLimits(collisionMetrics = null) {
  const baseDx =
    collisionMetrics?.drawNearXGap ??
    collisionMetrics?.minXGap ??
    MIN_FORWARD_GAP;
  const maxDx = baseDx * BATTLE_PROXIMITY_X_MULT;
  const maxDy =
    collisionMetrics?.drawNearLaneGap ?? BATTLE_PROXIMITY_Y_FALLBACK;
  return { maxDx, maxDy };
}

/** ゴールシーン用（並走時にバトル判定が通りやすい幅） */
export function buildGoalBattleProximityLimits() {
  return {
    maxDx: GOAL_BLOCK_X_GAP * GOAL_BATTLE_PROXIMITY_X_MULT,
    maxDy: GOAL_NEAR_LANE_GAP_MAX,
  };
}

/**
 * 2頭がバトル可能な物理距離内か（画面で隣接している想定に合わせる）
 */
export function isPairBattleProximity(a, b, limits = null) {
  if (!a || !b || a.id === b.id) return false;
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const fallback = buildBattleProximityLimits(null);
  const maxDx = limits?.maxDx ?? fallback.maxDx;
  const maxDy = limits?.maxDy ?? fallback.maxDy;
  return dx <= maxDx && dy <= maxDy;
}

/**
 * 同一フェーズ内で接触している馬ペアを検出する
 * @param {Array} horses - 全馬の状態配列
 * @param {object} limits - buildBattleProximityLimits の戻り値
 * @returns {Array} [{a: horse, b: horse}, ...] ペア配列（前方から順）
 */
export function detectContacts(horses, limits) {
  const proximityLimits = limits ?? buildBattleProximityLimits(null);
  const pairs = [];
  for (let i = 0; i < horses.length; i++) {
    for (let j = i + 1; j < horses.length; j++) {
      const a = horses[i];
      const b = horses[j];
      if (!isPairBattleProximity(a, b, proximityLimits)) continue;
      pairs.push({ a, b });
    }
  }
  pairs.sort((p1, p2) => Math.max(p2.a.x, p2.b.x) - Math.max(p1.a.x, p1.b.x));
  return pairs;
}

/**
 * バトル発生確率の判定（物理的に近いペアのみ）
 * @param {object} [options]
 * @param {number} [options.rateBonus] - ゴールシーン等の追加成功率
 */
export function shouldBattle(rng, horses, a, b, limits = null, options = {}) {
  const proximityLimits = limits ?? buildBattleProximityLimits(null);
  if (!isPairBattleProximity(a, b, proximityLimits)) return false;

  const sameLane = Math.abs(a.y - b.y) < 0.5;
  const adjacentLane = !sameLane && Math.abs(a.y - b.y) < proximityLimits.maxDy;
  const crowdRadius = proximityLimits.maxDx * 2.2;
  const nearbyCount = horses.filter(h =>
    h.id !== a.id && h.id !== b.id &&
    Math.abs(h.y - a.y) < proximityLimits.maxDy + 0.2 &&
    Math.abs(h.x - a.x) < crowdRadius,
  ).length;
  const crowdFactor = nearbyCount >= BATTLE_CROWD_MIN_NEARBY ? CONFIG.BATTLE_CROWD_BONUS : 0;
  const sameLaneBonus = CONFIG.BATTLE_SAME_LANE_BONUS ?? 0.18;
  const adjacentLaneBonus = adjacentLane ? sameLaneBonus * 0.45 : 0;
  const rateBonus = Number(options?.rateBonus) || 0;
  const formationRateMult = Number(options?.formationRateMult) || 1;
  const prob = Math.min(
    0.92,
    (CONFIG.BATTLE_BASE_RATE
      + (sameLane ? sameLaneBonus : adjacentLaneBonus)
      + crowdFactor
      + rateBonus) * formationRateMult,
  );
  return rng() < prob;
}

function jockeyReliabilityNorm(horse) {
  const value = Number.isFinite(horse?.J_reliability) ? horse.J_reliability : 50;
  return Math.max(0, Math.min(1, value / 100));
}

/**
 * バトルの勝敗を判定し、敗者にペナルティを適用
 * @param {object} [options]
 * @param {boolean} [options.ensureWinnerAhead=true] - 勝者を前方へ微補正する
 * @returns {{ winner: horse, loser: horse, eA: number, eB: number }}
 */
export function resolveBattle(rng, a, b, phase, options = {}) {
  const phaseCtx = options.phaseCtx ?? phase?._phaseCtx ?? null;
  const eA = calcBattleEfficiency(a, phase, phaseCtx, randFloat(rng, -5, 5));
  const eB = calcBattleEfficiency(b, phase, phaseCtx, randFloat(rng, -5, 5));

  const winner = eA > eB ? a : b;
  const loser = eA > eB ? b : a;

  const reliability = jockeyReliabilityNorm(loser);
  const penaltyRecovery = reliability * 0.24;
  loser.battlePenalty = CONFIG.BATTLE_PENALTY + (1 - CONFIG.BATTLE_PENALTY) * penaltyRecovery;
  loser.battleLosses += 1;
  loser.stamina -= CONFIG.BATTLE_STAMINA_COST
    * (1.08 - reliability * 0.26)
    * getWeightStaminaMult(loser);
  if (loser.stamina < 0) loser.stamina = 0;
  if (options?.ensureWinnerAhead !== false) {
    ensureBattleWinnerAheadX(winner, loser);
  }

  return { winner, loser, eA: Math.round(eA * 10) / 10, eB: Math.round(eB * 10) / 10 };
}
