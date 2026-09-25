import { describe, expect, it } from 'vitest';
import { resolveRaceEffort, staminaSpeedMultiplier, staminaAccelMultiplier } from '../src/engine/race-effort.js';
import { calcRunningStaminaDrain } from '../src/engine/stamina-drain.js';
import { runSimulation } from '../src/engine/simulation.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';

describe('脚質の作戦と消費の一貫性', () => {
  it('同じ能力なら逃げは前半に使い、差し・追込は後半に使う', () => {
    const styles = ['逃げ', '先行', '差し', '追込'];
    const mid = styles.map(style => resolveRaceEffort({ style }, {
      totalDistance: 1600, remainingMeters: 1000, rankNorm: 0.5,
    }));
    expect(mid[0]).toBeGreaterThan(mid[1]);
    expect(mid[1]).toBeGreaterThan(mid[2]);
    expect(mid[2]).toBeGreaterThan(mid[3]);
    for (const style of ['差し', '追込']) {
      const h = { style, initialStamina: 150, S_sustain: 70 };
      const early = resolveRaceEffort(h, { totalDistance: 1600, remainingMeters: 1000 });
      const late = resolveRaceEffort(h, { totalDistance: 1600, remainingMeters: 100 });
      const drain = effort => calcRunningStaminaDrain(h, { distanceMeters: 100, totalDistance: 1600, effort });
      expect(late).toBeGreaterThan(0.9);
      expect(drain(late)).toBeGreaterThan(drain(early) * 2);
    }
  });

  it('疲労は連続的に効き、枯渇しても走る力が残る', () => {
    expect(staminaSpeedMultiplier(0)).toBeGreaterThan(0.5);
    expect(staminaSpeedMultiplier(0.2)).toBeLessThan(staminaSpeedMultiplier(0.4));
    expect(staminaAccelMultiplier(0.1)).toBeLessThan(staminaAccelMultiplier(0.4));
    for (const fn of [staminaSpeedMultiplier, staminaAccelMultiplier]) {
      for (const boundary of [0, 0.33, 0.35, 0.4, 0.66]) {
        expect(Math.abs(fn(boundary + 0.0001) - fn(boundary))).toBeLessThan(0.001);
      }
    }
  });

  it('複数シードでも全フェーズで残量は単調減少し、道中に全馬が枯れない', () => {
    const race = loadDefaultRaceFixture();
    const endings = new Set();
    for (const seed of [1, 7, 42, 99, 20260523]) {
      const sim = runSimulation(race, { seed });
      let previous = null;
      for (const snap of sim.snapshots) {
        for (const h of snap.horses) {
          expect(h.stamina).toBeGreaterThanOrEqual(0);
          expect(h.stamina).toBeLessThanOrEqual(previous?.get(h.id) ?? h.initialStamina);
          expect(h.raceEffort).toBeGreaterThan(0);
          expect(h.raceEffort).toBeLessThanOrEqual(1);
        }
        previous = new Map(snap.horses.map(h => [h.id, h.stamina]));
      }
      expect(sim.snapshots[1].horses.every(h => h.stamina / h.initialStamina > 0.5)).toBe(true);
      endings.add(sim.snapshots.at(-1).horses.map(h => h.x.toFixed(2)).join(','));
    }
    expect(endings.size).toBeGreaterThan(1);
  });
});
