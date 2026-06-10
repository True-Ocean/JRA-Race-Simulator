import {
  calcHorsesWithCarrots,
  clonePreferencesSnapshot,
  createDefaultCarrotsByHorse,
  createDefaultMarksByHorse,
  loadCarrotsByHorseFromBundle,
  loadMarksByHorseFromBundle,
  preferencesSnapshotsEqual,
} from './src/engine/rating-adjustments.js';
import { buildPhases } from './src/engine/phase.js';
import { Renderer }       from './src/ui/renderer.js';
import {
  addAggregateRun,
  clearAggregateState,
  computeBucketKey,
  getAggregateTrialCount,
  loadAggregateState,
  loadRaceBundleFromSession,
  persistRaceBundleToSession,
  SESSION_KEY_OPEN_SCREEN,
  SESSION_KEY_OPEN_SIMULATOR,
  SESSION_KEY_SIMULATOR_STATE,
  SESSION_KEY_SIMULATOR_GOAL_RECORDING,
  SESSION_KEY_STATS_RETURN_SCREEN,
  SESSION_KEY_SUMMARY_STATE,
} from './src/stats/aggregate-store.js';
import { formatRaceInfo, resolveCourseDef } from './src/stats/race-display.js';
import { JRA_WAKU_COLORS } from './src/ui/colors.js';
import { runSimulation } from './src/engine/simulation.js';
import { RACE_SUMMARY_HEADER_LINE } from './src/engine/constants.js';
import { PhaseController } from './src/ui/phase-controller.js';
import {
  drawGoalCourseFrame,
  lastGoalRecordingFrame,
} from './src/ui/goal-scene.js';
import {
  escapeHtml,
  escapeRegExp,
  getRaceSummarySceneLabel,
  formatLogLineHtml,
} from './src/ui/race-log.js';
import {
  syncPlacingPanelsHtml,
  renderPlacingPanelsWithFinishTimes,
} from './src/ui/placing-panel.js';
import {
  buildFinishTimeRows,
  deriveGoalFinishedAtFromRecording,
  deserializeGoalFinishedAtById,
  serializeGoalFinishedAtById,
} from './src/ui/finish-times.js';
import {
  getStaminaDisplayBarPct,
  getStaminaBarClassName,
  updateEntryStaminaBars,
} from './src/ui/entry-stamina.js';
import { horseNameCarrotGroupHtml } from './src/ui/carrot-display.js';
import { setPlaybackButton } from './src/ui/playback-dock-label.js';
import {
  closeActiveInfoPopover,
  getEntryStyleBadgeClass,
  mountPreRaceEditor,
  renderPreRaceEditor,
  schedulePreRaceTableFit,
  showPreRaceConfirm,
} from './src/ui/pre-race-editor.js';


/** レースサマリ用ログ行かどうか（イベント抽出から除外する） */
function isRaceSummaryRelatedLine(line) {
  if (typeof line !== 'string') return true;
  if (line === RACE_SUMMARY_HEADER_LINE) return true;
  if (getRaceSummarySceneLabel(line)) return true;
  return false;
}

/**
 * 各馬に紐づくイベントログをスナップショットから抽出する。
 * 1ログ行に複数馬が含まれる場合（例: バトル行）は登場馬全員に同じ行を割り当てる。
 *
 * @returns {Map<string, Array<{ phaseLabel: string, text: string }>>}
 */
function extractHorseEventsBySnapshots(snapshots, phases, horseNames, getPhaseLabel) {
  const eventsByName = new Map();
  horseNames.forEach(name => {
    if (typeof name === 'string' && name.length > 0) {
      eventsByName.set(name, []);
    }
  });
  if (!Array.isArray(snapshots) || snapshots.length === 0) return eventsByName;

  const sortedNames = [...eventsByName.keys()].sort((a, b) => b.length - a.length);
  if (sortedNames.length === 0) return eventsByName;

  const escapedAlt = sortedNames.map(escapeRegExp).join('|');
  const namePattern = new RegExp(escapedAlt, 'g');

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const phase = phases?.[i] ?? null;
    const phaseLabel = phase ? (getPhaseLabel?.(phase) ?? '') : '';
    const lines = Array.isArray(snap?.eventLogs) ? snap.eventLogs : [];
    for (const line of lines) {
      if (isRaceSummaryRelatedLine(line)) continue;
      const matched = new Set();
      let m;
      namePattern.lastIndex = 0;
      while ((m = namePattern.exec(line)) !== null) {
        matched.add(m[0]);
        if (m.index === namePattern.lastIndex) namePattern.lastIndex++;
      }
      if (matched.size === 0) continue;
      matched.forEach(name => {
        const arr = eventsByName.get(name);
        if (arr) arr.push({ phaseLabel, text: line });
      });
    }
  }
  return eventsByName;
}

/** イベント1行のテキスト部分から、対象馬本人の馬名を強調表示用に整形する。 */
function formatHorseEventTextHtml(line, ownerName, horseMetaByName) {
  const fullHtml = formatLogLineHtml(line, horseMetaByName);
  return fullHtml;
}

/**
 * レースサマリー掲示板と同一ルールの着順ID列。
 * ゴール演出で記録した通過順を優先し、欠けがあれば simResults（到着順）で補完する。
 */
function buildSummaryPlacingOrderIds(finishOrderIds, simResults) {
  const orderedIds =
    Array.isArray(finishOrderIds) && finishOrderIds.length > 0
      ? [...finishOrderIds]
      : (simResults ?? []).map(h => h.id);
  const seen = new Set(orderedIds);
  if (Array.isArray(simResults)) {
    for (const r of simResults) {
      if (r && Number.isFinite(r.id) && !seen.has(r.id)) {
        orderedIds.push(r.id);
        seen.add(r.id);
      }
    }
  }
  return orderedIds;
}

function resolveGoalFinishedAtMap({ stored = null, recording = null } = {}) {
  const fromStored = deserializeGoalFinishedAtById(stored);
  if (fromStored.size > 0) return fromStored;
  if (Array.isArray(recording) && recording.length > 0) {
    return deriveGoalFinishedAtFromRecording(recording);
  }
  return new Map();
}

function refreshPlacingBoardWithFinishTimes({
  raceInfo,
  simResults,
  finishOrderIds,
  horseMetaByName,
  goalFinishedAtById = null,
  goalRecording = null,
  carrotsByHorse = {},
}) {
  if (!Array.isArray(simResults) || simResults.length === 0) return;
  const orderIds = buildSummaryPlacingOrderIds(finishOrderIds, simResults);
  const map =
    goalFinishedAtById instanceof Map && goalFinishedAtById.size > 0
      ? goalFinishedAtById
      : resolveGoalFinishedAtMap({ stored: goalFinishedAtById, recording: goalRecording });
  const { rows } = buildFinishTimeRows({
    raceInfo,
    simResults,
    finishOrderIds: orderIds,
    goalFinishedAtById: map,
  });
  renderPlacingPanelsWithFinishTimes({
    finishOrderIds: orderIds,
    simResults,
    horseMetaByName,
    finishRows: rows,
    carrotsByHorse,
  });
}

function renderRaceSummaryScreen({
  raceData,
  simResults,
  finishOrderIds,
  goalFinishedAtById = null,
  horseMetaByName,
  snapshots,
  phases,
  getPhaseLabel,
  carrotsByHorse = {},
}) {
  const screenEl = document.getElementById('race-summary-screen');
  if (!screenEl) return;

  const infoEl = document.getElementById('summary-race-info');
  if (infoEl) infoEl.innerHTML = formatRaceInfo(raceData);

  const placingsEl = document.getElementById('summary-placings');
  const eventsEl = document.getElementById('summary-horse-events');
  if (!placingsEl || !eventsEl) return;

  const resultsById = new Map();
  (simResults ?? []).forEach(h => {
    if (h && Number.isFinite(h.id)) resultsById.set(h.id, h);
  });

  const orderedIds = buildSummaryPlacingOrderIds(finishOrderIds, simResults);
  const { rows: finishRows } = buildFinishTimeRows({
    raceInfo: raceData?.race_info,
    simResults,
    finishOrderIds: orderedIds,
    goalFinishedAtById,
  });
  const finishRowById = new Map(finishRows.map(r => [r.id, r]));
  const sexAgeById = new Map(
    (raceData?.entries ?? []).map((entry, idx) => [idx, String(entry?.horse?.sex_age ?? '')]),
  );

  placingsEl.innerHTML = '';
  const placingItems = orderedIds.map((id, idx) => {
    const horse = resultsById.get(id);
    if (!horse) return null;
    const rank = idx + 1;
    const meta = horseMetaByName?.get(horse.name);
    const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
    const badgeHtml = meta && waku
      ? `<span class="summary-placing-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '<span class="summary-placing-badge" style="background:#1e3a5f;color:#fff;">-</span>';
    const sexAgeLabel = sexAgeById.get(id) || String(horse.sexAge ?? '');
    const sexAgeClass = sexAgeLabel.startsWith('牝')
      ? ' is-female'
      : sexAgeLabel.startsWith('牡')
        ? ' is-male'
        : '';
    const jockeyName = horse.jockeyName ? String(horse.jockeyName) : '—';
    const rankClass = rank === 1 ? ' is-top1' : rank === 2 ? ' is-top2' : rank === 3 ? ' is-top3' : '';
    const finishRow = finishRowById.get(id);
    const timeHtml = finishRow?.timeLabel
      ? `<span class="summary-placing-time">${escapeHtml(finishRow.timeLabel)}</span>`
      : '';
    const marginHtml = finishRow?.marginLabel
      ? `<span class="summary-placing-margin">${escapeHtml(finishRow.marginLabel)}</span>`
      : '';
    const div = document.createElement('div');
    div.className = `summary-placing-entry summary-placing-entry--with-times${rankClass}`;
    div.innerHTML = `
      <span class="summary-placing-rank">${rank}着</span>
      ${badgeHtml}
      <div class="summary-placing-line">
        ${horseNameCarrotGroupHtml(horse.name, carrotsByHorse[id] ?? 0, 'summary-placing-name')}
        <span class="summary-placing-meta">
          <span class="summary-placing-sex-age${sexAgeClass}">${escapeHtml(sexAgeLabel || '—')}</span>
          <span class="summary-placing-jockey">${escapeHtml(jockeyName)}</span>
        </span>
      </div>
      ${timeHtml}
      ${marginHtml}
    `;
    placingsEl.appendChild(div);
    return { id: horse.id, rank, horse };
  }).filter(Boolean);

  const horseNames = placingItems
    .map(item => item.horse.name)
    .filter(name => typeof name === 'string' && name.length > 0);
  const eventsByName = extractHorseEventsBySnapshots(snapshots, phases, horseNames, getPhaseLabel);

  eventsEl.innerHTML = '';
  placingItems.forEach(item => {
    const { rank, horse } = item;
    const block = document.createElement('div');
    const rankClass = rank === 1 ? ' is-top1' : rank <= 3 ? ' is-top3' : '';
    block.className = `summary-horse-block${rankClass}`;

    const meta = horseMetaByName?.get(horse.name);
    const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
    const badgeHtml = meta && waku
      ? `<span class="horse-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '';
    const head = document.createElement('div');
    head.className = 'summary-horse-head';
    head.innerHTML = `
      <span class="summary-horse-rank">${rank}着</span>
      ${badgeHtml}
      ${horseNameCarrotGroupHtml(horse.name, carrotsByHorse[horse.id] ?? 0, 'summary-horse-name')}
    `;
    block.appendChild(head);

    const list = document.createElement('div');
    list.className = 'summary-horse-events';
    const events = eventsByName.get(horse.name) ?? [];
    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'summary-horse-event-empty';
      empty.textContent = '目立ったイベントはありませんでした';
      list.appendChild(empty);
    } else {
      events.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'summary-horse-event';
        const phaseLabel = ev.phaseLabel ? `<span class="summary-event-phase">${escapeHtml(ev.phaseLabel)}</span>` : '';
        const bodyHtml = formatHorseEventTextHtml(ev.text, horse.name, horseMetaByName);
        row.innerHTML = `${phaseLabel}<span class="summary-event-body">${bodyHtml}</span>`;
        list.appendChild(row);
      });
    }
    block.appendChild(list);
    eventsEl.appendChild(block);
  });

  screenEl.hidden = false;
}

function hideRaceSummaryScreen() {
  const screenEl = document.getElementById('race-summary-screen');
  if (screenEl) screenEl.hidden = true;
}

// =====================
//  出馬表の初期描画（充実版）
// =====================
/** 残スタミナ表示: 実比率この％未満はバー0%、この％でバー100%（見せ方のスケール） */

function cloneRaceEntries(entries) {
  try {
    return structuredClone(entries);
  } catch {
    return JSON.parse(JSON.stringify(entries));
  }
}

function renderEntryList(horses, carrotsByHorse = {}) {
  const listEl = document.getElementById('entry-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  horses.forEach(horse => {
    const waku = JRA_WAKU_COLORS[horse.waku] ?? { bg: '#888', text: '#fff' };
    const staminaDisplayPct = getStaminaDisplayBarPct(horse);
    const staminaBarClass = getStaminaBarClassName(staminaDisplayPct);
    const weightLabel = Number.isFinite(horse.weight) ? `${horse.weight}kg` : '';
    const profileLabel = [horse.sexAge, weightLabel].filter(Boolean).join(' ');
    const sexClass = horse.sexAge?.startsWith('牝')
      ? 'is-female'
      : horse.sexAge?.startsWith('牡')
        ? 'is-male'
        : '';

    const row = document.createElement('div');
    row.className        = 'entry-row';
    row.dataset.horseId  = horse.id;
    // 左端に枠色の帯を border-left で表示
    row.style.borderLeft = `5px solid ${waku.bg}`;
    row.style.boxShadow  = `inset 3px 0 8px rgba(0,0,0,0.18)`;
    row.innerHTML = `
      <div class="entry-gate" style="background:${waku.bg};color:${waku.text};border:1px solid rgba(255,255,255,0.3);">${horse.gate}</div>
      <div class="entry-meta-line">
        ${horseNameCarrotGroupHtml(horse.name, carrotsByHorse[horse.id] ?? 0, 'entry-name')}
        <span class="entry-meta-tail">
          ${profileLabel ? `<span class="entry-demographics ${sexClass}">${escapeHtml(profileLabel)}</span>` : ''}
          <span class="entry-jockey-inline">🏇 ${escapeHtml(horse.jockeyName ?? '')}</span>
          <span class="entry-style-inline ${getEntryStyleBadgeClass(horse.style)}">${escapeHtml(horse.style)}</span>
        </span>
      </div>
      <div class="entry-params">
        <div class="param-row param-row--stamina">
          <div class="param-bar-bg"><div class="param-bar ${staminaBarClass}" style="width:${staminaDisplayPct}%"></div></div>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

const ENTRY_PANEL_MOBILE_MQ = '(max-width: 1024px)';

function initEntryPanelMobileCollapse() {
  const panel = document.getElementById('entry-panel');
  const toggle = document.getElementById('entry-panel-toggle');
  if (!panel || !toggle) return;

  const mq = window.matchMedia(ENTRY_PANEL_MOBILE_MQ);

  const syncForViewport = () => {
    if (!mq.matches) {
      panel.classList.remove('entry-panel--collapsed');
      toggle.setAttribute('aria-expanded', 'true');
      return;
    }
    toggle.setAttribute(
      'aria-expanded',
      panel.classList.contains('entry-panel--collapsed') ? 'false' : 'true',
    );
  };

  toggle.addEventListener('click', () => {
    if (!mq.matches) return;
    const collapsed = panel.classList.toggle('entry-panel--collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  mq.addEventListener('change', syncForViewport);
  syncForViewport();
}

/** 初期スタミナに対する実残量％（0〜100） */

const SIMULATOR_BOOT =
  typeof document !== 'undefined' &&
  Boolean(document.getElementById('field-canvas'));

// =====================
//  エントリーポイント
// =====================
if (SIMULATOR_BOOT) {
Promise.all([
  fetch('./src/data/race-info.json').then(res => res.json()),
  fetch('./src/data/race-entries.json').then(res => res.json()),
  fetch('./src/data/courses.json').then(res => res.json()),
])
  .then(([raceInfoData, raceEntriesData, courseCatalog]) => {
    if (raceInfoData?.race_id !== raceEntriesData?.race_id) {
      throw new Error(`race_id mismatch: race-info=${raceInfoData?.race_id} race-entries=${raceEntriesData?.race_id}`);
    }
    const raceData = {
      race_id: raceInfoData.race_id,
      race_info: raceInfoData.race_info,
      entries: cloneRaceEntries(raceEntriesData.entries),
    };
    const courseDef = resolveCourseDef(raceData, courseCatalog);
    if (!courseDef) {
      console.warn(
        '[jra-race-simulator] courses.json に一致するコースがありません。距離ベースの汎用フェーズで実行します。',
        raceData.race_info,
      );
    }
    const runtimeRaceData = { ...raceData, courseDef };
    /** オリジナル設定リセット用（JSON 初期の脚質など） */
    const baselineRaceEntries = cloneRaceEntries(raceData.entries);
    const phases        = buildPhases(runtimeRaceData.race_info.distance, courseDef);
    const track         = raceData.race_info.track;
    const condition     = raceData.race_info.condition;
    const renderer      = new Renderer('field-canvas', phases.length, track, condition, courseDef);

    /** ユーザー🥕評価（シミュレーション補正） */
    const carrotsByHorse = createDefaultCarrotsByHorse(runtimeRaceData.entries.length);
    /** ユーザー予想印 */
    const marksByHorse = createDefaultMarksByHorse(runtimeRaceData.entries.length);

    const savedBundle = loadRaceBundleFromSession();
    if (savedBundle?.race_id === runtimeRaceData.race_id) {
      Object.assign(
        marksByHorse,
        loadMarksByHorseFromBundle(savedBundle, runtimeRaceData.entries.length),
      );
      Object.assign(
        carrotsByHorse,
        loadCarrotsByHorseFromBundle(
          savedBundle,
          runtimeRaceData.entries.length,
          marksByHorse,
        ),
      );
    }

    const persistRaceBundle = () =>
      persistRaceBundleToSession(runtimeRaceData, carrotsByHorse, marksByHorse);

    /** オリジナル設定の編集ドラフト（確定前） */
    let preRaceDraft = null;
    /** オリジナル設定を開いた時点のスナップショット */
    let preRaceOpenSnapshot = null;

    function snapshotCommittedPreferences() {
      return clonePreferencesSnapshot(
        runtimeRaceData,
        carrotsByHorse,
        marksByHorse,
        cloneRaceEntries,
      );
    }

    function applyPreferencesSnapshot(snapshot) {
      runtimeRaceData.entries = cloneRaceEntries(snapshot.entries);
      Object.keys(carrotsByHorse).forEach(k => delete carrotsByHorse[k]);
      Object.assign(carrotsByHorse, snapshot.carrotsByHorse);
      Object.keys(marksByHorse).forEach(k => delete marksByHorse[k]);
      Object.assign(marksByHorse, snapshot.marksByHorse);
    }

    function bucketKeyForSnapshot(snapshot) {
      return computeBucketKey(
        { ...runtimeRaceData, entries: snapshot.entries },
        snapshot.carrotsByHorse,
      );
    }

    function beginPreRaceDraft() {
      preRaceOpenSnapshot = snapshotCommittedPreferences();
      preRaceDraft = clonePreferencesSnapshot(
        runtimeRaceData,
        carrotsByHorse,
        marksByHorse,
        cloneRaceEntries,
      );
      renderPreRaceEditor({ runtimeRaceData, draft: preRaceDraft });
    }

    function resetPreRaceDraftToBaseline() {
      if (!preRaceDraft) return;
      const fieldSize = baselineRaceEntries.length;
      preRaceDraft.entries = cloneRaceEntries(baselineRaceEntries);
      const defaultCarrots = createDefaultCarrotsByHorse(fieldSize);
      const defaultMarks = createDefaultMarksByHorse(fieldSize);
      for (let id = 0; id < fieldSize; id++) {
        preRaceDraft.carrotsByHorse[id] = defaultCarrots[id];
        preRaceDraft.marksByHorse[id] = defaultMarks[id];
      }
      renderPreRaceEditor({ runtimeRaceData, draft: preRaceDraft });
    }

    let initialHorses = [];
    let horseMetaByName = new Map();

    let controller = null;
    let simResults = null;
    let simLogs    = null;
    let simSnapshots = null;
    let lastFinishOrderIds = [];
    /** @type {Record<string, number>} */
    let lastGoalFinishedAtById = {};
    let hasAggregatedThisRun = false;
    let isReplayPlayback = false;
    /** @type {{ snapshots: object[], simResults: object[], finishOrderIds: number[], initialHorses?: object[], goalRecording?: object[], postGoalCourseFrame?: object } | null} */
    let replayBundle = null;
    let raceStartInitialHorses = null;
    /** レース開始ごとに変える RNG シード（race_id 固定だと毎回同一結果になる） */
    let simulationRunSeed = null;
    /** 全馬ゴール後・画面外へ抜けた直後のコース描画（集計画面からの復元用） */
    let postGoalCourseFrame = null;

    const btnPlayStep = document.getElementById('btn-play-step');
    const btnPlayAuto = document.getElementById('btn-play-auto');
    const btnPlayReplay = document.getElementById('btn-play-replay');
    const btnPlayReset = document.getElementById('btn-play-reset');
    const playbackDock = document.getElementById('field-playback-dock');
    const btnShowSummary = document.getElementById('btn-show-summary');
    const btnBackToSimulator = document.getElementById('btn-back-to-simulator');
    const btnBackToPreRace = document.getElementById('btn-back-to-pre-race');
    const raceInfoEl = document.getElementById('race-info');
    let autoAdvanceRafId = 0;
    let autoAdvanceActive = false;
    let currentRaceUsedAutoAdvance = false;
    /** @type {'play' | 'complete'} */
    let playbackDockMode = 'play';

    function stopAutoAdvanceLoop() {
      if (autoAdvanceRafId) {
        cancelAnimationFrame(autoAdvanceRafId);
        autoAdvanceRafId = 0;
      }
    }

    function isAutoDrivingRace() {
      return Boolean(controller && autoAdvanceActive);
    }

    function syncStepButtonLabel() {
      if (!btnPlayStep) return;
      if (!controller && playbackDockMode !== 'complete') {
        setPlaybackButton(btnPlayStep, 'play', 'スタート');
        btnPlayStep.setAttribute('aria-label', 'レースを開始');
      } else {
        setPlaybackButton(btnPlayStep, 'next', '次へ');
        btnPlayStep.setAttribute('aria-label', '次のフェーズへ');
      }
    }

    function syncAutoButtonLabel() {
      if (!btnPlayAuto) return;
      if (autoAdvanceActive) {
        setPlaybackButton(btnPlayAuto, 'pause', '停止');
        btnPlayAuto.classList.add('is-auto-active');
        btnPlayAuto.setAttribute('aria-label', 'オート再生を停止');
      } else {
        setPlaybackButton(btnPlayAuto, 'auto', 'オート');
        btnPlayAuto.classList.remove('is-auto-active');
        btnPlayAuto.setAttribute('aria-label', 'オート再生');
      }
    }

    function syncReplayButtonLabel() {
      setPlaybackButton(btnPlayReplay, 'replay', 'リプレイ');
    }

    function syncPlaybackDock() {
      if (!playbackDock) return;
      playbackDock.dataset.mode = playbackDockMode === 'complete' ? 'complete' : 'play';
      syncStepButtonLabel();
      syncAutoButtonLabel();
      syncReplayButtonLabel();
    }

    function saveReplayBundle(goalRecording = null) {
      if (!Array.isArray(simSnapshots) || simSnapshots.length === 0) return;
      if (!Array.isArray(simResults) || simResults.length === 0) return;
      try {
        const horsesSource = raceStartInitialHorses ?? initialHorses;
        const recording = Array.isArray(goalRecording)
          ? goalRecording
          : replayBundle?.goalRecording ?? null;
        const lastFrame = lastGoalRecordingFrame(recording);
        const postGoal = lastFrame
          ? JSON.parse(JSON.stringify(lastFrame))
          : replayBundle?.postGoalCourseFrame ?? postGoalCourseFrame ?? null;
        replayBundle = {
          snapshots: JSON.parse(JSON.stringify(simSnapshots)),
          simResults: JSON.parse(JSON.stringify(simResults)),
          finishOrderIds: Array.isArray(lastFinishOrderIds) ? [...lastFinishOrderIds] : [],
          goalFinishedAtById: { ...lastGoalFinishedAtById },
          initialHorses: Array.isArray(horsesSource)
            ? JSON.parse(JSON.stringify(horsesSource))
            : [],
          goalRecording: Array.isArray(recording)
            ? JSON.parse(JSON.stringify(recording))
            : null,
          postGoalCourseFrame: postGoal,
        };
        postGoalCourseFrame = replayBundle.postGoalCourseFrame ?? null;
      } catch {
        replayBundle = null;
      }
    }

    function syncSimulatorTrialSubtitle() {
      const el = document.getElementById('simulator-subtitle');
      if (!el) return;
      const trials = getAggregateTrialCount({ runtimeRaceData, carrotsByHorse });
      el.textContent = trials > 0 ? `シミュレーター（${trials}回実施済）` : 'シミュレーター';
    }

    function syncSimulatorChromeForAutoMode() {
      syncSimulatorTrialSubtitle();
      const btnOpenStats = document.getElementById('btn-open-stats');
      const inGoalScene = Boolean(controller?.goalSceneActive);
      const driving = isAutoDrivingRace();
      const raceComplete = playbackDockMode === 'complete';
      if (inGoalScene) {
        stopAutoAdvanceLoop();
        autoAdvanceActive = false;
        controller?.setAdvanceExternallyLocked(true);
        if (btnPlayStep) btnPlayStep.disabled = true;
        if (btnPlayAuto) btnPlayAuto.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = true;
        if (btnBackToPreRace && !btnBackToPreRace.hidden) btnBackToPreRace.disabled = true;
        syncPlaybackDock();
        return;
      }
      if (controller && driving) {
        controller.setAdvanceExternallyLocked(true);
        if (btnPlayStep) btnPlayStep.disabled = true;
        if (btnPlayAuto) btnPlayAuto.disabled = false;
        if (btnPlayReplay) btnPlayReplay.disabled = true;
        if (btnPlayReset) btnPlayReset.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = true;
        if (btnBackToPreRace && !btnBackToPreRace.hidden) btnBackToPreRace.disabled = true;
      } else if (controller) {
        controller.setAdvanceExternallyLocked(false);
        if (btnPlayStep) btnPlayStep.disabled = false;
        if (btnPlayAuto) btnPlayAuto.disabled = false;
        if (btnPlayReplay) btnPlayReplay.disabled = true;
        if (btnPlayReset) btnPlayReset.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
        controller._syncAdvanceButton();
      } else if (raceComplete) {
        if (btnPlayStep) btnPlayStep.disabled = true;
        if (btnPlayAuto) btnPlayAuto.disabled = true;
        if (btnPlayReplay) btnPlayReplay.disabled = !replayBundle;
        if (btnPlayReset) btnPlayReset.disabled = false;
        if (btnShowSummary) {
          btnShowSummary.disabled = !simResults || !simSnapshots;
        }
        if (btnOpenStats) btnOpenStats.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
      } else {
        if (btnPlayStep) btnPlayStep.disabled = false;
        if (btnPlayAuto) btnPlayAuto.disabled = false;
        if (btnPlayReplay) btnPlayReplay.disabled = true;
        if (btnPlayReset) btnPlayReset.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
      }
      syncPlaybackDock();
    }

    function scheduleAutoAdvanceLoop() {
      if (!controller || !autoAdvanceActive) return;
      stopAutoAdvanceLoop();
      const tick = () => {
        if (!controller || !autoAdvanceActive) {
          autoAdvanceRafId = 0;
          syncSimulatorChromeForAutoMode();
          return;
        }
        if (!controller.isAnimating) {
          controller.next(completeRaceAfterGoal);
        }
        autoAdvanceRafId = requestAnimationFrame(tick);
      };
      autoAdvanceRafId = requestAnimationFrame(tick);
    }

    function completeRaceAfterGoal() {
      stopAutoAdvanceLoop();
      const finishingController = controller;
      if (finishingController && Array.isArray(finishingController._goalRankOrder)) {
        lastFinishOrderIds = [...finishingController._goalRankOrder];
      }
      const recordedGoalPlayback = finishingController?.getGoalRecording?.() ?? null;
      if (finishingController?.getGoalFinishedAtById) {
        lastGoalFinishedAtById = serializeGoalFinishedAtById(
          finishingController.getGoalFinishedAtById(),
        );
      } else if (Array.isArray(recordedGoalPlayback) && recordedGoalPlayback.length > 0) {
        lastGoalFinishedAtById = serializeGoalFinishedAtById(
          deriveGoalFinishedAtFromRecording(recordedGoalPlayback),
        );
      }
      refreshPlacingBoardWithFinishTimes({
        raceInfo: runtimeRaceData.race_info,
        simResults,
        finishOrderIds: lastFinishOrderIds,
        horseMetaByName,
        goalFinishedAtById: lastGoalFinishedAtById,
        goalRecording: recordedGoalPlayback,
        carrotsByHorse,
      });
      setTimeout(() => {
        const shouldAggregate =
          Array.isArray(simResults) &&
          simResults.length &&
          !hasAggregatedThisRun &&
          !isReplayPlayback;
        if (shouldAggregate) {
          const orderIds = buildSummaryPlacingOrderIds(lastFinishOrderIds, simResults);
          addAggregateRun({
            runtimeRaceData,
            carrotsByHorse,
            source: currentRaceUsedAutoAdvance ? 'auto' : 'manual',
            orderIds,
          });
          hasAggregatedThisRun = true;
        }
        if (!isReplayPlayback) {
          saveReplayBundle(recordedGoalPlayback);
        }
        isReplayPlayback = false;
        playbackDockMode = 'complete';
        controller = null;
        autoAdvanceActive = false;
        currentRaceUsedAutoAdvance = false;
        syncSimulatorChromeForAutoMode();
        persistSimulatorStateToSession();
      }, 300);
    }

    function rollSimulationSeed() {
      const raceId = Number(runtimeRaceData.race_id) || 0;
      const t = Date.now() >>> 0;
      const r = (Math.random() * 0x100000000) >>> 0;
      simulationRunSeed = (raceId ^ t ^ (r * 2246822519)) >>> 0;
      if (simulationRunSeed === 0) simulationRunSeed = 1;
      return simulationRunSeed;
    }

    const currentOptions = () => ({
      reproducible: Boolean(simulationRunSeed),
      seed: simulationRunSeed ?? runtimeRaceData.race_id,
    });

    const refreshRaceInfo = () => {
      if (raceInfoEl) raceInfoEl.innerHTML = formatRaceInfo(runtimeRaceData);
    };

    function rebuildHorseMetaByName(horses = initialHorses) {
      horseMetaByName = new Map();
      runtimeRaceData.entries.forEach((entry, idx) => {
        const horse = horses[idx] ?? initialHorses[idx];
        if (!horse) return;
        horse.jockeyName = entry.jockey.name;
        horseMetaByName.set(horse.name, {
          gate: horse.gate,
          waku: horse.waku,
        });
      });
    }

    function applyComputedHorsesToUi() {
      initialHorses = calcHorsesWithCarrots(runtimeRaceData, carrotsByHorse);
      rebuildHorseMetaByName(initialHorses);
      renderEntryList(initialHorses, carrotsByHorse);
      updateEntryStaminaBars(initialHorses);
      renderer.resetHorseRenderState();
      renderer.draw(initialHorses, phases[0], 0);
      refreshRaceInfo();
      persistRaceBundle();
    }

    /** 集計画面から戻ったときなど、保存済みのレース結果表示を復元する */
    function applyRestoredRaceVisuals() {
      if (!Array.isArray(simSnapshots) || simSnapshots.length === 0) {
        applyComputedHorsesToUi();
        return;
      }
      const lastIdx = simSnapshots.length - 1;
      const lastSnap = simSnapshots[lastIdx];
      const phase = phases[lastIdx];
      const finalHorses = Array.isArray(lastSnap?.horses)
        ? lastSnap.horses.map(h => ({ ...h }))
        : null;
      if (!finalHorses?.length) {
        applyComputedHorsesToUi();
        return;
      }

      if (Array.isArray(replayBundle?.initialHorses) && replayBundle.initialHorses.length > 0) {
        initialHorses = replayBundle.initialHorses.map(h => ({ ...h }));
      } else {
        initialHorses = calcHorsesWithCarrots(runtimeRaceData, carrotsByHorse);
      }
      rebuildHorseMetaByName(finalHorses);
      finalHorses.forEach(horse => {
        const entry = runtimeRaceData.entries.find((_, i) => i === horse.id);
        if (entry) horse.jockeyName = entry.jockey.name;
      });
      renderEntryList(finalHorses, carrotsByHorse);
      updateEntryStaminaBars(finalHorses);
      renderer.resetHorseRenderState();

      const courseFrame =
        playbackDockMode === 'complete'
          ? (postGoalCourseFrame ??
            replayBundle?.postGoalCourseFrame ??
            lastGoalRecordingFrame(
              replayBundle?.goalRecording ?? loadGoalRecordingFromSession(),
            ))
          : null;

      const drawRestoredCourse = () => {
        if (courseFrame && drawGoalCourseFrame(renderer, courseFrame, phase)) {
          return;
        }
        renderer.draw(finalHorses, phase, 1);
      };

      drawRestoredCourse();
      refreshRaceInfo();
      // iOS Safari ではレイアウト確定前の draw が待機画面に戻って見えることがある
      if (window.matchMedia('(max-width: 1024px)').matches) {
        requestAnimationFrame(() => requestAnimationFrame(drawRestoredCourse));
      }
    }

    function resetSimulatorToIdle() {
      stopAutoAdvanceLoop();
      autoAdvanceActive = false;
      currentRaceUsedAutoAdvance = false;
      isReplayPlayback = false;
      playbackDockMode = 'play';
      hasAggregatedThisRun = false;
      replayBundle = null;
      raceStartInitialHorses = null;
      simulationRunSeed = null;
      postGoalCourseFrame = null;
      if (btnShowSummary) btnShowSummary.disabled = true;
      document.getElementById('phase-indicator').textContent = 'スタート';
      document.getElementById('log-panel').innerHTML =
        '<div class="log-entry" style="color:#334;">待機中...</div>';
      syncPlacingPanelsHtml('');

      renderer.resetHorseRenderState();
      renderer.draw(initialHorses, phases[0], 0);
      updateEntryStaminaBars(initialHorses);
      controller = null;
      simResults = null;
      simLogs = null;
      simSnapshots = null;
      lastFinishOrderIds = [];
      lastGoalFinishedAtById = {};
      hideRaceSummaryScreen();
      try {
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_STATE);
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_GOAL_RECORDING);
        sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
      } catch {
        /* ignore */
      }
      syncSimulatorChromeForAutoMode();
    }

    function loadGoalRecordingFromSession() {
      if (typeof sessionStorage === 'undefined') return null;
      try {
        const raw = sessionStorage.getItem(SESSION_KEY_SIMULATOR_GOAL_RECORDING);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
      } catch {
        return null;
      }
    }

    function rebuildReplayBundleFromSessionParts(parsed, goalRecordingOverride = undefined) {
      if (!Array.isArray(parsed?.snapshots) || !Array.isArray(parsed?.simResults)) return;
      const finishIds = Array.isArray(parsed.finishOrderIds) ? [...parsed.finishOrderIds] : [];
      const legacy = parsed.replayBundle;
      const meta = parsed.replayMeta ?? {};
      let goalRecording = goalRecordingOverride;
      if (goalRecording === undefined) {
        if (Array.isArray(legacy?.goalRecording) && legacy.goalRecording.length > 0) {
          goalRecording = legacy.goalRecording;
        } else {
          goalRecording = loadGoalRecordingFromSession();
        }
      }
      const initialHorsesSource =
        (Array.isArray(meta.initialHorses) && meta.initialHorses.length > 0)
          ? meta.initialHorses
          : (Array.isArray(legacy?.initialHorses) && legacy.initialHorses.length > 0)
            ? legacy.initialHorses
            : [];
      const explicitPostGoal = parsed.postGoalCourseFrame ?? legacy?.postGoalCourseFrame ?? null;
      const resolvedPostGoal =
        explicitPostGoal ?? lastGoalRecordingFrame(goalRecording) ?? null;
      replayBundle = {
        snapshots: JSON.parse(JSON.stringify(parsed.snapshots)),
        simResults: JSON.parse(JSON.stringify(parsed.simResults)),
        finishOrderIds: Array.isArray(legacy?.finishOrderIds) && legacy.finishOrderIds.length
          ? [...legacy.finishOrderIds]
          : finishIds,
        goalFinishedAtById:
          parsed.goalFinishedAtById ??
          legacy?.goalFinishedAtById ??
          {},
        initialHorses: initialHorsesSource.length
          ? JSON.parse(JSON.stringify(initialHorsesSource))
          : [],
        goalRecording: Array.isArray(goalRecording)
          ? JSON.parse(JSON.stringify(goalRecording))
          : null,
        postGoalCourseFrame: resolvedPostGoal
          ? JSON.parse(JSON.stringify(resolvedPostGoal))
          : null,
      };
      postGoalCourseFrame = replayBundle.postGoalCourseFrame ?? null;
    }

    function persistSimulatorStateToSession() {
      if (typeof sessionStorage === 'undefined') return false;
      if (!Array.isArray(simResults) || simResults.length === 0) return false;
      if (!Array.isArray(simSnapshots) || simSnapshots.length === 0) return false;

      const goalRecording = replayBundle?.goalRecording ?? null;
      const postGoal =
        postGoalCourseFrame ??
        replayBundle?.postGoalCourseFrame ??
        lastGoalRecordingFrame(goalRecording);
      const payload = {
        simResults,
        simLogs,
        snapshots: simSnapshots,
        finishOrderIds: Array.isArray(lastFinishOrderIds) ? [...lastFinishOrderIds] : [],
        goalFinishedAtById: { ...lastGoalFinishedAtById },
        postGoalCourseFrame: postGoal ? JSON.parse(JSON.stringify(postGoal)) : null,
        replayMeta: {
          simulationRunSeed: simulationRunSeed ?? null,
          initialHorses: Array.isArray(replayBundle?.initialHorses)
            ? JSON.parse(JSON.stringify(replayBundle.initialHorses))
            : (raceStartInitialHorses
              ? JSON.parse(JSON.stringify(raceStartInitialHorses))
              : []),
          finishOrderIds: Array.isArray(replayBundle?.finishOrderIds)
            ? [...replayBundle.finishOrderIds]
            : [],
        },
        ui: {
          phaseText: document.getElementById('phase-indicator')?.textContent ?? 'スタート',
          logHtml: document.getElementById('log-panel')?.innerHTML ?? '',
          placingHtml: document.getElementById('placing-panel')?.innerHTML ?? '',
          playbackDockMode: playbackDockMode === 'complete' ? 'complete' : 'play',
          btnShowSummaryDisabled: Boolean(btnShowSummary?.disabled),
        },
      };

      const tryWrite = (key, value) => {
        sessionStorage.setItem(key, value);
      };

      try {
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_GOAL_RECORDING);
      } catch {
        /* ignore */
      }

      const slimPayload = {
        ...payload,
        simLogs: null,
      };

      const writeAttempts = [
        () => tryWrite(SESSION_KEY_SIMULATOR_STATE, JSON.stringify(payload)),
        () => tryWrite(SESSION_KEY_SIMULATOR_STATE, JSON.stringify(slimPayload)),
      ];

      let coreSaved = false;
      for (const attempt of writeAttempts) {
        try {
          attempt();
          coreSaved = true;
          break;
        } catch {
          /* QuotaExceededError 等（モバイル Safari で起きやすい） */
        }
      }

      if (!coreSaved) return false;

      if (Array.isArray(goalRecording) && goalRecording.length > 0) {
        const fullJson = JSON.stringify(goalRecording);
        const thinned = goalRecording.filter((_, i) => i % 2 === 0);
        const thinnedJson = JSON.stringify(thinned);
        const goalAttempts = [fullJson, thinnedJson];
        for (const json of goalAttempts) {
          try {
            tryWrite(SESSION_KEY_SIMULATOR_GOAL_RECORDING, json);
            break;
          } catch {
            /* ignore */
          }
        }
      }

      return true;
    }

    function createPhaseControllerFromSnapshots(snapshotSource, resultsSource, replayOpts = {}) {
      const horsesForPlayback = Array.isArray(replayOpts.initialHorses)
        ? replayOpts.initialHorses
        : initialHorses;
      return new PhaseController(
        snapshotSource,
        phases,
        renderer,
        horsesForPlayback,
        horseMetaByName,
        resultsSource,
        {
          onGoalSceneStart: () => {
            stopAutoAdvanceLoop();
            autoAdvanceActive = false;
            syncSimulatorChromeForAutoMode();
          },
          isReplayPlayback: Boolean(replayOpts.isReplayPlayback),
          recordGoalPlayback: Boolean(replayOpts.recordGoalPlayback),
          goalRecording: replayOpts.goalRecording ?? null,
          raceId: runtimeRaceData.race_id,
          raceInfo: runtimeRaceData.race_info,
          carrotsByHorse,
        },
      );
    }

    function startNewRaceSimulation() {
      isReplayPlayback = false;
      rollSimulationSeed();
      try {
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_STATE);
        sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
      } catch {
        /* ignore */
      }
      if (btnShowSummary) btnShowSummary.disabled = true;
      const logPanel = document.getElementById('log-panel');
      if (logPanel) logPanel.innerHTML = '';
      syncPlacingPanelsHtml('');

      refreshRaceInfo();
      const sim = runSimulation(runtimeRaceData, currentOptions(), carrotsByHorse, renderer);
      simResults = sim.results;
      simLogs = sim.logs;
      simSnapshots = sim.snapshots;
      lastFinishOrderIds = [];
      lastGoalFinishedAtById = {};
      hasAggregatedThisRun = false;

      simResults.forEach(horse => {
        const entry = runtimeRaceData.entries.find((_, i) => i === horse.id);
        if (entry) horse.jockeyName = entry.jockey.name;
      });

      raceStartInitialHorses = JSON.parse(JSON.stringify(initialHorses));
      controller = createPhaseControllerFromSnapshots(simSnapshots, simResults, {
        recordGoalPlayback: true,
      });
      controller.start();
      playbackDockMode = 'play';
      syncSimulatorChromeForAutoMode();
      scrollAfterRaceStartOnNarrowLayout();
      return true;
    }

    function startReplay() {
      if (!replayBundle?.snapshots?.length || !replayBundle?.simResults?.length) return;
      isReplayPlayback = true;
      stopAutoAdvanceLoop();
      playbackDockMode = 'play';
      document.getElementById('log-panel').innerHTML = '';
      syncPlacingPanelsHtml('');
      document.getElementById('phase-indicator').textContent = 'スタート';

      let replaySnapshots;
      let replayResults;
      try {
        replaySnapshots = JSON.parse(JSON.stringify(replayBundle.snapshots));
        replayResults = JSON.parse(JSON.stringify(replayBundle.simResults));
      } catch {
        isReplayPlayback = false;
        playbackDockMode = 'complete';
        syncSimulatorChromeForAutoMode();
        return;
      }

      simSnapshots = replaySnapshots;
      simResults = replayResults;
      lastFinishOrderIds = Array.isArray(replayBundle.finishOrderIds)
        ? [...replayBundle.finishOrderIds]
        : [];
      lastGoalFinishedAtById =
        replayBundle.goalFinishedAtById && typeof replayBundle.goalFinishedAtById === 'object'
          ? { ...replayBundle.goalFinishedAtById }
          : {};

      replayResults.forEach(horse => {
        const entry = runtimeRaceData.entries.find((_, i) => i === horse.id);
        if (entry) horse.jockeyName = entry.jockey.name;
      });

      renderer.resetHorseRenderState();
      const replayInitialHorses = Array.isArray(replayBundle.initialHorses) &&
        replayBundle.initialHorses.length > 0
        ? replayBundle.initialHorses
        : initialHorses;
      controller = createPhaseControllerFromSnapshots(replaySnapshots, replayResults, {
        isReplayPlayback: true,
        goalRecording: Array.isArray(replayBundle.goalRecording) ? replayBundle.goalRecording : null,
        initialHorses: replayInitialHorses,
      });
      controller.start();
      autoAdvanceActive = true;
      syncSimulatorChromeForAutoMode();
      scheduleAutoAdvanceLoop();
      syncAutoButtonLabel();
    }

    /** 狭い画面でレース開始直後にコースが十分見えるようスクロール */
    function scrollAfterRaceStartOnNarrowLayout() {
      if (!window.matchMedia('(max-width: 1024px)').matches) return;
      const fieldViewport = document.getElementById('field-viewport');
      if (!fieldViewport) return;

      const getViewportBottomPx = () => {
        const vv = window.visualViewport;
        if (vv != null) return vv.offsetTop + vv.height;
        return window.innerHeight;
      };

      const applyScroll = () => {
        void fieldViewport.offsetHeight;
        const scrollRoot = document.scrollingElement ?? document.documentElement;
        const y0 = scrollRoot.scrollTop;
        const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
        const Vbottom = getViewportBottomPx();
        const f = fieldViewport.getBoundingClientRect();
        const enterLine = Math.min(Vbottom * 0.42, Vbottom - 80);
        const deltaRaceMin = Math.max(0, Math.ceil(f.top - enterLine));
        const deltaAlignBottom = Math.ceil(f.bottom - Vbottom + 10);
        const delta = Math.max(deltaRaceMin, deltaAlignBottom);
        const nextTop = Math.min(Math.max(0, y0 + delta), maxTop);
        scrollRoot.scrollTo({ top: nextTop, behavior: 'auto' });
      };

      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(applyScroll)),
      );
    }

    let raceControlsBound = false;
    function bindRaceControlsOnce() {
      if (raceControlsBound) return;
      raceControlsBound = true;

      btnPlayStep?.addEventListener('click', () => {
        if (playbackDockMode === 'complete' || btnPlayStep?.disabled || controller?.goalSceneActive) return;
        if (!controller) {
          startNewRaceSimulation();
          return;
        }
        controller.next(completeRaceAfterGoal);
      });

      btnPlayAuto?.addEventListener('click', () => {
        if (playbackDockMode === 'complete' || btnPlayAuto?.disabled || controller?.goalSceneActive) return;
        if (autoAdvanceActive) {
          stopAutoAdvanceLoop();
          autoAdvanceActive = false;
          syncSimulatorChromeForAutoMode();
          return;
        }
        if (!controller) {
          startNewRaceSimulation();
        }
        autoAdvanceActive = true;
        currentRaceUsedAutoAdvance = true;
        syncSimulatorChromeForAutoMode();
        scheduleAutoAdvanceLoop();
      });

      btnPlayReplay?.addEventListener('click', () => {
        if (btnPlayReplay?.disabled) return;
        if (playbackDockMode !== 'complete') return;
        startReplay();
      });

      btnPlayReset?.addEventListener('click', () => {
        if (btnPlayReset?.disabled) return;
        resetSimulatorToIdle();
      });

      btnShowSummary?.addEventListener('click', () => {
        if (!simResults || !simSnapshots) return;
        renderRaceSummaryScreen({
          raceData: runtimeRaceData,
          simResults,
          finishOrderIds: lastFinishOrderIds,
          goalFinishedAtById: resolveGoalFinishedAtMap({
            stored: lastGoalFinishedAtById,
            recording: replayBundle?.goalRecording ?? null,
          }),
          horseMetaByName,
          snapshots: simSnapshots,
          phases,
          getPhaseLabel: (phase) => renderer.getPhaseName(phase),
          carrotsByHorse,
        });
      });

      btnBackToSimulator?.addEventListener('click', () => {
        hideRaceSummaryScreen();
      });

      const saveStatsReturnScreen = (screen) => {
        try {
          sessionStorage.setItem(SESSION_KEY_STATS_RETURN_SCREEN, screen);
        } catch {
          /* ignore */
        }
      };

      const saveSummaryStateForReturn = () => {
        if (!simResults || !simSnapshots) return;
        const payload = {
          simResults,
          finishOrderIds: Array.isArray(lastFinishOrderIds) ? [...lastFinishOrderIds] : [],
          goalFinishedAtById: { ...lastGoalFinishedAtById },
          snapshots: simSnapshots,
        };
        try {
          sessionStorage.setItem(SESSION_KEY_SUMMARY_STATE, JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      };

      const saveSimulatorStateForReturn = () => {
        if (!Array.isArray(simResults) || simResults.length === 0 || controller) return;
        persistSimulatorStateToSession();
      };

      const openStatsPage = (returnScreen = 'simulator') => {
        saveStatsReturnScreen(returnScreen);
        saveSimulatorStateForReturn();
        if (returnScreen === 'summary') {
          saveSummaryStateForReturn();
        } else {
          try {
            sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
          } catch {
            /* ignore */
          }
        }
        persistRaceBundle();
        window.location.assign('stats.html');
      };
      document.getElementById('btn-open-stats')?.addEventListener('click', () => openStatsPage('simulator'));
      document.getElementById('btn-open-stats-summary')?.addEventListener('click', () => openStatsPage('summary'));

      btnBackToPreRace?.addEventListener('click', () => {
        hideRaceSummaryScreen();
        openPreRaceScreen();
      });
    }

    async function handlePreRaceCloseAttempt() {
      if (!preRaceDraft || !preRaceOpenSnapshot) return true;
      if (preferencesSnapshotsEqual(preRaceOpenSnapshot, preRaceDraft)) {
        preRaceDraft = null;
        preRaceOpenSnapshot = null;
        return true;
      }

      const agg = loadAggregateState();
      const newKey = bucketKeyForSnapshot(preRaceDraft);
      const wouldResetAggregate =
        agg.runs.length > 0 && Boolean(agg.bucketKey) && agg.bucketKey !== newKey;

      const message = wouldResetAggregate
        ? 'オリジナル設定が変更されました。これまでの集計がリセットされますがよろしいですか？'
        : 'オリジナル設定を反映しますか？';
      const labels = wouldResetAggregate
        ? { okLabel: 'はい', cancelLabel: 'いいえ' }
        : { okLabel: '反映する', cancelLabel: '変更を破棄' };

      const choice = await showPreRaceConfirm(message, labels);
      if (choice === 'stay') return false;
      if (choice === 'discard') {
        preRaceDraft = null;
        preRaceOpenSnapshot = null;
        return true;
      }

      applyPreferencesSnapshot(preRaceDraft);
      if (wouldResetAggregate) clearAggregateState();
      persistRaceBundle();
      if (simulatorInitialized) applyComputedHorsesToUi();
      preRaceDraft = null;
      preRaceOpenSnapshot = null;
      return true;
    }

    function closePreferencesScreen() {
      closeActiveInfoPopover();
      const preRaceEl = document.getElementById('pre-race-editor');
      if (preRaceEl) preRaceEl.hidden = true;
      if (btnBackToPreRace) btnBackToPreRace.hidden = false;
      syncSimulatorChromeForAutoMode();
    }

    const openScreen =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(SESSION_KEY_OPEN_SCREEN)
        : '';
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY_OPEN_SIMULATOR);
      sessionStorage.removeItem(SESSION_KEY_OPEN_SCREEN);
    }

    const openPreRaceScreen = ({ reset = false } = {}) => {
      if (reset) resetSimulatorToIdle();
      hideRaceSummaryScreen();
      const preRaceEl = document.getElementById('pre-race-editor');
      if (preRaceEl) preRaceEl.hidden = false;
      if (btnBackToPreRace) btnBackToPreRace.hidden = true;
      beginPreRaceDraft();
      schedulePreRaceTableFit();
    };

    let simulatorInitialized = false;

    function ensureSimulatorInitialized() {
      if (simulatorInitialized) return;
      simulatorInitialized = true;
      const restored = restoreSimulatorStateFromSession();
      if (restored) {
        applyRestoredRaceVisuals();
      } else {
        applyComputedHorsesToUi();
      }
      syncSimulatorChromeForAutoMode();
    }

    const openSimulatorHome = () => {
      closePreferencesScreen();
      ensureSimulatorInitialized();
    };

    const tryRestoreSummaryScreen = () => {
      if (openScreen !== 'summary' || !simResults || !simSnapshots) return false;
      renderRaceSummaryScreen({
        raceData: runtimeRaceData,
        simResults,
        finishOrderIds: lastFinishOrderIds,
        goalFinishedAtById: resolveGoalFinishedAtMap({
          stored: lastGoalFinishedAtById,
          recording: replayBundle?.goalRecording ?? loadGoalRecordingFromSession(),
        }),
        horseMetaByName,
        snapshots: simSnapshots,
        phases,
        getPhaseLabel: (phase) => renderer.getPhaseName(phase),
        carrotsByHorse,
      });
      return true;
    };

    const restoreSimulatorStateFromSession = () => {
      if (typeof sessionStorage === 'undefined') return false;
      const raw = sessionStorage.getItem(SESSION_KEY_SIMULATOR_STATE);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.simResults) || !Array.isArray(parsed?.snapshots)) return false;
        simResults = parsed.simResults;
        simLogs = Array.isArray(parsed.simLogs) ? parsed.simLogs : null;
        simSnapshots = parsed.snapshots;
        lastFinishOrderIds = Array.isArray(parsed.finishOrderIds) ? parsed.finishOrderIds : [];
        lastGoalFinishedAtById =
          parsed.goalFinishedAtById && typeof parsed.goalFinishedAtById === 'object'
            ? { ...parsed.goalFinishedAtById }
            : {};
        postGoalCourseFrame = parsed.postGoalCourseFrame ?? null;
        rebuildReplayBundleFromSessionParts(parsed);
        const ui = parsed.ui ?? {};
        document.getElementById('phase-indicator').textContent = ui.phaseText ?? 'ゴール';
        if (typeof ui.logHtml === 'string') {
          document.getElementById('log-panel').innerHTML = ui.logHtml;
        }
        if (lastFinishOrderIds.length > 0) {
          refreshPlacingBoardWithFinishTimes({
            raceInfo: runtimeRaceData.race_info,
            simResults,
            finishOrderIds: lastFinishOrderIds,
            horseMetaByName,
            goalFinishedAtById: lastGoalFinishedAtById,
            goalRecording: replayBundle?.goalRecording ?? loadGoalRecordingFromSession(),
            carrotsByHorse,
          });
        } else if (typeof ui.placingHtml === 'string') {
          syncPlacingPanelsHtml(ui.placingHtml);
        }
        playbackDockMode =
          ui.playbackDockMode === 'complete' || ui.btnRunDisabled === true
            ? 'complete'
            : 'play';
        hasAggregatedThisRun = true;
        if (playbackDockMode === 'complete') {
          saveReplayBundle(replayBundle?.goalRecording ?? null);
        }
        if (btnShowSummary) {
          btnShowSummary.disabled =
            ui.btnShowSummaryDisabled !== undefined ? Boolean(ui.btnShowSummaryDisabled) : false;
        }
        return true;
      } catch {
        return false;
      }
    };

    bindRaceControlsOnce();
    initEntryPanelMobileCollapse();

    if (openScreen === 'pre-race') {
      openPreRaceScreen({ reset: true });
    } else if (openScreen === 'summary') {
      openSimulatorHome();
      let restored = false;
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem(SESSION_KEY_SUMMARY_STATE);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.simResults) && Array.isArray(parsed?.snapshots)) {
              simResults = parsed.simResults;
              simSnapshots = parsed.snapshots;
              lastFinishOrderIds = Array.isArray(parsed.finishOrderIds) ? parsed.finishOrderIds : [];
              lastGoalFinishedAtById =
                parsed.goalFinishedAtById && typeof parsed.goalFinishedAtById === 'object'
                  ? { ...parsed.goalFinishedAtById }
                  : {};
              restored = tryRestoreSummaryScreen();
            }
          } catch {
            /* ignore parse error */
          }
        }
        sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
      }
      if (!restored && Array.isArray(simResults) && Array.isArray(simSnapshots)) {
        restored = tryRestoreSummaryScreen();
      }
    } else {
      openSimulatorHome();
    }

    mountPreRaceEditor({
      runtimeRaceData,
      getDraft: () => preRaceDraft,
      onCloseAttempt: handlePreRaceCloseAttempt,
      onClose: () => {
        closePreferencesScreen();
        ensureSimulatorInitialized();
      },
      onReset: resetPreRaceDraftToBaseline,
    });

    // iOS の bfcache 復帰時も完了画面の描画を維持
    window.addEventListener('pageshow', (ev) => {
      if (!ev.persisted) return;
      if (playbackDockMode !== 'complete' || !Array.isArray(simSnapshots) || !simSnapshots.length) {
        return;
      }
      applyRestoredRaceVisuals();
      syncSimulatorChromeForAutoMode();
    });

  })
  .catch(err => {
    console.error('JSONの読み込みに失敗しました:', err);
  });
}

export { runSimulation, resolveCourseDef, formatRaceInfo };
