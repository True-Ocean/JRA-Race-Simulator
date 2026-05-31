/** エントリーUIとゴールシーンで共有するスタミナ表示％・色 tier */

export const ENTRY_STAMINA_BAR_RAW_MIN = 50;
export const ENTRY_STAMINA_BAR_RAW_MAX = 100;

export function getStaminaRemainRawPct(horse) {
  if (!horse || horse.initialStamina <= 0) return 0;
  const ratio = (horse.stamina / horse.initialStamina) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

/**
 * バー幅・表示用％（ENTRY_STAMINA_BAR_RAW_MIN〜MAX を 0〜100 に線形マップ）
 */
export function getStaminaDisplayBarPct(horse) {
  const raw = getStaminaRemainRawPct(horse);
  const span = ENTRY_STAMINA_BAR_RAW_MAX - ENTRY_STAMINA_BAR_RAW_MIN;
  if (span <= 0) return raw;
  const t = (raw - ENTRY_STAMINA_BAR_RAW_MIN) / span;
  return Math.max(0, Math.min(100, Math.round(t * 100)));
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
