import { describe, it, expect } from 'vitest';
import {
  findLeaderX,
  createTrackRailScrollState,
  resetTrackRailScrollState,
  advanceTrackRailScroll,
  calcTrackRailPixelsPerX,
} from '../src/ui/track-rail-scroll.js';

describe('track-rail-scroll', () => {
  const renderer = { H: 500 };

  it('findLeaderX は x 最大の馬を返す', () => {
    const horses = [{ id: 1, x: 10 }, { id: 2, x: 42 }, { id: 3, x: 30 }];
    expect(findLeaderX(horses)).toBe(42);
  });

  it('freeze 中は scrollY を増やさず prevLeaderX だけ更新する', () => {
    const state = createTrackRailScrollState();
    const horsesA = [{ id: 1, x: 0 }];
    const horsesB = [{ id: 1, x: 20 }];

    expect(advanceTrackRailScroll(state, horsesA, renderer, { freeze: true })).toBe(0);
    expect(advanceTrackRailScroll(state, horsesB, renderer, { freeze: true })).toBe(0);
    expect(state.scrollY).toBe(0);
    expect(state.prevLeaderX).toBe(20);
  });

  it('先頭の Δx に比例して scrollY が増える', () => {
    const state = createTrackRailScrollState();
    const pxPerX = calcTrackRailPixelsPerX(renderer);

    advanceTrackRailScroll(state, [{ id: 1, x: 0 }], renderer);
    const after = advanceTrackRailScroll(state, [{ id: 1, x: 10 }], renderer);

    expect(after).toBeCloseTo(10 * pxPerX, 5);
  });

  it('resetTrackRailScrollState で累積をクリアできる', () => {
    const state = createTrackRailScrollState();
    advanceTrackRailScroll(state, [{ id: 1, x: 0 }], renderer);
    advanceTrackRailScroll(state, [{ id: 1, x: 50 }], renderer);
    expect(state.scrollY).toBeGreaterThan(0);

    resetTrackRailScrollState(state);
    expect(state.scrollY).toBe(0);
    expect(state.prevLeaderX).toBeNull();
  });
});
