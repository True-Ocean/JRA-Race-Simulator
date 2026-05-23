import { describe, expect, it } from 'vitest';
import {
  buildFinishTimeRows,
  calcWinnerStaminaAdjustSec,
  deriveGoalFinishedAtFromRecording,
  formatFinishMargin,
  formatRaceTimeSec,
  getBaselineWinnerTimeSec,
  interpolateDistanceBaselineSec,
  resolveSurfaceKey,
  resolveVenueKey,
} from '../src/ui/finish-times.js';
import finishTimeBaseline from '../src/data/finish-time-baseline.json' with { type: 'json' };

describe('finish-times', () => {
  it('formatRaceTimeSec', () => {
    expect(formatRaceTimeSec(143.5)).toBe('2:23.5');
    expect(formatRaceTimeSec(95.2)).toBe('1:35.2');
  });

  it('formatFinishMargin（直前馬との差・ハナ＜アタマ＜クビ＜馬身）', () => {
    expect(formatFinishMargin(0.03)).toBe('ハナ');
    expect(formatFinishMargin(0.05)).toBe('アタマ');
    expect(formatFinishMargin(0.09)).toBe('クビ');
    expect(formatFinishMargin(0.10)).toBe('1/2');
    expect(formatFinishMargin(0.15)).toBe('3/4');
    expect(formatFinishMargin(0.20)).toBe('1');
    expect(formatFinishMargin(0.35)).toBe('1 3/4');
    expect(formatFinishMargin(0.40)).toBe('2');
  });

  it('stamina adjust: high stamina -> faster', () => {
    expect(calcWinnerStaminaAdjustSec(0.9)).toBeLessThan(calcWinnerStaminaAdjustSec(0.3));
  });

  it('buildFinishTimeRows: 着差は直前の馬との差', () => {
    const simResults = [
      { id: 0, stamina: 80, initialStamina: 100, arrivalTime: 10 },
      { id: 1, stamina: 50, initialStamina: 100, arrivalTime: 11 },
      { id: 2, stamina: 50, initialStamina: 100, arrivalTime: 12 },
    ];
    const goalFinishedAtById = new Map([
      [0, 0],
      [1, 350],
      [2, 750],
    ]);
    const { rows } = buildFinishTimeRows({
      raceInfo: { distance: 1600, track: '芝', condition: '良' },
      simResults,
      finishOrderIds: [0, 1, 2],
      goalFinishedAtById,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0].marginLabel).toBe('—');
    expect(rows[1].timeSec - rows[0].timeSec).toBeCloseTo(0.35, 2);
    expect(rows[1].marginLabel).toBe('1 3/4');
    expect(rows[2].timeSec - rows[1].timeSec).toBeCloseTo(0.4, 2);
    expect(rows[2].marginLabel).toBe('2');
  });

  it('deriveGoalFinishedAtFromRecording', () => {
    const map = deriveGoalFinishedAtFromRecording([
      { kind: 'transition', elapsedMs: 100 },
      {
        kind: 'goal',
        elapsedMs: 500,
        goalRankOrderSnapshot: [2],
        horses: [{ id: 2, goalFinishedAtRaceMs: 120 }],
      },
      {
        kind: 'goal',
        elapsedMs: 800,
        goalRankOrderSnapshot: [2, 5],
        horses: [
          { id: 2, goalFinishedAtRaceMs: 120 },
          { id: 5, goalFinishedAtRaceMs: 280 },
        ],
      },
    ]);
    expect(map.get(2)).toBe(120);
    expect(map.get(5)).toBe(280);
  });

  it('baseline scales with distance', () => {
    const s16 = getBaselineWinnerTimeSec({ distance: 1600, track: '芝', condition: '良' });
    const s24 = getBaselineWinnerTimeSec({ distance: 2400, track: '芝', condition: '良' });
    expect(s24).toBeGreaterThan(s16);
  });

  it('resolveVenueKey / resolveSurfaceKey', () => {
    expect(resolveVenueKey('東京競馬場')).toBe('tokyo');
    expect(resolveVenueKey('中山')).toBe('nakayama');
    expect(resolveSurfaceKey('ダート')).toBe('dirt');
    expect(resolveSurfaceKey('芝')).toBe('turf');
  });

  it('interpolateDistanceBaselineSec: 2400m アンカー', () => {
    const sec = interpolateDistanceBaselineSec(
      finishTimeBaseline.turf.anchors,
      2400,
    );
    expect(sec).toBeCloseTo(141.9, 1);
  });

  it('東京 2400m 芝 G1 良は東京優駿の記録付近', () => {
    const sec = getBaselineWinnerTimeSec({
      distance: 2400,
      track: '芝',
      condition: '良',
      venue: '東京競馬場',
      grade: 'G1',
    });
    expect(sec).toBeCloseTo(141.9, 1);
  });

  it('競馬場オフセット: 中山は東京より遅い（芝2400）', () => {
    const tokyo = getBaselineWinnerTimeSec({
      distance: 2400,
      track: '芝',
      condition: '良',
      venue: '東京',
      grade: 'G1',
    });
    const nakayama = getBaselineWinnerTimeSec({
      distance: 2400,
      track: '芝',
      condition: '良',
      venue: '中山競馬場',
      grade: 'G1',
    });
    expect(nakayama).toBeGreaterThan(tokyo);
    expect(nakayama - tokyo).toBeCloseTo(0.55, 2);
  });

  it('芝は同距離のダートより速い基準', () => {
    const turf = getBaselineWinnerTimeSec({
      distance: 2000,
      track: '芝',
      condition: '良',
      venue: '東京',
      grade: 'G1',
    });
    const dirt = getBaselineWinnerTimeSec({
      distance: 2000,
      track: 'ダート',
      condition: '良',
      venue: '東京',
      grade: 'G1',
    });
    expect(turf).toBeLessThan(dirt);
  });
});
