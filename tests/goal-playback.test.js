import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhaseController } from '../src/ui/phase-controller.js';
import { makeMotionRenderer, assertNoBodyOverlap } from './helpers/motion-renderer.js';
import { runSimulation } from '../src/engine/simulation.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';
import * as goalStamina from '../src/engine/goal-stamina-expression.js';
import * as laneDecision from '../src/engine/lane-decision.js';
import { GOAL_PLAYBACK_RATE, GOAL_SCENE_TRANSITION_MS } from '../src/engine/constants.js';

const playbackConfig = vi.hoisted(() => ({ override: null }));
vi.mock('../src/engine/constants.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, get GOAL_PLAYBACK_RATE() { return playbackConfig.override ?? actual.GOAL_PLAYBACK_RATE; } };
});

/** DOMとCanvas出力だけを代替し、本番のゴールAI・消費・通過判定を最後まで実行。 */
function playGoal(race, sim, fps = 60, playbackHooks = {}, viewport = [900, 700]) {
  const element = () => ({ textContent: '', style: {}, appendChild() {}, scrollTop: 0 });
  vi.stubGlobal('document', {
    hidden: false, visibilityState: 'visible',
    getElementById: () => element(), createElement: element, querySelector: () => null,
  });
  const callbacks = [];
  vi.stubGlobal('requestAnimationFrame', fn => { callbacks.push(fn); return callbacks.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const frames = [];
  const renderer = makeMotionRenderer(...viewport);
  renderer.draw(sim.snapshots.at(-1).horses, sim.phases.at(-1), 1);
  let previousPoses;
  let drawnHorses;
  renderer.draw = (horses, phase, progress, options) => {
    renderer._drawHorses(horses, phase, progress, false, options);
    if (!options.goalRun) return;
    assertNoBodyOverlap(renderer.horseRenderState, previousPoses, renderer.cardW, renderer.cardH);
    previousPoses = new Map(renderer.horseRenderState);
    drawnHorses = horses;
  };
  const controller = new PhaseController(
    sim.snapshots, sim.phases, renderer, [], new Map(), sim.results,
    { raceId: race.race_id, raceInfo: race.race_info, raceSeed: sim.seed, ...playbackHooks },
  );
  let done = false;
  let firstFinishWallMs = null;
  controller._playGoalApproach(() => { done = true; });
  for (let i = 0; i < fps * 90 && !done; i++) {
    const current = callbacks.splice(0);
    for (const cb of current) cb(i * 1000 / fps);
    if (firstFinishWallMs == null && controller._goalRankOrder.length > 0) firstFinishWallMs = i * 1000 / fps;
    if (drawnHorses) {
      frames.push(drawnHorses.map(h => ({ ...h })));
      for (const h of drawnHorses) {
        if (h.goalFinished && !playbackHooks.isReplayPlayback) {
          const nose = renderer.horseRenderState.get(h.id).cy - renderer.cardH * 0.49;
          expect(nose).toBeLessThanOrEqual(renderer.H * 0.08 + 1e-6);
        }
      }
    }
  }
  expect(done, JSON.stringify({ seed: sim.seed, stuck: controller.lastRenderedHorses?.filter(h => !h.goalFinished)
    .map(h => ({ id: h.id, x: h.x, y: h.y, target: h.targetLane, mps: h.goalCurrentMps, meters: h.goalMeters })) })).toBe(true);
  return { controller, frames, renderer, horses: controller.lastRenderedHorses, firstFinishWallMs };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  playbackConfig.override = null;
});

function withGoalHorses(sim, horses) {
  return { ...sim, results: horses, snapshots: [{ horses }], phases: [sim.phases.at(-1)] };
}

describe('ゴール実再生の余力と完走', () => {
  it('15%速い表示でも、走行時間・能力・余力の関係を変えない', () => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    const horse = { ...sim.results[0], stamina: sim.results[0].initialStamina * 0.5,
      y: 2, raceEffort: 1, battleFatigue: 0, eventFatigueScore: 0 };
    const isolated = withGoalHorses(sim, [horse]);
    playbackConfig.override = 1;
    const normal = playGoal(race, isolated);
    playbackConfig.override = null;
    const faster = playGoal(race, isolated);
    const goalWallTime = run => run.firstFinishWallMs - GOAL_SCENE_TRANSITION_MS / 2;
    expect(GOAL_PLAYBACK_RATE).toBe(1.15);
    expect(goalWallTime(faster) / goalWallTime(normal)).toBeCloseTo(1 / 1.15, 2);
    expect(Math.abs(faster.horses[0].goalFinishedAtRaceMs - normal.horses[0].goalFinishedAtRaceMs)).toBeLessThan(50);
    expect(Math.abs(faster.horses[0].stamina - normal.horses[0].stamina)).toBeLessThan(0.2);
    if (process.env.GOAL_TEST_REPORT) {
      console.info('再生テンポ変更前後', [normal, faster].map(run => ({
        goalWallMs: goalWallTime(run), raceFinishMs: run.horses[0].goalFinishedAtRaceMs,
        stamina: run.horses[0].stamina,
      })));
    }
  });

  for (const viewport of [[232, 413], [400, 600], [900, 700]]) {
    for (const fps of [30, 60, 120]) {
      it.each([1, 42, 99])(`${viewport.join('×')}・${fps}fps・seed=%s：接触せず全馬が画面外まで走り抜ける`, seed => {
        const race = loadDefaultRaceFixture();
        const sim = runSimulation(race, { seed });
        const run = playGoal(race, sim, fps, {}, viewport);
        expect(run.horses.every(h => h.goalFinished)).toBe(true);
        for (const pose of run.renderer.horseRenderState.values()) {
          expect(pose.cy + run.renderer.cardH / 2).toBeLessThan(-2);
        }
      });
    }
  }

  it('密集した18頭が同じ進路を保っても、先着馬が画面外で止まらず後続も通過できる', () => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    const source = sim.results[0];
    const horses = Array.from({ length: 18 }, (_, i) => ({ ...source, id: i + 1,
      x: 150 - i * 2, y: 2, stamina: source.initialStamina * 0.4, raceEffort: 1 }));
    vi.spyOn(PhaseController.prototype, '_planGoalRouteV2')
      .mockImplementation((pack, h) => ({ lane: h.y, gain: 0, pressure: 0 }));
    const run = playGoal(race, withGoalHorses(sim, horses));
    expect(run.controller._goalRankOrder).toEqual(horses.map(h => h.id));
    expect(run.horses.every(h => h.goalFinished)).toBe(true);
  });

  it('脚を残した馬は瞬間移動せず加速し、追加の余力を使って従来より早く通過する', () => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    const h = { ...sim.results[0], stamina: sim.results[0].initialStamina * 0.5,
      y: 2, raceEffort: 1, battleFatigue: 0, eventFatigueScore: 0 };
    const isolated = withGoalHorses(sim, [h]);
    const baselineBoost = vi.spyOn(goalStamina, 'calcGoalReserveBoost').mockReturnValue(0);
    const baseline = playGoal(race, isolated);
    baselineBoost.mockRestore();
    const sprint = playGoal(race, isolated);
    const peak = run => Math.max(...run.frames.filter(f => !f[0].goalFinished).map(f => f[0].goalCurrentMps));
    expect(sprint.frames[0][0].goalCurrentMps).toBe(baseline.frames[0][0].goalCurrentMps);
    expect(peak(sprint)).toBeGreaterThan(peak(baseline) * 1.08);
    expect(peak(sprint)).toBeLessThan(peak(baseline) * 1.15);
    expect(sprint.horses[0].goalFinishedAtRaceMs).toBeLessThan(baseline.horses[0].goalFinishedAtRaceMs * 0.96);
    expect(sprint.horses[0].stamina).toBeLessThan(baseline.horses[0].stamina);
    for (let i = 1; i < sprint.frames.length; i++) {
      if (sprint.frames[i][0].goalFinished) break;
      const delta = sprint.frames[i][0].goalCurrentMps - sprint.frames[i - 1][0].goalCurrentMps;
      expect(Math.abs(delta)).toBeLessThan(0.15 * GOAL_PLAYBACK_RATE);
    }
    if (process.env.GOAL_TEST_REPORT) {
      console.info('単走・開始余力50%の比較', [baseline, sprint].map(run => ({
        peakMps: peak(run), finishMs: run.horses[0].goalFinishedAtRaceMs,
        remainingPct: run.horses[0].stamina / h.initialStamina * 100,
      })));
    }
  });

  it('余力があっても閉じた進路では前走馬を突き抜けない', () => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    const source = sim.results[0];
    const front = { ...source, id: 100, x: 100, y: 2, stamina: source.initialStamina * 0.15 };
    const behind = { ...source, id: 101, x: 70, y: 2, stamina: source.initialStamina * 0.6 };
    vi.spyOn(laneDecision, 'assignStretchFanLanesForPack').mockImplementation(() => {});
    vi.spyOn(PhaseController.prototype, '_planGoalRouteV2')
      .mockImplementation((pack, h) => ({ lane: h.y, gain: 0, pressure: 0 }));
    const { frames, controller } = playGoal(race, withGoalHorses(sim, [front, behind]));
    const gap = controller._getGoalBodyGapX();
    let constrainedFrames = 0;
    for (const frame of frames) {
      const lead = frame.find(h => h.id === front.id);
      const follower = frame.find(h => h.id === behind.id);
      if (lead.goalFinished) break;
      expect(lead.x - follower.x).toBeGreaterThanOrEqual(gap - 1e-6);
      if (lead.x - follower.x < gap + 1) constrainedFrames++;
    }
    expect(constrainedFrames).toBeGreaterThan(60);
  });

  it('保存記録のないリプレイを新しいゴール計算に置き換えない', () => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    expect(() => playGoal(race, sim, 60, { isReplayPlayback: true, goalRecording: null }))
      .toThrow('ゴールの再計算は行いません');
  });

  it('同じ出走表でも走行ごとの乱数で展開と実着順が変わり得る', () => {
    const race = loadDefaultRaceFixture();
    const runs = [1, 7, 42, 99, 20260523].map(seed => {
      const sim = runSimulation(race, { seed });
      const { controller } = playGoal(race, sim);
      return { order: controller._goalRankOrder, snapshots: sim.snapshots };
    });
    expect(new Set(runs.map(r => r.order.join(','))).size).toBeGreaterThan(1);
    expect(new Set(runs.map(r => r.order[0])).size).toBeGreaterThan(1);
    expect(new Set(runs.map(r => JSON.stringify(r.snapshots))).size).toBe(runs.length);
  }, 15000); // 5走すべての毎フレーム接触検査を含むため、単走用の既定5秒とは分ける。

  it.each([30, 60, 120])('リプレイは%s fpsでも記録した着順・余力・通過時刻・安全な終点を再現する', fps => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    const live = playGoal(race, sim, 60, { recordGoalPlayback: true });
    const replay = playGoal(race, sim, fps, {
      isReplayPlayback: true,
      goalRecording: live.controller._pendingGoalRecording,
      raceSeed: 999, // リプレイは再抽選してはいけない。
    });
    expect(replay.controller._goalRankOrder).toEqual(live.controller._goalRankOrder);
    const signature = run => run.horses.map(h => [h.id, h.stamina, h.goalFinishedAtRaceMs]);
    expect(signature(replay)).toEqual(signature(live));
    expect(Math.abs(replay.firstFinishWallMs - live.firstFinishWallMs)).toBeLessThan(50);
    for (const [id, pose] of live.renderer.horseRenderState) {
      expect(replay.renderer.horseRenderState.get(id).cx).toBeCloseTo(pose.cx, 5);
      expect(replay.renderer.horseRenderState.get(id).cy).toBeCloseTo(pose.cy, 5);
    }
  });

  it('再生倍率のない旧記録は、現在の15%増速を重ねず当時のテンポで再生する', () => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    playbackConfig.override = 1;
    const original = playGoal(race, sim, 60, { recordGoalPlayback: true });
    const legacyRecording = original.controller._pendingGoalRecording.map(frame => {
      const copy = { ...frame };
      delete copy.playbackRate;
      return copy;
    });
    playbackConfig.override = null;
    const replay = playGoal(race, sim, 60, { isReplayPlayback: true, goalRecording: legacyRecording });
    expect(Math.abs(replay.firstFinishWallMs - original.firstFinishWallMs)).toBeLessThan(50);
    expect(replay.controller._goalRankOrder).toEqual(original.controller._goalRankOrder);
  });

  it('全馬が完走し、残量が増えず、疲れた先行勢と脚を残した差し馬の差が残る', () => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    const { frames, horses, controller } = playGoal(race, sim);
    expect(controller._goalRankOrder).toHaveLength(race.entries.length);
    for (let i = 1; i < frames.length; i++) {
      const prev = new Map(frames[i - 1].map(h => [h.id, h]));
      for (const h of frames[i]) {
        expect(h.stamina).toBeGreaterThanOrEqual(0);
        expect(h.stamina).toBeLessThanOrEqual(prev.get(h.id).stamina + 1e-8);
        expect(h.goalMeters).toBeGreaterThanOrEqual(prev.get(h.id).goalMeters - 1e-8);
        expect(Number.isFinite(h.goalCurrentMps)).toBe(true);
      }
    }
    expect(horses.filter(h => h.stamina / h.initialStamina <= 0.33).length)
      .toBeGreaterThanOrEqual(Math.ceil(horses.length * 0.75));
    const mean = list => list.reduce((s, h) => s + h.stamina / h.initialStamina, 0) / list.length;
    expect(mean(horses.filter(h => h.style === '差し')))
      .toBeGreaterThan(mean(horses.filter(h => h.style === '逃げ')));
  });

  it.each([0.15, 0.5])('開始余力%sの単走では30/60/120fpsでも通過時刻と残量がほぼ一致する', (ratio) => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    const horse = { ...sim.results[0], stamina: sim.results[0].initialStamina * ratio };
    const isolated = withGoalHorses(sim, [horse]);
    const runs = [30, 60, 120].map(fps => playGoal(race, isolated, fps).horses[0]);
    for (const h of runs) {
      expect(Math.abs(h.stamina - runs[1].stamina)).toBeLessThan(0.25);
      expect(Math.abs(h.goalFinishedAtRaceMs - runs[1].goalFinishedAtRaceMs)).toBeLessThan(80);
    }
  });

  it('余力ゼロの単走馬も、予定尺後に不自然に加速せず完走する', () => {
    const race = loadDefaultRaceFixture();
    const sim = runSimulation(race, { seed: 42 });
    const h = { ...sim.results[0], stamina: 0, y: 2, raceEffort: 1 };
    const isolated = { ...sim, results: [h], snapshots: [{ horses: [h] }], phases: [sim.phases.at(-1)] };
    const { frames } = playGoal(race, isolated);
    for (const frame of frames.filter(f => !f[0].goalFinished && f[0].goalMeters > 100)) {
      expect(frame[0].goalCurrentMps).toBeLessThan(frame[0].goalIntrinsicMps);
    }
  });
});
