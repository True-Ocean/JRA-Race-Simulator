import { calcAllParams } from './params.js';

/** スライダー1段階あたりの％（±5 → ±5%） */
export const RATING_PCT_PER_POINT = 0.01;

/** 調教 mult を巡航へ効かせる指数（S_cruise *= trainingMult^TRAINING_CRUISE_EXP） */
export const TRAINING_CRUISE_EXP = 0.25;

/** 馬 mult を持久へ効かせる指数（S_sustain *= horseMult^HORSE_SUSTAIN_EXP） */
export const HORSE_SUSTAIN_EXP = 0.5;

export const RATING_SLIDER_MIN = -5;
export const RATING_SLIDER_MAX = 5;

/** プレレースで選べる印（空文字 = なし） */
export const PRE_RACE_MARK_OPTIONS = ['', '◎', '◯', '▲', '△', '★', '☆', '×', '消'];

/** 印は1頭のみ（◎◯▲△★☆ 各1頭まで） */
export const UNIQUE_MARK_SYMBOLS = new Set(['◎', '◯', '▲', '△', '★', '☆']);

/**
 * @typedef {{ horse: number, jockey: number, training: number }} HorseRatingAdjustments
 */

/**
 * @param {number} fieldSize
 * @returns {Record<number, HorseRatingAdjustments>}
 */
export function createDefaultRatingAdjustments(fieldSize) {
  const out = {};
  for (let id = 0; id < fieldSize; id++) {
    out[id] = { horse: 0, jockey: 0, training: 0 };
  }
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
 * @param {number} rating -5..+5
 * @returns {number}
 */
export function ratingToMultiplier(rating) {
  const n = Number.isFinite(rating) ? rating : 0;
  const clamped = Math.max(RATING_SLIDER_MIN, Math.min(RATING_SLIDER_MAX, Math.round(n)));
  return 1 + clamped * RATING_PCT_PER_POINT;
}

function clampStat(value) {
  return Math.max(0, Math.min(100, value));
}

/**
 * @param {HorseRatingAdjustments} ratings
 * @returns {{ horseMult: number, jockeyMult: number, trainingMult: number }}
 */
export function buildRatingMultipliers(ratings = {}) {
  return {
    horseMult: ratingToMultiplier(ratings.horse),
    jockeyMult: ratingToMultiplier(ratings.jockey),
    trainingMult: ratingToMultiplier(ratings.training),
  };
}

/**
 * ベース能力値に％補正を適用する（v1.5 役割分担）
 * @param {object} horse - calcAllParams の1頭（ベース）
 * @param {HorseRatingAdjustments} ratings
 * @returns {object}
 */
export function applyRatingMultipliersToHorse(horse, ratings = {}) {
  const { horseMult, jockeyMult, trainingMult } = buildRatingMultipliers(ratings);
  const S_cruise = clampStat(
    horse.S_cruise * horseMult * trainingMult ** TRAINING_CRUISE_EXP,
  );
  const S_sustain = clampStat(
    horse.S_sustain * horseMult ** HORSE_SUSTAIN_EXP * trainingMult,
  );
  const M_maneuv = clampStat(horse.M_maneuv * jockeyMult);
  const initialStamina = S_sustain * 2.2;
  return {
    ...horse,
    S_cruise,
    S_sustain,
    M_maneuv,
    stamina: initialStamina,
    initialStamina,
  };
}

/**
 * @param {object} raceData
 * @param {Record<number, HorseRatingAdjustments>} ratingAdjustments
 * @returns {object[]}
 */
export function calcHorsesWithRatingAdjustments(raceData, ratingAdjustments = {}) {
  const baseHorses = calcAllParams(raceData);
  return baseHorses.map(horse => {
    const ratings = ratingAdjustments[horse.id] ?? { horse: 0, jockey: 0, training: 0 };
    return applyRatingMultipliersToHorse(horse, ratings);
  });
}

function rankWithin(values, id, higherIsBetter = true) {
  const sorted = [...values].sort((a, b) => (higherIsBetter ? b.v - a.v : a.v - b.v));
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
