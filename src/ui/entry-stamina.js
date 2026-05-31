import {
  getStaminaRemainRawPct,
  getStaminaDisplayBarPct,
  getStaminaBarClassName,
} from '../engine/stamina-display.js';

function updateEntryStaminaBars(horses) {
  horses.forEach(horse => {
    const rowEl = document.querySelector(`#entry-list [data-horse-id="${horse.id}"]`);
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
