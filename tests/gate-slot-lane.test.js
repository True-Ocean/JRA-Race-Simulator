import { describe, expect, it } from 'vitest';
import { calcGateSlotLane } from '../src/engine/params.js';

describe('calcGateSlotLane', () => {
  it('1番は内側マージン付きの最内レーン、18番は外側マージン付きの最外レーン', () => {
    expect(calcGateSlotLane(1)).toBe(2);
    expect(calcGateSlotLane(18)).toBe(17);
  });

  it('頭数に依存せずゲート番号だけで位置が決まる', () => {
    expect(calcGateSlotLane(12)).toBeCloseTo(2 + (11 * 15) / 17, 5);
  });

  it('範囲外のゲート番号はクランプする', () => {
    expect(calcGateSlotLane(0)).toBe(2);
    expect(calcGateSlotLane(99)).toBe(17);
  });
});
