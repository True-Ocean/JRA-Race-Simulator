import { resolveCourseDef, formatRaceInfo } from './race-display.js';
import { calcWaku } from '../engine/params.js';
import {
  loadRaceBundleFromSession,
  persistRaceBundleToSession,
  computeBucketKey,
  loadAggregateState,
  computeAggregateRows,
  clearAggregateState,
  SESSION_KEY_OPEN_SCREEN,
  SESSION_KEY_STATS_RETURN_SCREEN,
} from './aggregate-store.js';

/** main.js の出馬表・掲示板と同じ枠色（馬番バッジ用） */
const JRA_WAKU_COLORS = {
  1: { bg: '#FFFFFF', text: '#000000' },
  2: { bg: '#000000', text: '#FFFFFF' },
  3: { bg: '#FF0000', text: '#FFFFFF' },
  4: { bg: '#0000FF', text: '#FFFFFF' },
  5: { bg: '#FFFF00', text: '#000000' },
  6: { bg: '#008000', text: '#FFFFFF' },
  7: { bg: '#FF6600', text: '#FFFFFF' },
  8: { bg: '#FF5FA2', text: '#000000' },
};

let runtimeRaceData = null;
let userTweaks = {};
let marks = {};

/** 数値列・馬番ソート（null / 非数値は常に末尾） */
const SORT_KEYS = ['gate', 'avgRank', 'winRate', 'top2Rate', 'top3Rate', 'bestRank', 'worstRank'];
let sortState = { key: null, dir: 'asc' };
let sortDelegationBound = false;

function metricValueForSort(row, key) {
  switch (key) {
    case 'avgRank':
      return row.avgRank;
    case 'winRate':
      return row.winRate;
    case 'top2Rate':
      return row.top2Rate;
    case 'top3Rate':
      return row.top3Rate;
    case 'bestRank':
      return row.bestRank;
    case 'worstRank':
      return row.worstRank;
    case 'gate':
      return row.gate;
    default:
      return null;
  }
}

function compareRowsForSort(a, b, key, dir) {
  const va = metricValueForSort(a, key);
  const vb = metricValueForSort(b, key);
  const fa = Number.isFinite(va);
  const fb = Number.isFinite(vb);
  if (!fa && !fb) return a.id - b.id;
  if (!fa) return 1;
  if (!fb) return -1;
  const cmp = va - vb;
  const signed = dir === 'asc' ? cmp : -cmp;
  if (signed !== 0) return signed;
  return a.id - b.id;
}

function sortRowsCopy(rows) {
  if (!sortState.key || !SORT_KEYS.includes(sortState.key)) return [...rows];
  const out = [...rows];
  out.sort((a, b) => compareRowsForSort(a, b, sortState.key, sortState.dir));
  return out;
}

function sortThHtml(key, label) {
  const active = sortState.key === key;
  const arrow = active ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const aria = active
    ? ` aria-sort="${sortState.dir === 'asc' ? 'ascending' : 'descending'}"`
    : '';
  return (
    `<th class="stats-col-metric stats-sortable" scope="col" data-sort="${key}"${aria} ` +
    `title="クリックで並べ替え">${escapeHtml(label)}${arrow}</th>`
  );
}

/** 馬ブロック見出し（馬番でソート・表示ラベルは出馬情報） */
function horseGateSortThHtml() {
  const key = 'gate';
  const active = sortState.key === key;
  const arrow = active ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const aria = active
    ? ` aria-sort="${sortState.dir === 'asc' ? 'ascending' : 'descending'}"`
    : '';
  return (
    `<th colspan="3" class="stats-horse-th-merged stats-sortable stats-horse-sort-th" scope="colgroup" ` +
    `data-sort="${key}"${aria} title="馬番順で並べ替え">${escapeHtml('出馬情報')}${arrow}</th>`
  );
}

function ensureStatsSortDelegation() {
  const wrap = document.getElementById('stats-table-wrap');
  if (!wrap || sortDelegationBound) return;
  sortDelegationBound = true;
  wrap.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th || !wrap.contains(th)) return;
    const key = th.dataset.sort;
    if (!SORT_KEYS.includes(key)) return;
    if (sortState.key === key) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.key = key;
      sortState.dir = 'asc';
    }
    renderTable();
  });
}

function pct(x) {
  if (!Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(2)}%`;
}

function fmtAvg(x) {
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(2);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function gateBadgeHtml(gate, fieldSize) {
  const waku = calcWaku(gate, fieldSize);
  const c = JRA_WAKU_COLORS[waku] ?? { bg: '#888888', text: '#ffffff' };
  const g = escapeHtml(String(gate));
  return `<span class="entry-gate" style="background:${c.bg};color:${c.text};border:1px solid rgba(255,255,255,0.3);">${g}</span>`;
}

/** 性齢の先頭字で牡／牝を判定（index 出馬表と同様） */
function sexAgeDemographicClass(sexAgeStr) {
  const s = String(sexAgeStr ?? '');
  if (s.startsWith('牝')) return 'is-female';
  if (s.startsWith('牡')) return 'is-male';
  return '';
}

/**
 * 馬番・馬名／性齢／騎手を3つの td に分けるが、枠線で一体のブロックに見せる
 */
function horseBlockCellsHtml(entry, gate, fieldSize) {
  const horse = entry?.horse ?? {};
  const jockey = entry?.jockey ?? {};
  const nameRaw = horse.name != null && horse.name !== '' ? String(horse.name) : '—';
  const sexRaw = horse.sex_age != null && horse.sex_age !== '' ? String(horse.sex_age) : '';
  const sexDisplay = sexRaw !== '' ? escapeHtml(sexRaw) : '—';
  const jockeyDisplay =
    jockey.name != null && jockey.name !== '' ? escapeHtml(String(jockey.name)) : '—';
  const sexClass = sexAgeDemographicClass(sexRaw);
  const title = escapeHtml([nameRaw, sexRaw, jockey.name].filter(Boolean).join(' '));

  return (
    `<td class="stats-horse-block stats-horse-block-start" title="${title}">` +
    `<div class="stats-horse-main-inner">` +
    `${gateBadgeHtml(gate, fieldSize)}` +
    `<span class="stats-horse-name-inline">${escapeHtml(nameRaw)}</span>` +
    `</div></td>` +
    `<td class="stats-horse-block stats-horse-block-mid stats-sex ${sexClass}" title="${title}">${sexDisplay}</td>` +
    `<td class="stats-horse-block stats-horse-block-end stats-jockey" title="${title}">${jockeyDisplay}</td>`
  );
}

function renderTable() {
  const wrap = document.getElementById('stats-table-wrap');
  if (!wrap || !runtimeRaceData) {
    if (wrap) {
      wrap.innerHTML =
        '<p class="stats-muted">出走データがありません。シミュレータから「集計画面へ」で開いてください。</p>';
    }
    return;
  }
  const { rows, trials } = computeAggregateRows({
    runtimeRaceData,
    userTweaks,
    marks,
  });

  const summary = document.getElementById('stats-trial-summary');
  if (summary) {
    summary.textContent = trials > 0 ? `試行 ${trials} 回` : '試行 0 回';
  }

  const fieldSize = runtimeRaceData.entries.length;
  if (!rows.length) {
    wrap.innerHTML = '<p class="stats-muted">出走馬がありません。</p>';
    return;
  }
  const emptyMetricCells = Array.from({ length: 6 }, () => '<td class="stats-col-metric"></td>').join('');
  const metricCols = Array.from({ length: 6 }, () => '<col class="stats-col-metric" />').join('');
  const horseCols =
    '<col class="stats-col-horse-main" />' +
    '<col class="stats-col-horse-sex" />' +
    '<col class="stats-col-horse-jockey" />';
  const head =
    '<colgroup>' +
    horseCols +
    metricCols +
    '</colgroup>' +
    '<thead><tr>' +
    horseGateSortThHtml() +
    sortThHtml('avgRank', '平均着順') +
    sortThHtml('winRate', '1着率') +
    sortThHtml('top2Rate', '連対率') +
    sortThHtml('top3Rate', '複勝率') +
    sortThHtml('bestRank', 'ベスト着順') +
    sortThHtml('worstRank', 'ワースト着順') +
    '</tr></thead>';
  const displayRows = sortRowsCopy(rows);
  const body =
    '<tbody>' +
    displayRows
      .map(r => {
        const entry = runtimeRaceData.entries[r.id];
        const statCells =
          trials === 0
            ? `${horseBlockCellsHtml(entry, r.gate, fieldSize)}${emptyMetricCells}`
            : `${horseBlockCellsHtml(entry, r.gate, fieldSize)}` +
              `<td class="stats-col-metric">${fmtAvg(r.avgRank)}</td>` +
              `<td class="stats-col-metric">${pct(r.winRate)}</td>` +
              `<td class="stats-col-metric">${pct(r.top2Rate)}</td>` +
              `<td class="stats-col-metric">${pct(r.top3Rate)}</td>` +
              `<td class="stats-col-metric">${r.bestRank ?? '—'}</td>` +
              `<td class="stats-col-metric">${r.worstRank ?? '—'}</td>`;
        return `<tr>${statCells}</tr>`;
      })
      .join('') +
    '</tbody>';
  wrap.innerHTML = `<table class="stats-table">${head}${body}</table>`;
}

async function init() {
  ensureStatsSortDelegation();

  const bundle = loadRaceBundleFromSession();
  const infoEl = document.getElementById('stats-race-info');
  const errEl = document.getElementById('stats-error');

  document.getElementById('btn-stats-back')?.addEventListener('click', () => {
    try {
      const returnScreen = sessionStorage.getItem(SESSION_KEY_STATS_RETURN_SCREEN) ?? 'simulator';
      sessionStorage.setItem(SESSION_KEY_OPEN_SCREEN, returnScreen);
      sessionStorage.removeItem(SESSION_KEY_STATS_RETURN_SCREEN);
    } catch {
      /* ignore */
    }
    window.location.assign('index.html');
  });

  document.getElementById('btn-stats-reset')?.addEventListener('click', () => {
    if (!window.confirm('このレース設定の集計をすべて消去しますか？')) return;
    clearAggregateState();
    sortState = { key: null, dir: 'asc' };
    renderTable();
  });

  if (!bundle || !bundle.race_id) {
    if (infoEl) infoEl.innerHTML = '';
    if (errEl) errEl.textContent = 'シミュレータ画面で「集計画面へ」から開いてください。';
    renderTable();
    return;
  }

  userTweaks = bundle.userTweaks ?? {};
  marks = bundle.marks ?? {};
  try {
    const courseCatalog = await fetch('./src/data/courses.json').then(r => r.json());
    const raceData = {
      race_id: bundle.race_id,
      race_info: bundle.race_info,
      entries: bundle.entries,
    };
    const courseDef = resolveCourseDef(raceData, courseCatalog);
    runtimeRaceData = { ...raceData, courseDef };
  } catch (e) {
    console.error(e);
    if (errEl) errEl.textContent = 'コースデータの読み込みに失敗しました。';
    return;
  }

  if (errEl) errEl.textContent = '';
  if (infoEl) {
    infoEl.innerHTML = formatRaceInfo(runtimeRaceData);
  }

  persistRaceBundleToSession(runtimeRaceData, userTweaks, marks);

  const key = computeBucketKey(runtimeRaceData, userTweaks, marks);
  const st = loadAggregateState();
  if (st.runs?.length && st.bucketKey && st.bucketKey !== key) {
    clearAggregateState();
    sortState = { key: null, dir: 'asc' };
  }

  renderTable();
}

init();
