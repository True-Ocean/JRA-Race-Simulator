import { escapeHtml } from './race-log.js';

/** @param {number} count */
export function carrotCountLabel(count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n <= 0) return '';
  return `🥕${n}`;
}

/**
 * @param {number} count
 * @param {{ title?: string }} [options]
 */
export function carrotBadgeHtml(count, { title = 'あなたの評価' } = {}) {
  const label = carrotCountLabel(count);
  if (!label) return '';
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<span class="horse-carrot-badge"${titleAttr}>${escapeHtml(label)}</span>`;
}
