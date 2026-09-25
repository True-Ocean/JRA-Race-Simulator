import { describe, expect, it } from 'vitest';
import { advanceHorsePoses, arrangeHorsePoses, pathsOverlap } from '../src/ui/horse-motion.js';
import { assertNoBodyOverlap } from './helpers/motion-renderer.js';

const clearance = { width: 10, length: 24 };
const poses = values => new Map(values.map(([id, cx, cy]) => [id, { cx, cy }]));
const advance = (a, b) => advanceHorsePoses(a, b, clearance, { dtMs: 50 });

describe('馬体と移動経路の安全制約', () => {
  it('始点・終点が離れていても途中ですれ違う軌跡を検出する', () => {
    expect(pathsOverlap({ cx: 0, cy: 0 }, { cx: 30, cy: 0 },
      { cx: 30, cy: 0 }, { cx: 0, cy: 0 }, clearance)).toBe(true);
    expect(pathsOverlap({ cx: 0, cy: 0 }, { cx: 30, cy: -50 },
      { cx: 30, cy: 0 }, { cx: 0, cy: -50 }, clearance)).toBe(true);
    expect(pathsOverlap({ cx: 0, cy: 0 }, { cx: 0, cy: -50 },
      { cx: 10, cy: 0 }, { cx: 10, cy: -50 }, clearance)).toBe(false);
  });

  it.each([
    [[[1, 0, 0], [2, 30, 0]], [[1, 30, -4], [2, 0, -4]]],
    [[[1, 0, 0], [2, 0, 30]], [[1, 0, -2], [2, 0, -20]]],
    [[[1, 0, 0], [2, 12, 12], [3, 24, 0]], [[1, 12, -10], [2, 12, -20], [3, 12, -10]]],
  ])('交差・追突・左右からの合流を止め、後ろへ押し戻さない (%j)', (from, to) => {
    const start = poses(from);
    const target = poses(to);
    const end = advance(start, target);
    assertNoBodyOverlap(end, start, 10, 24);
    for (const [id, p] of end) {
      expect(p.cy).toBeLessThanOrEqual(start.get(id).cy);
      expect(p.cx).toBeGreaterThanOrEqual(Math.min(start.get(id).cx, target.get(id).cx));
      expect(p.cx).toBeLessThanOrEqual(Math.max(start.get(id).cx, target.get(id).cx));
    }
  });

  it('密集した後続は先頭と同じ速度で追従でき、不要に間隔を広げない', () => {
    const start = poses(Array.from({ length: 18 }, (_, i) => [i, 20, i * 24]));
    const targets = new Map([...start].map(([id, p]) => [id, { cx: p.cx, cy: p.cy - 5 }]));
    const end = advance(start, targets);
    for (const [id, p] of end) expect(p.cy).toBeCloseTo(start.get(id).cy - 5, 6);
    assertNoBodyOverlap(end, start, 10, 24);
  });

  it('初期状態が重なっていても、配置を確定してから走り出す', () => {
    const packed = arrangeHorsePoses(poses([[1, 0, 0], [2, 0, 0], [3, 8, 0]]), clearance);
    assertNoBodyOverlap(packed, null, 10, 24);
    expect(packed.get(1).cy).toBe(0);
    expect(packed.get(3).cy).toBe(48);
  });

  it('安全境界で追従を繰り返しても丸め誤差で停止しない', () => {
    const body = { width: 29.484, length: 70.98 };
    let state = poses([[1, 10, 670], [2, 15, 755]]);
    for (let i = 0; i < 2000; i++) {
      // 実際のゴールと同じ、画面座標→進行度→画面座標の変換を挟む。
      const targets = new Map([...state].map(([id, p]) => [id, {
        cx: p.cx, cy: 680 - (((680 - p.cy) / 660) + (id === 1 ? 0.8 : 1.5) / 660) * 660,
      }]));
      const next = advanceHorsePoses(state, targets, body, { dtMs: 1000 / 60 });
      expect(next.get(1).cy).toBeCloseTo(state.get(1).cy - 0.8, 6);
      assertNoBodyOverlap(next, state, 29.4, 70.9);
      state = next;
    }
  });
});
