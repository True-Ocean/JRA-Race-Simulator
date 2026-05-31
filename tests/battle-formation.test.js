import { describe, expect, it } from 'vitest';
import {
  calcBattleEfficiency,
  getStyleBattleBonus,
  shouldSkipCornerBattleForFrontRunner,
  getFormationBattleRateMult,
} from '../src/engine/battle-formation.js';
import { createPhaseContext } from '../src/engine/phase-context.js';
import { buildPhases } from '../src/engine/phase.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const courses = JSON.parse(readFileSync(join(ROOT, 'src/data/courses.json'), 'utf8'));

describe('battle-formation', () => {
  const course = courses.courses.find(c => c.id === 'tokyo_turf_2400');
  const phases = buildPhases(2400, course);
  const ctx = createPhaseContext(2400, course, phases);
  const home = phases.find(p => p.segmentId === 'home');
  home._phaseCtx = ctx;

  it('形成期は逃げに脚質ボーナスが付く', () => {
    const nige = { style: '逃げ', S_formation: 50, M_maneuv: 0, S_cruise: 60 };
    const sashi = { style: '差し', S_formation: 46, M_maneuv: 40, S_cruise: 70 };
    expect(getStyleBattleBonus(nige, home, ctx)).toBeGreaterThan(getStyleBattleBonus(sashi, home, ctx));
  });

  it('M_maneuv 0 でも形成期は S_formation で戦える', () => {
    const nige = { style: '逃げ', S_formation: 50, M_maneuv: 0, S_cruise: 60, J_reliability: 24 };
    const sashi = { style: '差し', S_formation: 46, M_maneuv: 40, S_cruise: 70, J_reliability: 50 };
    const nigeE = calcBattleEfficiency(nige, home, ctx, 0);
    const sashiE = calcBattleEfficiency(sashi, home, ctx, 0);
    expect(nigeE).toBeGreaterThan(sashiE);
  });

  it('逃げが前にいるコーナー争いはスキップ対象', () => {
    const nige = { style: '逃げ', x: 100 };
    const inner = { style: '先行', x: 98 };
    expect(shouldSkipCornerBattleForFrontRunner(nige, inner)).toBe(true);
  });

  it('逃げが前にいるとき後方からのバトル率を下げる', () => {
    const nige = { style: '逃げ', x: 100 };
    const chaser = { style: '先行', x: 85 };
    expect(getFormationBattleRateMult(chaser, nige, home, ctx)).toBeLessThan(0.6);
  });
});
