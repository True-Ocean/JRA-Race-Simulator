import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveCourseDef } from '../../src/stats/race-display.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

/**
 * 本番 JSON と同じ構成のレースデータをテスト用に組み立てる。
 * renderer なしの runSimulation 向け（collisionMetrics は定数フォールバック）。
 */
export function loadDefaultRaceFixture() {
  const raceInfo = readJson('src/data/race-info.json');
  const raceEntries = readJson('src/data/race-entries.json');
  const courseCatalog = readJson('src/data/courses.json');
  const raceData = {
    ...raceInfo,
    entries: raceEntries.entries,
  };
  const courseDef = resolveCourseDef(raceData, courseCatalog);
  return { ...raceData, courseDef };
}
