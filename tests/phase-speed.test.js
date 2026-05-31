import { describe, expect, it } from 'vitest';
import { resolvePhaseSpeed } from '../src/engine/phase-speed.js';
import {
  createPhaseContext,
  getLaunchBlend,
  getSettleBlend,
  getPaceIntroBlend,
  getKickBlend,
} from '../src/engine/phase-context.js';
import { buildPhases } from '../src/engine/phase.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const courses = JSON.parse(readFileSync(join(ROOT, 'src/data/courses.json'), 'utf8'));

describe('phase-speed', () => {
  it('launch 期は S_formation が主', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
    const phases = buildPhases(2400, course);
    const ctx = createPhaseContext(2400, course, phases);
    const home = phases.find(p => p.segmentId === 'home');
    const horse = { S_formation: 50, S_pace: 80, S_kick: 90, S_cruise: 80 };
    expect(getLaunchBlend(home, ctx)).toBe(1);
    expect(resolvePhaseSpeed(horse, home, ctx)).toBeCloseTo(50, 1);
  });

  it('settle 期も S_formation', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
    const phases = buildPhases(2400, course);
    const ctx = createPhaseContext(2400, course, phases);
    const corner1 = phases.find(p => p.segmentId === 'corner1');
    const horse = { S_formation: 50, S_pace: 80, S_kick: 90, S_cruise: 80 };
    expect(getSettleBlend(corner1, ctx)).toBe(1);
    expect(resolvePhaseSpeed(horse, corner1, ctx)).toBeCloseTo(50, 1);
  });

  it('pace 導入期は S_pace へブレンド', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
    const phases = buildPhases(2400, course);
    const ctx = createPhaseContext(2400, course, phases);
    const back = phases.find(p => p.segmentId === 'back');
    const horse = { S_formation: 50, S_pace: 80, S_kick: 95, S_cruise: 80 };
    expect(getPaceIntroBlend(back, ctx)).toBe(1);
    expect(resolvePhaseSpeed(horse, back, ctx)).toBeCloseTo(80, 1);
  });

  it('キック期は S_kick が主', () => {
    const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
    const phases = buildPhases(2400, course);
    const ctx = createPhaseContext(2400, course, phases);
    const final = phases.find(p => p.segmentId === 'final');
    const horse = { S_formation: 50, S_pace: 80, S_kick: 95, S_cruise: 80 };
    expect(getKickBlend(final, ctx)).toBe(1);
    expect(resolvePhaseSpeed(horse, final, ctx)).toBeCloseTo(95, 1);
  });
});
