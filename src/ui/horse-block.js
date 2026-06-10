import { calcWaku } from '../engine/params.js';
import { carrotBadgeHtml, carrotCountLabel } from './carrot-display.js';
import { JRA_WAKU_COLORS } from './colors.js';

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 性齢の先頭字で牡／牝を判定 */
export function sexAgeDemographicClass(sexAgeStr) {
  const s = String(sexAgeStr ?? '');
  if (s.startsWith('牝')) return 'is-female';
  if (s.startsWith('牡')) return 'is-male';
  return '';
}

export function gateBadgeHtml(gate, fieldSize) {
  const waku = calcWaku(gate, fieldSize);
  const c = JRA_WAKU_COLORS[waku] ?? { bg: '#888888', text: '#ffffff' };
  const g = escapeHtml(String(gate));
  return `<span class="entry-gate" style="background:${c.bg};color:${c.text};border:1px solid rgba(255,255,255,0.3);">${g}</span>`;
}

function horseBlockTexts(entry) {
  const horse = entry?.horse ?? {};
  const jockey = entry?.jockey ?? {};
  const nameRaw = horse.name != null && horse.name !== '' ? String(horse.name) : '—';
  const sexRaw = horse.sex_age != null && horse.sex_age !== '' ? String(horse.sex_age) : '';
  const sexDisplay = sexRaw !== '' ? sexRaw : '—';
  const jockeyDisplay =
    jockey.name != null && jockey.name !== '' ? String(jockey.name) : '—';
  const sexClass = sexAgeDemographicClass(sexRaw);
  const title = [nameRaw, sexRaw, jockey.name].filter(Boolean).join(' ');
  return { nameRaw, sexDisplay, jockeyDisplay, sexClass, title };
}

/**
 * 馬番・馬名／性齢／騎手を3つの td に分けるが、枠線で一体のブロックに見せる
 */
export function horseBlockCellsHtml(entry, gate, fieldSize, carrotCount = 0) {
  const { nameRaw, sexDisplay, jockeyDisplay, sexClass, title } = horseBlockTexts(entry);
  const carrotLabel = carrotCount > 0 ? ` ${carrotCountLabel(carrotCount)}` : '';
  const fullTitle = title + carrotLabel;

  return (
    `<td class="stats-horse-block stats-horse-block-start" title="${escapeHtml(fullTitle)}">` +
    `<div class="stats-horse-main-inner">` +
    `${gateBadgeHtml(gate, fieldSize)}` +
    `<span class="stats-horse-name-inline">${escapeHtml(nameRaw)}</span>` +
    `${carrotBadgeHtml(carrotCount)}` +
    `</div></td>` +
    `<td class="stats-horse-block stats-horse-block-mid stats-sex ${sexClass}" title="${escapeHtml(fullTitle)}">${escapeHtml(sexDisplay)}</td>` +
    `<td class="stats-horse-block stats-horse-block-end stats-jockey" title="${escapeHtml(fullTitle)}">${escapeHtml(jockeyDisplay)}</td>`
  );
}

/**
 * @param {HTMLTableRowElement} tr
 */
export function appendHorseBlockCells(tr, entry, gate, fieldSize, carrotCount = 0) {
  const { nameRaw, sexDisplay, jockeyDisplay, sexClass, title } = horseBlockTexts(entry);
  const carrotLabel = carrotCount > 0 ? ` ${carrotCountLabel(carrotCount)}` : '';
  const fullTitle = title + carrotLabel;

  const tdStart = document.createElement('td');
  tdStart.className = 'stats-horse-block stats-horse-block-start';
  tdStart.title = fullTitle;

  const inner = document.createElement('div');
  inner.className = 'stats-horse-main-inner';

  const waku = calcWaku(gate, fieldSize);
  const c = JRA_WAKU_COLORS[waku] ?? { bg: '#888888', text: '#ffffff' };
  const gateBadge = document.createElement('span');
  gateBadge.className = 'entry-gate';
  gateBadge.textContent = String(gate);
  gateBadge.style.background = c.bg;
  gateBadge.style.color = c.text;
  gateBadge.style.border = '1px solid rgba(255,255,255,0.3)';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'stats-horse-name-inline';
  nameSpan.textContent = nameRaw;

  inner.append(gateBadge, nameSpan);
  const carrotLabelText = carrotCountLabel(carrotCount);
  if (carrotLabelText) {
    const carrotSpan = document.createElement('span');
    carrotSpan.className = 'horse-carrot-badge';
    carrotSpan.title = 'あなたの評価';
    carrotSpan.textContent = carrotLabelText;
    inner.appendChild(carrotSpan);
  }
  tdStart.appendChild(inner);

  const tdMid = document.createElement('td');
  tdMid.className = `stats-horse-block stats-horse-block-mid stats-sex ${sexClass}`.trim();
  tdMid.title = fullTitle;
  tdMid.textContent = sexDisplay;

  const tdEnd = document.createElement('td');
  tdEnd.className = 'stats-horse-block stats-horse-block-end stats-jockey';
  tdEnd.title = fullTitle;
  tdEnd.textContent = jockeyDisplay;

  tr.append(tdStart, tdMid, tdEnd);
}
