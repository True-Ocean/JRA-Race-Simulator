/** エントリーUIとゴールシーンで共有するスタミナ表示％・色 tier */

import { getStaminaRatio } from './race-effort.js';

export function getStaminaRemainRawPct(horse) {
  return Math.round(getStaminaRatio(horse) * 100);
}

/**
 * 実際の余力をそのまま表示。小数を保ち、1%単位の段差も作らない。
 */
export function getStaminaDisplayBarPct(horse) {
  return getStaminaRatio(horse) * 100;
}

/** @returns {'green'|'yellow'|'red'} */
export function resolveStaminaTier(displayPct) {
  if (displayPct <= 33) return 'red';
  if (displayPct <= 66) return 'yellow';
  return 'green';
}

/** 表示％の3等分で色分け（下1/3=赤・中1/3=黄・上1/3=緑） */
export function getStaminaBarClassName(staminaDisplayPct) {
  const tier = resolveStaminaTier(staminaDisplayPct);
  if (tier === 'red') return 'stamina-remain-bar is-critical';
  if (tier === 'yellow') return 'stamina-remain-bar is-warning';
  return 'stamina-remain-bar';
}
