/**
 * モンテカルロ／手動シミュレーションの集計（sessionStorage、タブを閉じると消える）
 */

import { serializeCarrotsByHorse, serializeMarksByHorse } from '../engine/rating-adjustments.js';

export const STORAGE_KEY_AGGREGATE = 'jra-sim-aggregate-v1';
export const STORAGE_KEY_BUNDLE = 'jra-sim-bundle-v1';
/** 集計画面から戻るとき、プレレースではなくシミュレータ本体を開く */
export const SESSION_KEY_OPEN_SIMULATOR = 'jra-open-simulator';
/** 集計画面へ遷移する前に、どの画面にいたかを保存 */
export const SESSION_KEY_STATS_RETURN_SCREEN = 'jra-stats-return-screen';
/** 集計画面から戻るときに index 側で開く画面 */
export const SESSION_KEY_OPEN_SCREEN = 'jra-open-screen';
/** 集計→戻るでサマリー復元するための最小状態 */
export const SESSION_KEY_SUMMARY_STATE = 'jra-summary-state';
/** 集計→戻るでシミュレーター結果（ログ/掲示板/完了状態）を復元 */
export const SESSION_KEY_SIMULATOR_STATE = 'jra-simulator-state';
/** ゴール演出フレーム（本体 state とは別キーで保存し、モバイルの容量制限を回避） */
export const SESSION_KEY_SIMULATOR_GOAL_RECORDING = 'jra-simulator-goal-recording';

/** FNV-1a 風の軽量ハッシュ（同期・短いキー用） */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

/**
 * race_id + レースJSON相当（出馬・条件・🥕）のバケットキー（予想印は含めない）
 */
export function computeBucketKey(raceData, carrotsByHorse) {
  const payload = {
    race_id: raceData.race_id,
    race_info: raceData.race_info,
    entries: raceData.entries,
    carrotsByHorse: carrotsByHorse ?? {},
  };
  return `${raceData.race_id}:${hashString(JSON.stringify(payload))}`;
}

/**
 * @param {Record<number, string>|Record<string, string>} marksByHorse
 */
export function buildRaceBundlePayload(runtimeRaceData, carrotsByHorse, marksByHorse = {}) {
  const fieldSize = runtimeRaceData.entries?.length ?? 0;
  return {
    race_id: runtimeRaceData.race_id,
    race_info: runtimeRaceData.race_info,
    entries: runtimeRaceData.entries,
    carrotsByHorse: serializeCarrotsByHorse(carrotsByHorse, fieldSize),
    marksByHorse: serializeMarksByHorse(marksByHorse, fieldSize),
  };
}

export function persistRaceBundleToSession(runtimeRaceData, carrotsByHorse, marksByHorse = {}) {
  const payload = buildRaceBundlePayload(runtimeRaceData, carrotsByHorse, marksByHorse);
  sessionStorage.setItem(STORAGE_KEY_BUNDLE, JSON.stringify(payload));
}

export function loadRaceBundleFromSession() {
  const raw = sessionStorage.getItem(STORAGE_KEY_BUNDLE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadAggregateState() {
  const raw = sessionStorage.getItem(STORAGE_KEY_AGGREGATE);
  if (!raw) {
    return { bucketKey: '', runs: [] };
  }
  try {
    const o = JSON.parse(raw);
    return {
      bucketKey: o.bucketKey ?? '',
      runs: Array.isArray(o.runs) ? o.runs : [],
    };
  } catch {
    return { bucketKey: '', runs: [] };
  }
}

export function saveAggregateState(state) {
  sessionStorage.setItem(
    STORAGE_KEY_AGGREGATE,
    JSON.stringify({ bucketKey: state.bucketKey, runs: state.runs }),
  );
}

export function clearAggregateState() {
  sessionStorage.removeItem(STORAGE_KEY_AGGREGATE);
}

/**
 * @param {{ runtimeRaceData: object, carrotsByHorse: object, source: 'batch'|'manual'|'auto', orderIds: number[] }} p
 */
export function addAggregateRun(p) {
  const { runtimeRaceData, carrotsByHorse, source, orderIds } = p;
  const bucketKey = computeBucketKey(runtimeRaceData, carrotsByHorse);
  let state = loadAggregateState();
  if (!state.runs) state.runs = [];
  if (!state.bucketKey || state.bucketKey !== bucketKey) {
    state = { bucketKey, runs: [] };
  }
  state.runs.push({ source, order: [...orderIds] });
  saveAggregateState(state);
}

export function runCountsBySource(state) {
  let batch = 0;
  let manual = 0;
  let auto = 0;
  for (const r of state.runs) {
    if (r.source === 'batch') batch += 1;
    else if (r.source === 'manual') manual += 1;
    else if (r.source === 'auto') auto += 1;
  }
  return { batch, manual, auto, total: state.runs.length };
}

/** 集計対象は手動・自動（ゴール演出順）のみ。過去の一括試行は表示から除外する。 */
function manualRunsOnly(runs) {
  return runs.filter(r => r.source === 'manual' || r.source === 'auto');
}

/**
 * @param {{ runtimeRaceData: object, carrotsByHorse: object }} p
 */
export function computeAggregateRows(p) {
  const { runtimeRaceData, carrotsByHorse } = p;
  const bucketKey = computeBucketKey(runtimeRaceData, carrotsByHorse);
  const state = loadAggregateState();
  const keyOk = Boolean(state.bucketKey) && state.bucketKey === bucketKey;
  const runs = keyOk ? manualRunsOnly(state.runs) : [];
  const n = runs.length;
  const counts = runCountsBySource(state);

  const rows = [];
  const fieldSize = runtimeRaceData.entries.length;
  for (let id = 0; id < fieldSize; id++) {
    const entry = runtimeRaceData.entries[id];
    const name = entry?.horse?.name ?? `馬${id + 1}`;
    const gate = entry?.gate ?? id + 1;
    if (n === 0) {
      rows.push({
        id,
        gate,
        name,
        wins: 0,
        top2: 0,
        top3: 0,
        winRate: 0,
        top2Rate: 0,
        top3Rate: 0,
        avgRank: null,
        bestRank: null,
        worstRank: null,
      });
      continue;
    }
    let wins = 0;
    let top2 = 0;
    let top3 = 0;
    let sumPlace = 0;
    let best = Infinity;
    let worst = 0;
    for (const run of runs) {
      const order = run.order;
      if (!Array.isArray(order)) continue;
      const rank = order.indexOf(id);
      if (rank < 0) continue;
      const place = rank + 1;
      if (place === 1) wins += 1;
      if (place <= 2) top2 += 1;
      if (place <= 3) top3 += 1;
      best = Math.min(best, place);
      worst = Math.max(worst, place);
      sumPlace += place;
    }
    rows.push({
      id,
      gate,
      name,
      wins,
      top2,
      top3,
      winRate: n ? wins / n : 0,
      top2Rate: n ? top2 / n : 0,
      top3Rate: n ? top3 / n : 0,
      avgRank: n ? sumPlace / n : null,
      bestRank: Number.isFinite(best) ? best : null,
      worstRank: n ? worst : null,
    });
  }
  return { rows, trials: n, batch: counts.batch, manual: counts.manual, auto: counts.auto };
}
