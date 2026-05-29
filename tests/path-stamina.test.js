import { describe, expect, it } from 'vitest';
import {
  calcPathSegmentMeters,
  calcLanePathFactor,
  calcPathStaminaDrain,
  calcPathInterpT,
  interpolateStaminaForDisplay,
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

  it('走行後 pathMeters が増え、外枠ほど長い傾向がある', () => {
    const { snapshots, results } = runSimulation(raceData, { seed: 42 }, {}, null);
    const last = snapshots[snapshots.length - 1]?.horses ?? [];
    expect(last.length).toBeGreaterThan(0);
    for (const h of last) {
      expect(h.pathMeters).toBeGreaterThan(0);
      expect(h.stamina).toBeLessThanOrEqual(h.initialStamina);
    }
    const byLane = [...results].sort(
      (a, b) => (b.corner4ExitLane ?? b.y) - (a.corner4ExitLane ?? a.y),
    );
    const outer = byLane[0];
    const inner = byLane[byLane.length - 1];
    if (outer?.pathMeters && inner?.pathMeters && outer.id !== inner.id) {
      expect(outer.pathMeters).toBeGreaterThanOrEqual(inner.pathMeters * 0.95);
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
