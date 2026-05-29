import { resolveSurfaceKey, resolveVenueKey } from '../ui/finish-times.js';

/**
 * race_info（venue / track / distance）から courses.json の1件を解決する。
 * @param {{ race_info?: { venue?: string, track?: string, distance?: number, course_id?: string } } | null | undefined} raceData
 * @param {{ courses?: object[], defaultCourseId?: string } | null | undefined} courseCatalog
 * @returns {object | null}
 */
export function resolveCourseDef(raceData, courseCatalog) {
  const info = raceData?.race_info ?? {};
  const courses = courseCatalog?.courses ?? [];

  const venueKey = resolveVenueKey(info.venue);
  const surface = resolveSurfaceKey(info.track);
  const distance = Number(info.distance);

  if (venueKey && Number.isFinite(distance)) {
    const match = courses.find(
      c =>
        c.venueKey === venueKey &&
        (c.surface ?? 'turf') === surface &&
        c.distance === distance,
    );
    if (match) return match;
  }

  const requestedId = info.course_id;
  if (requestedId) {
    const byId = courses.find(c => c.id === requestedId);
    if (byId) return byId;
  }

  const defId = courseCatalog?.defaultCourseId;
  if (defId) {
    return courses.find(c => c.id === defId) ?? null;
  }
  return null;
}
