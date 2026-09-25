import { resolveVenueKey } from '../ui/finish-times.js';

/**
 * 公開レースの競馬場・馬場・距離に一致する実コースだけを解決する。
 * course_id は内外回りなどの区別用。一致条件を省略・上書きする指定ではない。
 * @param {{ race_info?: { venue?: string, track?: string, distance?: number, course_id?: string } } | null | undefined} raceData
 * @param {{ courses?: object[] } | null | undefined} courseCatalog
 * @returns {object | null}
 */
export function resolveCourseDef(raceData, courseCatalog) {
  const info = raceData?.race_info ?? {};
  const courses = Array.isArray(courseCatalog?.courses) ? courseCatalog.courses : [];

  const venueKey = resolveVenueKey(info.venue);
  const track = String(info.track ?? '').trim().toLowerCase();
  const surface = { '芝': 'turf', turf: 'turf', 'ダート': 'dirt', dirt: 'dirt' }[track];
  const distance = Number(info.distance);

  if (!venueKey || !surface || !Number.isFinite(distance) || distance <= 0) return null;
  const matches = courses.filter(c =>
    c?.venueKey === venueKey && c.surface === surface && c.distance === distance
    && (!info.course_id || c.id === info.course_id),
  );
  // 未登録・矛盾・曖昧な定義を、汎用コースや配列の先頭で補わない。
  return matches.length === 1 ? matches[0] : null;
}
