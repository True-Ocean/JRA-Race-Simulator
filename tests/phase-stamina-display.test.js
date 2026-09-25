import { afterEach, expect, it, vi } from 'vitest';
import { PhaseController } from '../src/ui/phase-controller.js';

afterEach(() => vi.unstubAllGlobals());

it('フェーズ開始時に終了時の残量へ飛ばず、移動に合わせて一方向に減る', () => {
  const bar = { style: {}, className: '' };
  const element = () => ({ textContent: '', style: {}, appendChild() {} });
  vi.stubGlobal('document', {
    getElementById: element, createElement: element,
    querySelector: () => ({ querySelector: () => bar }),
  });
  const from = { id: 0, x: 0, y: 1, pathMeters: 0, stamina: 80, initialStamina: 100 };
  const to = { ...from, x: 100, pathMeters: 100, stamina: 60 };
  const renderer = { getPhaseName: () => '向正面', draw() {} };
  const c = new PhaseController([{ horses: [from] }, { horses: [to] }], [{}, {}], renderer);
  c._railScrollDrawOptions = () => ({});
  let renderFrame;
  c._playTween = (_, render) => { renderFrame = render; };
  c._renderPhase(1);
  expect(bar.style.width).toBe('80%');
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    renderFrame(progress, false, 16);
    expect(Number.parseFloat(bar.style.width)).toBeCloseTo(80 - progress * 20);
  }
});
