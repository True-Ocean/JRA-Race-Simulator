import { describe, expect, it } from 'vitest';
import { runSimulation } from '../src/engine/simulation.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';

describe('逃げ・大逃げのスタミナ消費（SAFEモデル Step1）', () => {
  const raceData = loadDefaultRaceFixture();
  const options = { seed: 20260523 };

  it('逃げ・大逃げはゴール時点で差し馬よりスタミナ残量が低い傾向になる', () => {
    const { results } = runSimulation(raceData, options, {}, {}, null);
    const nigeHorses = results.filter(h => h.style === '逃げ' || h.style === '大逃げ');
    const otherHorses = results.filter(h => h.style !== '逃げ' && h.style !== '大逃げ');
    expect(nigeHorses.length).toBeGreaterThan(0);
    expect(otherHorses.length).toBeGreaterThan(0);

    const avgRatio = (horses) => {
      const ratios = horses
        .filter(h => h.initialStamina > 0)
        .map(h => h.stamina / h.initialStamina);
      return ratios.reduce((a, b) => a + b, 0) / ratios.length;
    };

    const nigeAvg = avgRatio(nigeHorses);
    const otherAvg = avgRatio(otherHorses);
    expect(nigeAvg).toBeLessThan(otherAvg);
  });

  it('逃げ・大逃げのスタミナはレース前より減っている', () => {
    const { results } = runSimulation(raceData, options, {}, {}, null);
    for (const h of results.filter(x => x.style === '逃げ' || x.style === '大逃げ')) {
      expect(h.stamina).toBeLessThan(h.initialStamina);
    }
  });

  it('大逃げは向正面終了時点でスタミナが枯渇していない', () => {
    const { snapshots, phases } = runSimulation(raceData, options, {}, {}, null);
    const backIdx = phases.findIndex(
      p => p.segmentId === 'back' || String(p.segmentLabel ?? '').includes('向正面'),
    );
    expect(backIdx).toBeGreaterThanOrEqual(0);
    const snap = snapshots[backIdx];
    const oonige = snap.horses.filter(h => h.style === '大逃げ');
    expect(oonige.length).toBeGreaterThan(0);
    for (const h of oonige) {
      const ratio = h.initialStamina > 0 ? h.stamina / h.initialStamina : 0;
      expect(ratio).toBeGreaterThan(0.12);
    }
  });
});
