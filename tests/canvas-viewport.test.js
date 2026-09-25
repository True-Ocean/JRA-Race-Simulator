import { describe, it, expect } from 'vitest';
import {
  clampAnimationDtMs,
  isDocumentHidden,
  MAX_ANIMATION_FRAME_MS,
  scaleHorseRenderPositions,
  shouldApplyCanvasResize,
} from '../src/ui/canvas-viewport.js';

describe('canvas-viewport', () => {
  it('レイアウト未確定の 0 サイズはリサイズしない', () => {
    expect(shouldApplyCanvasResize(null, { w: 0, h: 400, dpr: 2 })).toBe(false);
    expect(shouldApplyCanvasResize(null, { w: 300, h: 1, dpr: 2 })).toBe(false);
  });

  it('幅・高さ・DPR が同じならビットマップを張り替えない', () => {
    const prev = { w: 360, h: 640, dpr: 2 };
    expect(shouldApplyCanvasResize(prev, { w: 360, h: 640, dpr: 2 })).toBe(false);
    expect(shouldApplyCanvasResize(prev, { w: 360, h: 641, dpr: 2 })).toBe(false);
    expect(shouldApplyCanvasResize(prev, { w: 360, h: 644, dpr: 2 })).toBe(true);
    expect(shouldApplyCanvasResize(prev, { w: 360, h: 640, dpr: 3 })).toBe(true);
  });

  it('初回の有効サイズは適用する', () => {
    expect(shouldApplyCanvasResize({ w: 0, h: 0, dpr: 0 }, { w: 360, h: 640, dpr: 2 })).toBe(true);
  });

  it('巨大な経過時間は 1 フレーム分にクランプする', () => {
    expect(clampAnimationDtMs(12_000)).toBe(MAX_ANIMATION_FRAME_MS);
    expect(clampAnimationDtMs(16)).toBe(16);
    expect(clampAnimationDtMs(-8)).toBe(0);
    expect(clampAnimationDtMs(Number.NaN)).toBe(0);
  });

  it('リサイズ時は馬座標をスケールし、極端な変化では破棄する', () => {
    const state = new Map([
      [1, { cx: 100, cy: 200, baseCy: 180 }],
    ]);
    scaleHorseRenderPositions(state, 200, 400, 400, 800);
    expect(state.get(1)).toEqual({ cx: 200, cy: 400, baseCy: 360 });

    scaleHorseRenderPositions(state, 400, 800, 40, 80);
    expect(state.size).toBe(0);
  });

  it('document.hidden を判定できる', () => {
    expect(isDocumentHidden({ hidden: true })).toBe(true);
    expect(isDocumentHidden({ hidden: false })).toBe(false);
    expect(isDocumentHidden(null)).toBe(false);
  });
});
