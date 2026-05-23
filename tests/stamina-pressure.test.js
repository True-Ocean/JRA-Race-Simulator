import { describe, expect, it } from 'vitest';
import { runSimulation } from '../src/engine/simulation.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';
import {
  calcGoalEffortNorm,
  calcGoalReserveBurnDrain,
} from '../src/ui/goal-scene.js';

describe('競争圧・実行圧', () => {
  it('実行圧: 加速・望む速度への追従で effort が上がる', () => {
    const low = calcGoalEffortNorm(14, 14, 0);
    const high = calcGoalEffortNorm(16, 13, 0.08);
    expect(low).toBeLessThan(high);
  });

  it('実行圧: effort が低いと reserveBurn は小さい', () => {
    const base = {
      stamina: 100,
      initialStamina: 150,
      remainMeters: 60,
      goalCurrentMps: 15,
      staminaRatio: 0.66,
      pathQuality: 0.9,
      distRatio: 0.7,
      dt: 0.05,
    };
    const withEffort = calcGoalReserveBurnDrain({ ...base, effortNorm: 0.85 });
    const noEffort = calcGoalReserveBurnDrain({ ...base, effortNorm: 0 });
    expect(withEffort).toBeGreaterThan(noEffort);
  });

  it('大逃げは向正面で枯渇せず、レース後はスタミナが減っている', () => {
    const { snapshots, phases, results } = runSimulation(
      loadDefaultRaceFixture(),
      { seed: 20260523 },
      {},
      {},
      null,
    );
    const backIdx = phases.findIndex(
      p => p.segmentId === 'back' || String(p.segmentLabel ?? '').includes('向正面'),
    );
    expect(backIdx).toBeGreaterThanOrEqual(0);
    for (const h of snapshots[backIdx].horses.filter(x => x.style === '大逃げ')) {
      const ratio = h.stamina / h.initialStamina;
      expect(ratio).toBeGreaterThan(0.12);
    }
    for (const h of results.filter(x => x.style === '逃げ' || x.style === '大逃げ')) {
      expect(h.stamina).toBeLessThan(h.initialStamina);
    }
  });
});
