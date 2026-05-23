/**
 * 走破タイム表示（1着: 距離基準 ± スタミナ残量、2着以降: ゴール演出の通過差）
 */

import finishTimeBaseline from '../data/finish-time-baseline.json' with { type: 'json' };

const STAMINA_RATIO_CENTER = 0.55;
const STAMINA_TIME_COEFF = 1.45;
const STAMINA_ADJUST_MIN_SEC = -0.85;
const STAMINA_ADJUST_MAX_SEC = 1.05;

const GOAL_GAP_MIN_SEC = 0.04;

/** @type {Map<string, string>} */
const venueKeyByName = buildVenueKeyByNameMap(finishTimeBaseline.venues);

function buildVenueKeyByNameMap(venues) {
  const map = new Map();
  if (!venues || typeof venues !== 'object') return map;
  for (const [key, entry] of Object.entries(venues)) {
    map.set(key, key);
    const names = Array.isArray(entry?.names) ? entry.names : [];
    for (const name of names) {
      const normalized = normalizeVenueLabel(name);
      if (normalized) map.set(normalized, key);
    }
  }
  return map;
}

/**
 * @param {string | null | undefined} label
 */
function normalizeVenueLabel(label) {
  if (typeof label !== 'string') return '';
  return label.trim().replace(/競馬場$/u, '');
}

/**
 * @param {string | null | undefined} venue
 * @returns {string | null}
 */
export function resolveVenueKey(venue) {
  if (!venue) return null;
  const raw = String(venue).trim();
  if (!raw) return null;
  if (venueKeyByName.has(raw)) return venueKeyByName.get(raw) ?? null;
  const stripped = normalizeVenueLabel(raw);
  if (venueKeyByName.has(stripped)) return venueKeyByName.get(stripped) ?? null;
  return null;
}

/**
 * @param {string | null | undefined} track
 * @returns {'turf' | 'dirt'}
 */
export function resolveSurfaceKey(track) {
  const t = String(track ?? '芝').trim();
  return t === 'ダート' || t.toLowerCase() === 'dirt' ? 'dirt' : 'turf';
}

/**
 * @param {Array<{ distance: number, sec: number }>} anchors
 * @param {number} distance
 */
export function interpolateDistanceBaselineSec(anchors, distance) {
  const points = (anchors ?? [])
    .filter(p => Number.isFinite(p?.distance) && Number.isFinite(p?.sec))
    .map(p => ({ distance: p.distance, sec: p.sec }))
    .sort((a, b) => a.distance - b.distance);

  if (points.length === 0) return 120;
  if (points.length === 1) return points[0].sec;

  const d = Number(distance);
  if (!Number.isFinite(d) || d <= 0) return points[0].sec;

  if (d <= points[0].distance) {
    const [a, b] = [points[0], points[1]];
    const span = b.distance - a.distance;
    if (span <= 0) return a.sec;
    const t = (d - a.distance) / span;
    return a.sec + (b.sec - a.sec) * t;
  }

  const last = points[points.length - 1];
  if (d >= last.distance) {
    const a = points[points.length - 2];
    const b = last;
    const span = b.distance - a.distance;
    if (span <= 0) return b.sec;
    const t = (d - a.distance) / span;
    return a.sec + (b.sec - a.sec) * t;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (d >= a.distance && d <= b.distance) {
      const span = b.distance - a.distance;
      if (span <= 0) return a.sec;
      const t = (d - a.distance) / span;
      return a.sec + (b.sec - a.sec) * t;
    }
  }

  return last.sec;
}

/**
 * @param {'turf' | 'dirt'} surface
 * @param {string | null} venueKey
 */
function getVenueOffsetSec(surface, venueKey) {
  if (!venueKey) return 0;
  const entry = finishTimeBaseline.venues?.[venueKey];
  if (!entry) return 0;
  const offset = entry[surface];
  return Number.isFinite(offset) ? offset : 0;
}

/**
 * @param {'turf' | 'dirt'} surface
 * @param {string | null | undefined} condition
 */
function getConditionAdjustSec(surface, condition) {
  const table = finishTimeBaseline.conditionAdjustSec?.[surface];
  if (!table) return 0;
  const key = condition ?? '良';
  const v = table[key];
  return Number.isFinite(v) ? v : 0;
}

/**
 * @param {string | null | undefined} grade
 */
function getGradeAdjustSec(grade) {
  if (!grade) return 0;
  const table = finishTimeBaseline.gradeAdjustSec;
  if (!table) return 0;
  const v = table[grade] ?? table[String(grade).toUpperCase()];
  return Number.isFinite(v) ? v : 0;
}

/**
 * レース条件から1着の基準走破タイム（秒）
 * 芝/ダ別距離曲線（G1・良）＋競馬場オフセット＋格・馬場
 * @param {{ distance?: number, track?: string, condition?: string, venue?: string, grade?: string } | null | undefined} raceInfo
 */
export function getBaselineWinnerTimeSec(raceInfo) {
  const distance = Number(raceInfo?.distance) > 0 ? Number(raceInfo.distance) : 1600;
  const surface = resolveSurfaceKey(raceInfo?.track);
  const curve = finishTimeBaseline[surface]?.anchors ?? finishTimeBaseline.turf?.anchors;

  let sec = interpolateDistanceBaselineSec(curve, distance);

  const venueKey = resolveVenueKey(raceInfo?.venue);
  sec += getVenueOffsetSec(surface, venueKey);
  sec += getGradeAdjustSec(raceInfo?.grade);
  sec += getConditionAdjustSec(surface, raceInfo?.condition);

  return sec;
}

/**
 * 1着馬の終盤スタミナ残量比率（0〜1）から勝ち時計の増減（秒）
 * 残量が多いほど速い（マイナス）、少ないほど遅い（プラス）
 */
export function calcWinnerStaminaAdjustSec(staminaRatio) {
  const r = clamp01(staminaRatio);
  const raw = (STAMINA_RATIO_CENTER - r) * STAMINA_TIME_COEFF;
  return Math.max(STAMINA_ADJUST_MIN_SEC, Math.min(STAMINA_ADJUST_MAX_SEC, raw));
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * @param {number} totalSec
 * @returns {string}
 */
export function formatRaceTimeSec(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '—';
  const rounded = Math.round(totalSec * 10) / 10;
  const mins = Math.floor(rounded / 60);
  const rem = Math.round((rounded - mins * 60) * 10) / 10;
  if (mins > 0) {
    const remStr = rem < 10 ? `0${rem.toFixed(1)}` : rem.toFixed(1);
    return `${mins}:${remStr}`;
  }
  return rem.toFixed(1);
}

/** 1馬身あたりの秒換算（0.2秒 ≒ 1馬身） */
const SECONDS_PER_LENGTH = 0.2;

/** 僅差: ハナ → アタマ → クビ（いずれも半馬身未満） */
const TIGHT_MARGIN_HANA_MAX_SEC = 0.035;
const TIGHT_MARGIN_ATAMA_MAX_SEC = 0.070;
const TIGHT_MARGIN_KUBI_MAX_SEC = 0.100;

/**
 * 直前の馬とのタイム差（秒）を JRA 風の着差表記に変換
 * 僅差の順序: ハナ ＜ アタマ ＜ クビ ＜ 1/2馬身 …
 * @param {number} deltaSec 1つ前の着順との差（秒）
 * @returns {string}
 */
export function formatFinishMargin(deltaSec) {
  if (!Number.isFinite(deltaSec) || deltaSec < 0) return '—';
  if (deltaSec < TIGHT_MARGIN_HANA_MAX_SEC) return 'ハナ';
  if (deltaSec < TIGHT_MARGIN_ATAMA_MAX_SEC) return 'アタマ';
  if (deltaSec < TIGHT_MARGIN_KUBI_MAX_SEC) return 'クビ';

  const lengths = deltaSec / SECONDS_PER_LENGTH;
  const snapped = Math.round(lengths * 4) / 4;
  const whole = Math.floor(snapped + 1e-6);
  const quarter = Math.round((snapped - whole) * 4);

  if (whole === 0) {
    if (quarter <= 1) return '1/2';
    if (quarter === 2) return '1/2';
    return '3/4';
  }

  if (quarter === 0) return String(whole);
  if (quarter === 1) return `${whole} 1/4`;
  if (quarter === 2) return `${whole} 1/2`;
  if (quarter === 3) return `${whole} 3/4`;
  return String(whole);
}

function getStaminaRatioFromHorse(horse) {
  if (!horse || !(horse.initialStamina > 0)) return 0.5;
  return clamp01(horse.stamina / horse.initialStamina);
}

/**
 * @param {{
 *   raceInfo?: object,
 *   simResults?: object[],
 *   finishOrderIds?: number[],
 *   goalFinishedAtById?: Map<number, number> | Record<number, number>,
 * }} params
 * @returns {{ rows: Array<{ id: number, rank: number, timeSec: number, timeLabel: string, marginLabel: string }>, winnerTimeSec: number }}
 */
export function buildFinishTimeRows({
  raceInfo,
  simResults = [],
  finishOrderIds = [],
  goalFinishedAtById = null,
}) {
  const resultsById = new Map();
  (simResults ?? []).forEach(h => {
    if (h && Number.isFinite(h.id)) resultsById.set(h.id, h);
  });

  const orderedIds =
    Array.isArray(finishOrderIds) && finishOrderIds.length > 0
      ? [...finishOrderIds]
      : [...resultsById.values()]
          .sort((a, b) => (a.arrivalTime ?? 0) - (b.arrivalTime ?? 0))
          .map(h => h.id);

  const gapMap = goalFinishedAtById instanceof Map
    ? goalFinishedAtById
    : new Map(
        Object.entries(goalFinishedAtById ?? {}).map(([k, v]) => [Number(k), v]),
      );

  const winnerId = orderedIds[0];
  const winner = resultsById.get(winnerId);
  const winnerTimeSec =
    getBaselineWinnerTimeSec(raceInfo) +
    calcWinnerStaminaAdjustSec(getStaminaRatioFromHorse(winner));

  const winnerRaceMs = Number.isFinite(gapMap.get(winnerId))
    ? gapMap.get(winnerId)
    : 0;

  let prevTimeSec = winnerTimeSec;
  const rows = orderedIds.map((id, idx) => {
    const rank = idx + 1;
    let timeSec = winnerTimeSec;
    if (rank > 1) {
      const horseMs = Number.isFinite(gapMap.get(id)) ? gapMap.get(id) : winnerRaceMs;
      const deltaSec = Math.max(GOAL_GAP_MIN_SEC, (horseMs - winnerRaceMs) / 1000);
      timeSec = winnerTimeSec + deltaSec;
    }
    const marginLabel =
      rank === 1 ? '—' : formatFinishMargin(timeSec - prevTimeSec);
    prevTimeSec = timeSec;
    return {
      id,
      rank,
      timeSec,
      timeLabel: formatRaceTimeSec(timeSec),
      marginLabel,
    };
  });

  return { rows, winnerTimeSec };
}

/**
 * @param {Map<number, number>} goalFinishedAtById
 * @returns {Record<string, number>}
 */
export function serializeGoalFinishedAtById(goalFinishedAtById) {
  const out = {};
  if (!(goalFinishedAtById instanceof Map)) return out;
  goalFinishedAtById.forEach((ms, id) => {
    if (Number.isFinite(ms)) out[String(id)] = ms;
  });
  return out;
}

/**
 * @param {Record<string, number> | null | undefined} raw
 * @returns {Map<number, number>}
 */
export function deserializeGoalFinishedAtById(raw) {
  const map = new Map();
  if (!raw || typeof raw !== 'object') return map;
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k);
    if (Number.isFinite(id) && Number.isFinite(v)) map.set(id, v);
  }
  return map;
}

/**
 * ゴール再生フレーム列から通過時刻マップを復元（goalFinishedAtRaceMs 未記録の旧録画向け）
 * @param {Array<{ kind?: string, elapsedMs?: number, goalRankOrderSnapshot?: number[], horses?: object[] }>} frames
 */
export function deriveGoalFinishedAtFromRecording(frames) {
  const map = new Map();
  if (!Array.isArray(frames) || frames.length === 0) return map;

  let goalStartMs = null;
  let prevOrderLen = 0;

  for (const frame of frames) {
    if (frame?.kind !== 'goal') continue;
    if (goalStartMs == null && Number.isFinite(frame.elapsedMs)) {
      goalStartMs = frame.elapsedMs;
    }
    const order = Array.isArray(frame.goalRankOrderSnapshot)
      ? frame.goalRankOrderSnapshot
      : [];
    const raceMs =
      Number.isFinite(frame.elapsedMs) && goalStartMs != null
        ? Math.max(0, frame.elapsedMs - goalStartMs)
        : null;

    const horsesById = new Map(
      (frame.horses ?? []).map(h => [h.id, h]),
    );

    for (let i = prevOrderLen; i < order.length; i++) {
      const id = order[i];
      const horse = horsesById.get(id);
      const ms =
        Number.isFinite(horse?.goalFinishedAtRaceMs)
          ? horse.goalFinishedAtRaceMs
          : raceMs;
      if (Number.isFinite(ms)) map.set(id, ms);
    }
    prevOrderLen = order.length;
  }

  return map;
}
