import { describe, expect, it } from 'vitest';
import { calcG1ClassScore, resolveGoalClassIndex } from '../src/engine/career-goal.js';
import { calcGoalCareerSpeedMult } from '../src/engine/goal-stamina-expression.js';

describe('career-goal（G1着順→ゴール指数）', () => {
  it('G1平均着順が良いほど g1_class_score が高い', () => {
    const strong = calcG1ClassScore({ runs: 2, wins: 2, avg_finish: 1.0 });
    const weak = calcG1ClassScore({ runs: 1, wins: 0, avg_finish: 10.0 });
    expect(strong).toBeGreaterThan(weak);
  });

  it('ロブチェン相当の career はゴール速度倍率が場内最高クラス', () => {
    const rob = resolveGoalClassIndex({
      class_index: 0.73,
      graded: { G1: { runs: 2, wins: 2, avg_finish: 1.0 } },
    });
    const avg = resolveGoalClassIndex({
      class_index: 0.35,
      graded: { G1: { runs: 1, wins: 0, avg_finish: 10.0 } },
    });
    expect(rob).toBeGreaterThan(0.85);
    expect(calcGoalCareerSpeedMult(rob) - calcGoalCareerSpeedMult(avg)).toBeGreaterThan(0.1);
  });
});
