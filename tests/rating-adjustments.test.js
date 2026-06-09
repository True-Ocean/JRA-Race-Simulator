import { describe, expect, it } from 'vitest';
import {
  applyCarrotBonusToHorse,
  calcHorsesWithCarrots,
  calcHorsesWithRatingAdjustments,
  carrotsForMark,
  carrotsToMultiplier,
  clampCarrots,
  computeBaselineAbilityRanks,
  formatEntryDetailLines,
  loadCarrotsByHorseFromBundle,
  loadMarksByHorseFromBundle,
  marksByHorseToSymbolMap,
  normalizeMarksByHorse,
  PRE_RACE_MARK_OPTIONS,
  UNIQUE_MARK_SYMBOLS,
  serializeMarksByHorse,
  symbolMapToMarksByHorse,
} from '../src/engine/rating-adjustments.js';
import { calcAllParams } from '../src/engine/params.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';

describe('rating-adjustments', () => {
  const raceData = loadDefaultRaceFixture();

  it('carrotsToMultiplier: 0 → 1、10 → 1.08', () => {
    expect(carrotsToMultiplier(0)).toBe(1);
    expect(carrotsToMultiplier(10)).toBeCloseTo(1.08);
  });

  it('clampCarrots: 0〜10 に収める', () => {
    expect(clampCarrots(-3)).toBe(0);
    expect(clampCarrots(12)).toBe(10);
    expect(clampCarrots(7)).toBe(7);
  });

  it('carrotsForMark: 印ごとのデフォルト🥕', () => {
    expect(carrotsForMark('◎')).toBe(7);
    expect(carrotsForMark('◯')).toBe(6);
    expect(carrotsForMark('☆')).toBe(2);
    expect(carrotsForMark('')).toBe(0);
    expect(carrotsForMark('×')).toBe(1);
  });

  it('applyCarrotBonusToHorse: 🥕10 は主要能力を約8%上げる', () => {
    const base = calcAllParams(raceData)[0];
    const adj = applyCarrotBonusToHorse(base, 10);
    expect(adj.S_cruise / base.S_cruise).toBeCloseTo(1.08, 2);
    expect(adj.S_sustain / base.S_sustain).toBeCloseTo(1.08, 2);
    expect(adj.M_maneuv / base.M_maneuv).toBeCloseTo(1.08, 2);
  });

  it('calcHorsesWithCarrots: 全馬同数🥕は相対順位を変えない', () => {
    const base = calcAllParams(raceData);
    const carrots = Object.fromEntries(base.map(h => [h.id, 5]));
    const horses = calcHorsesWithCarrots(raceData, carrots);
    const baseOrder = [...base].sort((a, b) => b.S_cruise - a.S_cruise).map(h => h.id);
    const adjOrder = [...horses].sort((a, b) => b.S_cruise - a.S_cruise).map(h => h.id);
    expect(adjOrder).toEqual(baseOrder);
  });

  it('calcHorsesWithRatingAdjustments は carrots のエイリアス', () => {
    const carrots = { 0: 3, 1: 0 };
    expect(calcHorsesWithRatingAdjustments(raceData, carrots)).toEqual(
      calcHorsesWithCarrots(raceData, carrots),
    );
  });

  it('loadCarrotsByHorseFromBundle: 印からデフォルト🥕を導出', () => {
    const loaded = loadCarrotsByHorseFromBundle(
      { marksByHorse: { 0: '◎', 2: '△' } },
      5,
      {},
    );
    expect(loaded[0]).toBe(7);
    expect(loaded[2]).toBe(4);
    expect(loaded[1]).toBe(0);
  });

  it('computeBaselineAbilityRanks: 全頭に順位', () => {
    const ranks = computeBaselineAbilityRanks(raceData);
    const n = raceData.entries.length;
    expect(Object.keys(ranks)).toHaveLength(n);
    expect(ranks[0].fieldSize).toBe(n);
    expect(ranks[0].cruise).toBeGreaterThanOrEqual(1);
  });

  it('marksByHorse ↔ symbol map（レガシー変換）', () => {
    const byHorse = { 0: '◎', 2: '△' };
    const sym = marksByHorseToSymbolMap(byHorse);
    expect(sym['◎']).toBe(0);
    expect(sym['△']).toBe(2);
    const back = symbolMapToMarksByHorse(sym, 5);
    expect(back[0]).toBe('◎');
    expect(back[2]).toBe('△');
    expect(back[1]).toBe('');
  });

  it('予想印は同一記号を複数頭に付けられる', () => {
    const byHorse = normalizeMarksByHorse({ 0: '◎', 1: '◎', 2: '△' }, 5);
    expect(byHorse[0]).toBe('◎');
    expect(byHorse[1]).toBe('◎');
    expect(serializeMarksByHorse(byHorse, 5)).toEqual({ 0: '◎', 1: '◎', 2: '△' });
    const loaded = loadMarksByHorseFromBundle({ marksByHorse: { 0: '◎', 1: '◎' } }, 5);
    expect(loaded[0]).toBe('◎');
    expect(loaded[1]).toBe('◎');
  });

  it('formatEntryDetailLines: 3Fはレンジ表示', () => {
    const entry = raceData.entries[0];
    const lines = formatEntryDetailLines(entry);
    expect(lines[0]).toMatch(/^Ave-3F .+〜.+ \(avg /);
    expect(lines[1]).toMatch(/^上り3F .+〜.+ \(avg /);
  });

  it('PRE_RACE_MARK_OPTIONS: × と 消 を含む', () => {
    expect(PRE_RACE_MARK_OPTIONS).toContain('×');
    expect(PRE_RACE_MARK_OPTIONS).toContain('消');
    expect(UNIQUE_MARK_SYMBOLS.has('×')).toBe(false);
    expect(UNIQUE_MARK_SYMBOLS.has('消')).toBe(false);
  });
});
