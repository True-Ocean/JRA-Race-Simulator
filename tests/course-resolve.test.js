import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveCourseDef } from '../src/lib/course-resolve.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

describe('resolveCourseDef', () => {
  const courseCatalog = readJson('src/data/courses.json');

  it('race-info の venue / track / distance で東京芝2400を解決する', () => {
    const raceData = {
      race_info: {
        venue: '東京競馬場',
        track: '芝',
        distance: 2400,
      },
    };
    const def = resolveCourseDef(raceData, courseCatalog);
    expect(def?.id).toBe('tokyo_turf_2400');
    expect(def?.segments?.length).toBeGreaterThan(0);
  });

  it('venue 表記の揺れ（東京）でも同じコースを解決する', () => {
    const def = resolveCourseDef(
      { race_info: { venue: '東京', track: '芝', distance: 2400 } },
      courseCatalog,
    );
    expect(def?.id).toBe('tokyo_turf_2400');
  });

  it('未定義の競馬場・距離は generic_one_turn にフォールバックする', () => {
    const def = resolveCourseDef(
      { race_info: { venue: '中山競馬場', track: '芝', distance: 2500 } },
      courseCatalog,
    );
    expect(def?.id).toBe('generic_one_turn');
  });

  it('course_id 明示時はルックアップより優先されない（一致キーが先）', () => {
    const def = resolveCourseDef(
      {
        race_info: {
          venue: '東京競馬場',
          track: '芝',
          distance: 2400,
          course_id: 'generic_one_turn',
        },
      },
      courseCatalog,
    );
    expect(def?.id).toBe('tokyo_turf_2400');
  });

  it('course_id のみで汎用コースを解決できる（後方互換）', () => {
    const def = resolveCourseDef(
      { race_info: { course_id: 'generic_one_turn' } },
      courseCatalog,
    );
    expect(def?.id).toBe('generic_one_turn');
  });

  it('load-race-fixture と同構成で本番 JSON から解決できる', () => {
    const raceInfo = readJson('src/data/race-info.json');
    const def = resolveCourseDef(raceInfo, courseCatalog);
    expect(def?.id).toBe('tokyo_turf_1600');
  });

  it('race-info の venue / track / distance で阪神芝2200（内）を解決する', () => {
    const def = resolveCourseDef(
      { race_info: { venue: '阪神競馬場', track: '芝', distance: 2200 } },
      courseCatalog,
    );
    expect(def?.id).toBe('hanshin_turf_2200');
    expect(def?.turnDirection).toBe('right');
    expect(def?.segments?.find(s => s.id === 'back')?.label).toBe('向正面');
  });

  it('race-info の venue / track / distance で東京芝1600を解決する', () => {
    const def = resolveCourseDef(
      { race_info: { venue: '東京競馬場', track: '芝', distance: 1600 } },
      courseCatalog,
    );
    expect(def?.id).toBe('tokyo_turf_1600');
    expect(def?.segments?.find(s => s.id === 'start')?.label).toBe('スタート');
    expect(def?.segments?.find(s => s.id === 'back')?.label).toBe('向正面');
  });
});
