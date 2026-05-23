import { JRA_WAKU_COLORS } from './colors.js';
import {
  RACE_SUMMARY_HEADER_LINE,
  RACE_SUMMARY_SCENE_LABELS,
} from '../engine/constants.js';

function getBattleLogClass(logLine) {
  if (logLine === '＝＝＝＝＝＝＝＝[着順]＝＝＝＝＝＝＝＝') return 'log-entry placing';
  if (logLine === RACE_SUMMARY_HEADER_LINE) return 'log-entry scene-heading';
  if (logLine.startsWith('[出遅れ]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[好スタート]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[つまずき]')) return 'log-entry irregular irregular-stumble';
  if (logLine.startsWith('[着順]')) return 'log-entry placing';
  if (logLine.startsWith('[仕掛け:')) return 'log-entry';
  if (!logLine.startsWith('[バトル')) return 'log-entry';
  if (logLine.startsWith('[バトル:先頭争い]')) return 'log-entry battle battle-lead';
  if (logLine.startsWith('[バトル:コーナー争い]')) return 'log-entry battle battle-corner';
  if (logLine.startsWith('[バトル:直線争い]')) return 'log-entry battle battle-final';
  if (logLine.startsWith('[バトル:進路争い]')) return 'log-entry battle battle-lane';
  if (logLine.startsWith('[バトル:同レーン争い]')) return 'log-entry battle battle-block';
  return 'log-entry battle battle-default';
}

function getLogTagClass(logLine) {
  if (logLine.startsWith('[出遅れ]')) return 'log-tag irregular-start';
  if (logLine.startsWith('[好スタート]')) return 'log-tag irregular-start';
  if (logLine.startsWith('[つまずき]')) return 'log-tag irregular-stumble';
  if (logLine.startsWith('[着順]')) return 'log-tag placing';
  if (logLine.startsWith('[仕掛け:繰り上がり]')) return 'log-tag spur-climb';
  if (logLine.startsWith('[仕掛け:')) return 'log-tag spur-entry';
  if (logLine.startsWith('[バトル:先頭争い]')) return 'log-tag battle-lead';
  if (logLine.startsWith('[バトル:コーナー争い]')) return 'log-tag battle-corner';
  if (logLine.startsWith('[バトル:直線争い]')) return 'log-tag battle-final';
  if (logLine.startsWith('[バトル:進路争い]')) return 'log-tag battle-lane';
  if (logLine.startsWith('[バトル:同レーン争い]')) return 'log-tag battle-block';
  if (logLine.startsWith('[バトル')) return 'log-tag battle-default';
  return 'log-tag';
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRaceSummarySceneLabel(logLine) {
  if (typeof logLine !== 'string') return null;
  for (const label of RACE_SUMMARY_SCENE_LABELS) {
    if (logLine.startsWith(`${label}:`)) return label;
  }
  return null;
}

function decorateHorseNames(text, horseMetaByName) {
  let html = escapeHtml(text);
  if (!horseMetaByName || horseMetaByName.size === 0) return html;

  const names = [...horseMetaByName.keys()].sort((a, b) => b.length - a.length);
  names.forEach(name => {
    const meta = horseMetaByName.get(name);
    if (!meta) return;
    const escapedName = escapeHtml(name);
    const re = new RegExp(escapeRegExp(escapedName), 'g');
    const waku = JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' };
    const badge = `<span class="horse-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`;
    html = html.replace(re, `${badge}<span class="horse-name">${escapedName}</span>`);
  });
  return html;
}

function formatSceneHeadingHtml(title, horseMetaByName) {
  return `<span class="scene-heading-label">${decorateHorseNames(String(title ?? ''), horseMetaByName)}</span>`;
}

function formatLogLineHtml(logLine, horseMetaByName) {
  if (logLine === RACE_SUMMARY_HEADER_LINE) {
    return formatSceneHeadingHtml(logLine, horseMetaByName);
  }
  const raceSummarySceneLabel = getRaceSummarySceneLabel(logLine);
  if (raceSummarySceneLabel) {
    const restText = logLine.slice(raceSummarySceneLabel.length + 1).trimStart();
    const bodyHtml = decorateHorseNames(restText, horseMetaByName);
    return `<span class="race-summary-scene">${escapeHtml(raceSummarySceneLabel)}</span>: ${bodyHtml}`;
  }

  const tagMatch = logLine.match(/^\[[^\]]+\]/);
  if (!tagMatch) return decorateHorseNames(logLine, horseMetaByName);

  const tagText = tagMatch[0];
  const restText = logLine.slice(tagText.length).trimStart();
  const tagClass = getLogTagClass(logLine);
  const tagHtml = `<span class="${tagClass}">${escapeHtml(tagText)}</span>`;
  const bodyHtml = decorateHorseNames(restText, horseMetaByName);
  return `${tagHtml} ${bodyHtml}`;
}

export {
  getBattleLogClass,
  getLogTagClass,
  escapeHtml,
  escapeRegExp,
  getRaceSummarySceneLabel,
  decorateHorseNames,
  formatSceneHeadingHtml,
  formatLogLineHtml,
};
