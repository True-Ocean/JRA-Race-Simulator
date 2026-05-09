import { resolveCourseDef, formatRaceInfo } from '../../main.js';
import { calcWaku } from '../engine/params.js';
import {
  loadRaceBundleFromSession,
  persistRaceBundleToSession,
  computeBucketKey,
  loadAggregateState,
  computeAggregateRows,
  clearAggregateState,
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

function pct(x) {
  if (!Number.isFinite(x)) return '—';
  return `${Math.round(x * 1000) / 10}%`;
}

function fmtAvg(x) {
  if (!Number.isFinite(x)) return '—';
  return String(Math.round(x * 100) / 100);
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

  if (!rows.length) {
    wrap.innerHTML = '<p class="stats-muted">出走馬がありません。</p>';
    return;
  }

  const fieldSize = runtimeRaceData.entries.length;
  const head =
    '<thead><tr>' +
    '<th>馬番</th><th>馬名</th><th>平均着順</th><th>1着率</th><th>連対率</th><th>複勝率</th><th>最良着</th><th>最悪着</th>' +
    '</tr></thead>';
  const body =
    '<tbody>' +
    rows
      .map(
        r =>
          `<tr><td class="stats-gate-cell">${gateBadgeHtml(r.gate, fieldSize)}</td>` +
          `<td>${escapeHtml(r.name)}</td>` +
          `<td>${fmtAvg(r.avgRank)}</td>` +
          `<td>${pct(r.winRate)}</td>` +
          `<td>${pct(r.top2Rate)}</td>` +
          `<td>${pct(r.top3Rate)}</td>` +
          `<td>${r.bestRank ?? '—'}</td>` +
          `<td>${r.worstRank ?? '—'}</td></tr>`,
      )
      .join('') +
    '</tbody>';
  wrap.innerHTML = `<table class="stats-table">${head}${body}</table>`;
}

async function init() {
  const bundle = loadRaceBundleFromSession();
  const infoEl = document.getElementById('stats-race-info');
  const errEl = document.getElementById('stats-error');

  document.getElementById('btn-stats-reset')?.addEventListener('click', () => {
    if (!window.confirm('このレース設定の集計をすべて消去しますか？')) return;
    clearAggregateState();
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
  }

  renderTable();
}

init();
