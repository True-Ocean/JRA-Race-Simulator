import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSimulation } from '../src/engine/simulation.js';
import { loadDefaultRaceFixture } from './helpers/load-race-fixture.js';
import { makeMotionRenderer, assertNoBodyOverlap } from './helpers/motion-renderer.js';

afterEach(() => vi.unstubAllGlobals());

describe('道中は希望進路を尊重しつつ馬体の交差を防ぐ', () => {
  it('リサイズ・復帰でも新しい馬体寸法で重ならず、追加の再描画では動かない', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const renderer = makeMotionRenderer();
    renderer.ctx = { setTransform() {} };
    renderer.canvas = { parentElement: { clientWidth: 600, clientHeight: 450 } };
    const horses = Array.from({ length: 18 }, (_, i) => ({ id: i + 1, gate: i + 1,
      x: 135 - (i % 6) * 10, y: 2 + Math.floor(i / 6) }));
    const phase = { index: 1 };
    renderer.draw(horses, phase, 1);
    renderer._lastDraw = { horses, phase, phaseProgress: 1, options: {} };
    for (const [width, height] of [[600, 450], [232, 413], [400, 600], [900, 700]]) {
      Object.assign(renderer.canvas.parentElement, { clientWidth: width, clientHeight: height });
      renderer._resize();
      assertNoBodyOverlap(renderer.horseRenderState, null, renderer.cardW, renderer.cardH);
      const before = structuredClone([...renderer.horseRenderState]);
      renderer.redrawLast();
      expect([...renderer.horseRenderState]).toEqual(before);
      expect(renderer.cardW).toBeLessThanOrEqual(renderer.laneW * 0.72);
    }
  });

  it('タブ復帰の再描画だけでは馬を動かさない', () => {
    const renderer = makeMotionRenderer();
    const horses = [{ id: 1, x: 120, y: 3 }, { id: 2, x: 112, y: 3.1 }];
    const phase = { index: 1, ratio: 0.4, segmentId: 'back' };
    const options = { motionDtMs: 16.7, horseSmoothing: 1 };
    renderer.draw(horses, phase, 1, options);
    renderer._lastDraw = { horses, phase, phaseProgress: 1, options };
    const before = structuredClone([...renderer.horseRenderState]);
    for (let i = 0; i < 10; i++) renderer.redrawLast();
    expect([...renderer.horseRenderState]).toEqual(before);
  });

  it('同レーンではすり抜けも架空の横回避もせず、前走馬に追従する', () => {
    const renderer = makeMotionRenderer();
    const phase = { index: 1, segmentId: 'back' };
    for (let i = 0; i <= 120; i++) {
      const horses = [{ id: 1, x: 110 + i * 0.4, y: 3 }, { id: 2, x: 104 + i * 0.5, y: 3.1 }];
      const before = new Map(renderer.horseRenderState);
      renderer.draw(horses, phase, 1, { motionDtMs: 1000 / 60 });
      assertNoBodyOverlap(renderer.horseRenderState, before, renderer.cardW, renderer.cardH);
      for (const h of horses) {
        expect(renderer.horseRenderState.get(h.id).cx).toBeCloseTo(renderer.laneToX(h.y), 8);
      }
      expect(renderer.horseRenderState.get(1).cy).toBeLessThan(renderer.horseRenderState.get(2).cy);
    }
  });

  for (const [W, H] of [[232, 413], [400, 600], [900, 700]]) {
    for (const fps of [30, 60, 120]) {
      it.each([1, 7, 42, 99])(`実出走表 seed=%s・${W}×${H}・${fps}fps：ゲート〜道中の全補間で馬体が交差しない`, seed => {
        const renderer = makeMotionRenderer(W, H);
        const sim = runSimulation(loadDefaultRaceFixture(), { seed }, {}, renderer);
        renderer.draw(sim.snapshots[0].horses, sim.phases[0], 0);
        assertNoBodyOverlap(renderer.horseRenderState, null, renderer.cardW, renderer.cardH);
        for (let p = 0; p < sim.phases.length; p++) {
          const fromById = new Map((p === 0 ? sim.snapshots[0] : sim.snapshots[p - 1]).horses.map(h => [h.id, h]));
          for (let i = 1; i <= fps * 2; i++) {
            const t = i / (fps * 2);
            const horses = sim.snapshots[p].horses.map(to => {
              const from = fromById.get(to.id);
              return { ...to, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
            });
            const before = new Map(renderer.horseRenderState);
            renderer.draw(horses, sim.phases[p], p === 0 ? t : 1, { motionDtMs: 1000 / fps });
            assertNoBodyOverlap(renderer.horseRenderState, before, renderer.cardW, renderer.cardH,
              `seed=${seed} phase=${p} frame=${i}`);
            for (const h of horses) {
              const prev = before.get(h.id);
              const pose = renderer.horseRenderState.get(h.id);
              const wantedDx = renderer.laneToX(h.y) - prev.cx;
              const dx = pose.cx - prev.cx;
              expect(Math.abs(dx)).toBeLessThanOrEqual(renderer.laneW * 2 / fps + 1e-6);
              // 安全のため保留はするが、希望とは逆向きの横移動を作らない。
              expect(dx * wantedDx).toBeGreaterThanOrEqual(-1e-7);
              expect(prev.cy - pose.cy).toBeLessThanOrEqual(H * 0.8 / fps + 1e-6);
              expect(prev.cy - pose.cy).toBeLessThanOrEqual(
                Math.max(0, prev.baseCy - pose.baseCy) + renderer.cardH * 0.8 / fps + 1e-6);
            }
          }
        }
      });
    }
  }
});
