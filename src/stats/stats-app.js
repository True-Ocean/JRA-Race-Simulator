import { runSimulation, resolveCourseDef } from '../../main.js';
import {
  loadRaceBundleFromSession,
  persistRaceBundleToSession,
  computeBucketKey,
  loadAggregateState,
  addAggregateRun,
  computeAggregateRows,
  clearAggregateState,
} from './aggregate-store.js';

const MC_MAX = 100;

let runtimeRaceData = null;
let userTweaks = {};
let marks = {};
let cancelMc = false;
let currentMode = 'all';

function pct(x) {
  if (!Number.isFinite(x)) return '—';
  return `${Math.round(x * 1000) / 10}%`;
}

function renderTable(mode) {
  const wrap = document.getElementById('stats-table-wrap');
  if (!wrap || !runtimeRaceData) {
    if (wrap) wrap.innerHTML = '<p class="stats-muted">出走データがありません。シミュレータから「集計画面へ」で開いてください。</p>';
    return;
  }
  const { rows, trials, batch, manual } = computeAggregateRows({
    runtimeRaceData,
    userTweaks,
    marks,
    mode,
  });
  const summary = document.getElementById('stats-trial-summary');
  if (summary) {
    summary.textContent =
      trials > 0
        ? `試行 ${trials} 回（一括 ${batch} / 手動 ${manual}）`
        : '試行 0 回（シミュレータでレース完了、または下で一括実行）';
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

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('[data-stats-mode]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.statsMode === mode);
  });
  renderTable(mode);
}

async function init() {
  const bundle = loadRaceBundleFromSession();
  const infoEl = document.getElementById('stats-race-info');
  const errEl = document.getElementById('stats-error');

  if (!bundle || !bundle.race_id) {
    if (infoEl) infoEl.innerHTML = '';
    if (errEl) errEl.textContent = 'シミュレータ画面で「集計画面へ」から開いてください。';
    renderTable('all');
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

  document.querySelectorAll('[data-stats-mode]').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.statsMode));
  });

  const inp = document.getElementById('stats-mc-count');
  const btnRun = document.getElementById('stats-mc-run');
  const btnCancel = document.getElementById('stats-mc-cancel');
  const prog = document.getElementById('stats-mc-progress');

  if (inp) inp.value = '50';

  btnCancel?.addEventListener('click', () => {
    cancelMc = true;
  });

  btnRun?.addEventListener('click', async () => {
    if (!runtimeRaceData) return;
    const n = Math.min(MC_MAX, Math.max(1, Math.floor(Number(inp?.value) || 0)));
    if (inp) inp.value = String(n);
    cancelMc = false;
    btnRun.disabled = true;
    btnCancel.disabled = false;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (cancelMc) break;
      const seed = (Date.now() + i * 0x9e3779b9) >>> 0;
      const sim = runSimulation(
        runtimeRaceData,
        { seed, reproducible: false },
        userTweaks,
        marks,
        null,
      );
      const orderIds = sim.results.map(h => h.id);
      addAggregateRun({
        runtimeRaceData,
        userTweaks,
        marks,
        source: 'batch',
        orderIds,
      });
      if (prog) prog.textContent = `${i + 1} / ${n}`;
      if (i % 3 === 2) {
        await new Promise(r => requestAnimationFrame(r));
      }
    }
    if (prog) prog.textContent = cancelMc ? 'キャンセルしました' : `完了（${Math.round(performance.now() - t0)} ms）`;
    btnRun.disabled = false;
    btnCancel.disabled = true;
    setMode(currentMode);
  });

  setMode('all');
}

init();
