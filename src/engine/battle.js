import { CONFIG } from '../config.js';
import { randFloat } from './rng.js';

/**
 * 同一フェーズ内で接触している馬ペアを検出する
 * @param {Array} horses - 全馬の状態配列
 * @param {number} threshold - 接触とみなすX座標の差（フェーズ距離基準）
 * @returns {Array} [{a: horse, b: horse}, ...] ペア配列（前方から順）
 */
export function detectContacts(horses, threshold) {
  const pairs = [];
  for (let i = 0; i < horses.length; i++) {
    for (let j = i + 1; j < horses.length; j++) {
      const a = horses[i];
      const b = horses[j];
      const sameOrAdjacentLane = Math.abs(a.y - b.y) < 1.0;
      const closeEnough        = Math.abs(a.x - b.x) < threshold;
      if (sameOrAdjacentLane && closeEnough) {
        pairs.push({ a, b });
      }
    }
  }
  // 前方（X座標が大きい）ペアを優先
  pairs.sort((p1, p2) => Math.max(p2.a.x, p2.b.x) - Math.max(p1.a.x, p1.b.x));
  return pairs;
}

/**
 * バトル発生確率の判定
 */
export function shouldBattle(rng, horses, a, b) {
  const sameLane = Math.abs(a.y - b.y) < 0.5;
  const nearbyCount = horses.filter(h =>
    h.id !== a.id && h.id !== b.id &&
    Math.abs(h.y - a.y) < 1.0 &&
    Math.abs(h.x - a.x) < 50
  ).length;
  const crowdFactor = nearbyCount >= 3 ? CONFIG.BATTLE_CROWD_BONUS : 0;
  const prob        = CONFIG.BATTLE_BASE_RATE + (sameLane ? 0.2 : 0) + crowdFactor;
  return rng() < prob;
}

/**
 * バトルの勝敗を判定し、敗者にペナルティを適用
 * @returns {{ winner: horse, loser: horse, eA: number, eB: number }}
 */
export function resolveBattle(rng, a, b, phase) {
  const eA = a.M_maneuv * 0.6 + a.S_cruise * 0.4 + randFloat(rng, -5, 5);
  const eB = b.M_maneuv * 0.6 + b.S_cruise * 0.4 + randFloat(rng, -5, 5);

  const winner = eA > eB ? a : b;
  const loser  = eA > eB ? b : a;

  // 敗者にペナルティ
  loser.battlePenalty = CONFIG.BATTLE_PENALTY;
  loser.battleLosses += 1;
  loser.stamina      -= CONFIG.BATTLE_STAMINA_COST;
  if (loser.stamina < 0) loser.stamina = 0;

  return { winner, loser, eA: Math.round(eA * 10) / 10, eB: Math.round(eB * 10) / 10 };
}