import { JRA_WAKU_COLORS } from './colors.js';
import { escapeHtml } from './race-log.js';

function formatHomePlacingRowInnerHtml(rank, horse, horseMetaByName) {
  const meta = horseMetaByName?.get(horse.name);
  const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
  const badgeHtml =
    meta && waku
      ? `<span class="summary-placing-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '<span class="summary-placing-badge" style="background:#1e3a5f;color:#fff;">-</span>';
  return `
      <span class="summary-placing-rank">${rank}着</span>
      ${badgeHtml}
      <span class="summary-placing-name">${escapeHtml(horse.name)}</span>
    `;
}

/** 右カラム #placing-panel とコース上オーバーレイ #placing-panel-overlay を同期 */
function syncPlacingPanelsHtml(html) {
  const main = document.getElementById('placing-panel');
  const overlay = document.getElementById('placing-panel-overlay');
  if (main) main.innerHTML = html;
  if (overlay) overlay.innerHTML = html;
}

function appendPlacingRowToPanels(rank, horse, horseMetaByName) {
  const rankClass =
    rank === 1 ? ' is-top1' : rank === 2 ? ' is-top2' : rank === 3 ? ' is-top3' : '';
  const makeDiv = () => {
    const div = document.createElement('div');
    div.className = `summary-placing-entry${rankClass}`;
    div.innerHTML = formatHomePlacingRowInnerHtml(rank, horse, horseMetaByName);
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

export {
  formatHomePlacingRowInnerHtml,
  syncPlacingPanelsHtml,
  appendPlacingRowToPanels,
};
