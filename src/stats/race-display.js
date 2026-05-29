/**
 * 集計画面などシミュレータ本体を読み込まないページ用のレース表示ヘルパー
 *（main.js 全体の import を避ける）
 */

export function formatRaceInfo(raceData) {
  const info = raceData.race_info;
  const formatRaceDate = value => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日`;
    }
    if (typeof value === 'number') {
      const raw = String(value);
      if (/^\d{8}$/.test(raw)) {
        return `${raw.slice(0, 4)}年${Number(raw.slice(4, 6))}月${Number(raw.slice(6, 8))}日`;
      }
      return '';
    }
    if (typeof value !== 'string') return '';

    const compact = value.trim();
    const normalized = compact.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (normalized) {
      const [, y, m, d] = normalized;
      return `${y}年${Number(m)}月${Number(d)}日`;
    }
    const compactDigits = compact.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactDigits) {
      const [, y, m, d] = compactDigits;
      return `${y}年${Number(m)}月${Number(d)}日`;
    }
    return compact;
  };

  const dateLabel = formatRaceDate(info.date || raceData.race_date);
  const restParts = [
    info.age_condition,
    info.grade,
    info.race_name,
    info.track,
    Number.isFinite(info.distance) ? `${info.distance}m` : '',
  ].filter(Boolean);
  const tail = restParts.join('　');

  const headInner = [];
  if (dateLabel) headInner.push(`<span class="race-info-date">${dateLabel}</span>`);
  if (info.venue) {
    if (headInner.length) {
      headInner.push('<span class="race-info-sep-in-head" aria-hidden="true">　</span>');
    }
    headInner.push(`<span class="race-info-venue">${info.venue}</span>`);
  }
  const headHtml = headInner.length
    ? `<span class="race-info-head">${headInner.join('')}</span>`
    : '';
  const tailHtml = tail ? `<span class="race-info-tail">${tail}</span>` : '';
  if (!headHtml && !tailHtml) return '';
  if (!tailHtml) return headHtml;
  if (!headHtml) return tailHtml;
  const lineSep = '<br class="race-info-break" aria-hidden="true">';
  const between = '<span class="race-info-sep" aria-hidden="true">　</span>';
  return `${headHtml}${lineSep}${between}${tailHtml}`;
}

export { resolveCourseDef } from '../lib/course-resolve.js';
