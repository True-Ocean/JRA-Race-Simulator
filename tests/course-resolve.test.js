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

  it('未定義の競馬場・距離は別コースへ代替しない', () => {
    const def = resolveCourseDef(
      { race_info: { venue: '中山競馬場', track: '芝', distance: 2500 } },
      courseCatalog,
    );
    expect(def).toBeNull();
  });

  it('明示した course_id がレース条件と矛盾する場合は停止する', () => {
    const def = resolveCourseDef(
      {
        race_info: {
          venue: '東京競馬場',
          track: '芝',
          distance: 2400,
          course_id: 'hanshin_turf_2200',
        },
      },
      courseCatalog,
    );
    expect(def).toBeNull();
  });

  it('course_id だけでは競馬場・馬場・距離の指定を省略できない', () => {
    const def = resolveCourseDef(
      { race_info: { course_id: 'tokyo_turf_2400' } },
      courseCatalog,
    );
    expect(def).toBeNull();
  });

  it.each([undefined, '', '障害', '不明'])('馬場が %s の場合、芝と推測しない', track => {
    expect(resolveCourseDef({ race_info: { venue: '東京', distance: 2400, track } }, courseCatalog))
      .toBeNull();
  });

  it('古い汎用・既定コース定義が残っていても利用しない', () => {
    const oldCatalog = {
      defaultCourseId: 'tokyo_turf_2400',
      courses: [...courseCatalog.courses, { id: 'generic_one_turn' }, { distance: 2500, surface: 'turf' }],
    };
    expect(resolveCourseDef({ race_info: { venue: '中山', track: '芝', distance: 2500 } }, oldCatalog))
      .toBeNull();
  });

  it('同条件の実コースが複数ある場合は course_id の一致が必要', () => {
    const course = courseCatalog.courses[0];
    const catalog = { courses: [course, { ...course, id: 'another_layout' }] };
    const race_info = { venue: '東京', track: '芝', distance: 2400 };
    expect(resolveCourseDef({ race_info }, catalog)).toBeNull();
    expect(resolveCourseDef({ race_info: { ...race_info, course_id: course.id } }, catalog)).toBe(course);
  });

  it('公開カタログには具体的な競馬場・距離・馬場を持つ定義だけがある', () => {
    for (const course of courseCatalog.courses) {
      expect(course.venueKey).toBeTruthy();
      expect(course.distance).toBeGreaterThan(0);
      expect(['turf', 'dirt']).toContain(course.surface);
    }
    expect(courseCatalog.defaultCourseId).toBeUndefined();
  });

  it('load-race-fixture と同構成で本番 JSON から解決できる', () => {
    const raceInfo = readJson('src/data/race-info.json');
    const def = resolveCourseDef(raceInfo, courseCatalog);
    expect(def?.id).toBe('nakayama_turf_1200');
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

  it('race-info の venue / track / distance で中山芝1200（外）を解決する', () => {
    const def = resolveCourseDef(
      { race_info: { venue: '中山競馬場', track: '芝', distance: 1200 } },
      courseCatalog,
    );
    expect(def?.id).toBe('nakayama_turf_1200');
    expect(def?.turnDirection).toBe('right');
    expect(def?.segments?.find(s => s.id === 'back')?.label).toBe('向正面');
    expect(def?.segments?.find(s => s.id === 'corner3')?.cornerNo).toBe(3);
    const ratioSum = def.segments.reduce((acc, s) => acc + s.ratio, 0);
    expect(ratioSum).toBeCloseTo(1, 5);
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
