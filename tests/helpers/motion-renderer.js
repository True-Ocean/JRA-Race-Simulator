import { expect } from 'vitest';
import { Renderer } from '../../src/ui/renderer.js';

// Canvas出力だけを省略し、本番の寸法・位置計算・連続衝突判定をそのまま動かす。
export function makeMotionRenderer(W = 400, H = 600) {
  const RAIL_MARGIN = Math.max(22, W * 0.045);
  const laneW = (W - RAIL_MARGIN * 2) / 18;
  const cardW = Math.min(Math.max(14, laneW * 0.6), laneW * 0.72);
  return Object.assign(Object.create(Renderer.prototype), {
    W, H, RAIL_MARGIN, laneW, cardW, cardH: cardW * 2.5,
    innerRailSide: 'right', horseRenderState: new Map(),
    _drawCard() {},
    draw(horses, phase, progress, options = {}) {
      this._drawHorses(horses, phase, progress, Boolean(options.forceStartLineup), options);
    },
  });
}

/** 本番の衝突関数に依存せず、描画した矩形とフレーム間の補間点を検査。 */
export function assertNoBodyOverlap(poses, previous, cardW, cardH, context = '') {
  const nodes = [...poses];
  let worstMargin = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [aId, a] = nodes[i];
      const [bId, b] = nodes[j];
      const a0 = previous?.get(aId) ?? a;
      const b0 = previous?.get(bId) ?? b;
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const dx = Math.abs(a0.cx - b0.cx + ((a.cx - a0.cx) - (b.cx - b0.cx)) * t);
        const dy = Math.abs(a0.cy - b0.cy + ((a.cy - a0.cy) - (b.cy - b0.cy)) * t);
        worstMargin = Math.min(worstMargin, Math.max(dx - cardW, dy - cardH));
      }
    }
  }
  expect(worstMargin, context).toBeGreaterThanOrEqual(-1e-6);
}
