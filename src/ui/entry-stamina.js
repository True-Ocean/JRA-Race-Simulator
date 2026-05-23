const ENTRY_STAMINA_BAR_RAW_MIN = 50;
const ENTRY_STAMINA_BAR_RAW_MAX = 100;

function getStaminaRemainRawPct(horse) {
  if (!horse || horse.initialStamina <= 0) return 0;
  const ratio = (horse.stamina / horse.initialStamina) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

/**
 * バー幅・表示用％（ENTRY_STAMINA_BAR_RAW_MIN〜MAX を 0〜100% に線形マップ）
 */
function getStaminaDisplayBarPct(horse) {
  const raw = getStaminaRemainRawPct(horse);
  const span = ENTRY_STAMINA_BAR_RAW_MAX - ENTRY_STAMINA_BAR_RAW_MIN;
  if (span <= 0) return raw;
  const t = (raw - ENTRY_STAMINA_BAR_RAW_MIN) / span;
  return Math.max(0, Math.min(100, Math.round(t * 100)));
}

/** 表示％（50〜100実残を 0〜100 にマップ）の3等分で色分け（下1/3=赤・中1/3=黄・上1/3=緑） */
function getStaminaBarClassName(staminaDisplayPct) {
  if (staminaDisplayPct <= 33) return 'stamina-remain-bar is-critical';
  if (staminaDisplayPct <= 66) return 'stamina-remain-bar is-warning';
  return 'stamina-remain-bar';
}

function updateEntryStaminaBars(horses) {
  horses.forEach(horse => {
    const rowEl = document.querySelector(`[data-horse-id="${horse.id}"]`);
    if (!rowEl) return;
    const displayPct = getStaminaDisplayBarPct(horse);
    const barEl = rowEl.querySelector('.stamina-remain-bar');
    if (barEl) {
      barEl.style.width = `${displayPct}%`;
      barEl.className = `param-bar ${getStaminaBarClassName(displayPct)}`;
    }
  });
}

export {
  getStaminaRemainRawPct,
  getStaminaDisplayBarPct,
  getStaminaBarClassName,
  updateEntryStaminaBars,
};
