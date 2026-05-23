import { describe, expect, it } from 'vitest';
import { runSimulation } from '../src/engine/simulation.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';
import golden from './fixtures/golden-snapshot.json';

function simulationSignature(result) {
  return {
    snapshotCount: result.snapshots.length,
    resultCount: result.results.length,
    winnerId: result.results[0]?.id,
    winnerName: result.results[0]?.name,
    finishIds: result.results.map(h => h.id).join(','),
  };
}

describe('runSimulation', () => {
  const raceData = loadDefaultRaceFixture();
  const options = { seed: golden.seed };

  it('同じ seed で2回実行すると同一結果になる（再現性）', () => {
    const first = runSimulation(raceData, options, {}, {}, null);
    const second = runSimulation(raceData, options, {}, {}, null);
    expect(simulationSignature(first)).toEqual(simulationSignature(second));
  });

  it('固定フィクスチャのゴールデン値と一致する', () => {
    const result = runSimulation(raceData, options, {}, {}, null);
    const sig = simulationSignature(result);
    expect(sig.snapshotCount).toBe(golden.snapshotCount);
    expect(sig.resultCount).toBe(golden.resultCount);
    expect(sig.winnerId).toBe(golden.winnerId);
    expect(sig.winnerName).toBe(golden.winnerName);
    expect(sig.finishIds).toBe(golden.finishIds);
  });

  it('全馬分の results と snapshots が返る', () => {
    const result = runSimulation(raceData, options, {}, {}, null);
    expect(result.results).toHaveLength(raceData.entries.length);
    expect(result.snapshots.length).toBeGreaterThan(0);
    expect(result.logs).toBeInstanceOf(Array);
  });
});
