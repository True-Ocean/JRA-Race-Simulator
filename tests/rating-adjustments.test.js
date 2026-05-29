import { describe, expect, it } from 'vitest';
import {
  applyRatingMultipliersToHorse,
  buildRatingMultipliers,
  calcHorsesWithRatingAdjustments,
  computeBaselineAbilityRanks,
  formatEntryDetailLines,
  loadMarksByHorseFromBundle,
  marksByHorseToSymbolMap,
  normalizeMarksByHorse,
  PRE_RACE_MARK_OPTIONS,
  UNIQUE_MARK_SYMBOLS,
  ratingToMultiplier,
  serializeMarksByHorse,
  symbolMapToMarksByHorse,
} from '../src/engine/rating-adjustments.js';
import { calcAllParams } from '../src/engine/params.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';

describe('rating-adjustments', () => {
  const raceData = loadDefaultRaceFixture();

  it('ratingToMultiplier: ±5 → 0.95 / 1.05', () => {
    expect(ratingToMultiplier(-5)).toBeCloseTo(0.95);
    expect(ratingToMultiplier(0)).toBe(1);
    expect(ratingToMultiplier(5)).toBeCloseTo(1.05);
  });

  it('applyRatingMultipliersToHorse: 馬+5 は巡航を約5%上げる', () => {
    const base = calcAllParams(raceData)[0];
    const adj = applyRatingMultipliersToHorse(base, { horse: 5, jockey: 0, training: 0 });
    expect(adj.S_cruise).toBeGreaterThan(base.S_cruise);
    expect(adj.S_cruise / base.S_cruise).toBeCloseTo(1.05, 2);
    expect(adj.M_maneuv).toBe(base.M_maneuv);
  });

  it('applyRatingMultipliersToHorse: 騎手+5 は操作のみ', () => {
    const base = calcAllParams(raceData)[0];
    const adj = applyRatingMultipliersToHorse(base, { horse: 0, jockey: 5, training: 0 });
    expect(adj.M_maneuv / base.M_maneuv).toBeCloseTo(1.05, 2);
    expect(adj.S_cruise).toBe(base.S_cruise);
  });

  it('applyRatingMultipliersToHorse: 調教+5 は持久を主に上げる', () => {
    const base = calcAllParams(raceData)[0];
    const adj = applyRatingMultipliersToHorse(base, { horse: 0, jockey: 0, training: 5 });
    expect(adj.S_sustain).toBeGreaterThan(base.S_sustain);
    expect(adj.initialStamina).toBeGreaterThan(base.initialStamina);
    const cruiseRatio = adj.S_cruise / base.S_cruise;
    expect(cruiseRatio).toBeGreaterThan(1);
    expect(cruiseRatio).toBeLessThan(1.02);
  });

  it('calcHorsesWithRatingAdjustments: 全馬+1 は相対順位を変えない', () => {
    const base = calcAllParams(raceData);
    const adj = Object.fromEntries(base.map(h => [h.id, { horse: 1, jockey: 0, training: 0 }]));
    const horses = calcHorsesWithRatingAdjustments(raceData, adj);
    const baseOrder = [...base].sort((a, b) => b.S_cruise - a.S_cruise).map(h => h.id);
    const adjOrder = [...horses].sort((a, b) => b.S_cruise - a.S_cruise).map(h => h.id);
    expect(adjOrder).toEqual(baseOrder);
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

  it('buildRatingMultipliers', () => {
    const m = buildRatingMultipliers({ horse: 2, jockey: -3, training: 0 });
    expect(m.horseMult).toBeCloseTo(1.02);
    expect(m.jockeyMult).toBeCloseTo(0.97);
    expect(m.trainingMult).toBe(1);
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
