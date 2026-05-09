import { resolveCourseDef } from '../../main.js';
import {
  loadRaceBundleFromSession,
  persistRaceBundleToSession,
  computeBucketKey,
  loadAggregateState,
  computeAggregateRows,
  clearAggregateState,
  runCountsBySource,
} from './aggregate-store.js';

let runtimeRaceData = null;
let userTweaks = {};
let marks = {};

function pct(x) {
  if (!Number.isFinite(x)) return '—';
  return `${Math.round(x * 1000) / 10}%`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
  const state = loadAggregateState();
  const { batch: legacyBatch } = runCountsBySource(state);

  const summary = document.getElementById('stats-trial-summary');
  if (summary) {
    let msg =
      trials > 0
        ? `試行 ${trials} 回（シミュレータでレース完了のたびに、ゴール演出の着順で蓄積）`
        : '試行 0 回（シミュレータでレースを最後まで再生すると集計されます）';
    if (legacyBatch > 0) {
      msg += ` ※以前の一括試行 ${legacyBatch} 回は表示から除外しています。`;
    }
    summary.textContent = msg;
  }

  if (!rows.length) {
    wrap.innerHTML = '<p class="stats-muted">出走馬がありません。</p>';
    return;
  }

  const head =
    '<thead><tr>' +
    '<th>枠</th><th>馬名</th><th>1着率</th><th>連対率</th><th>複勝率</th><th>最良着</th><th>最悪着</th>' +
    '</tr></thead>';
  const body =
    '<tbody>' +
    rows
      .map(
        r =>
          `<tr><td>${escapeHtml(String(r.gate))}</td>` +
          `<td>${escapeHtml(r.name)}</td>` +
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
    const ri = runtimeRaceData.race_info;
    infoEl.innerHTML = `<b>${escapeHtml(ri?.race_name ?? '')}</b> · ${escapeHtml(ri?.venue ?? '')} · ${escapeHtml(String(ri?.distance ?? ''))}m`;
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
