import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng.js';
import {
  initFormationTarget,
  getFormationOrderBias,
  STYLE_FORMATION_TARGET_RANK,
} from '../src/engine/formation.js';

describe('formation', () => {
  it('脚質レンジ内でレースごとに formationTargetRank が変わる', () => {
    const horseA = { style: '先行', ave3f: 35.0 };
    const horseB = { style: '先行', ave3f: 35.0 };
    initFormationTarget(horseA, createRng(1), 36, 2);
    initFormationTarget(horseB, createRng(999), 36, 2);
    const range = STYLE_FORMATION_TARGET_RANK['先行'];
    expect(horseA.formationTargetRank).toBeGreaterThanOrEqual(range.min);
    expect(horseA.formationTargetRank).toBeLessThanOrEqual(range.max);
    expect(horseB.formationTargetRank).toBeGreaterThanOrEqual(range.min);
    expect(horseB.formationTargetRank).toBeLessThanOrEqual(range.max);
    expect(horseA.formationTargetRank).not.toBe(horseB.formationTargetRank);
  });

  it('目標より後方にいるほど序盤スコアが上がる', () => {
    const horse = { formationTargetRank: 0.2 };
    const frontBias = getFormationOrderBias(horse, 0.15, 0.1);
    const backBias = getFormationOrderBias(horse, 0.55, 0.1);
    expect(backBias).toBeGreaterThan(frontBias);
  });
});
