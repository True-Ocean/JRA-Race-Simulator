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
import { JRA_WAKU_COLORS } from '../ui/colors.js';

let runtimeRaceData = null;
let ratingAdjustments = {};
let marks = {};
const AUTO_MARKS = ['◎', '◯', '▲', '△', '★', '☆'];
const MARK_SORT_RANK = new Map([
  ['◎', 0],
  ['◯', 1],
  ['▲', 2],
  ['△', 3],
  ['★', 4],
  ['☆', 5],
]);

/** 数値列・馬番ソート（null / 非数値は常に末尾） */
const SORT_KEYS = [
  'mark',
  'gate',
  'compositeScore',
  'avgRank',
  'winRate',
  'top2Rate',
  'top3Rate',
  'bestRank',
  'worstRank',
];
let sortState = { key: null, dir: 'asc' };
let sortDelegationBound = false;
let latestAutoMarks = new Map();
let latestCompositeScores = new Map();

function getSortEntry(key) {
  return sortState.key === key ? sortState : null;
}

function metricValueForSort(row, key) {
  switch (key) {
    case 'mark': {
      const symbol = latestAutoMarks.get(row.id);
      return MARK_SORT_RANK.get(symbol) ?? 99;
    }
    case 'compositeScore':
      return latestCompositeScores.get(row.id);
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
  if (!fa && !fb) return 0;
  if (!fa) return 1;
  if (!fb) return -1;
  const cmp = va - vb;
  const signed = dir === 'asc' ? cmp : -cmp;
  return signed;
}

function sortRowsCopy(rows) {
  if (!sortState.key || !SORT_KEYS.includes(sortState.key)) return [...rows];
  const out = [...rows];
  out.sort((a, b) => {
    const cmp = compareRowsForSort(a, b, sortState.key, sortState.dir);
    if (cmp !== 0) return cmp;
    return a.id - b.id;
  });
  return out;
}

function sortThHtml(key, label, className = 'stats-col-metric') {
  const entry = getSortEntry(key);
  const active = Boolean(entry);
  const arrow = active ? (entry.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const aria = active
    ? ` aria-sort="${entry.dir === 'asc' ? 'ascending' : 'descending'}"`
    : '';
  return (
    `<th class="${escapeHtml(className)} stats-sortable" scope="col" data-sort="${key}"${aria} ` +
    `title="クリックで並べ替え">${escapeHtml(label)}${arrow}</th>`
  );
}

/** 馬ブロック見出し（馬番でソート・表示ラベルは出馬情報） */
function horseGateSortThHtml() {
  const key = 'gate';
  const entry = getSortEntry(key);
  const active = Boolean(entry);
  const arrow = active ? (entry.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const aria = active
    ? ` aria-sort="${entry.dir === 'asc' ? 'ascending' : 'descending'}"`
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
      sortState = { key, dir: 'asc' };
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

function fmtScore(x) {
  if (!Number.isFinite(x)) return '—';
  return `${(x * 1000).toFixed(1)}pt`;
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

function normalize01(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max <= min) return 0.5;
  return (value - min) / (max - min);
}

function computeCompositeScores(rows) {
  const out = new Map();
  const avgValues = rows.map(r => r.avgRank).filter(Number.isFinite);
  const minAvg = avgValues.length ? Math.min(...avgValues) : 0;
  const maxAvg = avgValues.length ? Math.max(...avgValues) : 1;
  for (const r of rows) {
    const avgBadNorm = normalize01(r.avgRank, minAvg, maxAvg);
    const avgGoodNorm = 1 - avgBadNorm;
    const score = 0.45 * r.winRate + 0.3 * r.top2Rate + 0.2 * r.top3Rate + 0.05 * avgGoodNorm;
    out.set(r.id, score);
  }
  return out;
}

function tieBreakForMain(a, b) {
  const seq = [
    (x, y) => y.winRate - x.winRate,
    (x, y) => y.top2Rate - x.top2Rate,
    (x, y) => y.top3Rate - x.top3Rate,
    (x, y) => x.avgRank - y.avgRank,
    (x, y) => x.gate - y.gate,
  ];
  for (const cmp of seq) {
    const d = cmp(a, b);
    if (d !== 0) return d;
  }
  return a.id - b.id;
}

function computeAutoMarks(rows, trials, compositeScores) {
  const marked = new Map();
  if (!Array.isArray(rows) || rows.length === 0 || trials <= 0) return marked;

  const candidates1 = rows.filter(r => Number.isFinite(r.bestRank) && r.bestRank <= 1);
  if (!candidates1.length) return marked;
  const candidates2 = rows.filter(r => Number.isFinite(r.bestRank) && r.bestRank <= 2);
  const candidates3 = rows.filter(r => Number.isFinite(r.bestRank) && r.bestRank <= 3);

  const mainSorted = [...candidates2]
    .map(r => ({ ...r, mainScore: compositeScores.get(r.id) ?? -Infinity }))
    .sort((a, b) => {
      const d = b.mainScore - a.mainScore;
      if (d !== 0) return d;
      return tieBreakForMain(a, b);
    });
  const mainScoreById = new Map(mainSorted.map(r => [r.id, r.mainScore]));

  const pickOne = (label, pool, compare) => {
    const filtered = pool.filter(r => !marked.has(r.id));
    if (!filtered.length) return;
    filtered.sort(compare);
    marked.set(filtered[0].id, label);
  };

  pickOne('◎', candidates1, (a, b) => {
    const d = (mainScoreById.get(b.id) ?? -Infinity) - (mainScoreById.get(a.id) ?? -Infinity);
    if (d !== 0) return d;
    return tieBreakForMain(a, b);
  });

  pickOne('◯', mainSorted, (a, b) => {
    const d = b.mainScore - a.mainScore;
    if (d !== 0) return d;
    return tieBreakForMain(a, b);
  });

  pickOne('▲', mainSorted, (a, b) => {
    const d = b.mainScore - a.mainScore;
    if (d !== 0) return d;
    return tieBreakForMain(a, b);
  });

  const remaining3 = () => candidates3.filter(r => !marked.has(r.id));
  if (!remaining3().length) return marked;

  pickOne('△', remaining3(), (a, b) => {
    const d = a.avgRank - b.avgRank;
    if (d !== 0) return d;
    return tieBreakForMain(a, b);
  });

  pickOne('★', remaining3(), (a, b) => {
    const d = b.top3Rate - a.top3Rate;
    if (d !== 0) return d;
    return tieBreakForMain(a, b);
  });

  const remainingByBestRank = limit =>
    rows.filter(r => Number.isFinite(r.bestRank) && r.bestRank <= limit && !marked.has(r.id));
  const starPool = remainingByBestRank(1).length
    ? remainingByBestRank(1)
    : remainingByBestRank(2).length
      ? remainingByBestRank(2)
      : remainingByBestRank(3);

  pickOne('☆', starPool, (a, b) => {
    const pool = starPool;
    if (!pool.length) return 0;
    const avgPool = pool.map(r => r.avgRank).filter(Number.isFinite);
    const worstPool = pool.map(r => r.worstRank).filter(Number.isFinite);
    const minAvgPool = avgPool.length ? Math.min(...avgPool) : 0;
    const maxAvgPool = avgPool.length ? Math.max(...avgPool) : 1;
    const minWorst = worstPool.length ? Math.min(...worstPool) : 0;
    const maxWorst = worstPool.length ? Math.max(...worstPool) : 1;
    const romanceA =
      0.5 * normalize01(a.avgRank, minAvgPool, maxAvgPool) +
      0.3 * normalize01(a.worstRank, minWorst, maxWorst) +
      0.2 * (1 - a.top3Rate);
    const romanceB =
      0.5 * normalize01(b.avgRank, minAvgPool, maxAvgPool) +
      0.3 * normalize01(b.worstRank, minWorst, maxWorst) +
      0.2 * (1 - b.top3Rate);
    const d = romanceB - romanceA;
    if (d !== 0) return d;
    return tieBreakForMain(a, b);
  });

  return marked;
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
    ratingAdjustments,
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
  const compositeScores = computeCompositeScores(rows);
  const autoMarks = computeAutoMarks(rows, trials, compositeScores);
  latestAutoMarks = autoMarks;
  latestCompositeScores = compositeScores;
  const emptyMetricCells = Array.from({ length: 7 }, () => '<td class="stats-col-metric"></td>').join('');
  const markCol = '<col class="stats-col-mark" />';
  const metricCols = Array.from({ length: 7 }, () => '<col class="stats-col-metric" />').join('');
  const horseCols =
    '<col class="stats-col-horse-main" />' +
    '<col class="stats-col-horse-sex" />' +
    '<col class="stats-col-horse-jockey" />';
  const head =
    '<colgroup>' +
    markCol +
    horseCols +
    metricCols +
    '</colgroup>' +
    '<thead><tr>' +
    sortThHtml('mark', '印', 'stats-col-mark') +
    horseGateSortThHtml() +
    sortThHtml('compositeScore', '総合スコア') +
    sortThHtml('avgRank', '平均着順') +
    sortThHtml('winRate', '勝率') +
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
        const symbol = autoMarks.get(r.id) ?? '';
        const markCell = `<td class="stats-col-mark" title="自動印">${escapeHtml(symbol)}</td>`;
        const statCells =
          trials === 0
            ? `${markCell}${horseBlockCellsHtml(entry, r.gate, fieldSize)}${emptyMetricCells}`
            : `${markCell}${horseBlockCellsHtml(entry, r.gate, fieldSize)}` +
              `<td class="stats-col-metric">${fmtScore(compositeScores.get(r.id))}</td>` +
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

  ratingAdjustments = bundle.ratingAdjustments ?? bundle.userTweaks ?? {};
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

  persistRaceBundleToSession(runtimeRaceData, ratingAdjustments, marks);

  const key = computeBucketKey(runtimeRaceData, ratingAdjustments, marks);
  const st = loadAggregateState();
  if (st.runs?.length && st.bucketKey && st.bucketKey !== key) {
    clearAggregateState();
    sortState = { key: null, dir: 'asc' };
  }

  renderTable();
}

init();
