/** コース再生ボタン用アイコン（ブラウザ・スマホ共通の絵文字） */
export const PLAYBACK_EMOJI = {
  play: '\u25B6\uFE0F',
  next: '\u23ED\uFE0F',
  pause: '\u23F8\uFE0F',
  replay: '\u21AA\uFE0F',
};

/**
 * コース再生ドックのボタン文言とアイコンを更新する。
 * @param {HTMLButtonElement | null} button
 * @param {'play' | 'next' | 'pause' | 'replay' | null} iconKey
 * @param {string} label
 */
export function setPlaybackButton(button, iconKey, label) {
  if (!button) return;
  const iconEl = button.querySelector('.field-playback-btn__icon');
  const labelEl = button.querySelector('.field-playback-btn__label');
  const emoji = iconKey ? PLAYBACK_EMOJI[iconKey] : '';
  if (iconEl) {
    iconEl.textContent = emoji;
    iconEl.hidden = !emoji;
  }
  if (labelEl) {
    labelEl.textContent = label;
    return;
  }
  button.textContent = emoji ? `${emoji} ${label}` : label;
}
