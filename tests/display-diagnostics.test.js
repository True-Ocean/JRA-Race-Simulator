import { describe, expect, it } from 'vitest';
import {
  createDisplayDiagnosticView,
  createDisplayTrace,
  isLocalDisplayDiagnostics,
  shouldShowDisplayDiagnostics,
} from '../src/ui/display-diagnostics.js';

describe('display-diagnostics', () => {
  it('診断記録は localhost で有効になり、パネルは debug=flicker のときだけ表示する', () => {
    expect(isLocalDisplayDiagnostics({
      hostname: '127.0.0.1',
      search: '',
    })).toBe(true);
    expect(shouldShowDisplayDiagnostics({
      hostname: '127.0.0.1',
      search: '?debug=flicker',
    })).toBe(true);
    expect(isLocalDisplayDiagnostics({
      hostname: 'example.com',
      search: '?debug=flicker',
    })).toBe(false);
    expect(shouldShowDisplayDiagnostics({
      hostname: 'localhost',
      search: '',
    })).toBe(false);
  });

  it('描画イベントは記録を圧迫せず、復元イベントは時系列で残る', () => {
    const trace = createDisplayTrace(null, () => 'fixed-time');
    trace.record('boot');
    trace.record('draw');
    trace.record('draw');
    trace.record('visibility', { state: 'visible' });
    expect(trace.snapshot()).toEqual({
      page: 1,
      counts: { boot: 1, draw: 2, visibility: 1 },
      events: [
        { time: 'fixed-time', page: 1, type: 'boot', detail: {}, draws: 0 },
        { time: 'fixed-time', page: 1, type: 'visibility', detail: { state: 'visible' }, draws: 2 },
      ],
    });
  });

  it('ページ番号を復元してリロードの境界を追跡できる', () => {
    const trace = createDisplayTrace({ page: 3, events: [] }, () => 'fixed-time');
    expect(trace.snapshot().page).toBe(4);
  });

  it('表示用ログでは直近イベントを新しい順に確認できる', () => {
    const view = createDisplayDiagnosticView({
      page: 2,
      counts: { boot: 1 },
      events: [
        { type: 'boot' },
        { type: 'pageshow' },
        { type: 'visibility' },
      ],
    }, 2);
    expect(view).toEqual({
      page: 2,
      counts: { boot: 1 },
      recentEvents: [
        { type: 'visibility' },
        { type: 'pageshow' },
      ],
    });
  });
});
