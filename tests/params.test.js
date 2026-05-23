import { describe, expect, it } from 'vitest';
import { calcWaku } from '../src/engine/params.js';

describe('calcWaku', () => {
  it('18頭立てで馬番7は4枠', () => {
    expect(calcWaku(7, 18)).toBe(4);
  });

  it('18頭立てで馬番1は1枠', () => {
    expect(calcWaku(1, 18)).toBe(1);
  });

  it('8頭以下は馬番=枠番', () => {
    expect(calcWaku(3, 8)).toBe(3);
  });
});
