import { JRA_WAKU_COLORS } from './colors.js';
import { escapeHtml } from './race-log.js';

/**
 * @param {number} rank
 * @param {object} horse
 * @param {Map<string, object> | undefined} horseMetaByName
 * @param {{ timeLabel?: string, marginLabel?: string } | null | undefined} finishDisplay
 */
function formatHomePlacingRowInnerHtml(rank, horse, horseMetaByName, finishDisplay = null) {
  const meta = horseMetaByName?.get(horse.name);
  const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
  const badgeHtml =
    meta && waku
      ? `<span class="summary-placing-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '<span class="summary-placing-badge" style="background:#1e3a5f;color:#fff;">-</span>';
  const timeLabel = finishDisplay?.timeLabel ?? '';
  const marginLabel = finishDisplay?.marginLabel ?? '';
  const timeHtml = timeLabel
    ? `<span class="summary-placing-time">${escapeHtml(timeLabel)}</span>`
    : '';
  const marginHtml = marginLabel
    ? `<span class="summary-placing-margin">${escapeHtml(marginLabel)}</span>`
    : '';
  return `
      <span class="summary-placing-rank">${rank}着</span>
      ${badgeHtml}
      <span class="summary-placing-name">${escapeHtml(horse.name)}</span>
      ${timeHtml}
      ${marginHtml}
    `;
}

/** 右カラム #placing-panel とコース上オーバーレイ #placing-panel-overlay を同期 */
function syncPlacingPanelsHtml(html) {
  const main = document.getElementById('placing-panel');
  const overlay = document.getElementById('placing-panel-overlay');
  if (main) main.innerHTML = html;
  if (overlay) overlay.innerHTML = html;
}

/**
 * @param {number} rank
 * @param {object} horse
 * @param {Map<string, object> | undefined} horseMetaByName
 * @param {{ timeLabel?: string, marginLabel?: string } | null | undefined} finishDisplay
 */
function appendPlacingRowToPanels(rank, horse, horseMetaByName, finishDisplay = null) {
  const rankClass =
    rank === 1 ? ' is-top1' : rank === 2 ? ' is-top2' : rank === 3 ? ' is-top3' : '';
  const makeDiv = () => {
    const div = document.createElement('div');
    div.className = `summary-placing-entry${rankClass}`;
    div.innerHTML = formatHomePlacingRowInnerHtml(
      rank,
      horse,
      horseMetaByName,
      finishDisplay,
    );
    return div;
  };
  const main = document.getElementById('placing-panel');
  const overlay = document.getElementById('placing-panel-overlay');
  if (main) {
    main.appendChild(makeDiv());
    main.scrollTop = main.scrollHeight;
  }
  if (overlay) {
    overlay.appendChild(makeDiv());
    /* オーバーレイは1着側を常に見えるよう先頭固定（下へスクロールで全頭確認） */
    overlay.scrollTop = 0;
  }
}

/**
 * 着順・タイム・着差付きで掲示板を一括描画
 * @param {{
 *   finishOrderIds: number[],
 *   simResults: object[],
 *   horseMetaByName: Map<string, object>,
 *   finishRows?: Array<{ id: number, timeLabel: string, marginLabel: string }>,
 * }} params
 */
function renderPlacingPanelsWithFinishTimes({
  finishOrderIds,
  simResults,
  horseMetaByName,
  finishRows = [],
}) {
  const resultsById = new Map(
    (simResults ?? []).map(h => [h.id, h]),
  );
  const rowById = new Map(finishRows.map(r => [r.id, r]));

  const html = finishOrderIds
    .map((id, idx) => {
      const horse = resultsById.get(id);
      if (!horse) return '';
      const rank = idx + 1;
      const rankClass =
        rank === 1 ? ' is-top1' : rank === 2 ? ' is-top2' : rank === 3 ? ' is-top3' : '';
      const row = rowById.get(id);
      const finishDisplay = row
        ? { timeLabel: row.timeLabel, marginLabel: row.marginLabel }
        : null;
      const inner = formatHomePlacingRowInnerHtml(
        rank,
        horse,
        horseMetaByName,
        finishDisplay,
      );
      return `<div class="summary-placing-entry${rankClass}">${inner}</div>`;
    })
    .join('');

  syncPlacingPanelsHtml(html);
}

export {
  formatHomePlacingRowInnerHtml,
  syncPlacingPanelsHtml,
  appendPlacingRowToPanels,
  renderPlacingPanelsWithFinishTimes,
};
