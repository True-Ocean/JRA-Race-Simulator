import { describe, expect, it } from 'vitest';
import {
  calcPathSegmentMeters,
  calcLanePathFactor,
  calcPathStaminaDrain,
  calcPathInterpT,
  interpolateStaminaForDisplay,
  applyPathBudget,
} from '../src/engine/path-stamina.js';
import { runSimulation } from '../src/engine/simulation.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';
import { USE_PATH_BASED_STAMINA } from '../src/engine/constants.js';

describe('path-stamina', () => {
  it('calcPathSegmentMeters: 縦移動のみ', () => {
    const m = calcPathSegmentMeters(0, 1, 80, 1, 300);
    expect(m).toBeCloseTo(300, 1);
  });

  it('calcPathSegmentMeters: 横移動のみ', () => {
    const m = calcPathSegmentMeters(0, 1, 0, 4, 300);
    expect(m).toBeCloseTo(9, 1);
  });

  it('applyPathBudget: 直進は前進100%', () => {
    const r = applyPathBudget(40, 0, 200);
    expect(r.advance).toBeCloseTo(40, 5);
    expect(r.lateralScale).toBe(1);
  });

  it('applyPathBudget: 斜め進路は前進・横移を同率で抑える', () => {
    const r = applyPathBudget(40, 2, 200);
    expect(r.advance).toBeLessThan(40);
    expect(r.lateralScale).toBeCloseTo(r.advance / 40, 5);
    expect(r.lateralScale).toBeLessThan(1);
  });

  it('applyPathBudget: 馬番非依存（同じ laneDelta なら同じ比率）', () => {
    const a = applyPathBudget(30, 1.5, 160);
    const b = applyPathBudget(30, 1.5, 160);
    expect(a.advance).toBeCloseTo(b.advance, 8);
    expect(a.lateralScale).toBeCloseTo(b.lateralScale, 8);
  });

  it('calcLanePathFactor: コーナー外ほど大きい', () => {
    const phase = { isCorner: true, cornerNo: 2 };
    expect(calcLanePathFactor(1, phase)).toBeLessThan(calcLanePathFactor(10, phase));
  });

  it('calcPathStaminaDrain: 距離に比例', () => {
    const a = calcPathStaminaDrain(100, 1.0, 1, { isCorner: false });
    const b = calcPathStaminaDrain(200, 1.0, 1, { isCorner: false });
    expect(b).toBeCloseTo(a * 2, 5);
  });

  it('calcPathInterpT: path 進捗で補間', () => {
    const from = { x: 0, pathMeters: 0, stamina: 100 };
    const to = { x: 80, pathMeters: 100, stamina: 90 };
    const t = calcPathInterpT(from, to, 40, 50);
    expect(t).toBeCloseTo(0.5, 2);
    expect(interpolateStaminaForDisplay(from, to, t)).toBeCloseTo(95, 2);
  });
});

describe('runSimulation path integration', () => {
  const raceData = loadDefaultRaceFixture();

  it('USE_PATH_BASED_STAMINA が有効', () => {
    expect(USE_PATH_BASED_STAMINA).toBe(true);
  });

  it('走行後 pathMeters が増え、スタミナが消費される', () => {
    const { snapshots, results } = runSimulation(raceData, { seed: 42 }, {}, null);
    const last = snapshots[snapshots.length - 1]?.horses ?? [];
    expect(last.length).toBeGreaterThan(0);
    for (const h of last) {
      expect(h.pathMeters).toBeGreaterThan(0);
      expect(h.stamina).toBeLessThanOrEqual(h.initialStamina);
    }
    for (const h of results) {
      expect(h.pathMeters).toBeGreaterThan(0);
    }
  });

  it('同 seed で pathMeters が再現する', () => {
    const a = runSimulation(raceData, { seed: 7 }, {}, null);
    const b = runSimulation(raceData, { seed: 7 }, {}, null);
    const pathsA = a.results.map(h => h.pathMeters).join(',');
    const pathsB = b.results.map(h => h.pathMeters).join(',');
    expect(pathsA).toBe(pathsB);
  });
});
