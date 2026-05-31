/** バトルログのタグ接頭辞（全角コロン） */
export const BATTLE_LOG_PREFIX = '[バトル：';

/**
 * レースログ用のバトル行を生成する。
 * 1行目: [バトル：種別] / 2行目: ⭕️勝者馬名 vs ❌敗者馬名（枠色バッジは表示層で付与）
 *
 * @param {string} typeLabel 例: 進路争い, 先頭争い
 * @param {{ name?: string }} winner
 * @param {{ name?: string }} loser
 */
export function buildBattleLogLine(typeLabel, winner, loser) {
  const wName = winner?.name ?? '';
  const lName = loser?.name ?? '';
  const tag = `${BATTLE_LOG_PREFIX}${typeLabel}]`;
  const body = `⭕️${wName} vs ❌${lName}`;
  return `${tag}\n${body}`;
}

/** ログ行からバトル種別ラベルを取得（表示用 CSS 分岐） */
export function getBattleTypeLabel(logLine) {
  if (typeof logLine !== 'string' || !logLine.startsWith('[バトル')) return null;
  const m = logLine.match(/^\[バトル[：:]([^\]]+)\]/);
  return m ? m[1] : null;
}

/** バトルログ行かどうか */
export function isBattleLogLine(logLine) {
  return getBattleTypeLabel(logLine) != null;
}
