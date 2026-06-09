import { calcAllParams } from './params.js';

/** 🥕の最小・最大 */
export const CARROT_MIN = 0;
export const CARROT_MAX = 10;

/** 1🥕あたりの能力補正（10個で +8%） */
export const CARROT_PCT_PER_UNIT = 0.008;

/** 印ごとのデフォルト🥕数 */
export const MARK_DEFAULT_CARROTS = {
  '◎': 7,
  '◯': 6,
  '▲': 5,
  '△': 4,
  '★': 3,
  '☆': 2,
  '×': 1,
};

/** プレレースで選べる印（空文字 = なし） */
export const PRE_RACE_MARK_OPTIONS = ['', '◎', '◯', '▲', '△', '★', '☆', '×', '消'];

/** 集計の推奨印で使う記号（予想印は重複可・×消も可） */
export const UNIQUE_MARK_SYMBOLS = new Set(['◎', '◯', '▲', '△', '★', '☆']);

/**
 * @param {string} symbol
 * @returns {number}
 */
export function carrotsForMark(symbol) {
  return MARK_DEFAULT_CARROTS[symbol] ?? 0;
}

/**
 * @param {number} carrots
 * @returns {number}
 */
export function clampCarrots(carrots) {
  const n = Number.isFinite(carrots) ? Math.round(carrots) : 0;
  return Math.max(CARROT_MIN, Math.min(CARROT_MAX, n));
}

/**
 * @param {number} fieldSize
 * @returns {Record<number, number>}
 */
export function createDefaultCarrotsByHorse(fieldSize) {
  const out = {};
  for (let id = 0; id < fieldSize; id++) out[id] = 0;
  return out;
}

/**
 * @param {number} fieldSize
 * @returns {Record<number, string>}
 */
export function createDefaultMarksByHorse(fieldSize) {
  const out = {};
  for (let id = 0; id < fieldSize; id++) out[id] = '';
  return out;
}

/**
 * @param {number} carrots
 * @returns {number}
 */
export function carrotsToMultiplier(carrots) {
  return 1 + clampCarrots(carrots) * CARROT_PCT_PER_UNIT;
}

function clampStat(value) {
  return Math.max(0, Math.min(100, value));
}

/**
 * @param {object} horse - calcAllParams の1頭（ベース）
 * @param {number} carrots
 * @returns {object}
 */
export function applyCarrotBonusToHorse(horse, carrots = 0) {
  const mult = carrotsToMultiplier(carrots);
  const S_pace = clampStat(horse.S_pace * mult);
  const S_kick = clampStat(horse.S_kick * mult);
  const S_cruise = S_pace;
  const S_formation = horse.S_formation;
  const S_sustain = clampStat(horse.S_sustain * mult);
  const M_maneuv = clampStat(horse.M_maneuv * mult);
  const initialStamina = S_sustain * 2.2;
  return {
    ...horse,
    S_formation,
    S_pace,
    S_kick,
    S_cruise,
    S_sustain,
    M_maneuv,
    stamina: initialStamina,
    initialStamina,
  };
}

/**
 * @param {object} raceData
 * @param {Record<number, number>} carrotsByHorse
 * @returns {object[]}
 */
export function calcHorsesWithCarrots(raceData, carrotsByHorse = {}) {
  const baseHorses = calcAllParams(raceData);
  return baseHorses.map(horse => {
    const carrots = carrotsByHorse[horse.id] ?? 0;
    return applyCarrotBonusToHorse(horse, carrots);
  });
}

/** @deprecated carrotsByHorse を渡す（後方互換のエイリアス） */
export function calcHorsesWithRatingAdjustments(raceData, carrotsByHorse = {}) {
  return calcHorsesWithCarrots(raceData, carrotsByHorse);
}

/**
 * @param {Record<number, number>|Record<string, number>} raw
 * @param {number} fieldSize
 * @returns {Record<number, number>}
 */
export function normalizeCarrotsByHorse(raw = {}, fieldSize = 0) {
  const out = createDefaultCarrotsByHorse(fieldSize);
  for (const [idStr, val] of Object.entries(raw)) {
    const id = Number(idStr);
    if (!Number.isFinite(id) || id < 0 || id >= fieldSize) continue;
    out[id] = clampCarrots(val);
  }
  return out;
}

/**
 * @param {Record<number, number>} carrotsByHorse
 * @param {number} fieldSize
 * @returns {Record<string, number>}
 */
export function serializeCarrotsByHorse(carrotsByHorse = {}, fieldSize = 0) {
  const out = {};
  for (let id = 0; id < fieldSize; id++) {
    const c = clampCarrots(carrotsByHorse[id] ?? 0);
    if (c > 0) out[String(id)] = c;
  }
  return out;
}

/**
 * @param {object|null|undefined} bundle
 * @param {number} fieldSize
 * @param {Record<number, string>} [marksByHorse]
 * @returns {Record<number, number>}
 */
export function loadCarrotsByHorseFromBundle(bundle, fieldSize, marksByHorse = {}) {
  if (bundle?.carrotsByHorse && typeof bundle.carrotsByHorse === 'object') {
    return normalizeCarrotsByHorse(bundle.carrotsByHorse, fieldSize);
  }
  const marks =
    marksByHorse && Object.keys(marksByHorse).length > 0
      ? marksByHorse
      : loadMarksByHorseFromBundle(bundle, fieldSize);
  const out = createDefaultCarrotsByHorse(fieldSize);
  for (let id = 0; id < fieldSize; id++) {
    out[id] = carrotsForMark(marks[id] ?? '');
  }
  return out;
}

/**
 * @param {object} runtimeRaceData
 * @param {Record<number, number>} carrotsByHorse
 * @param {Record<number, string>} marksByHorse
 * @param {(entries: object[]) => object[]} cloneEntriesFn
 */
export function clonePreferencesSnapshot(
  runtimeRaceData,
  carrotsByHorse,
  marksByHorse,
  cloneEntriesFn,
) {
  const fieldSize = runtimeRaceData.entries?.length ?? 0;
  return {
    entries: cloneEntriesFn(runtimeRaceData.entries),
    carrotsByHorse: normalizeCarrotsByHorse(carrotsByHorse, fieldSize),
    marksByHorse: normalizeMarksByHorse(marksByHorse, fieldSize),
  };
}

/**
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 * @returns {boolean}
 */
export function preferencesSnapshotsEqual(a, b) {
  if (!a || !b) return false;
  return (
    JSON.stringify(a.entries) === JSON.stringify(b.entries) &&
    JSON.stringify(a.carrotsByHorse) === JSON.stringify(b.carrotsByHorse) &&
    JSON.stringify(a.marksByHorse) === JSON.stringify(b.marksByHorse)
  );
}

function rankWithin(values, id, higherIsBetter = true) {
  const sorted = [...values].sort((x, y) => (higherIsBetter ? y.v - x.v : x.v - y.v));
  const idx = sorted.findIndex(x => x.id === id);
  return idx >= 0 ? idx + 1 : null;
}

/**
 * 参考能力順位（微調整なし・固定）
 * @param {object} raceData
 * @returns {Record<number, { cruise: number, sustain: number, composite: number, fieldSize: number }>}
 */
export function computeBaselineAbilityRanks(raceData) {
  const horses = calcAllParams(raceData);
  const fieldSize = horses.length;
  const cruiseRows = horses.map(h => ({ id: h.id, v: h.S_cruise }));
  const sustainRows = horses.map(h => ({ id: h.id, v: h.S_sustain }));
  const compositeRows = horses.map(h => ({
    id: h.id,
    v: 0.5 * h.S_cruise + 0.3 * h.S_sustain + 0.2 * h.M_maneuv,
  }));

  const out = {};
  horses.forEach(h => {
    out[h.id] = {
      cruise: rankWithin(cruiseRows, h.id, true),
      sustain: rankWithin(sustainRows, h.id, true),
      composite: rankWithin(compositeRows, h.id, true),
      fieldSize,
    };
  });
  return out;
}

/**
 * @param {Record<number, string>|Record<string, string>} raw
 * @param {number} fieldSize
 * @returns {Record<number, string>}
 */
export function normalizeMarksByHorse(raw = {}, fieldSize = 0) {
  const out = createDefaultMarksByHorse(fieldSize);
  for (const [idStr, symbol] of Object.entries(raw)) {
    const id = Number(idStr);
    if (!Number.isFinite(id) || id < 0 || id >= fieldSize) continue;
    out[id] = typeof symbol === 'string' ? symbol : '';
  }
  return out;
}

/**
 * @param {object|null|undefined} bundle
 * @param {number} fieldSize
 * @returns {Record<number, string>}
 */
export function loadMarksByHorseFromBundle(bundle, fieldSize) {
  if (!bundle) return createDefaultMarksByHorse(fieldSize);
  if (bundle.marksByHorse && typeof bundle.marksByHorse === 'object') {
    return normalizeMarksByHorse(bundle.marksByHorse, fieldSize);
  }
  if (bundle.marks && typeof bundle.marks === 'object') {
    const keys = Object.keys(bundle.marks);
    const legacySymbolMap = keys.some(k => UNIQUE_MARK_SYMBOLS.has(k));
    if (legacySymbolMap) {
      return symbolMapToMarksByHorse(bundle.marks, fieldSize);
    }
    return normalizeMarksByHorse(bundle.marks, fieldSize);
  }
  return createDefaultMarksByHorse(fieldSize);
}

/**
 * @param {Record<number, string>} marksByHorse
 * @param {number} fieldSize
 * @returns {Record<string, string>}
 */
export function serializeMarksByHorse(marksByHorse = {}, fieldSize = 0) {
  const out = {};
  for (let id = 0; id < fieldSize; id++) {
    const sym = marksByHorse[id] ?? '';
    if (sym) out[String(id)] = sym;
  }
  return out;
}

/**
 * @param {Record<number, string>} marksByHorse
 * @returns {Record<string, number>}
 */
export function marksByHorseToSymbolMap(marksByHorse = {}) {
  const out = {};
  for (const [idStr, symbol] of Object.entries(marksByHorse)) {
    if (!symbol || !UNIQUE_MARK_SYMBOLS.has(symbol)) continue;
    out[symbol] = Number(idStr);
  }
  return out;
}

/**
 * @param {Record<string, number>} symbolMap
 * @param {number} fieldSize
 * @returns {Record<number, string>}
 */
export function symbolMapToMarksByHorse(symbolMap = {}, fieldSize = 0) {
  const out = createDefaultMarksByHorse(fieldSize);
  for (const [symbol, id] of Object.entries(symbolMap)) {
    if (!UNIQUE_MARK_SYMBOLS.has(symbol)) continue;
    if (Number.isFinite(id) && id >= 0 && id < fieldSize) {
      out[id] = symbol;
    }
  }
  return out;
}

function format3fRangeLine(label, range, fallback) {
  if (range && Number.isFinite(range.min) && Number.isFinite(range.max)) {
    const avg = Number.isFinite(range.avg) ? range.avg : fallback;
    const avgPart = Number.isFinite(avg) ? ` (avg ${avg.toFixed(1)})` : '';
    return `${label} ${range.min.toFixed(1)}〜${range.max.toFixed(1)}${avgPart}`;
  }
  if (Number.isFinite(fallback)) return `${label} ${fallback.toFixed(1)}`;
  return null;
}

/**
 * 詳細ポップオーバー用テキスト（DB由来の参考データ）
 * @param {object} entry
 * @returns {string[]}
 */
export function formatEntryDetailLines(entry) {
  const horse = entry?.horse ?? {};
  const jockey = entry?.jockey ?? {};
  const lines = [];
  const aveLine = format3fRangeLine('Ave-3F', horse.ave_3f_range, horse.ave_3f);
  if (aveLine) lines.push(aveLine);
  const lastLine = format3fRangeLine('上り3F', horse.last_3f_range, horse.last_3f);
  if (lastLine) lines.push(lastLine);
  if (horse.sex_age) lines.push(`性齢 ${horse.sex_age}`);
  if (Number.isFinite(horse.weight)) lines.push(`斤量 ${horse.weight}kg`);
  if (Number.isFinite(jockey.win_rate)) {
    lines.push(`騎手勝率 ${Math.round(jockey.win_rate * 100)}%`);
  }
  if (Number.isFinite(jockey.top3_rate)) {
    lines.push(`3着内率 ${Math.round(jockey.top3_rate * 100)}%`);
  }
  return lines;
}
