import { JRA_WAKU_COLORS } from './colors.js';
import {
  BATTLE_LOG_PREFIX,
  getBattleTypeLabel,
  isBattleLogLine,
} from '../engine/battle-log.js';
import {
  PHASE_CALM_LOG_LINE,
  RACE_SUMMARY_HEADER_LINE,
  RACE_SUMMARY_SCENE_LABELS,
} from '../engine/constants.js';

const BATTLE_TYPE_CSS = {
  先頭争い: { entry: 'battle-lead', tag: 'battle-lead' },
  コーナー争い: { entry: 'battle-corner', tag: 'battle-corner' },
  直線争い: { entry: 'battle-final', tag: 'battle-final' },
  進路争い: { entry: 'battle-lane', tag: 'battle-lane' },
  同レーン争い: { entry: 'battle-block', tag: 'battle-block' },
};

function getBattleCssKeys(typeLabel) {
  return BATTLE_TYPE_CSS[typeLabel] ?? { entry: 'battle-default', tag: 'battle-default' };
}

function getBattleLogClass(logLine) {
  if (logLine === '＝＝＝＝＝＝＝＝[着順]＝＝＝＝＝＝＝＝') return 'log-entry placing';
  if (logLine === PHASE_CALM_LOG_LINE) return 'log-entry phase-calm';
  if (logLine === RACE_SUMMARY_HEADER_LINE) return 'log-entry scene-heading';
  if (logLine.startsWith('[出遅れ]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[好スタート]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[つまずき]')) return 'log-entry irregular irregular-stumble';
  if (logLine.startsWith('[着順]')) return 'log-entry placing';
  if (logLine.startsWith('[仕掛け:')) return 'log-entry';
  const battleType = getBattleTypeLabel(logLine);
  if (battleType) {
    const { entry } = getBattleCssKeys(battleType);
    return `log-entry battle ${entry}`;
  }
  return 'log-entry';
}

function getLogTagClass(logLine) {
  if (logLine.startsWith('[出遅れ]')) return 'log-tag irregular-start';
  if (logLine.startsWith('[好スタート]')) return 'log-tag irregular-start';
  if (logLine.startsWith('[つまずき]')) return 'log-tag irregular-stumble';
  if (logLine.startsWith('[着順]')) return 'log-tag placing';
  if (logLine.startsWith('[仕掛け:')) return 'log-tag spur-entry';
  const battleType = getBattleTypeLabel(logLine);
  if (battleType) {
    const { tag } = getBattleCssKeys(battleType);
    return `log-tag ${tag}`;
  }
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

const IRREGULAR_LOG_TAGS = new Set(['[出遅れ]', '[好スタート]', '[つまずき]']);

function isIrregularLogLine(logLine) {
  if (typeof logLine !== 'string') return false;
  for (const tag of IRREGULAR_LOG_TAGS) {
    if (logLine.startsWith(tag)) return true;
  }
  return false;
}

/** ログ本文から馬名を解決（旧形式の叙述付きログにも対応） */
function resolveHorseNameFromLogFragment(text, horseMetaByName) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return trimmed;
  if (!horseMetaByName || horseMetaByName.size === 0) return trimmed;
  const names = [...horseMetaByName.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (trimmed === name || trimmed.startsWith(`${name} `) || trimmed.startsWith(name)) {
      return name;
    }
  }
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function formatHorseBadgeNameHtml(horseName, horseMetaByName) {
  const meta = horseMetaByName?.get(horseName);
  const waku = JRA_WAKU_COLORS[meta?.waku] ?? { bg: '#888', text: '#fff' };
  const gate = meta?.gate ?? '?';
  const badge = `<span class="horse-badge" style="background:${waku.bg};color:${waku.text};">${escapeHtml(String(gate))}</span>`;
  const nameHtml = `<span class="horse-name">${escapeHtml(horseName)}</span>`;
  return `${badge}${nameHtml}`;
}

function formatIrregularLogLineHtml(logLine, horseMetaByName) {
  const tagMatch = logLine.match(/^(\[[^\]]+\])/);
  if (!tagMatch) return null;
  const tagText = tagMatch[1];
  const restText = logLine.slice(tagText.length).trimStart();
  const horseName = resolveHorseNameFromLogFragment(restText, horseMetaByName);
  const tagClass = getLogTagClass(logLine);
  const tagHtml = `<span class="${tagClass}">${escapeHtml(tagText)}</span>`;
  const horseHtml = formatHorseBadgeNameHtml(horseName, horseMetaByName);
  return `${tagHtml} ${horseHtml}`;
}

/** 旧形式（⭕️17馬名）の馬名部分を meta から解決する */
function resolveBattleHorseName(sideFragment, horseMetaByName) {
  const trimmed = String(sideFragment ?? '').trim();
  if (!trimmed) return trimmed;
  if (!horseMetaByName || horseMetaByName.size === 0) {
    return trimmed.replace(/^\d+/, '').trim() || trimmed;
  }
  const names = [...horseMetaByName.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (trimmed === name || trimmed.endsWith(name)) return name;
  }
  return trimmed.replace(/^\d+/, '').trim() || trimmed;
}

function parseBattleMatchup(bodyText, horseMetaByName) {
  const m = String(bodyText ?? '').match(/^⭕️(.+?) vs ❌(.+)$/u);
  if (!m) return null;
  return {
    winnerName: resolveBattleHorseName(m[1], horseMetaByName),
    loserName: resolveBattleHorseName(m[2], horseMetaByName),
  };
}

function formatBattleHorseSideHtml(emoji, horseName, horseMetaByName) {
  const meta = horseMetaByName?.get(horseName);
  const waku = JRA_WAKU_COLORS[meta?.waku] ?? { bg: '#888', text: '#fff' };
  const gate = meta?.gate ?? '?';
  const badge = `<span class="horse-badge" style="background:${waku.bg};color:${waku.text};">${escapeHtml(String(gate))}</span>`;
  const nameHtml = `<span class="horse-name">${escapeHtml(horseName)}</span>`;
  const iconHtml = emoji
    ? `<span class="battle-icon" aria-hidden="true">${emoji}</span>`
    : '';
  return `<span class="battle-side">${iconHtml}${badge}${nameHtml}</span>`;
}

function formatBattleLogLineHtml(logLine, horseMetaByName) {
  const battleType = getBattleTypeLabel(logLine);
  if (!battleType) return null;

  const tagText = `${BATTLE_LOG_PREFIX}${battleType}]`;
  const bodyStart = tagText.length;
  let bodyText = logLine.slice(bodyStart);
  if (bodyText.startsWith('\n')) bodyText = bodyText.slice(1);
  else bodyText = bodyText.trimStart();

  const { tag } = getBattleCssKeys(battleType);
  const tagHtml = `<span class="log-tag ${tag}">${escapeHtml(tagText)}</span>`;

  const matchup = parseBattleMatchup(bodyText, horseMetaByName);
  let bodyInner;
  if (matchup) {
    const winnerHtml = formatBattleHorseSideHtml('⭕️', matchup.winnerName, horseMetaByName);
    const loserHtml = formatBattleHorseSideHtml('❌', matchup.loserName, horseMetaByName);
    bodyInner = `${winnerHtml}<span class="battle-vs">vs</span>${loserHtml}`;
  } else {
    bodyInner = escapeHtml(bodyText);
  }
  const bodyHtml = `<span class="battle-matchup">${bodyInner}</span>`;
  return `${tagHtml}<br>${bodyHtml}`;
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

  if (isBattleLogLine(logLine)) {
    return formatBattleLogLineHtml(logLine, horseMetaByName);
  }

  if (isIrregularLogLine(logLine)) {
    return formatIrregularLogLineHtml(logLine, horseMetaByName);
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
