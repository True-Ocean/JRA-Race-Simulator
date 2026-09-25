import { resolveCourseDef } from './course-resolve.js';
import { buildPhases } from '../engine/phase.js';

/** 毎週差し替える公開中の1レースを正とし、古いレースをセッションから復活させない。 */
export function isCurrentRace(saved, published) {
  return saved?.race_id != null && saved.race_id === published?.race_id;
}

/** メイン画面・集計画面で共通の公開データ読み込み。汎用コースへの代替はしない。 */
export async function loadPublishedRace(fetchJson = fetch) {
  const [info, entryData, catalog] = await Promise.all(
    ['race-info', 'race-entries', 'courses'].map(async name => {
      const response = await fetchJson(`./src/data/${name}.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${name}.json の読み込みに失敗しました（${response.status}）。`);
      return response.json();
    }),
  );
  if (!info?.race_id || !isCurrentRace(entryData, info)) {
    throw new Error('レース情報と出走表の race_id が一致しません。公開データを確認してください。');
  }
  const grade = String(info.race_info?.grade ?? '').normalize('NFKC').toUpperCase().trim();
  if (!['G1', 'GI'].includes(grade)) throw new Error('公開対象はG1レースのみです。');
  if (!Array.isArray(entryData.entries) || entryData.entries.length === 0) {
    throw new Error('公開レースの出走表がありません。');
  }
  const race = { race_id: info.race_id, race_info: info.race_info, entries: entryData.entries };
  const courseDef = resolveCourseDef(race, catalog);
  if (!courseDef) {
    const { venue, track, distance } = race.race_info;
    throw new Error(`コース定義が未登録、または一致しません（${venue ?? '競馬場未設定'}・${track ?? '馬場未設定'}・${distance ?? '?'}m）。courses.json を確認してください。`);
  }
  buildPhases(race.race_info.distance, courseDef); // 壊れた区間定義でも起動を止める。
  return { ...race, courseDef };
}
