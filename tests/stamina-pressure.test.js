import { describe, expect, it } from 'vitest';
import { getRaceEffortContext, resolveRaceEffort } from '../src/engine/race-effort.js';
import { calcRunningStaminaDrain } from '../src/engine/stamina-drain.js';

const horse = { id: 1, x: 100, y: 2, style: '逃げ', initialStamina: 150, S_sustain: 70 };
const context = { totalDistance: 1600, remainingMeters: 1200, distanceMeters: 150, rankNorm: 0 };

describe('展開による走行負荷', () => {
  it('単騎逃げより近くに競りかける相手がいると脚を使う', () => {
    const alone = getRaceEffortContext(horse, [horse]);
    const contested = getRaceEffortContext(horse, [horse,
      { id: 2, x: 98, y: 3 }, { id: 3, x: 104, y: 4 },
    ]);
    const easy = resolveRaceEffort(horse, { ...context, ...alone });
    const hard = resolveRaceEffort(horse, { ...context, ...contested });
    expect(hard).toBeGreaterThan(easy);
    const drain = effort => calcRunningStaminaDrain(horse, { ...context, effort });
    expect(drain(hard)).toBeGreaterThan(drain(easy));
  });

  it('前が塞がると仕掛けを控え、開けば同じ位置から脚を使える', () => {
    const closer = { ...horse, style: '差し', raceEffort: 0.7 };
    const late = { ...context, remainingMeters: 180, distanceMeters: 30 };
    const blocked = resolveRaceEffort(closer, { ...late, frontBlocked: true });
    const open = resolveRaceEffort(closer, { ...late, frontBlocked: false });
    expect(open).toBeGreaterThan(blocked);
    expect(open - closer.raceEffort).toBeLessThan(0.2);
  });

  it('目標位置より後ろなら早めに仕掛ける判断が生じる', () => {
    const closer = { ...horse, style: '差し', formationTargetRank: 0.4 };
    const late = { ...context, remainingMeters: 450 };
    expect(resolveRaceEffort(closer, { ...late, rankNorm: 0.9 }))
      .toBeGreaterThan(resolveRaceEffort(closer, { ...late, rankNorm: 0.4 }));
  });
});
