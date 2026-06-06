import { describe, expect, it } from 'vitest';
import { runSimulation } from '../src/engine/simulation.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';

function withNigeLeadHorse(raceData) {
  const entries = raceData.entries.map((entry, index) => {
    if (index !== 0) return entry;
    return {
      ...entry,
      horse: { ...entry.horse, style: '逃げ' },
    };
  });
  return { ...raceData, entries };
}

describe('逃げ馬のスタミナ（能力・隊列由来）', () => {
  const raceData = withNigeLeadHorse(loadDefaultRaceFixture());
  const options = { seed: 20260523 };

  it('逃げ馬はレース後にスタミナが減っている', () => {
    const { results } = runSimulation(raceData, options, {}, null);
    const nigeHorses = results.filter(h => h.style === '逃げ' || h.style === '大逃げ');
    expect(nigeHorses.length).toBeGreaterThan(0);
    for (const h of nigeHorses) {
      expect(h.stamina).toBeLessThan(h.initialStamina);
    }
  });

  it('逃げ・大逃げは向正面終了時点でスタミナが枯渇していない', () => {
    const { snapshots, phases } = runSimulation(raceData, options, {}, null);
    const backIdx = phases.findIndex(
      p => p.segmentId === 'back' || String(p.segmentLabel ?? '').includes('向正面'),
    );
    expect(backIdx).toBeGreaterThanOrEqual(0);
    const snap = snapshots[backIdx];
    const frontRunners = snap.horses.filter(h => h.style === '逃げ' || h.style === '大逃げ');
    expect(frontRunners.length).toBeGreaterThan(0);
    for (const h of frontRunners) {
      const ratio = h.initialStamina > 0 ? h.stamina / h.initialStamina : 0;
      expect(ratio).toBeGreaterThan(0.12);
    }
  });
});
