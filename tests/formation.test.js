import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng.js';
import {
  initFormationTarget,
  getFormationOrderBias,
  calcFormationAdvanceMult,
  calcFormationRangeOffset,
  resolveFormationRankNorm,
  STYLE_FORMATION_TARGET_RANK,
  enforceFrontRunnerAheadOfClosers,
} from '../src/engine/formation.js';

describe('formation', () => {
  it('脚質レンジ内でレースごとに formationTargetRank が変わる', () => {
    const horseA = { style: '先行', ave3f: 35.0 };
    const horseB = { style: '先行', ave3f: 35.0 };
    initFormationTarget(horseA, createRng(1));
    initFormationTarget(horseB, createRng(999));
    const range = STYLE_FORMATION_TARGET_RANK['先行'];
    expect(horseA.formationTargetRank).toBeGreaterThanOrEqual(range.min);
    expect(horseA.formationTargetRank).toBeLessThanOrEqual(range.max);
    expect(horseB.formationTargetRank).toBeGreaterThanOrEqual(range.min);
    expect(horseB.formationTargetRank).toBeLessThanOrEqual(range.max);
    expect(horseA.formationTargetRank).not.toBe(horseB.formationTargetRank);
  });

  it('目標より後方にいるほど序盤スコアが上がる', () => {
    const horse = { formationTargetRank: 0.2 };
    const frontBias = getFormationOrderBias(horse, 0.85, 0.9);
    const backBias = getFormationOrderBias(horse, 0.15, 0.9);
    expect(backBias).toBeGreaterThan(frontBias);
  });

  it('settle 期: 差し・追込の前出しは advanceMult が下がる', () => {
    const oikomi = { style: '追込' };
    const frontOikomi = calcFormationAdvanceMult(0.92, oikomi, 0, 0.9);
    const midOikomi = calcFormationAdvanceMult(0.35, oikomi, 0, 0.9);
    expect(frontOikomi).toBeLessThan(midOikomi);
  });

  it('settle 期: 逃げ・先行の前目は維持ボーナス', () => {
    const nige = { style: '逃げ', formationTargetRank: 0.1 };
    const frontNige = calcFormationAdvanceMult(0.95, nige, 0, 0.9);
    const oikomi = { style: '追込' };
    const frontOikomi = calcFormationAdvanceMult(0.92, oikomi, 0, 0.9);
    expect(frontNige).toBeGreaterThan(1);
    expect(frontNige).toBeGreaterThan(frontOikomi);
  });

  it('launch 期: 差し・追込の前出しは advanceMult が下がる', () => {
    const sashi = { style: '差し' };
    const frontSashi = calcFormationAdvanceMult(0.95, sashi, 0.9, 0);
    const midSashi = calcFormationAdvanceMult(0.35, sashi, 0.9, 0);
    expect(frontSashi).toBeLessThan(midSashi);
    expect(frontSashi).toBeLessThan(1);
  });

  it('launch 期: 逃げが後方にいると追い上げボーナス', () => {
    const nige = { style: '逃げ', formationTargetRank: 0.08 };
    const frontNige = calcFormationAdvanceMult(0.92, nige, 0.9, 0);
    const rearNige = calcFormationAdvanceMult(0.55, nige, 0.9, 0);
    expect(rearNige).toBeGreaterThan(frontNige);
    expect(rearNige).toBeGreaterThan(1.05);
  });

  it('launch 期: 先行が後方にいると追い上げボーナス', () => {
    const senkou = { style: '先行', formationTargetRank: 0.22 };
    const frontSenkou = calcFormationAdvanceMult(0.86, senkou, 0.9, 0);
    const rearSenkou = calcFormationAdvanceMult(0.45, senkou, 0.9, 0);
    expect(rearSenkou).toBeGreaterThan(frontSenkou);
    expect(rearSenkou).toBeGreaterThan(1.03);
  });

  it('隊列が固まっているときは目標順位で判定する', () => {
    const horse = { formationTargetRank: 0.12, x: 5 };
    const clustered = [{ id: 1, x: 0 }, { id: 2, x: 5 }];
    expect(resolveFormationRankNorm(horse, 0.95, clustered)).toBeCloseTo(0.12, 5);
  });

  it('隊列が広がったら実位置で判定する', () => {
    const horse = { formationTargetRank: 0.12, x: 5 };
    const spread = [{ id: 1, x: 0, formationTargetRank: 0.12 }, { id: 2, x: 200, formationTargetRank: 0.12 }];
    expect(resolveFormationRankNorm(horse, 0, spread)).toBeCloseTo(1, 5);
  });

  it('max より後ろでも advanceMult が極端に落ちない', () => {
    const nige = { style: '逃げ', formationTargetRank: 0.1, x: 1 };
    const clustered = [{ id: 1, x: 0 }, { id: 2, x: 1 }];
    const mult = calcFormationAdvanceMult(0.05, nige, 0, 0.9, clustered);
    expect(mult).toBeGreaterThan(0.5);
  });

  it('先行が差し・追込より後ろに付いたら補正される', () => {
    const senkou = { id: 1, style: '先行', x: 100, y: 3 };
    const sashi = { id: 2, style: '差し', x: 130, y: 3.5 };
    const horses = [senkou, sashi];
    enforceFrontRunnerAheadOfClosers(horses, 38);
    expect(senkou.x).toBeGreaterThan(100);
    expect(senkou.x).toBeGreaterThanOrEqual(sashi.x - 38);
  });

  it('出遅れは max を拡大する', () => {
    const horse = { style: '逃げ', startEventType: 'slow' };
    const normal = calcFormationRangeOffset(0.45, { style: '逃げ' });
    const slow = calcFormationRangeOffset(0.45, horse);
    expect(slow.overRear).toBeLessThan(normal.overRear);
  });
});
