import { describe, expect, it } from 'vitest';
import { buildPhases } from '../src/engine/phase.js';
import {
  createPhaseContext,
  getLaunchBlend,
  getSettleBlend,
  getStyleBlend,
  getKickBlend,
  getPaceIntroBlend,
  resolveFormationEndProgress,
  resolveSimBoundaries,
  isRearPelotonForwardExempt,
  isLaunchPhase,
} from '../src/engine/phase-context.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const courses = JSON.parse(readFileSync(join(ROOT, 'src/data/courses.json'), 'utf8'));

describe('phase-context', () => {
  it('progressStart/End が距離累計で付与される', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
    const phases = buildPhases(2400, course);
    expect(phases[0].progressStart).toBe(0);
    expect(phases[phases.length - 1].progressEnd).toBeCloseTo(1, 5);
    expect(phases[1].progressStart).toBeCloseTo(0.06, 3);
  });

  it('東京2400: launch→settle→pace→kick', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
    const phases = buildPhases(2400, course);
    const ctx = createPhaseContext(2400, course, phases);
    const start = phases.find(p => p.segmentId === 'start');
    const home = phases.find(p => p.segmentId === 'home');
    const corner1 = phases.find(p => p.segmentId === 'corner1');
    const corner2 = phases.find(p => p.segmentId === 'corner2');
    const corner4 = phases.find(p => p.segmentId === 'corner4');

    expect(getLaunchBlend(start, ctx)).toBe(1);
    expect(getLaunchBlend(home, ctx)).toBe(1);
    expect(getLaunchBlend(corner1, ctx)).toBe(0);
    expect(getSettleBlend(corner1, ctx)).toBe(1);
    expect(getSettleBlend(corner2, ctx)).toBe(0);
    expect(getStyleBlend(corner2, ctx)).toBe(0);
    expect(getPaceIntroBlend(corner2, ctx)).toBeGreaterThan(0);
    expect(getPaceIntroBlend(corner2, ctx)).toBeLessThan(1);
    expect(getKickBlend(corner4, ctx)).toBe(1);
  });

  it('ワンターン: launch=2セグメント、settle=corner3', () => {
    const course = courses.courses.find(c => c.id === 'generic_one_turn');
    const phases = buildPhases(2000, course);
    const ctx = createPhaseContext(2000, course, phases);
    const back = phases.find(p => p.segmentId === 'back');
    const corner3 = phases.find(p => p.segmentId === 'corner3');
    const corner4 = phases.find(p => p.segmentId === 'corner4');

    expect(getLaunchBlend(back, ctx)).toBe(1);
    expect(getSettleBlend(corner3, ctx)).toBe(1);
    expect(getSettleBlend(corner4, ctx)).toBe(0);
    expect(getPaceIntroBlend(corner4, ctx)).toBeGreaterThan(0);
  });

  it('東京芝1600: launch=スタート+向正面、settle=corner3', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_1600');
    const phases = buildPhases(1600, course);
    const ctx = createPhaseContext(1600, course, phases);
    const start = phases.find(p => p.segmentId === 'start');
    const back = phases.find(p => p.segmentId === 'back');
    const corner3 = phases.find(p => p.segmentId === 'corner3');
    const corner4 = phases.find(p => p.segmentId === 'corner4');
    const final = phases.find(p => p.segmentId === 'final');

    expect(getLaunchBlend(start, ctx)).toBe(1);
    expect(getLaunchBlend(back, ctx)).toBe(1);
    expect(getLaunchBlend(corner3, ctx)).toBe(0);
    expect(getSettleBlend(corner3, ctx)).toBe(1);
    expect(getSettleBlend(corner4, ctx)).toBe(0);
    expect(getKickBlend(final, ctx)).toBe(1);
    expect(phases).toHaveLength(5);
    expect(start.ratio).toBe(0);
    expect(back.ratio).toBeCloseTo(0.08, 3);
  });

  it('コース未定義フェーズは距離・構造から境界を推定する', () => {
    const phases = buildPhases(1600, null);
    const ctx = createPhaseContext(1600, null, phases);
    const bounds = resolveSimBoundaries(1600, null, phases);

    expect(bounds.launchEndProgress).toBeGreaterThan(0);
    expect(bounds.settleEndProgress).toBeGreaterThanOrEqual(bounds.launchEndProgress);
    expect(bounds.paceStartProgress).toBeGreaterThanOrEqual(bounds.settleEndProgress);
    expect(getLaunchBlend(phases[0], ctx)).toBe(1);
    expect(getKickBlend(phases[phases.length - 1], ctx)).toBe(1);
  });

  it('legacy formation simRole を launch/settle に分割する', () => {
    const legacyCourse = {
      segments: [
        { id: 'start', kind: 'start', simRole: 'formation', ratio: 0.1 },
        { id: 'home', kind: 'straight', simRole: 'formation', ratio: 0.2 },
        { id: 'c1', kind: 'corner', simRole: 'formation', ratio: 0.2 },
        { id: 'back', kind: 'straight', simRole: 'pace', ratio: 0.5 },
      ],
    };
    const phases = buildPhases(2000, legacyCourse);
    const ctx = createPhaseContext(2000, legacyCourse, phases);
    expect(getLaunchBlend(phases[0], ctx)).toBe(1);
    expect(getLaunchBlend(phases[1], ctx)).toBe(1);
    expect(getSettleBlend(phases[2], ctx)).toBe(1);
    expect(getPaceIntroBlend(phases[3], ctx)).toBe(1);
  });

  it('launch 中: 差し・追込は前方ブロック免除されない', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
    const phases = buildPhases(2400, course);
    const ctx = createPhaseContext(2400, course, phases);
    const start = phases.find(p => p.segmentId === 'start');
    const horses = [
      { id: 1, style: '逃げ', x: 0 },
      { id: 2, style: '差し', x: 2 },
    ];
    expect(isLaunchPhase(start, ctx)).toBe(true);
    expect(isRearPelotonForwardExempt(horses[0], horses, start, ctx)).toBe(true);
    expect(isRearPelotonForwardExempt(horses[1], horses, start, ctx)).toBe(false);
  });

  it('settleEndProgress は corner1 終端と一致する', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
    const phases = buildPhases(2400, course);
    const end = resolveFormationEndProgress(2400, course, phases);
    const corner1 = phases.find(p => p.segmentId === 'corner1');
    expect(end).toBeCloseTo(corner1.progressEnd, 5);
  });
});
