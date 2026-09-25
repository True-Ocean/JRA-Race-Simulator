import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { isCurrentRace, loadPublishedRace } from '../src/lib/published-race.js';
import { runSimulation } from '../src/engine/simulation.js';

const data = name => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
function fetchFixture(overrides = {}) {
  return vi.fn(async url => {
    const name = url.match(/([^/]+)\.json$/)[1];
    return { ok: true, json: async () => overrides[name] ?? data(name) };
  });
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('公開するG1は1レースだけ', () => {
  it('公開中のJSONと一致する実コースを読み、通常のシミュレーションを実行できる', async () => {
    const fetchImpl = fetchFixture();
    const race = await loadPublishedRace(fetchImpl);
    expect(race.courseDef.id).toBe('nakayama_turf_1200');
    expect(runSimulation(race, { seed: 42 }).results).toHaveLength(race.entries.length);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [, options] of fetchImpl.mock.calls) expect(options.cache).toBe('no-store');
  });

  it('情報と出走表が別レースなら公開データの混在として止める', async () => {
    await expect(loadPublishedRace(fetchFixture({
      'race-entries': { ...data('race-entries'), race_id: 1 },
    }))).rejects.toThrow('race_id が一致しません');
  });

  it('一致しないコースを汎用レイアウトで補わない', async () => {
    const info = data('race-info');
    info.race_info.distance = 2500;
    await expect(loadPublishedRace(fetchFixture({ 'race-info': info })))
      .rejects.toThrow('コース定義が未登録、または一致しません');
  });

  it('壊れたレイアウトでは再生を開始しない', async () => {
    const catalog = data('courses');
    catalog.courses.find(c => c.id === 'nakayama_turf_1200').segments = [];
    await expect(loadPublishedRace(fetchFixture({ courses: catalog })))
      .rejects.toThrow('コースの区間定義');
  });

  it('G1以外や空の出走表は止める', async () => {
    const info = data('race-info');
    info.race_info.grade = 'G2';
    await expect(loadPublishedRace(fetchFixture({ 'race-info': info }))).rejects.toThrow('G1レースのみ');
    await expect(loadPublishedRace(fetchFixture({
      'race-entries': { ...data('race-entries'), entries: [] },
    }))).rejects.toThrow('出走表がありません');
  });

  it('HTTPエラーを空データとして扱わない', async () => {
    await expect(loadPublishedRace(async () => ({ ok: false, status: 404 })))
      .rejects.toThrow('読み込みに失敗しました（404）');
  });

  it('前週やレースIDのない旧記録を復元せず、同じ公開レースだけを許可する', () => {
    const current = data('race-info');
    expect(isCurrentRace({ race_id: current.race_id }, current)).toBe(true);
    expect(isCurrentRace({ race_id: 1 }, current)).toBe(false);
    expect(isCurrentRace({}, current)).toBe(false);
    expect(isCurrentRace(null, current)).toBe(false);
    expect(isCurrentRace(null, null)).toBe(false);
  });

  it('メイン画面で読み込み失敗を表示し、再生・編集操作を無効にする', async () => {
    vi.resetModules();
    const error = { hidden: true, textContent: '' };
    const log = { textContent: '' };
    const buttons = [{ disabled: false }, { disabled: false }];
    vi.stubGlobal('document', {
      getElementById: id => ({ 'field-canvas': {}, 'race-load-error': error, 'log-panel': log })[id] ?? null,
      querySelectorAll: () => buttons,
    });
    vi.stubGlobal('fetch', fetchFixture({ courses: { courses: [] } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('../main.js');
    await vi.waitFor(() => expect(error.hidden).toBe(false));
    expect(error.textContent).toContain('レースを開始できません');
    expect(error.textContent).toContain('コース定義');
    expect(buttons.every(b => b.disabled)).toBe(true);
    expect(log.textContent).not.toBe('');
  });

  it('集計画面を直接開いても、前週のレースは表示しない', async () => {
    vi.resetModules();
    const elements = new Map();
    vi.stubGlobal('document', {
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', addEventListener() {} });
        return elements.get(id);
      },
    });
    vi.stubGlobal('sessionStorage', {
      getItem: key => key === 'jra-sim-bundle-v1' ? JSON.stringify({ race_id: 1 }) : null,
    });
    vi.stubGlobal('fetch', fetchFixture());
    await import('../src/stats/stats-app.js');
    await vi.waitFor(() => expect(elements.get('stats-error').textContent).toContain('公開レースが更新'));
    expect(elements.get('stats-race-info').textContent).toBe('');
  });
});
