import { createRng }      from './src/engine/rng.js';
import { calcAllParams, calcWaku } from './src/engine/params.js';
import { buildPhases, calcStaminaCons, applyCornerLoss, laneIndex, getStylePaceMultiplier }
                          from './src/engine/phase.js';
import { detectContacts, shouldBattle, resolveBattle }
                          from './src/engine/battle.js';
import { CONFIG }         from './src/config.js';
import { Renderer }       from './src/ui/renderer.js';
import {
  addAggregateRun,
  clearAggregateState,
  computeBucketKey,
  loadAggregateState,
  persistRaceBundleToSession,
  SESSION_KEY_OPEN_SCREEN,
  SESSION_KEY_OPEN_SIMULATOR,
  SESSION_KEY_SIMULATOR_STATE,
  SESSION_KEY_SIMULATOR_GOAL_RECORDING,
  SESSION_KEY_STATS_RETURN_SCREEN,
  SESSION_KEY_SUMMARY_STATE,
} from './src/stats/aggregate-store.js';
import { formatRaceInfo, resolveCourseDef } from './src/stats/race-display.js';
import { JRA_WAKU_COLORS } from './src/ui/colors.js';
import {
  runSimulation,
  clampLane,
  applyBattleStaminaImpact,
  isNigeStyle,
  getJockeyReliabilityNorm,
  getJockeyAggressionNorm,
  isLaneInShiftPath,
} from './src/engine/simulation.js';
import {
  MIN_FORWARD_GAP,
  LATERAL_BLOCK_X_GAP,
  LATERAL_BLOCK_LANE_GAP,
  DIAGONAL_REAR_BLOCK_X_GAP,
  DIAGONAL_REAR_BLOCK_LANE_GAP,
  DIAGONAL_REAR_INNER_BAND_OUTER_EPS,
  DIAGONAL_REAR_INNER_BAND_INNER_MARGIN,
  LANE_WIDTH,
  INNER_HALF_LANE_MAX,
  LEAD_BATTLE_PHASE_MAX,
  EARLY_LEAD_RATIO_MAX,
  FINAL_DUEL_PHASE_MIN,
  FORMATION_LOCK_PHASE,
  PRE_CORNER_PACK_PHASE_MAX,
  COLLISION_MIN_Y_GAP,
  COLLISION_ITERATIONS,
  COLLISION_ITERATIONS_EARLY,
  COLLISION_EPS,
  START_DELAY_BASE_RATE,
  STUMBLE_BASE_RATE,
  STUMBLE_PHASE_MAX,
  EARLY_TROUBLE_DECAY_PER_100M,
  EARLY_ORDER_TIE_NOISE,
  EARLY_OUTER_NIGE_START_RATIO,
  EARLY_OUTER_NIGE_ADV_GAIN_MAX,
  EARLY_OUTER_NIGE_DRAIN_PER_100M,
  START_PHASE_NIGE_PACE_BLEND,
  START_PHASE_GAP_CATCH_SCALE,
  START_PHASE_OUTER_NIGE_SCALE,
  OONIGE_BURST_ROLL_MIN,
  OONIGE_BURST_ROLL_MAX,
  OONIGE_BURST_PHASE_JITTER_MIN,
  OONIGE_BURST_PHASE_JITTER_MAX,
  OONIGE_DRAIN_BURST_LINK_GAIN,
  OONIGE_PHASE_DRAIN_EARLY_MULT,
  OONIGE_PHASE_DRAIN_LATE_MULT,
  FRONTRUN_ROLL_MIN,
  FRONTRUN_ROLL_MAX,
  OONIGE_LATE_DRAIN_BASE_PER_100M,
  OONIGE_LATE_DRAIN_LEAD_GAIN,
  USE_SAFE_STAMINA_MODEL,
  SAFE_BASE_STAMINA_PER_M,
  SAFE_LANE_EVENT_DRAIN_MULT,
  SAFE_CORNER_EVENT_DRAIN_MULT,
  SAFE_ACCEL_EVENT_DRAIN_MULT,
  SAFE_GOAL_EVENT_FATIGUE_WEIGHT,
  SAFE_GOAL_STAMINA_PER_M_REF,
  SAFE_GOAL_STAMINA_PER_M_RANGE,
  START_BURST_STAMINA_FREE_CAP,
  NIGE_PACE_EXTRA_DRAIN_FLOOR,
  NIGE_OUTER_DASH_CLEAR_LEAD_MULT,
  OONIGE_LATE_CLEAR_LEAD_MULT,
  OONIGE_LATE_CLEAR_LEAD_GAP,
  GOAL_FURLONG_METERS,
  GOAL_TIME_SCALE,
  GOAL_DISTANCE_METERS,
  GOAL_LAST3F_DISTANCE_M,
  GOAL_LAST3F_SEC_CLAMP_MIN,
  GOAL_LAST3F_SEC_CLAMP_MAX,
  GOAL_LAST3F_FALLBACK_SEC,
  GOAL_X_PER_METER,
  GOAL_LANE_CHANGE_PER_SEC,
  GOAL_BLOCK_X_GAP,
  GOAL_MIN_PACK_GAP_X,
  GOAL_NEAR_LANE_GAP_BASE,
  GOAL_NEAR_LANE_GAP_MAX,
  GOAL_LANE_CHANGE_COOLDOWN_MS,
  FINAL_LANE_CHANGE_COOLDOWN_PHASES,
  FINAL_FRONT_BLOCK_EXTRA_GAP,
  FINAL_STRAIGHT_RATIO,
  POST_C3_STAMINA_SPREAD_FLOOR,
  PROACTIVE_LATE_SPREAD_INTENT_MIN,
  LATERAL_SHIFT_SOFT_CAP,
  LATERAL_SHIFT_HARD_CAP,
  LATERAL_SHIFT_THROUGH_C3_CAP,
  START_LATERAL_SHIFT_CAP,
  GOAL_MIN_SPEED_RATIO,
  GOAL_MAX_SPEED_RATIO,
  GOAL_POST_SCROLL_MS,
  GOAL_POST_CLEAR_METERS,
  RACE_SUMMARY_HEADER_LINE,
  RACE_SUMMARY_SCENE_LABELS,
  GOAL_PROGRESS_MAX_POST_LINE,
  GOAL_ENTRY_LEADER_START_PROGRESS,
  GOAL_PROGRESS_MIN,
  GOAL_SCENE_TRANSITION_MS,
  GOAL_SCENE_TRANSITION_MAX_ALPHA,
  GOAL_PROGRESS_TARGET_AT_FINISH,
  GOAL_LEADER_ANCHOR_PROGRESS,
  GOAL_ANCHOR_MAX_PROGRESS,
  GOAL_PROGRESS_SPAN,
  GOAL_EARLY_PHASE_T,
  GOAL_SPREAD_EARLY_MULT,
  GOAL_ANCHOR_FOLLOW_SCALE,
  GOAL_CAMERA_LERP,
  GOAL_CAMERA_LERP_MAX,
  GOAL_ANCHOR_DYNAMIC_BOOST,
  STAMINA_LANE_CHANGE_COST,
  STAMINA_ACCEL_COST,
  STAMINA_EARLY_ACCEL_MULT,
  STAMINA_BATTLE_BASE_COST,
  STAMINA_BATTLE_LOSER_EXTRA,
  STAMINA_BATTLE_TRACKER_GAIN,
  INNER_CUTIN_BATTLE_COOLDOWN_PHASES,
  INNER_CUTIN_REMATCH_COOLDOWN_PHASES,
  INNER_CUTIN_MIN_INWARD_DELTA,
  INNER_CUTIN_WINNER_STAMINA_MULT,
  INNER_CUTIN_LOSER_STAMINA_MULT,
  THROUGH_C3_LANE_CHANGE_TRIGGER_DELTA,
  INNER_RAIL_GAP_OPTIONS,
  INNER_RAIL_GAP_WEIGHTS,
  INNER_POCKET_FRONT_GAP_RATIO,
  INNER_POCKET_REAR_GAP_RATIO,
  PRE_CORNER_INNER_COMPRESS_ITERS,
  PRE_CORNER_FORCE_INNER_STEP,
  PRE_CORNER_MIN_Y_GAP_MULT,
  HOME_OUTER_REROUTE_STEPS,
  COLLISION_FRONT_BUFFER_X,
  COLLISION_REAR_BUFFER_X,
  INNER_CUTIN_BUFFER_MULT,
  PACK_DENSITY_PENALTY_QUAD,
  STAMINA_CORNER_OUTER_PER_LANE,
  GOAL_STAMINA_DRAIN_MULT,
  GOAL_AI,
} from './src/engine/constants.js';

function goalIntrinsicMpsFromLast3f(last3fSec) {
  const s = Number.isFinite(last3fSec)
    ? Math.max(GOAL_LAST3F_SEC_CLAMP_MIN, Math.min(GOAL_LAST3F_SEC_CLAMP_MAX, last3fSec))
    : GOAL_LAST3F_FALLBACK_SEC;
  return GOAL_LAST3F_DISTANCE_M / s;
}

/** スタミナ残量だけでスピード上限を掛ける（last_3f とは独立に毎フレーム変化） */
function goalStaminaSpeedMult(staminaRatio) {
  const r = Math.max(0, Math.min(1, staminaRatio));
  // スタミナが残っている間は last_3f 由来の能力を素直に出し、
  // ほぼ枯渇した時だけ速度低下を入れる（速度への二重計上を避ける）。
  if (r >= 0.08) return 1.0;
  return 0.84 + (r / 0.08) * 0.16;
}

function normalize01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function mapIdEntriesToMap(entries) {
  if (entries instanceof Map) return entries;
  if (Array.isArray(entries)) return new Map(entries);
  if (entries && typeof entries === 'object') return new Map(Object.entries(entries));
  return new Map();
}

function lastGoalRecordingFrame(recording) {
  if (!Array.isArray(recording) || recording.length === 0) return null;
  return recording[recording.length - 1];
}

/** ゴール演出の記録フレームをコース Canvas に描画（全馬ゴール後の空コース含む） */
function drawGoalCourseFrame(renderer, frame, phase) {
  if (!frame || !renderer || !phase) return false;
  const horses = (frame.horses ?? []).map(h => ({ ...h }));
  if (frame.kind === 'transition') {
    renderer.draw(horses, phase, 1, {
      sceneTransition: {
        t: frame.transitionT ?? 0,
        maxAlpha: GOAL_SCENE_TRANSITION_MAX_ALPHA,
      },
    });
    return true;
  }
  const goalRun = frame.drawOptions?.goalRun ?? {};
  renderer.draw(horses, phase, 1, {
    phaseLabel: goalRun.phaseLabel ?? 'ゴールシーン',
    furlong: goalRun.furlong ?? { t: frame.rawT ?? 0 },
    goalLine: goalRun.goalLine ?? frame.rawT ?? 0,
    sceneTransition: frame.drawOptions?.sceneTransition ?? undefined,
    goalRun: {
      ...goalRun,
      progressById: mapIdEntriesToMap(goalRun.progressById),
      laneIntentById: mapIdEntriesToMap(goalRun.laneIntentById),
      overtakePressureById: mapIdEntriesToMap(goalRun.overtakePressureById),
    },
  });
  return true;
}

function getBattleLogClass(logLine) {
  if (logLine === '＝＝＝＝＝＝＝＝[着順]＝＝＝＝＝＝＝＝') return 'log-entry placing';
  if (logLine === RACE_SUMMARY_HEADER_LINE) return 'log-entry scene-heading';
  if (logLine.startsWith('[出遅れ]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[好スタート]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[つまずき]')) return 'log-entry irregular irregular-stumble';
  if (logLine.startsWith('[着順]')) return 'log-entry placing';
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

/** ホーム画面・着順掲示板（着順・馬番・馬名のみ） */
function formatHomePlacingRowInnerHtml(rank, horse, horseMetaByName) {
  const meta = horseMetaByName?.get(horse.name);
  const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
  const badgeHtml =
    meta && waku
      ? `<span class="summary-placing-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '<span class="summary-placing-badge" style="background:#1e3a5f;color:#fff;">-</span>';
  return `
      <span class="summary-placing-rank">${rank}着</span>
      ${badgeHtml}
      <span class="summary-placing-name">${escapeHtml(horse.name)}</span>
    `;
}

/** 右カラム #placing-panel とコース上オーバーレイ #placing-panel-overlay を同期 */
function syncPlacingPanelsHtml(html) {
  const main = document.getElementById('placing-panel');
  const overlay = document.getElementById('placing-panel-overlay');
  if (main) main.innerHTML = html;
  if (overlay) overlay.innerHTML = html;
}

function appendPlacingRowToPanels(rank, horse, horseMetaByName) {
  const rankClass =
    rank === 1 ? ' is-top1' : rank === 2 ? ' is-top2' : rank === 3 ? ' is-top3' : '';
  const makeDiv = () => {
    const div = document.createElement('div');
    div.className = `summary-placing-entry${rankClass}`;
    div.innerHTML = formatHomePlacingRowInnerHtml(rank, horse, horseMetaByName);
    return div;
  };
  const main = document.getElementById('placing-panel');
  const overlay = document.getElementById('placing-panel-overlay');
  if (main) {
    main.appendChild(makeDiv());
    main.scrollTop = main.scrollHeight;
  }
  if (overlay) {
    overlay.appendChild(makeDiv());
    /* オーバーレイは1着側を常に見えるよう先頭固定（下へスクロールで全頭確認） */
    overlay.scrollTop = 0;
  }
}

/** レースサマリ用ログ行かどうか（イベント抽出から除外する） */
function isRaceSummaryRelatedLine(line) {
  if (typeof line !== 'string') return true;
  if (line === RACE_SUMMARY_HEADER_LINE) return true;
  if (getRaceSummarySceneLabel(line)) return true;
  return false;
}

/**
 * 各馬に紐づくイベントログをスナップショットから抽出する。
 * 1ログ行に複数馬が含まれる場合（例: バトル行）は登場馬全員に同じ行を割り当てる。
 *
 * @returns {Map<string, Array<{ phaseLabel: string, text: string }>>}
 */
function extractHorseEventsBySnapshots(snapshots, phases, horseNames, getPhaseLabel) {
  const eventsByName = new Map();
  horseNames.forEach(name => {
    if (typeof name === 'string' && name.length > 0) {
      eventsByName.set(name, []);
    }
  });
  if (!Array.isArray(snapshots) || snapshots.length === 0) return eventsByName;

  const sortedNames = [...eventsByName.keys()].sort((a, b) => b.length - a.length);
  if (sortedNames.length === 0) return eventsByName;

  const escapedAlt = sortedNames.map(escapeRegExp).join('|');
  const namePattern = new RegExp(escapedAlt, 'g');

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const phase = phases?.[i] ?? null;
    const phaseLabel = phase ? (getPhaseLabel?.(phase) ?? '') : '';
    const lines = Array.isArray(snap?.eventLogs) ? snap.eventLogs : [];
    for (const line of lines) {
      if (isRaceSummaryRelatedLine(line)) continue;
      const matched = new Set();
      let m;
      namePattern.lastIndex = 0;
      while ((m = namePattern.exec(line)) !== null) {
        matched.add(m[0]);
        if (m.index === namePattern.lastIndex) namePattern.lastIndex++;
      }
      if (matched.size === 0) continue;
      matched.forEach(name => {
        const arr = eventsByName.get(name);
        if (arr) arr.push({ phaseLabel, text: line });
      });
    }
  }
  return eventsByName;
}

/** イベント1行のテキスト部分から、対象馬本人の馬名を強調表示用に整形する。 */
function formatHorseEventTextHtml(line, ownerName, horseMetaByName) {
  const fullHtml = formatLogLineHtml(line, horseMetaByName);
  return fullHtml;
}

/**
 * レースサマリー掲示板と同一ルールの着順ID列。
 * ゴール演出で記録した通過順を優先し、欠けがあれば simResults（到着順）で補完する。
 */
function buildSummaryPlacingOrderIds(finishOrderIds, simResults) {
  const orderedIds =
    Array.isArray(finishOrderIds) && finishOrderIds.length > 0
      ? [...finishOrderIds]
      : (simResults ?? []).map(h => h.id);
  const seen = new Set(orderedIds);
  if (Array.isArray(simResults)) {
    for (const r of simResults) {
      if (r && Number.isFinite(r.id) && !seen.has(r.id)) {
        orderedIds.push(r.id);
        seen.add(r.id);
      }
    }
  }
  return orderedIds;
}

function renderRaceSummaryScreen({
  raceData,
  simResults,
  finishOrderIds,
  horseMetaByName,
  snapshots,
  phases,
  getPhaseLabel,
}) {
  const screenEl = document.getElementById('race-summary-screen');
  if (!screenEl) return;

  const infoEl = document.getElementById('summary-race-info');
  if (infoEl) infoEl.innerHTML = formatRaceInfo(raceData);

  const placingsEl = document.getElementById('summary-placings');
  const eventsEl = document.getElementById('summary-horse-events');
  if (!placingsEl || !eventsEl) return;

  const resultsById = new Map();
  (simResults ?? []).forEach(h => {
    if (h && Number.isFinite(h.id)) resultsById.set(h.id, h);
  });

  const orderedIds = buildSummaryPlacingOrderIds(finishOrderIds, simResults);
  const sexAgeById = new Map(
    (raceData?.entries ?? []).map((entry, idx) => [idx, String(entry?.horse?.sex_age ?? '')]),
  );

  placingsEl.innerHTML = '';
  const placingItems = orderedIds.map((id, idx) => {
    const horse = resultsById.get(id);
    if (!horse) return null;
    const rank = idx + 1;
    const meta = horseMetaByName?.get(horse.name);
    const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
    const badgeHtml = meta && waku
      ? `<span class="summary-placing-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '<span class="summary-placing-badge" style="background:#1e3a5f;color:#fff;">-</span>';
    const sexAgeLabel = sexAgeById.get(id) || String(horse.sexAge ?? '');
    const sexAgeClass = sexAgeLabel.startsWith('牝')
      ? ' is-female'
      : sexAgeLabel.startsWith('牡')
        ? ' is-male'
        : '';
    const jockeyName = horse.jockeyName ? String(horse.jockeyName) : '—';
    const rankClass = rank === 1 ? ' is-top1' : rank === 2 ? ' is-top2' : rank === 3 ? ' is-top3' : '';
    const div = document.createElement('div');
    div.className = `summary-placing-entry${rankClass}`;
    div.innerHTML = `
      <span class="summary-placing-rank">${rank}着</span>
      ${badgeHtml}
      <div class="summary-placing-line">
        <span class="summary-placing-name">${escapeHtml(horse.name)}</span>
        <span class="summary-placing-meta">
          <span class="summary-placing-sex-age${sexAgeClass}">${escapeHtml(sexAgeLabel || '—')}</span>
          <span class="summary-placing-jockey">${escapeHtml(jockeyName)}</span>
        </span>
      </div>
    `;
    placingsEl.appendChild(div);
    return { id: horse.id, rank, horse };
  }).filter(Boolean);

  const horseNames = placingItems
    .map(item => item.horse.name)
    .filter(name => typeof name === 'string' && name.length > 0);
  const eventsByName = extractHorseEventsBySnapshots(snapshots, phases, horseNames, getPhaseLabel);

  eventsEl.innerHTML = '';
  placingItems.forEach(item => {
    const { rank, horse } = item;
    const block = document.createElement('div');
    const rankClass = rank === 1 ? ' is-top1' : rank <= 3 ? ' is-top3' : '';
    block.className = `summary-horse-block${rankClass}`;

    const meta = horseMetaByName?.get(horse.name);
    const waku = meta ? (JRA_WAKU_COLORS[meta.waku] ?? { bg: '#888', text: '#fff' }) : null;
    const badgeHtml = meta && waku
      ? `<span class="horse-badge" style="background:${waku.bg};color:${waku.text};">${meta.gate}</span>`
      : '';
    const head = document.createElement('div');
    head.className = 'summary-horse-head';
    head.innerHTML = `
      <span class="summary-horse-rank">${rank}着</span>
      ${badgeHtml}
      <span class="summary-horse-name">${escapeHtml(horse.name)}</span>
    `;
    block.appendChild(head);

    const list = document.createElement('div');
    list.className = 'summary-horse-events';
    const events = eventsByName.get(horse.name) ?? [];
    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'summary-horse-event-empty';
      empty.textContent = '目立ったイベントはありませんでした';
      list.appendChild(empty);
    } else {
      events.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'summary-horse-event';
        const phaseLabel = ev.phaseLabel ? `<span class="summary-event-phase">${escapeHtml(ev.phaseLabel)}</span>` : '';
        const bodyHtml = formatHorseEventTextHtml(ev.text, horse.name, horseMetaByName);
        row.innerHTML = `${phaseLabel}<span class="summary-event-body">${bodyHtml}</span>`;
        list.appendChild(row);
      });
    }
    block.appendChild(list);
    eventsEl.appendChild(block);
  });

  screenEl.hidden = false;
}

function hideRaceSummaryScreen() {
  const screenEl = document.getElementById('race-summary-screen');
  if (screenEl) screenEl.hidden = true;
}

function applyStartSlowMotion(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const slowZone = 0.36;
  const slowFactor = 0.58;
  if (p <= slowZone) return p * slowFactor;
  const slowOut = slowZone * slowFactor;
  const remainIn = 1 - slowZone;
  const remainOut = 1 - slowOut;
  return slowOut + ((p - slowZone) / remainIn) * remainOut;
}


// =====================
//  出馬表の初期描画（充実版）
// =====================
/** 残スタミナ表示: 実比率この％未満はバー0%、この％でバー100%（見せ方のスケール） */
const ENTRY_STAMINA_BAR_RAW_MIN = 60;
const ENTRY_STAMINA_BAR_RAW_MAX = 100;

/** 出馬表の脚質バッジ用クラス（index.html の .entry-style--* と対応） */
const ENTRY_STYLE_BADGE_CLASS = {
  大逃げ: 'entry-style--oonige',
  逃げ: 'entry-style--nige',
  先行: 'entry-style--senko',
  差し: 'entry-style--sashi',
  追込: 'entry-style--oikomi',
};

function getEntryStyleBadgeClass(style) {
  return ENTRY_STYLE_BADGE_CLASS[style] ?? 'entry-style--default';
}

/** プレレース編集で選べる脚質（シミュレーションが参照するラベルと一致） */
const PRE_RACE_STYLE_OPTIONS = ['大逃げ', '逃げ', '先行', '差し', '追込'];

function cloneRaceEntries(entries) {
  try {
    return structuredClone(entries);
  } catch {
    return JSON.parse(JSON.stringify(entries));
  }
}

function clampNumber(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round100(n) {
  return Math.round(n * 100) / 100;
}

/**
 * プレレース表の見やすさを保ちつつ、必要時のみ軽く縮小する
 */
function updatePreRaceTableFit() {
  const editor = document.getElementById('pre-race-editor');
  const wrap = document.querySelector('.pre-race-table-wrap');
  const inner = document.querySelector('.pre-race-table-inner');
  if (!editor || !wrap || !inner) return;
  if (editor.hidden) return;

  inner.style.zoom = '';
  inner.style.transform = '';
  inner.style.marginBottom = '';

  const availH = wrap.clientHeight;
  const nh = inner.scrollHeight;
  if (availH < 8 || nh < 1) return;

  const scaleByHeight = availH / nh;
  const scale = Math.max(0.9, Math.min(1, scaleByHeight));
  if (scale >= 0.999) return;

  inner.style.transform = `scale(${scale})`;
  inner.style.transformOrigin = 'top center';
  inner.style.marginBottom = `${-(nh * (1 - scale))}px`;
}

function schedulePreRaceTableFit() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => updatePreRaceTableFit());
  });
}

/**
 * 出走表プレレース編集 UI を構築する（runtimeRaceData.entries を直接更新）
 */
function mountPreRaceEditor(runtimeRaceData, onConfirm, onBeforeConfirm, options = {}) {
  const tbody = document.getElementById('pre-race-tbody');
  const infoEl = document.getElementById('pre-race-race-info');
  const btn = document.getElementById('btn-pre-race-confirm');
  if (!tbody || !btn) return;

  if (infoEl) {
    infoEl.innerHTML = formatRaceInfo(runtimeRaceData);
  }

  tbody.innerHTML = '';

  function makeStepperCell(get, set, min, max, step, fmt, normalizeValue = round100) {
    const td = document.createElement('td');
    td.className = 'pre-race-num-cell';
    const inner = document.createElement('div');
    inner.className = 'pre-race-stepper';
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '−';
    const val = document.createElement('span');
    val.className = 'pre-race-val';
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '+';
    const paint = () => {
      val.textContent = fmt(get());
    };
    const applyDelta = delta => {
      set(normalizeValue(clampNumber(get() + delta, min, max)));
      paint();
    };
    down.addEventListener('click', () => applyDelta(-step));
    up.addEventListener('click', () => applyDelta(step));
    paint();
    inner.append(down, val, up);
    td.appendChild(inner);
    return td;
  }

  const totalEntries = runtimeRaceData.entries.length;

  runtimeRaceData.entries.forEach(entry => {
    if (!entry.jockey) entry.jockey = {};
    const horse = entry.horse;
    const jockey = entry.jockey;
    if (!Number.isFinite(jockey.win_rate)) jockey.win_rate = 0;
    if (!Number.isFinite(jockey.top3_rate)) jockey.top3_rate = 0.5;

    const tr = document.createElement('tr');

    const waku = calcWaku(entry.gate, totalEntries);
    const wakuColors = JRA_WAKU_COLORS[waku] ?? { bg: '#888888', text: '#ffffff' };

    const tdGate = document.createElement('td');
    tdGate.className = 'pre-race-gate-cell';
    const gateBadge = document.createElement('span');
    gateBadge.className = 'entry-gate';
    gateBadge.textContent = String(entry.gate);
    gateBadge.style.background = wakuColors.bg;
    gateBadge.style.color = wakuColors.text;
    gateBadge.style.border = '1px solid rgba(255,255,255,0.3)';
    tdGate.appendChild(gateBadge);
    tr.appendChild(tdGate);

    const tdName = document.createElement('td');
    tdName.className = 'pre-race-name';
    tdName.textContent = horse.name ?? '';
    tdName.title = horse.name ?? '';
    tr.appendChild(tdName);

    const tdSexAge = document.createElement('td');
    tdSexAge.className = 'pre-race-readonly';
    const sexAgeLabel = horse.sex_age ?? '';
    const sexSpan = document.createElement('span');
    sexSpan.className = 'entry-demographics';
    sexSpan.textContent = sexAgeLabel;
    if (sexAgeLabel.startsWith('牝')) sexSpan.classList.add('is-female');
    else if (sexAgeLabel.startsWith('牡')) sexSpan.classList.add('is-male');
    tdSexAge.appendChild(sexSpan);
    tr.appendChild(tdSexAge);

    const tdWeightRo = document.createElement('td');
    tdWeightRo.className = 'pre-race-readonly';
    tdWeightRo.textContent = Number.isFinite(horse.weight) ? `${horse.weight}kg` : '—';
    tr.appendChild(tdWeightRo);

    const tdJockeyName = document.createElement('td');
    tdJockeyName.className = 'pre-race-jockey-name';
    tdJockeyName.textContent = jockey.name ?? '';
    tdJockeyName.title = jockey.name ?? '';
    tr.appendChild(tdJockeyName);

    const tdStyle = document.createElement('td');
    const styleWrap = document.createElement('span');
    const syncStyleBadgeClass = () => {
      styleWrap.className = `entry-style-inline pre-race-style-wrap ${getEntryStyleBadgeClass(horse.style)}`;
    };
    syncStyleBadgeClass();

    const sel = document.createElement('select');
    sel.className = 'pre-race-select';
    const styleSet = new Set(PRE_RACE_STYLE_OPTIONS);
    if (horse.style && !styleSet.has(horse.style)) {
      const o = document.createElement('option');
      o.value = horse.style;
      o.textContent = horse.style;
      sel.appendChild(o);
    }
    PRE_RACE_STYLE_OPTIONS.forEach(s => {
      const o = document.createElement('option');
      o.value = s;
      o.textContent = s;
      if (horse.style === s) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      horse.style = sel.value;
      syncStyleBadgeClass();
    });
    styleWrap.appendChild(sel);
    tdStyle.appendChild(styleWrap);
    tr.appendChild(tdStyle);

    tr.appendChild(
      makeStepperCell(
        () => horse.ave_3f,
        v => {
          horse.ave_3f = v;
        },
        32,
        42,
        0.1,
        v => round1(v).toFixed(1),
        round1,
      ),
    );

    tr.appendChild(
      makeStepperCell(
        () => horse.last_3f,
        v => {
          horse.last_3f = v;
        },
        30,
        37,
        0.1,
        v => round1(v).toFixed(1),
        round1,
      ),
    );

    tr.appendChild(
      makeStepperCell(
        () => jockey.win_rate,
        v => {
          jockey.win_rate = v;
        },
        0.05,
        0.45,
        0.01,
        v => `${Math.round(round100(v) * 100)}%`,
        round100,
      ),
    );

    tr.appendChild(
      makeStepperCell(
        () => jockey.top3_rate,
        v => {
          jockey.top3_rate = v;
        },
        0.3,
        0.7,
        0.01,
        v => `${Math.round(round100(v) * 100)}%`,
        round100,
      ),
    );

    tbody.appendChild(tr);
  });

  btn.addEventListener('click', () => {
    if (typeof onBeforeConfirm === 'function' && onBeforeConfirm() === false) return;
    onConfirm();
  });

  schedulePreRaceTableFit();
  const wrapEl = document.querySelector('.pre-race-table-wrap');
  if (wrapEl && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => schedulePreRaceTableFit());
    ro.observe(wrapEl);
  }
  window.addEventListener('resize', schedulePreRaceTableFit);

  if (options.openSimulatorDirect) {
    if (!(typeof onBeforeConfirm === 'function' && onBeforeConfirm() === false)) {
      onConfirm();
    }
  }
}

function renderEntryList(horses) {
  const listEl = document.getElementById('entry-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  horses.forEach(horse => {
    const waku = JRA_WAKU_COLORS[horse.waku] ?? { bg: '#888', text: '#fff' };
    const staminaDisplayPct = getStaminaDisplayBarPct(horse);
    const staminaBarClass = getStaminaBarClassName(staminaDisplayPct);
    const weightLabel = Number.isFinite(horse.weight) ? `${horse.weight}kg` : '';
    const profileLabel = [horse.sexAge, weightLabel].filter(Boolean).join(' ');
    const sexClass = horse.sexAge?.startsWith('牝')
      ? 'is-female'
      : horse.sexAge?.startsWith('牡')
        ? 'is-male'
        : '';

    const row = document.createElement('div');
    row.className        = 'entry-row';
    row.dataset.horseId  = horse.id;
    // 左端に枠色の帯を border-left で表示
    row.style.borderLeft = `5px solid ${waku.bg}`;
    row.style.boxShadow  = `inset 3px 0 8px rgba(0,0,0,0.18)`;
    row.innerHTML = `
      <div class="entry-gate" style="background:${waku.bg};color:${waku.text};border:1px solid rgba(255,255,255,0.3);">${horse.gate}</div>
      <div class="entry-meta-line">
        <span class="entry-name">${escapeHtml(horse.name)}</span>
        ${profileLabel ? `<span class="entry-demographics ${sexClass}">${escapeHtml(profileLabel)}</span>` : ''}
        <span class="entry-jockey-inline">🏇 ${escapeHtml(horse.jockeyName ?? '')}</span>
        <span class="entry-style-inline ${getEntryStyleBadgeClass(horse.style)}">${escapeHtml(horse.style)}</span>
      </div>
      <div class="entry-params">
        <div class="param-row param-row--stamina">
          <div class="param-bar-bg"><div class="param-bar ${staminaBarClass}" style="width:${staminaDisplayPct}%"></div></div>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

/** 初期スタミナに対する実残量％（0〜100） */
function getStaminaRemainRawPct(horse) {
  if (!horse || horse.initialStamina <= 0) return 0;
  const ratio = (horse.stamina / horse.initialStamina) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

/**
 * バー幅・表示用％（ENTRY_STAMINA_BAR_RAW_MIN〜MAX を 0〜100% に線形マップ）
 */
function getStaminaDisplayBarPct(horse) {
  const raw = getStaminaRemainRawPct(horse);
  const span = ENTRY_STAMINA_BAR_RAW_MAX - ENTRY_STAMINA_BAR_RAW_MIN;
  if (span <= 0) return raw;
  const t = (raw - ENTRY_STAMINA_BAR_RAW_MIN) / span;
  return Math.max(0, Math.min(100, Math.round(t * 100)));
}

/** 表示％（60〜100実残を 0〜100 にマップした値）で色分け。ラベル・バー幅と一致させる */
function getStaminaBarClassName(staminaDisplayPct) {
  if (staminaDisplayPct <= 25) return 'stamina-remain-bar is-critical';
  if (staminaDisplayPct < 50) return 'stamina-remain-bar is-warning';
  return 'stamina-remain-bar';
}

function updateEntryStaminaBars(horses) {
  horses.forEach(horse => {
    const rowEl = document.querySelector(`[data-horse-id="${horse.id}"]`);
    if (!rowEl) return;
    const displayPct = getStaminaDisplayBarPct(horse);
    const barEl = rowEl.querySelector('.stamina-remain-bar');
    if (barEl) {
      barEl.style.width = `${displayPct}%`;
      barEl.className = `param-bar ${getStaminaBarClassName(displayPct)}`;
    }
  });
}

// =====================
//  フェーズ手動進行コントローラー（ステップバイステップ）
// =====================
class PhaseController {
  constructor(
    snapshots,
    phases,
    renderer,
    initialHorses = [],
    horseMetaByName = new Map(),
    simResults = null,
    playbackHooks = {},
  ) {
    this.snapshots   = snapshots;
    this.playbackHooks = playbackHooks ?? {};
    this.goalSceneActive = false;
    this.phases      = phases;
    this.renderer    = renderer;
    this.simResults  = simResults;
    this.initialHorses = initialHorses.map(h => ({ ...h }));
    this.horseMetaByName = horseMetaByName;
    this.currentIdx  = 0;
    this.lastRenderedHorses = null;
    this._logQueue   = [];
    this._logTimer   = null;
    this._goalRankLogged = new Set();
    this._goalRankOrder = [];
    this._goalPlacingHeaderLogged = false;
    this._goalLineDiffById = new Map();
    this._goalAllFinishedAtMs = null;
    this._goalCameraRawProgress = null;
    this._goalBattledPairs = new Set();
    this.isReplayPlayback = Boolean(playbackHooks.isReplayPlayback);
    this.recordGoalPlayback = Boolean(playbackHooks.recordGoalPlayback);
    this.goalRecording = Array.isArray(playbackHooks.goalRecording)
      ? playbackHooks.goalRecording
      : null;
    this.raceData = { race_id: playbackHooks.raceId ?? 1 };
    this._pendingGoalRecording = [];
    this._replayGoalRankSynced = 0;

    this.btnAdvance = document.getElementById('btn-play-step');
    this.logPanel  = document.getElementById('log-panel');
    this.indicator = document.getElementById('phase-indicator');
    this.isAnimating = false;
    this.advanceExternallyLocked = false;
    this.frameCount  = 24; // 1フェーズを細かく刻む
    this.frameMs     = 70; // 1コマの表示時間
  }

  _syncAdvanceButton() {
    if (!this.btnAdvance) return;
    this.btnAdvance.disabled = this.isAnimating || this.advanceExternallyLocked;
  }

  setAdvanceExternallyLocked(locked) {
    this.advanceExternallyLocked = Boolean(locked);
    this._syncAdvanceButton();
  }

  start() {
    this.currentIdx = 0;
    this.renderer.resetHorseRenderState();
    this._initializePlacingPanel();
    this._renderPhase(0);
    this._syncAdvanceButton();
  }

  _renderPhase(idx) {
    const snap  = this.snapshots[idx];
    const phase = this.phases[idx];
    const prev  = idx > 0 ? this.snapshots[idx - 1] : null;
    const fromForAnimation = this.lastRenderedHorses
      ?? prev?.horses
      ?? this.initialHorses;

    const phaseName = this.renderer.getPhaseName(phase);
    this.indicator.textContent = phaseName;
    this._appendSceneHeading(phaseName);

    // 馬カードをアニメーション付きで描画（前フェーズ位置から開始）
    // ログは最初の描画フレームと同タイミングで _enqueueLogs する（案A）
    this._animateHorses(fromForAnimation, snap.horses, phase, idx === 0, snap.eventLogs);

    updateEntryStaminaBars(fromForAnimation ?? snap.horses);
  }

  // 馬カードをアニメーションで表示（段階的に進行度を上げる）
  _animateHorses(fromHorses, toHorses, phase, isFirstPhase = false, eventLogs = null) {
    this.isAnimating      = true;
    this._syncAdvanceButton();

    // 初回のみスタート演出（スタート隊列→第1フェーズ）
    if (isFirstPhase) {
      const holdFrames = 8;
      const moveFrames = this.frameCount;
      const totalFrames = holdFrames + moveFrames;
      const fromById = new Map((fromHorses ?? []).map(h => [h.id, h]));
      let frame = 0;
      const stepFirst = () => {
        frame++;
        const holdProgress = Math.min(1, frame / holdFrames);
        const rawMoveProgress = Math.max(0, Math.min(1, (frame - holdFrames) / moveFrames));
        const moveProgress = applyStartSlowMotion(rawMoveProgress);
        const gateOpenProgress = moveProgress <= 0.12
          ? 0
          : Math.max(0, Math.min(1, (moveProgress - 0.12) / 0.42));
        const gateSlide = moveProgress <= 0
          ? 0
          : Math.max(0, Math.min(1, (moveProgress - 0.10) / 0.65));
        const lateralProgress = gateSlide;
        const rendered = toHorses.map(to => {
          const from = fromById.get(to.id) ?? to;
          return {
            ...to,
            x: from.x + (to.x - from.x) * moveProgress,
            // ゲートが下がる演出に合わせて、横移動は少し遅れて開始する
            y: from.y + (to.y - from.y) * lateralProgress,
            stamina: from.stamina + (to.stamina - from.stamina) * moveProgress,
          };
        });

        this.renderer.draw(
          rendered,
          phase,
          moveProgress,
          {
            forceStartLineup: moveProgress <= 0.02,
            gateOpenProgress: moveProgress <= 0 ? holdProgress * 0.03 : gateOpenProgress,
            gateYOffset: gateSlide * this.renderer.H * 0.22,
            gateOpacity: 1 - gateSlide * 0.95,
          }
        );
        this.lastRenderedHorses = rendered.map(h => ({ ...h }));
        updateEntryStaminaBars(rendered);
        if (frame === 1 && Array.isArray(eventLogs) && eventLogs.length > 0) {
          this._enqueueLogs(eventLogs);
        }
        if (frame >= totalFrames) {
          this.lastRenderedHorses = toHorses.map(h => ({ ...h }));
          this.isAnimating = false;
          this._syncAdvanceButton();
          return;
        }
        setTimeout(stepFirst, this.frameMs);
      };
      setTimeout(stepFirst, this.frameMs);
      return;
    }

    const fromById = new Map((fromHorses ?? []).map(h => [h.id, h]));
    let frame = 0;
    const step = () => {
      frame++;
      const progress = Math.min(1, frame / this.frameCount);

      // 前フェーズ位置 -> 今フェーズ位置へ線形補間
      const tweened = toHorses.map(to => {
        const from = fromById.get(to.id) ?? to;
        return {
          ...to,
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
          stamina: from.stamina + (to.stamina - from.stamina) * progress,
        };
      });

      this.renderer.draw(tweened, phase, 1);
      this.lastRenderedHorses = tweened.map(h => ({ ...h }));
      updateEntryStaminaBars(tweened);
      if (frame === 1 && Array.isArray(eventLogs) && eventLogs.length > 0) {
        this._enqueueLogs(eventLogs);
      }
      if (progress >= 1) {
        this.lastRenderedHorses = toHorses.map(h => ({ ...h }));
        this.isAnimating = false;
        this._syncAdvanceButton();
        return;
      }
      setTimeout(step, this.frameMs);
    };
    setTimeout(step, this.frameMs);
  }

  // ログを1行ずつ時間差で表示
  _enqueueLogs(lines) {
    if (this._logTimer) {
      clearTimeout(this._logTimer);
      this._logTimer = null;
    }
    this._logQueue = [...lines];
    this._flushNextLog();
  }

  _flushNextLog() {
    if (this._logQueue.length === 0) return;
    const line = this._logQueue.shift();
    this._appendLog(line);
    this._logTimer = setTimeout(() => this._flushNextLog(), 80);
  }

  /** 着順枠の伸縮でログ欄が縮んでも、最新行が見えるよう末尾へスクロール */
  _scrollRaceLogToBottom() {
    if (!this.logPanel) return;
    const el = this.logPanel;
    const sync = () => {
      el.scrollTop = el.scrollHeight;
    };
    sync();
    requestAnimationFrame(() => {
      sync();
      requestAnimationFrame(sync);
    });
  }

  _appendLog(line) {
    const div  = document.createElement('div');
    div.className = getBattleLogClass(line);
    div.innerHTML = formatLogLineHtml(line, this.horseMetaByName);
    this.logPanel.appendChild(div);
    this.logPanel.scrollTop = this.logPanel.scrollHeight;
  }

  _appendSceneHeading(title) {
    const div = document.createElement('div');
    div.className = 'log-entry scene-heading';
    div.innerHTML = formatSceneHeadingHtml(title, this.horseMetaByName);
    this.logPanel.appendChild(div);
    this.logPanel.scrollTop = this.logPanel.scrollHeight;
  }

  _appendPlacingRow(rank, horse) {
    appendPlacingRowToPanels(rank, horse, this.horseMetaByName);
    this._scrollRaceLogToBottom();
  }

  _initializePlacingPanel() {
    syncPlacingPanelsHtml('');
  }

  _setPlacingLog(rank, horse) {
    this._appendPlacingRow(rank, horse);
  }

  getGoalRecording() {
    return this._pendingGoalRecording.length > 0 ? this._pendingGoalRecording : null;
  }

  _serializeGoalHorse(horse) {
    return {
      id: horse.id,
      name: horse.name,
      x: horse.x,
      y: horse.y,
      stamina: horse.stamina,
      initialStamina: horse.initialStamina,
      goalMeters: horse.goalMeters,
      goalFinished: horse.goalFinished,
      goalIntrinsicMps: horse.goalIntrinsicMps,
      goalProgressScale: horse.goalProgressScale,
      style: horse.style,
      gate: horse.gate,
      waku: horse.waku,
      battleFatigue: horse.battleFatigue,
      jockeyName: horse.jockeyName,
    };
  }

  _mapEntriesToMap(entries) {
    if (entries instanceof Map) return entries;
    if (Array.isArray(entries)) return new Map(entries);
    if (entries && typeof entries === 'object') return new Map(Object.entries(entries));
    return new Map();
  }

  _captureGoalPlaybackFrame(frame) {
    if (!this.recordGoalPlayback) return;
    this._pendingGoalRecording.push(frame);
  }

  _syncReplayGoalPlacing(horses, goalRankOrderSnapshot) {
    if (!Array.isArray(goalRankOrderSnapshot)) return;
    const synced = this._replayGoalRankSynced;
    if (goalRankOrderSnapshot.length <= synced) return;
    const horsesById = new Map(horses.map(h => [h.id, h]));
    for (let i = synced; i < goalRankOrderSnapshot.length; i++) {
      const id = goalRankOrderSnapshot[i];
      if (this._goalRankLogged.has(id)) continue;
      const horse = horsesById.get(id);
      if (!horse) continue;
      this._goalRankLogged.add(id);
      this._goalRankOrder.push(id);
      this._setPlacingLog(this._goalRankOrder.length, horse);
    }
    this._replayGoalRankSynced = goalRankOrderSnapshot.length;
  }

  _playGoalApproachFromRecording(onDone) {
    const frames = this.goalRecording;
    if (!Array.isArray(frames) || frames.length === 0) {
      onDone?.();
      return;
    }

    const lastIdx = this.snapshots.length - 1;
    const phase = this.phases[lastIdx];
    const transitionStartedAt = performance.now();
    const lastFrame = frames[frames.length - 1];
    const endElapsedMs =
      (Number.isFinite(lastFrame?.elapsedMs) ? lastFrame.elapsedMs : 0) +
      GOAL_POST_SCROLL_MS +
      120;

    this.isAnimating = true;
    this.goalSceneActive = true;
    this._syncAdvanceButton();
    this.playbackHooks.onGoalSceneStart?.();
    this.indicator.textContent = 'ゴールシーン';
    this._appendSceneHeading('ゴールシーン');
    this._goalRankLogged = new Set();
    this._goalRankOrder = [];
    this._goalPlacingHeaderLogged = false;
    this._goalLineDiffById = new Map();
    this._goalAllFinishedAtMs = null;
    this._goalCameraRawProgress = null;
    this._goalBattledPairs = new Set();
    this._replayGoalRankSynced = 0;

    const step = (ts) => {
      const elapsedMs = ts - transitionStartedAt;
      let idx = 0;
      while (idx < frames.length - 1 && frames[idx + 1].elapsedMs <= elapsedMs) {
        idx += 1;
      }
      const frame = frames[idx];
      const horses = (frame.horses ?? []).map(h => ({ ...h }));

      if (frame.kind === 'transition') {
        this.renderer.draw(horses, phase, 1, {
          sceneTransition: {
            t: frame.transitionT ?? 0,
            maxAlpha: GOAL_SCENE_TRANSITION_MAX_ALPHA,
          },
        });
      } else {
        const goalRun = frame.drawOptions?.goalRun ?? {};
        const progressById = this._mapEntriesToMap(goalRun.progressById);
        const laneIntentById = this._mapEntriesToMap(goalRun.laneIntentById);
        const overtakePressureById = this._mapEntriesToMap(goalRun.overtakePressureById);
        this.renderer.draw(horses, phase, 1, {
          phaseLabel: goalRun.phaseLabel ?? 'ゴールシーン',
          furlong: goalRun.furlong ?? { t: frame.rawT ?? 0 },
          goalLine: goalRun.goalLine ?? frame.rawT ?? 0,
          sceneTransition: frame.drawOptions?.sceneTransition ?? undefined,
          goalRun: {
            ...goalRun,
            progressById,
            laneIntentById,
            overtakePressureById,
          },
        });
        this._syncReplayGoalPlacing(horses, frame.goalRankOrderSnapshot);
        if (frame.goalAllFinishedAtMs != null) {
          this._goalAllFinishedAtMs = frame.goalAllFinishedAtMs;
        }
      }

      this.lastRenderedHorses = horses.map(h => ({ ...h }));
      updateEntryStaminaBars(horses);

      if (elapsedMs >= endElapsedMs) {
        this.isAnimating = false;
        this.goalSceneActive = false;
        this.lastRenderedHorses = horses.map(h => ({ ...h }));
        onDone?.();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _playGoalApproach(onDone) {
    if (!Array.isArray(this.simResults) || this.simResults.length === 0) {
      onDone?.();
      return;
    }

    if (this.isReplayPlayback && Array.isArray(this.goalRecording) && this.goalRecording.length > 0) {
      this._playGoalApproachFromRecording(onDone);
      return;
    }

    const lastIdx = this.snapshots.length - 1;
    const finalSnap = this.snapshots[lastIdx];
    const phase = this.phases[lastIdx];
    const baseHorses = (this.lastRenderedHorses ?? finalSnap.horses).map(h => ({ ...h }));
    // 最終直線最後のコマでレンダラーが実際に描いた cy を progress 値に逆算して保持し、
    // ゴール演出 1 コマ目で同位置から開始できるようにする。
    const initialRenderProgressById = new Map();
    this.renderer.horseRenderState.forEach((state, id) => {
      if (Number.isFinite(state?.cy)) {
        initialRenderProgressById.set(id, this.renderer.yToProgress(state.cy));
      }
    });
    // ※ 段階(α): 事前確定着順 (arrivalTime) を演出にバイアスとして渡さない方針へ移行。
    //   従来は fastWeightById を作って surge を ±18% 揺らしていたが、これは
    //   「runSimulation の結果を答え合わせさせる」構造になっており、ゴールシーンが
    //   自律シミュレーションとして機能していなかった。fastWeight 系は完全撤廃する。
    //   ここで simResults の有無だけは sanity check として残す（馬データ自体が必要なため）。
    if (!Array.isArray(this.simResults) || this.simResults.length === 0) {
      onDone?.();
      return;
    }

    const resultsById = new Map(this.simResults.map(h => [h.id, h]));
    const last3fValues = this.simResults
      .map(h => h.last3f)
      .filter(v => Number.isFinite(v));
    const minLast3f = last3fValues.length ? Math.min(...last3fValues) : 33;
    const maxLast3f = last3fValues.length ? Math.max(...last3fValues) : minLast3f + 1;
    const last3fSpan = Math.max(0.001, maxLast3f - minLast3f);

    const xValues = baseHorses.map(h => h.x);
    const maxX = Math.max(...xValues, 1);
    // 最終直線フェーズの描画式と揃えて、ゴール演出開始時の座標ジャンプを防ぐ。
    const drawSpan = Math.max(140, maxX);
    const calcFinalMappedProgress = (x) => {
      const normalized = Math.max(0, Math.min(1, x / drawSpan));
      const easedProgress = Math.pow(normalized, 0.82);
      return Math.min(0.93, easedProgress * 0.88 + 0.06);
    };
    const baseGoalProgressById = new Map();
    baseHorses.forEach(horse => {
      const carried = initialRenderProgressById.get(horse.id);
      const baseProgress = Number.isFinite(carried)
        ? carried
        : calcFinalMappedProgress(horse.x);
      baseGoalProgressById.set(horse.id, baseProgress);
    });
    let baseLeaderProgress = -Infinity;
    baseGoalProgressById.forEach(progress => {
      if (progress > baseLeaderProgress) baseLeaderProgress = progress;
    });
    if (!Number.isFinite(baseLeaderProgress)) {
      baseLeaderProgress = GOAL_ENTRY_LEADER_START_PROGRESS;
    }
    const goalEntryOffset = GOAL_ENTRY_LEADER_START_PROGRESS - baseLeaderProgress;

    const simHorses = baseHorses.map(h => {
      const rawStaminaRatio = h.initialStamina > 0 ? h.stamina / h.initialStamina : 0.5;
      const staminaRatio = rawStaminaRatio;
      const res = resultsById.get(h.id) ?? h;
      const goalIntrinsicMps = goalIntrinsicMpsFromLast3f(res.last3f);
      const l3w = Number.isFinite(res.last3f)
        ? (maxLast3f - res.last3f) / last3fSpan
        : 0.5;
      const isCloser = h.style === '差し' || h.style === '追込';
      const startSpeedMult = Math.max(
        0.72,
        Math.min(
          1.06,
          0.78 + l3w * 0.14 + (isCloser ? 0.05 : 0),
        ),
      );
      return {
        ...h,
        goalMeters: 0,
        goalFinished: false,
        goalIntrinsicMps,
        targetLane: h.y,
        goalStartProgress: (baseGoalProgressById.get(h.id) ?? GOAL_ENTRY_LEADER_START_PROGRESS) + goalEntryOffset,
        // どれだけ下から入ってきても、最終的に全馬がゴール線を通過できるよう個別に進捗倍率を持たせる。
        goalProgressScale: 1,
        goalCurrentMps:
          goalIntrinsicMps * goalStaminaSpeedMult(staminaRatio) * startSpeedMult,
        // 進路AI（_planGoalRouteV2）が「現速度（リセット後）」ではなく
        // 「その馬がそのフレームで本来出したい速度」で判定できるよう、
        // targetMps を毎フレーム保存する専用フィールド。
        goalDesiredMps:
          goalIntrinsicMps * goalStaminaSpeedMult(staminaRatio) * startSpeedMult,
        goalAccelState: 0,
        goalLaneCost: 0,
        goalCommitUntilMs: 0,
        goalLaneCooldownUntilMs: 0,
        goalBurstRemainMs: 0,
        goalBurstCooldownUntilMs: 0,
        // 同レーン前方に詰まっている時間の積算（ms）。
        // 一定時間を超えたら _planGoalRouteV2 の進路変更閾値を緩める用途に使う。
        goalStuckMs: 0,
        // 直前にレーン変更を採用した時刻+短い窓。
        // この窓内は _enforceGoalPackSpacing の「隣接レーン押し戻し」を弱め、
        // 追い抜きの瞬間に肩が並ぶ動きを潰さないようにする。
        goalLaneEnterUntilMs: 0,
      };
    });

    simHorses.forEach(horse => {
      const startProgress = Number.isFinite(horse.goalStartProgress)
        ? horse.goalStartProgress
        : GOAL_ENTRY_LEADER_START_PROGRESS;
      const neededSpan = Math.max(
        GOAL_PROGRESS_SPAN,
        GOAL_PROGRESS_TARGET_AT_FINISH - startProgress,
      );
      horse.goalProgressScale = neededSpan / Math.max(1e-6, GOAL_PROGRESS_SPAN);
    });

    // ゴールシーン中は horse.x を「描画 progress と 1 対 1 で対応する量」に再束縛する。
    // これでシミュ側の AI / 衝突判定 / _enforceGoalPackSpacing が
    // 実際にレンダリングされている前後関係と一致するようになる。
    // RENDER_X_PER_PROGRESS は、progress 1 単位あたり何 sim-x 分かを表す係数。
    // 既存の GOAL_X_PER_METER と矛盾しないよう
    //   (GOAL_DISTANCE_METERS * GOAL_X_PER_METER) / GOAL_PROGRESS_SPAN
    // で定義する。これにより、scale=1 の時の毎フレーム dx が従来式と完全一致する。
    const RENDER_X_PER_PROGRESS =
      (GOAL_DISTANCE_METERS * GOAL_X_PER_METER) / Math.max(1e-6, GOAL_PROGRESS_SPAN);
    simHorses.forEach(horse => {
      horse.x = (horse.goalStartProgress ?? GOAL_ENTRY_LEADER_START_PROGRESS) * RENDER_X_PER_PROGRESS;
    });

    // ゴールシーンは「ゴール前 200m を全力で走破する程度の実時間」で見せる。
    // スタミナ減衰や演出バッファは掛けず、各馬の intrinsic mps（last_3f 由来）から
    // 200m を走り切る時間そのものを採用し、最も遅い馬に合わせて尺を決める。
    const durationMs =
      Math.max(
        ...simHorses.map(h => (GOAL_DISTANCE_METERS / Math.max(1e-6, h.goalIntrinsicMps)) * 1000),
        1,
      ) * GOAL_TIME_SCALE;
    const goalRng = createRng((this.raceData?.race_id ?? 1) + 7919);
    const transitionStartedAt = performance.now();
    const transitionHalfMs = GOAL_SCENE_TRANSITION_MS * 0.5;
    let goalSceneStarted = false;
    let startedAt = null;
    let lastTs = null;
    let goalFrameIndex = 0;

    this.isAnimating = true;
    this.goalSceneActive = true;
    this._syncAdvanceButton();
    this.playbackHooks.onGoalSceneStart?.();
    this.indicator.textContent = this.renderer.getPhaseName(phase);
    this._goalRankLogged = new Set();
    this._goalRankOrder = [];
    this._goalPlacingHeaderLogged = false;
    this._goalLineDiffById = new Map();
    this._goalAllFinishedAtMs = null;
    this._goalCameraRawProgress = null;
    this._goalBattledPairs = new Set();

    const step = (ts) => {
      if (!goalSceneStarted) {
        const transitionElapsed = ts - transitionStartedAt;
        const transitionT = Math.max(
          0,
          Math.min(1, transitionElapsed / Math.max(1, GOAL_SCENE_TRANSITION_MS)),
        );
        if (transitionElapsed < transitionHalfMs) {
          this.renderer.draw(baseHorses, phase, 1, {
            sceneTransition: {
              t: transitionT,
              maxAlpha: GOAL_SCENE_TRANSITION_MAX_ALPHA,
            },
          });
          this.lastRenderedHorses = baseHorses.map(h => ({ ...h }));
          this._captureGoalPlaybackFrame({
            elapsedMs: transitionElapsed,
            kind: 'transition',
            horses: baseHorses.map(h => this._serializeGoalHorse(h)),
            transitionT,
          });
          requestAnimationFrame(step);
          return;
        }

        goalSceneStarted = true;
        startedAt = ts;
        lastTs = ts;
        goalFrameIndex = 0;
        this.indicator.textContent = 'ゴールシーン';
        this._appendSceneHeading('ゴールシーン');
      }

      const isFirstGoalFrame = goalFrameIndex === 0;
      goalFrameIndex += 1;
      const rawDt = Math.max(0.001, Math.min(0.12, (ts - lastTs) / 1000));
      const dt = isFirstGoalFrame ? 0 : rawDt;
      lastTs = ts;
      const elapsed = ts - startedAt;
      const rawT = elapsed / durationMs;
      const t = Math.max(0, Math.min(1, rawT));
      this._goalRawT = t;
      const laneIntentById = new Map();
      const overtakePressureById = new Map();
      const frameEngaged = new Set();

      // フレーム冒頭の x / goalMeters をスナップショット。
      // _enforceGoalPackSpacing の押し戻しはこの値を下限としてクランプし、
      // フレーム間で goalMeters / x が「減る」ことを構造的に禁止する
      // （= 馬が後退して見える挙動を根本から無くす）。
      simHorses.forEach(h => {
        h._frameStartX = h.x;
        h._frameStartGoalMeters = h.goalMeters;
      });

      simHorses.sort((a, b) => b.x - a.x);
      simHorses.forEach(horse => {
        if (horse.goalFinished) {
          // ゴール後も画面上に抜けるまで前進を継続する。
          laneIntentById.set(horse.id, 0);
          overtakePressureById.set(horse.id, 0);
          const sr =
            horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0.5;
          const postGoalMinMps =
            horse.goalIntrinsicMps * goalStaminaSpeedMult(sr) * 1.06;
          horse.goalCurrentMps = Math.max(postGoalMinMps, horse.goalCurrentMps * 0.996);
          const progressedMeters = Math.max(postGoalMinMps * dt, horse.goalCurrentMps * dt);
          horse.goalMeters = Math.min(
            GOAL_DISTANCE_METERS + GOAL_POST_CLEAR_METERS * 3.2,
            horse.goalMeters + progressedMeters,
          );
          // x は描画 progress と一致させるため scale を反映して進める。
          horse.x += progressedMeters * GOAL_X_PER_METER * (horse.goalProgressScale ?? 1);
          return;
        }
        const result = resultsById.get(horse.id) ?? horse;
        const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0.5;
        const last3fWeight = Number.isFinite(result.last3f)
          ? (maxLast3f - result.last3f) / last3fSpan
          : 0.5;
        const baseMps =
          horse.goalIntrinsicMps * goalStaminaSpeedMult(staminaRatio);
        const styleBoost = horse.style === '追込' ? 0.16
          : horse.style === '差し' ? 0.13
            : horse.style === '先行' ? 0.04
              : 0;
        const styleTop = horse.style === '追込' ? 1.12
          : horse.style === '差し' ? 1.08
            : horse.style === '先行' ? 1.02
              : 0.98;
        const battleFatigue = Math.min(0.38, (horse.battleFatigue ?? 0) * 0.035);
        const distRatio = Math.min(1, (horse.goalMeters || 0) / GOAL_DISTANCE_METERS);
        const remainMeters = Math.max(0, GOAL_DISTANCE_METERS - (horse.goalMeters || 0));
        const isCloser = horse.style === '追込' || horse.style === '差し';
        const aggression = this._calcGoalAggression(horse, staminaRatio, last3fWeight, distRatio);
        const frontGapNow = this._goalFrontGap(simHorses, horse, clampLane(horse.y));
        const frontBlockedNow = frontGapNow < GOAL_BLOCK_X_GAP * 1.08;
        const urgePass = this._goalShouldSeekPass(simHorses, horse);
        // 「同レーン前方に詰まっている時間」を積算する。
        // 詰まっている間は時間が伸び、解消したら同じ速さで減衰させる。
        // _planGoalRouteV2 の閾値緩和に使う（一定時間以上詰まっていれば外を見る）。
        const stuckThisFrameMs = frontBlockedNow ? dt * 1000 : -dt * 1000 * 1.5;
        horse.goalStuckMs = Math.max(
          0,
          Math.min(2000, (horse.goalStuckMs ?? 0) + stuckThisFrameMs),
        );
        const lanePlan = this._planGoalRouteV2(simHorses, horse, {
          t,
          dt,
          elapsedMs: elapsed,
          aggression,
          staminaRatio,
          last3fWeight,
          frontBlocked: frontBlockedNow,
          urgeOvertake: urgePass,
          stuckMs: horse.goalStuckMs,
        });
        overtakePressureById.set(horse.id, lanePlan.pressure);
        const canChangeRoute = elapsed >= (horse.goalCommitUntilMs ?? 0) &&
          elapsed >= (horse.goalLaneCooldownUntilMs ?? 0);
        // 詰まっている時間が長いほど、進路変更に必要なスコア差を大きく緩める。
        // 1.2 秒を上限に、最大 0.55 まで閾値を下げる。
        const stuckEase = Math.min(0.55, (horse.goalStuckMs ?? 0) / 1200 * 0.55);
        const adaptiveThreshold = Math.max(
          // 詰まりが深刻な時は下限自体も少し下げる（0.55 -> 0.40）
          0.40,
          GOAL_AI.switchThresholdBase
            - aggression * 0.52
            + (1 - distRatio) * 0.14
            + (staminaRatio < 0.24 ? 0.12 : 0)
            - (urgePass ? 0.32 : 0)
            - stuckEase,
        );
        const laneRound = clampLane(horse.y);
        const frontSlower = this._goalFrontIsSlower(simHorses, horse, laneRound);
        const straightKeepBias = frontBlockedNow
          ? 0
          : urgePass
            ? 0.06
            : (frontSlower ? 0.16 : 0.36);
        const shouldSwitch = canChangeRoute &&
          lanePlan.lane !== laneRound &&
          lanePlan.gain > (adaptiveThreshold + straightKeepBias);
        if (shouldSwitch) {
          horse.targetLane = lanePlan.lane;
          horse.goalCommitUntilMs = elapsed + GOAL_AI.switchCommitSec * 1000;
          // 進路変更直後 ~0.6 秒は _enforceGoalPackSpacing の隣接レーン押し戻しを
          // 半分に弱める。これがないと、肩を並べに行った瞬間に押し戻されて
          // 「外に出ようとしたのに元のレーンに戻される」剛体ブロック挙動になる。
          horse.goalLaneEnterUntilMs = elapsed + 600;
          // 詰まり時間も 0 にリセット（同じ詰まりに二重で甘くしないため）。
          horse.goalStuckMs = 0;
        } else if (canChangeRoute) {
          // 進路変更を選ばなかった -> 中途半端な目標レーンを残さず現在地に固定。
          // これがないと過去の目標レーンに引きずられて細かく揺れ続けてしまう。
          horse.targetLane = horse.y;
        } else if (Math.abs((horse.targetLane ?? horse.y) - horse.y) < 0.08) {
          horse.targetLane = horse.y;
        }
        laneIntentById.set(horse.id, Math.max(-1, Math.min(1, (horse.targetLane - horse.y) / 2.2)));
        const laneDelta = horse.targetLane - horse.y;
        let laneShift = 0;
        if (Math.abs(laneDelta) > 0.01) {
          const cutInTarget = this._findGoalCutInRival(simHorses, horse, horse.targetLane);
          if (
            cutInTarget &&
            !frameEngaged.has(horse.id) &&
            !frameEngaged.has(cutInTarget.id) &&
            !this._hasGoalBattlePair(horse, cutInTarget)
          ) {
            if (shouldBattle(goalRng, simHorses, horse, cutInTarget)) {
              const result = resolveBattle(goalRng, horse, cutInTarget, phase);
              applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
              this._markGoalBattlePair(horse, cutInTarget);
              const battleType = this._classifyGoalBattleType(horse, cutInTarget, {
                isLaneChange: true,
              });
              const log = `[バトル:${battleType}] ${horse.name} vs ${cutInTarget.name} → 勝者: ${result.winner.name}`;
              this._appendLog(log);
              frameEngaged.add(horse.id);
              frameEngaged.add(cutInTarget.id);
              if (result.winner.id !== horse.id) {
                horse.targetLane = horse.y;
                horse.goalCurrentMps *= 0.985;
              }
            } else {
              horse.targetLane = horse.y;
              horse.goalCurrentMps *= 0.992;
            }
          }
          const speedRatio = horse.goalCurrentMps / Math.max(1e-6, baseMps);
          const speedLimited = speedRatio > 1.15 ? 0.58 : (speedRatio > 1 ? 0.74 : 1.0);
          const laneRate = GOAL_LANE_CHANGE_PER_SEC * speedLimited * (
            frontBlockedNow ? 1.0 : (urgePass ? 0.95 : 0.82)
          );
          const laneStep = Math.sign(laneDelta) * Math.min(Math.abs(laneDelta), laneRate * dt);
          const candidateY = clampLane(horse.y + laneStep);
          // 進路変更で「新たな同レーン重なり」を生む場合は、本フレームの寄せを保留する。
          // これがないと割り込んだ側ではなく後続側が _enforceGoalPackSpacing で
          // 強制的に後退させられて「後退する馬」に見える。
          if (this._goalLaneChangeWouldOverlap(simHorses, horse, candidateY)) {
            laneShift = 0;
          } else {
            laneShift = Math.abs(laneStep);
            horse.y = candidateY;
          }
        }
        if (laneShift > 0) {
          const aggressiveShift = Math.max(0, laneShift - 0.14);
          const laneDrain = laneShift * STAMINA_LANE_CHANGE_COST * 0.70 + aggressiveShift * 0.34;
          horse.goalLaneCost += laneDrain;
          horse.stamina = Math.max(0, horse.stamina - laneDrain);
          if (laneShift > 0.12) {
            horse.goalLaneCooldownUntilMs = elapsed + GOAL_LANE_CHANGE_COOLDOWN_MS;
          }
          if (!frontBlockedNow && laneShift > 0.05) {
            const rawLoss = Math.min(0.028, 0.006 + (laneShift - 0.05) * 0.14);
            const ease = (0.2 + staminaRatio * 0.5) * (0.25 + last3fWeight * 0.55);
            horse.goalCurrentMps *= Math.max(0.972, 1 - rawLoss * ease);
          }
        }

        const frontGapAfterLane = this._goalFrontGap(simHorses, horse, horse.y);
        const trafficPenalty = frontGapAfterLane < GOAL_BLOCK_X_GAP
          ? Math.max(GOAL_AI.trafficPenaltyFloor, frontGapAfterLane / GOAL_BLOCK_X_GAP)
          : 1.0;
        const furlongHint = (horse.goalMeters || 0) / GOAL_FURLONG_METERS;
        const lateBoost = 0.90
          + 0.22 * Math.pow(distRatio, 0.85)
          + 0.14 * Math.pow(distRatio, 0.72)
          + (isCloser ? 0.10 * Math.pow(Math.min(1, furlongHint), 0.5) : 0);
        // baseMps にスタミナを織り込み済みのため微調整のみ
        const staminaFineTuning = 0.97 + staminaRatio * 0.05;
        // 段階(α): 旧 surge は `0.90 + fastWeight * 0.16 + styleBoost` で
        // 事前確定着順 (arrivalTime) を直接バイアスに使っていた。これを撤廃し、
        // 残スタミナという「現在進行中のシミュ状態」だけで surge を組み立てる。
        // 値域は概ね従来と同等（0.92〜1.06 + styleBoost）に揃えてある。
        const surge = 0.92 + staminaRatio * 0.14 + styleBoost;
        const closingKick = 1
          + Math.pow(distRatio, 0.58) * (
            (isCloser ? 0.20 : 0.06) * (0.45 + last3fWeight * 0.28)
            + last3fWeight * 0.06
          )
          + Math.pow(distRatio, 1.05) * (
            (horse.style === '追込' ? 0.12 : 0) +
            (horse.style === '差し' ? 0.10 : 0) +
            last3fWeight * 0.04
          );
        // 段階(α) 追加: 残スタミナを「ゴール直前の末脚」として開放する係数。
        //   - distRatio が大きい（ゴール接近）ほど効きが強くなる（=上がり3Fの加速）
        //   - staminaRatio が低ければ開放できる余力がないためゼロに近づく
        //   - last3fWeight が高い末脚タイプは開放上限を高めにする
        // closingKick はスタミナ非依存（潜在能力）だったため、ここで「実際に
        // 余力を残せた馬だけが末脚を爆発させられる」という物理が成立する。
        const staminaUnleash =
          staminaRatio *
          (0.06 + 0.20 * Math.pow(distRatio, 0.55)) *
          (0.85 + last3fWeight * 0.30);
        const staminaKick = 1 + staminaUnleash;
        const staminaPerMeter = horse.stamina / Math.max(1, remainMeters);
        const spmNorm = normalize01(
          (staminaPerMeter - SAFE_GOAL_STAMINA_PER_M_REF) / SAFE_GOAL_STAMINA_PER_M_RANGE,
        );
        const eventFatigueNorm = normalize01((horse.eventFatigueScore ?? 0) * 0.065);
        const readiness = normalize01(spmNorm * 0.74 + (1 - eventFatigueNorm) * 0.26);
        const finalReadinessMult = USE_SAFE_STAMINA_MODEL
          ? 0.90 + 0.24 * readiness - eventFatigueNorm * SAFE_GOAL_EVENT_FATIGUE_WEIGHT * 0.08
          : 1.0;
        // スタミナ残量は baseMps 側（goalStaminaSpeedMult）で既に反映済み。
        // ここではバトルでの疲労分だけを純粋にペナルティとして反映し、
        // スタミナ二重計上で 200m 所要時間が伸びすぎる現象を解消する。
        const fatiguePenalty = Math.max(0.65, 1 - battleFatigue);
        const routeTax = Math.min(0.07, (horse.goalLaneCost ?? 0) * 0.0035);
        const routeTaxMult = 1 - routeTax * (1.15 - staminaRatio * 0.45);
        const targetMps =
          baseMps *
          lateBoost *
          staminaFineTuning *
          surge *
          styleTop *
          closingKick *
          staminaKick *
          finalReadinessMult *
          trafficPenalty *
          fatiguePenalty *
          routeTaxMult;
        // 進路AI が「その馬が本来出したい速度」で判定できるように、
        // 毎フレームの targetMps を保存しておく。
        // ブロック時に goalCurrentMps が前走馬速度へ寄せられても、
        // 「自分の野心速度」はここに残るので、進路AIが仕事を放棄しなくなる。
        horse.goalDesiredMps = targetMps;
        const accelBase = 2.3
          + last3fWeight * 1.9
          + (isCloser ? 1.1 : 0.2)
          + (isCloser ? 0.35 * last3fWeight * Math.sqrt(distRatio) : 0);
        const inBurstWindow = isCloser &&
          remainMeters >= GOAL_AI.burstWindowMetersToGoMin &&
          remainMeters <= GOAL_AI.burstWindowMetersToGoMax &&
          last3fWeight > 0.48 &&
          staminaRatio > 0.16 &&
          frontGapAfterLane > GOAL_BLOCK_X_GAP * 0.95;
        const canBurst = elapsed >= (horse.goalBurstCooldownUntilMs ?? 0) &&
          (horse.goalBurstRemainMs ?? 0) <= 0;
        if (inBurstWindow && canBurst) {
          horse.goalBurstRemainMs = GOAL_AI.burstDurationSec * 1000;
          horse.goalBurstCooldownUntilMs =
            elapsed + (GOAL_AI.burstDurationSec + GOAL_AI.burstCooldownSec) * 1000;
        }
        const burstActive = (horse.goalBurstRemainMs ?? 0) > 0;
        if (burstActive) {
          horse.goalBurstRemainMs = Math.max(0, horse.goalBurstRemainMs - dt * 1000);
        }
        const burstAccelBonus = burstActive
          ? GOAL_AI.burstAccelBonus * (0.55 + last3fWeight * 0.45)
          : 0;
        const accel = Math.max(0.55, accelBase * (0.64 + staminaRatio * 0.70) + burstAccelBonus);
        const mpsDiff = targetMps - horse.goalCurrentMps;
        const deltaV = Math.sign(mpsDiff) * Math.min(Math.abs(mpsDiff), accel * dt);
        const minMps = baseMps * GOAL_MIN_SPEED_RATIO;
        const maxMps = baseMps * GOAL_MAX_SPEED_RATIO;
        horse.goalCurrentMps = Math.max(minMps, Math.min(maxMps, horse.goalCurrentMps + deltaV));

        const accelDrain = Math.max(0, deltaV) * (1.2 + (isCloser ? 0.45 : 0.15));
        const speedDrain = horse.goalCurrentMps * 0.0115;
        const trafficDrain = (1 - trafficPenalty) * 0.85;
        const closersSprint = isCloser && distRatio > 0.28;
        const sprintStaminaMultRaw = closersSprint
          ? 1
            + 0.55 * last3fWeight * (0.35 + 0.65 * distRatio)
            + (deltaV > 0.015 ? 0.24 * last3fWeight * distRatio : 0)
            + (burstActive ? 0.14 + last3fWeight * 0.18 : 0)
          : 1;
        const sprintStaminaMult = Math.min(GOAL_AI.goalDrainSprintCap, sprintStaminaMultRaw);
        const goalDrain = (accelDrain + speedDrain + trafficDrain) * dt * GOAL_STAMINA_DRAIN_MULT * sprintStaminaMult;
        horse.stamina = Math.max(0, horse.stamina - goalDrain);

        // 前進量を「前方馬との最小間隔を踏み越えない範囲」に事前クランプする。
        // 後付けの押し出しではなく事前に前進量を絞ることで、
        // 「一旦進んでから後退するように見える」現象を根本から無くす。
        let progressedMeters = horse.goalCurrentMps * dt;
        const minForwardMeters = minMps * dt;
        const minPackGap = Math.max(5.5, GOAL_MIN_PACK_GAP_X);
        const blockingFront = this._goalFrontHorse(simHorses, horse, horse.y);
        if (blockingFront) {
          const allowedDx = (blockingFront.x - minPackGap) - horse.x;
          const scaleSelf = horse.goalProgressScale ?? 1;
          const xPerMeterSelf = Math.max(1e-6, GOAL_X_PER_METER * scaleSelf);
          const frontStartX = Number.isFinite(blockingFront._frameStartX)
            ? blockingFront._frameStartX
            : (blockingFront.x ?? 0);
          const frontAdvanceX = Math.max(0, (blockingFront.x ?? 0) - frontStartX);
          const followAdvanceMeters = frontAdvanceX / xPerMeterSelf;
          let maxAdvance;
          if (allowedDx <= 0) {
            // 既に最小間隔より内側でも停止はさせず、前走馬の進みへ追従する。
            maxAdvance = followAdvanceMeters;
          } else {
            const spacingAdvanceMeters = allowedDx / xPerMeterSelf;
            // 車間が許す限り、前走馬の流れには追従させる。
            maxAdvance = Math.max(spacingAdvanceMeters, followAdvanceMeters);
          }
          const shouldTryOvertakeBattle =
            progressedMeters > maxAdvance + 1e-6 &&
            !frameEngaged.has(horse.id) &&
            !frameEngaged.has(blockingFront.id) &&
            !this._hasGoalBattlePair(horse, blockingFront);
          if (shouldTryOvertakeBattle && shouldBattle(goalRng, simHorses, horse, blockingFront)) {
            const result = resolveBattle(goalRng, horse, blockingFront, phase);
            applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
            this._markGoalBattlePair(horse, blockingFront);
            const battleType = this._classifyGoalBattleType(horse, blockingFront, {
              isLaneChange: false,
            });
            const log = `[バトル:${battleType}] ${horse.name} vs ${blockingFront.name} → 勝者: ${result.winner.name}`;
            this._appendLog(log);
            frameEngaged.add(horse.id);
            frameEngaged.add(blockingFront.id);
            if (result.winner.id !== horse.id) {
              horse.goalCurrentMps *= 0.986;
            } else {
              horse.goalCurrentMps *= 1.004;
              blockingFront.goalCurrentMps = Math.max(0, blockingFront.goalCurrentMps * 0.996);
            }
          }
          if (progressedMeters > maxAdvance) {
            progressedMeters = maxAdvance;
            // 進路が塞がれた時は「停止」ではなく前走馬に追従する。
            // ただし旧実装のように goalCurrentMps を frontMps へ完全上書きすると、
            //   ① 自分の野心速度（targetMps への加速分）が毎フレーム消える
            //   ② 進路AI が selfMps == frontMps で必ず直進判定になる
            // という閉ループに陥り、後続全体が剛体ブロック化してしまう。
            // ここでは「上限を frontMps よりほんの少し上に締める」ソフトクランプにし、
            // 自分の速度が前走馬よりわずかに高い状態を許容する（=進路AI が機能する）。
            const frontMps = Number.isFinite(blockingFront.goalCurrentMps)
              ? blockingFront.goalCurrentMps
              : minMps;
            const blockedCeiling = Math.max(minMps, frontMps * 1.04);
            // 「下げる時だけ」反映する。すでに blockedCeiling より遅ければ自分の速度を尊重する。
            horse.goalCurrentMps = Math.max(
              minMps,
              Math.min(maxMps, Math.min(horse.goalCurrentMps, blockedCeiling)),
            );
          }
          progressedMeters = Math.max(progressedMeters, Math.min(minForwardMeters, maxAdvance));
        }
        horse.goalCurrentMps = Math.max(minMps, horse.goalCurrentMps);
        horse.goalMeters = Math.min(
          GOAL_DISTANCE_METERS + GOAL_POST_CLEAR_METERS * 3.2,
          horse.goalMeters + progressedMeters,
        );
        // x は描画 progress と 1 対 1 で対応させる。
        horse.x += progressedMeters * GOAL_X_PER_METER * (horse.goalProgressScale ?? 1);
      });

      this._enforceGoalPackSpacing(simHorses, elapsed);

      // 各馬の goalMeters 積み上げのみから progress を作る（グローバル演出による頭打ちはしない）
      const goalRenderProgressById = new Map();
      simHorses.forEach(horse => {
        const rawProgress = this._resolveGoalMappedProgress(
          horse,
          GOAL_DISTANCE_METERS,
          GOAL_PROGRESS_SPAN,
          null,
        );
        goalRenderProgressById.set(
          horse.id,
          Math.max(GOAL_PROGRESS_MIN, Math.min(GOAL_PROGRESS_MAX_POST_LINE, rawProgress)),
        );
      });
      const goalLineY = this._getScrollingGoalLineY();
      if (goalLineY != null) {
        simHorses.forEach(horse => {
          if (horse.goalFinished) return;
          const noseY = this._estimateGoalNoseY(
            horse,
            GOAL_DISTANCE_METERS,
            GOAL_PROGRESS_SPAN,
            goalRenderProgressById,
          );
          const diff = noseY - goalLineY;
          const prevDiff = this._goalLineDiffById.get(horse.id);
          this._goalLineDiffById.set(horse.id, diff);
          const crossedLine = (prevDiff == null && diff <= 0) || (prevDiff != null && prevDiff > 0 && diff <= 0);
          const reachedDistance = horse.goalMeters >= GOAL_DISTANCE_METERS;
          const isNearLine = diff <= this.renderer.cardH * 0.20;
          if (crossedLine || (reachedDistance && isNearLine)) {
            this._markHorseGoalFinished(horse);
          }
        });
      }

      const drawOptions = {
        phaseLabel: 'ゴールシーン',
        furlong: { t },
        goalLine: rawT,
        sceneTransition: {
          t: Math.max(
            0,
            Math.min(1, (transitionHalfMs + elapsed) / Math.max(1, GOAL_SCENE_TRANSITION_MS)),
          ),
          maxAlpha: GOAL_SCENE_TRANSITION_MAX_ALPHA,
        },
        goalRun: {
          t,
          distanceMeters: GOAL_DISTANCE_METERS,
          progressSpan: GOAL_PROGRESS_SPAN,
          maxProgress: GOAL_PROGRESS_MAX_POST_LINE,
          minProgress: GOAL_PROGRESS_MIN,
          progressById: goalRenderProgressById,
          laneIntentById,
          overtakePressureById,
        },
      };
      this.renderer.draw(simHorses, phase, 1, drawOptions);
      this.lastRenderedHorses = simHorses.map(h => ({ ...h }));
      updateEntryStaminaBars(simHorses);
      this._captureGoalPlaybackFrame({
        elapsedMs: transitionHalfMs + elapsed,
        kind: 'goal',
        horses: simHorses.map(h => this._serializeGoalHorse(h)),
        rawT,
        drawOptions: {
          ...drawOptions,
          goalRun: {
            ...drawOptions.goalRun,
            progressById: [...goalRenderProgressById.entries()],
            laneIntentById: [...laneIntentById.entries()],
            overtakePressureById: [...overtakePressureById.entries()],
          },
        },
        goalRankOrderSnapshot: [...this._goalRankOrder],
        goalAllFinishedAtMs: this._goalAllFinishedAtMs,
      });

      const allFinished = simHorses.every(h => h.goalFinished);
      // 既定の演出尺を超えても残っている馬がいる場合、テレポートはせず
      // 「徐々にスピードを引き上げる」ことで自然にゴールラインを通過させる。
      // テレポート（goalMeters/x のジャンプ）はスムージングと噛み合わず
      // ゴール手前で馬が消えたように見えるため使用しない。
      const overdue = elapsed - durationMs;
      if (overdue > 0 && !allFinished) {
        const boostT = Math.min(1, overdue / Math.max(1, durationMs));
        const speedBoostMult = 1 + 0.55 * boostT; // 最大 1.55 倍まで段階的に
        simHorses.forEach(h => {
          if (h.goalFinished) return;
          const baseFloor = h.goalIntrinsicMps * speedBoostMult;
          if (h.goalCurrentMps < baseFloor) {
            h.goalCurrentMps = baseFloor;
          }
        });
      }
      if (simHorses.every(h => h.goalFinished) && this._goalAllFinishedAtMs == null) {
        this._goalAllFinishedAtMs = elapsed;
      }
      // 描画平滑化後の実座標で「馬体が完全に画面外へ抜けたか」を判定する。
      // 理論 progress だけで判定すると、見た目が残っているのに終了することがある。
      const allClearedTop = simHorses.every(horse => {
        const rendered = this.renderer.horseRenderState.get(horse.id);
        if (!rendered || !Number.isFinite(rendered.cy)) return false;
        const iconBottomY = rendered.cy + this.renderer.cardH * 0.5;
        return iconBottomY < -2;
      });
      const canFinish =
        this._goalAllFinishedAtMs != null &&
        allClearedTop &&
        elapsed >= this._goalAllFinishedAtMs + GOAL_POST_SCROLL_MS;
      if (canFinish) {
        this.isAnimating = false;
        this.lastRenderedHorses = simHorses.map(h => ({ ...h }));
        onDone?.();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _goalFrontHorse(horses, horse, lane, atX = horse.x) {
    const nearLaneGap = this._getGoalNearLaneGap();
    return horses
      .filter(h =>
        h.id !== horse.id &&
        h.x > atX &&
        Math.abs(h.y - lane) < nearLaneGap,
      )
      .sort((a, b) => a.x - b.x)[0] ?? null;
  }

  _goalFrontIsSlower(horses, horse, lane) {
    const front = this._goalFrontHorse(horses, horse, lane);
    if (!front) return false;
    // ブロック中は goalCurrentMps が前走馬速度に寄せられているため、現速度だけ
    // で比較すると「自分は速いのに前と同速 → 直進維持」と誤判定する。
    // ここも進路AI ゲートと同じく、野心速度 (goalDesiredMps) と現速度のうち
    // 大きい方を採用し、「自分が本当に出したい速度」で前走馬と比較する。
    const selfM = Math.max(horse.goalDesiredMps ?? 0, horse.goalCurrentMps ?? 0);
    const frontM = Math.max(front.goalDesiredMps ?? 0, front.goalCurrentMps ?? 0);
    return selfM > frontM * 1.04;
  }

  /**
   * 自分の「進路上」に自分より遅い馬がいるか（= 直進では追いつかれて詰まる）。
   * 同レーン判定は厳密に nearLaneGap 内だけにし、斜め前で別レーンを走っている
   * 関係ない馬では発火しないようにする（その馬は自分の進路を塞いでいない）。
   */
  _goalShouldSeekPass(horses, horse) {
    // ブロック中は goalCurrentMps が前走馬に寄せられて速度差が消えるため、
    // 「現速度」だけで判断すると追い抜き意欲が立ち上がらない。
    // 自分は野心速度 (goalDesiredMps) を尊重し、相手も野心と現速度の大きい方で
    // 比較することで「本当は速い後続」が前を抜きにいく動きを取り戻す。
    const selfM = Math.max(horse.goalDesiredMps ?? 0, horse.goalCurrentMps ?? 0);
    if (!Number.isFinite(selfM) || selfM < 1e-6) return false;
    const near = this._getGoalNearLaneGap();
    const maxDx = GOAL_AI.passSeekMaxForwardX;
    for (const o of horses) {
      if (o.id === horse.id || o.goalFinished) continue;
      const dx = o.x - horse.x;
      if (dx <= 0.5 || dx > maxDx) continue;
      if (Math.abs(o.y - horse.y) >= near) continue;
      const oM = Math.max(o.goalDesiredMps ?? 0, o.goalCurrentMps ?? 0);
      if (selfM > oM * 1.03) return true;
    }
    return false;
  }

  /**
   * ゴールシーン専用: 自分の前方近接バンド内で、横方向に minWidth 以上空いた切れ目
   * （= 「割って入れる隙間」）を 1 つだけ返す。
   *
   * 使い所は _planGoalRouteV2 のみ。判定は純粋な幾何計算で副作用を持たない。
   * @returns {{ center:number, width:number, low:number, high:number } | null}
   */
  _goalDetectInnerSqueezeAhead(horses, horse, options = {}) {
    const currentLane = clampLane(horse.y);
    // 既定値は 1.5 頭分（馬体幅 cardW = laneW * 0.6 → 1.5 頭 ≒ 0.9 レーン）。
    const minWidth = options.minWidth ?? 0.9;
    // 横方向探索範囲。これより外の馬は別世界として扱う。
    const lateralReach = options.lateralReach ?? 1.6;
    // X 方向の前方バンド: 直近すぎ（既に並走）と遠すぎ（視程外）を除外し
    // 「目の前」だけを切り出す。
    const xMin = horse.x + GOAL_BLOCK_X_GAP * 0.35;
    const xMax = horse.x + GOAL_BLOCK_X_GAP * 1.8;
    const cluster = horses
      .filter(o =>
        o.id !== horse.id &&
        !o.goalFinished &&
        o.x >= xMin && o.x <= xMax &&
        Math.abs(o.y - currentLane) < lateralReach,
      )
      .sort((a, b) => a.y - b.y);
    // 仮想壁として lateralReach の両端を加え、馬体間の横隙間を列挙する。
    // 片側が完全に空でも自然に「片側ガラ空き」として検出できる構造。
    const ys = [
      currentLane - lateralReach,
      ...cluster.map(o => o.y),
      currentLane + lateralReach,
    ];
    let best = null;
    for (let i = 0; i < ys.length - 1; i += 1) {
      const width = ys[i + 1] - ys[i];
      if (width < minWidth) continue;
      const center = (ys[i] + ys[i + 1]) / 2;
      // 「目の前」と言える範囲（自レーン±1.0）の隙間だけ採用する。
      // ここを越えるなら _planGoalRouteV2 の通常の外側候補で扱うべき領域。
      if (Math.abs(center - currentLane) > 1.0) continue;
      if (!best || width > best.width) {
        best = { center, width, low: ys[i], high: ys[i + 1] };
      }
    }
    return best;
  }

  /**
   * 進路変更（lane y の連続値遷移）が、新たな同レーン重なりを生むかどうかを判定する。
   * 既に重なっている相手は判定対象外（離脱方向の進路変更を妨げない）。
   */
  _goalLaneChangeWouldOverlap(horses, horse, candidateY) {
    const minPackGap = Math.max(5.5, GOAL_MIN_PACK_GAP_X);
    const sameLaneGap = 0.78;
    const currentY = horse.y;
    for (const o of horses) {
      if (o.id === horse.id) continue;
      const distNew = Math.abs(o.y - candidateY);
      if (distNew >= sameLaneGap) continue;
      if (Math.abs(o.x - horse.x) >= minPackGap) continue;
      // 既に同レーン重なりだった相手は無視する（脱出方向の進路変更まで止めない）。
      const distNow = Math.abs(o.y - currentY);
      if (distNow >= sameLaneGap) return true;
    }
    return false;
  }

  _enforceGoalPackSpacing(horses, elapsedMs = 0) {
    // 視覚上の馬体幅は cardW = laneW * 0.6 なので、laneDiff < 0.78 で必ず重なる。
    // 「強い間隔」を要求する閾値は安全側で 0.78、隣接気味の重なりも捌くため
    // 「弱い間隔」を 1.10 まで適用する。
    const sameLaneGap = 0.78;
    const adjacentLaneGap = 1.10;
    const minGap = Math.max(5.5, GOAL_MIN_PACK_GAP_X);
    const adjacentMinGap = minGap * 0.55;
    // レーン変更直後の馬は、追い抜きで肩を並べに行く瞬間の動きを優先する。
    // この間は隣接（同レーンではない）押し戻しを 0.55 倍まで弱める。
    // ※ 同レーンでの重なりは安全のため緩めない（馬体重なりは常に防ぐ）。
    const recentLaneChangeAdjacentScale = 0.55;
    // 1 フレームあたりの押し戻し量上限（フレーム冒頭値を下限とした単調クランプの中での上限）。
    // 実際のレースでは後退は起こり得ないため、押し戻しても「フレーム冒頭」より戻さない設計。
    const maxShavePerFrame = 0.45;
    for (let iter = 0; iter < 6; iter += 1) {
      let changed = false;
      const sorted = [...horses].sort((a, b) => a.x - b.x);
      for (const h of sorted) {
        let bestMaxX = Infinity;
        // h（後方馬）が直近にレーン変更を採用していれば、隣接押し戻しを弱める。
        const hRecentLaneChange = elapsedMs > 0 &&
          (h.goalLaneEnterUntilMs ?? 0) > elapsedMs;
        for (const o of horses) {
          if (o.id === h.id) continue;
          const laneDiff = Math.abs(o.y - h.y);
          if (laneDiff >= adjacentLaneGap) continue;
          if (o.x <= h.x) continue;
          const isAdjacent = laneDiff >= sameLaneGap;
          // 「同レーンの最小間隔」は常に維持。
          // 「隣接レーンの最小間隔」だけを、いずれかの馬が直近にレーン変更していれば緩める。
          const oRecentLaneChange = elapsedMs > 0 &&
            (o.goalLaneEnterUntilMs ?? 0) > elapsedMs;
          const adjacentScale = (isAdjacent && (hRecentLaneChange || oRecentLaneChange))
            ? recentLaneChangeAdjacentScale
            : 1;
          const gap = isAdjacent ? adjacentMinGap * adjacentScale : minGap;
          const candidateMaxX = o.x - gap;
          if (candidateMaxX < bestMaxX) bestMaxX = candidateMaxX;
        }
        if (!Number.isFinite(bestMaxX)) continue;
        if (h.x > bestMaxX + 1e-6) {
          const desiredShave = h.x - bestMaxX;
          const shave = Math.min(desiredShave, maxShavePerFrame);
          // フレーム冒頭値を下限として後退クランプ。
          // x / goalMeters はフレーム間で絶対に減らない（後退禁止）ため、
          // 「フレーム内で進みすぎた分だけを進まなかったことにする」挙動に置き換わる。
          const floorX = Number.isFinite(h._frameStartX) ? h._frameStartX : (h.x - shave);
          const newX = Math.max(h.x - shave, floorX);
          const actualShave = h.x - newX;
          if (actualShave > 1e-9) {
            h.x = newX;
            // x が progressScale 倍速で進む再束縛を踏まえて、
            // goalMeters の戻し量も scale を割って整合させる。
            const scale = h.goalProgressScale ?? 1;
            const floorGoalMeters = Number.isFinite(h._frameStartGoalMeters)
              ? h._frameStartGoalMeters
              : 0;
            h.goalMeters = Math.max(
              floorGoalMeters,
              (h.goalMeters ?? 0) - actualShave / Math.max(1e-6, GOAL_X_PER_METER * scale),
            );
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }

  _goalFrontGap(horses, horse, lane, atX = horse.x) {
    const front = this._goalFrontHorse(horses, horse, lane, atX);
    if (!front) return 999;
    return front.x - atX;
  }

  _getGoalNearLaneGap() {
    const t = Math.max(0, Math.min(1, this._goalRawT ?? 0));
    return GOAL_NEAR_LANE_GAP_BASE + (GOAL_NEAR_LANE_GAP_MAX - GOAL_NEAR_LANE_GAP_BASE) * t;
  }

  _goalLaneDensity(horses, horse, lane, atX = horse.x) {
    const nearLaneGap = this._getGoalNearLaneGap() + 0.08;
    return horses.reduce((acc, h) => {
      if (h.id === horse.id || Math.abs(h.y - lane) >= nearLaneGap) return acc;
      const dx = h.x - atX;
      if (Math.abs(dx) > 24) return acc;
      if (dx >= 0) return acc + (dx < 12 ? 1.25 : 0.8);
      return acc + 0.35;
    }, 0);
  }

  _findGoalCutInRival(horses, horse, targetLane) {
    const laneTo = clampLane(targetLane);
    const laneFrom = clampLane(horse.y);
    return horses.find(h => {
      if (h.id === horse.id) return false;
      const rearGap = horse.x - h.x;
      if (rearGap <= 0 || rearGap > DIAGONAL_REAR_BLOCK_X_GAP) return false;
      if (!isLaneInShiftPath(h.y, laneFrom, laneTo, 0.9)) return false;
      return Math.abs(h.x - horse.x) < LATERAL_BLOCK_X_GAP * 0.95;
    });
  }

  _getGoalBattlePairKey(a, b) {
    const idA = String(a?.id ?? '');
    const idB = String(b?.id ?? '');
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  }

  _hasGoalBattlePair(a, b) {
    return this._goalBattledPairs.has(this._getGoalBattlePairKey(a, b));
  }

  _markGoalBattlePair(a, b) {
    this._goalBattledPairs.add(this._getGoalBattlePairKey(a, b));
  }

  _classifyGoalBattleType(a, b, options = {}) {
    if (options?.isLaneChange) return '進路争い';
    const maxGoalMeters = Math.max(a?.goalMeters ?? 0, b?.goalMeters ?? 0);
    const remain = Math.max(0, GOAL_DISTANCE_METERS - maxGoalMeters);
    const neckAndNeck = Math.abs((a?.x ?? 0) - (b?.x ?? 0)) <= GOAL_BLOCK_X_GAP * 0.7;
    if (remain <= 35 && neckAndNeck) return 'ゴール前叩き合い';
    return '追い抜き争い';
  }

  _getScrollingGoalLineY() {
    // ゴールラインは表示後に固定し、馬だけが上方向へ進んで通過する。
    return this.renderer.H * 0.08;
  }

  _estimateGoalNoseY(horse, distanceMeters, progressSpan, progressById = null) {
    const mappedProgress = this._resolveGoalMappedProgress(
      horse,
      distanceMeters,
      progressSpan,
      progressById,
    );
    const cy = this.renderer.progressToY(mappedProgress);
    return cy - this.renderer.cardH * 0.49;
  }

  _resolveGoalMappedProgress(horse, distanceMeters, progressSpan, progressById = null) {
    const forced = progressById?.get(horse.id);
    if (Number.isFinite(forced)) {
      return Math.max(GOAL_PROGRESS_MIN, Math.min(GOAL_PROGRESS_MAX_POST_LINE, forced));
    }
    const advanceRatio = Math.max(0, Math.min(2.5, (horse.goalMeters ?? 0) / Math.max(1, distanceMeters)));
    const startProgress = Number.isFinite(horse.goalStartProgress)
      ? horse.goalStartProgress
      : 0.20;
    const progressScale = Number.isFinite(horse.goalProgressScale) ? horse.goalProgressScale : 1;
    const progress = startProgress + advanceRatio * progressSpan * progressScale;
    return Math.max(GOAL_PROGRESS_MIN, Math.min(GOAL_PROGRESS_MAX_POST_LINE, progress));
  }

  _buildGoalLogicProgressMap(horses, distanceMeters, progressSpan, t = 0) {
    const rawById = new Map();
    let leaderRaw = -Infinity;
    horses.forEach(horse => {
      const raw = this._resolveGoalMappedProgress(horse, distanceMeters, progressSpan, null);
      rawById.set(horse.id, raw);
      if (raw > leaderRaw) leaderRaw = raw;
    });
    if (!Number.isFinite(leaderRaw)) leaderRaw = GOAL_LEADER_ANCHOR_PROGRESS;

    if (!Number.isFinite(this._goalCameraRawProgress)) {
      this._goalCameraRawProgress = leaderRaw;
    } else {
      const tClamped = Math.max(0, Math.min(1, t));
      const followLerp = GOAL_CAMERA_LERP + (GOAL_CAMERA_LERP_MAX - GOAL_CAMERA_LERP) * tClamped;
      this._goalCameraRawProgress += (leaderRaw - this._goalCameraRawProgress) * followLerp;
    }

    const tClamped = Math.max(0, Math.min(1, t));
    const inEarlyFurlongPhase = t < GOAL_EARLY_PHASE_T;
    const earlySpread = inEarlyFurlongPhase ? GOAL_SPREAD_EARLY_MULT : 1;
    const dynamicScale =
      (GOAL_ANCHOR_FOLLOW_SCALE + GOAL_ANCHOR_DYNAMIC_BOOST * (1 - tClamped)) * earlySpread;

    const anchoredById = new Map();
    horses.forEach(horse => {
      const raw = rawById.get(horse.id) ?? GOAL_LEADER_ANCHOR_PROGRESS;
      const anchored =
        GOAL_LEADER_ANCHOR_PROGRESS + (raw - this._goalCameraRawProgress) * dynamicScale;
      anchoredById.set(horse.id, Math.max(0.05, Math.min(GOAL_ANCHOR_MAX_PROGRESS, anchored)));
    });
    return anchoredById;
  }

  _buildGoalVisualProgressMap(horses, logicProgressById, t = 0) {
    const tClamped = Math.max(0, Math.min(1, t));
    const lateT = Math.max(0, Math.min(1, (tClamped - GOAL_AI.visualLateStartT) / Math.max(1e-6, 1 - GOAL_AI.visualLateStartT)));
    const amplify = 1 + GOAL_AI.visualLateBoost * lateT;
    const visualById = new Map();
    horses.forEach(horse => {
      const logic = logicProgressById.get(horse.id) ?? GOAL_LEADER_ANCHOR_PROGRESS;
      const visual = GOAL_LEADER_ANCHOR_PROGRESS + (logic - GOAL_LEADER_ANCHOR_PROGRESS) * amplify;
      visualById.set(horse.id, Math.max(GOAL_PROGRESS_MIN, Math.min(GOAL_PROGRESS_MAX_POST_LINE, visual)));
    });
    return visualById;
  }

  _calcGoalAggression(horse, staminaRatio, last3fWeight, distRatio) {
    const base = GOAL_AI.aggrBaseByStyle[horse.style] ?? 0.5;
    const value =
      base +
      staminaRatio * GOAL_AI.aggrStaminaGain +
      last3fWeight * GOAL_AI.aggrLast3fGain +
      (1 - distRatio) * 0.18;
    return Math.max(0.2, Math.min(1.8, value));
  }

  _predictGoalX(horse, horizonSec = GOAL_AI.horizonSec) {
    const currentMps =
      horse.goalCurrentMps ??
      (horse.goalIntrinsicMps != null
        ? horse.goalIntrinsicMps * goalStaminaSpeedMult(
          horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0.5,
        )
        : goalIntrinsicMpsFromLast3f(horse.last3f));
    const deltaMeters = currentMps * horizonSec;
    // ゴールシーン中は horse.x が描画 progress と同期しているため、
    // 予測の前進量にも goalProgressScale を反映する必要がある。
    return horse.x + deltaMeters * GOAL_X_PER_METER * (horse.goalProgressScale ?? 1);
  }

  /**
   * 短期（horizon）で自他の直進予測を重ね、レーン接近＋前後距離が詰まるほどコストを加算する。
   */
  _goalMultiStepCollisionCost(horses, horse, testLane) {
    const stepSec = GOAL_AI.predictStepSec;
    const horizon = GOAL_AI.horizonSec;
    const n = Math.max(1, Math.round(horizon / stepSec));
    let selfMps = horse.goalCurrentMps;
    if (!Number.isFinite(selfMps)) {
      selfMps = Number.isFinite(horse.goalIntrinsicMps)
        ? horse.goalIntrinsicMps * 0.92
        : goalIntrinsicMpsFromLast3f(horse.last3f);
    }
    // ゴールシーン中は horse.x が描画 progress と同期している（goalProgressScale 倍速）。
    // 予測も同じ尺度で行わないと、自他の前後関係が描画と乖離してしまう。
    const selfScale = horse.goalProgressScale ?? 1;
    const selfVx = selfMps * GOAL_X_PER_METER * selfScale;
    const nearLaneBase = this._getGoalNearLaneGap() + 0.1;
    let cost = 0;
    for (let k = 1; k <= n; k += 1) {
      const time = stepSec * k;
      const sx = horse.x + selfVx * time;
      for (const o of horses) {
        if (o.id === horse.id || o.goalFinished) continue;
        let oMps = o.goalCurrentMps;
        if (!Number.isFinite(oMps)) {
          oMps = Number.isFinite(o.goalIntrinsicMps)
            ? o.goalIntrinsicMps * 0.92
            : goalIntrinsicMpsFromLast3f(o.last3f);
        }
        const oScale = o.goalProgressScale ?? 1;
        const ox = o.x + oMps * GOAL_X_PER_METER * oScale * time;
        const laneDist = Math.abs(testLane - o.y);
        const nearLane = nearLaneBase * (isNigeStyle(o.style) || o.style === '先行' ? 1.02 : 1);
        if (laneDist >= nearLane) continue;
        const laneFactor = 1 - laneDist / Math.max(1e-6, nearLane);
        const dx = ox - sx;
        const frontBand = GOAL_BLOCK_X_GAP * 1.38;
        const rearBand = GOAL_BLOCK_X_GAP * 0.92;
        if (dx > 0 && dx < frontBand) {
          cost += (1 - dx / frontBand) * laneFactor * (0.85 + 0.15 * k / n);
        } else if (dx <= 0 && dx > -rearBand) {
          cost += (1 - Math.abs(dx) / rearBand) * laneFactor * 0.42 * (0.85 + 0.15 * k / n);
        }
      }
    }
    return cost * GOAL_AI.collisionHorizonWeight;
  }

  _planGoalRouteV2(horses, horse, context = {}) {
    const currentLane = clampLane(horse.y);
    const staminaRatio = context.staminaRatio ?? 0.5;
    const last3fWeight = context.last3fWeight ?? 0.5;
    const aggression = context.aggression ?? 0.5;
    const frontBlocked = Boolean(context.frontBlocked);
    const urgeOvertake = Boolean(context.urgeOvertake);
    const stuckMs = Math.max(0, Math.min(2000, context.stuckMs ?? 0));
    const jockeyReliability = getJockeyReliabilityNorm(horse);
    const jockeyAggression = getJockeyAggressionNorm(horse);
    const riderAggression = Math.max(0, Math.min(1, aggression * 0.68 + jockeyAggression * 0.32));
    const horizonSec = GOAL_AI.horizonSec;

    // 進路が完全に空いている、または前方馬が自分以上に速い／実質追いつかない場合は
    // 直進が最適。ここで早期に確定することで、スタイルバイアスや aggression による
    // 「目の前が空いているのに左右に揺れる」現象を根本から防ぐ。
    const frontInCurrent = this._goalFrontHorse(horses, horse, currentLane);
    const farFrontThreshold = GOAL_AI.passSeekMaxForwardX;
    if (!frontInCurrent || (frontInCurrent.x - horse.x) > farFrontThreshold) {
      return { lane: currentLane, gain: 0, pressure: 0 };
    }
    // 「現速度」ではなく「その馬が本来出したい速度（=直近の targetMps）」で比較する。
    // ブロック時に goalCurrentMps が frontMps へ寄せられても、goalDesiredMps は
    // その馬の野心を保持しているので、AI が「直進維持」一択に固まらなくなる。
    // どちらかの値（野心 or 現速）が前走馬より明確に速ければ、別レーンの評価に進む。
    const selfDesired = Math.max(
      horse.goalDesiredMps ?? 0,
      horse.goalCurrentMps ?? 0,
    );
    const frontDesired = Math.max(
      frontInCurrent.goalDesiredMps ?? 0,
      frontInCurrent.goalCurrentMps ?? 0,
    );
    // 詰まり時間が長くなるほどゲートを甘くする（最低でも 0.97 倍までは緩める）。
    // 例: 0.6 秒詰まりで 1.005、1.2 秒で ~0.985 → 微差でも進路評価に進めるようになる。
    const gateRatio = Math.max(0.97, 1.02 - stuckMs / 1200 * 0.05);
    if (selfDesired <= frontDesired * gateRatio) {
      // 自分が出したい速度でも前方馬の方が速い -> 進路変更しても追いつけない。直進維持。
      return { lane: currentLane, gain: 0, pressure: 0 };
    }

    // === ゴール前「内突き」判定 ==========================================
    // 内側で詰まっていて、かつ「足・余力・バトル勝率」が揃っている馬だけが、
    // 目の前の 1.5 頭分の隙間に対してリスクを取って割り込む挙動を許可する。
    // この AI が呼ばれるのはゴールシーンだけなので、追加のシーン判定は不要。
    const isInnerTrapped =
      currentLane <= 4 &&
      frontBlocked &&
      stuckMs >= 400;
    // resolveBattle と同じ式（ノイズ無し）で勝率の指標を作る。
    // 期待値プラス（Δedge ≥ 2.0）でない限り内突きは選ばない。
    const battleEdgeOf = h =>
      (Number.isFinite(h.M_maneuv) ? h.M_maneuv : 50) * 0.6 +
      (Number.isFinite(h.S_cruise) ? h.S_cruise : 50) * 0.4;
    const selfEdge = battleEdgeOf(horse);
    const frontEdge = battleEdgeOf(frontInCurrent);
    const squeezeRequiredStamina = 0.30 + jockeyReliability * 0.03 - jockeyAggression * 0.04;
    const squeezeSpeedRatio = 1.06 + jockeyReliability * 0.015 - jockeyAggression * 0.025;
    const squeezeEdge = Math.max(0.8, Math.min(3.2, 2.0 + jockeyReliability * 1.4 - jockeyAggression * 1.6));
    const isCapableOfSqueeze =
      staminaRatio >= squeezeRequiredStamina &&   // 余力が残っている
      selfDesired >= frontDesired * squeezeSpeedRatio && // 出したい速度が明確に速い
      (selfEdge - frontEdge) >= squeezeEdge;      // 騎手の勝負気質に応じたリスク許容
    const squeeze = (isInnerTrapped && isCapableOfSqueeze)
      ? this._goalDetectInnerSqueezeAhead(horses, horse)
      : null;
    // 突けるなら割り込む先のレーン（整数）を確定。
    const squeezeLane = squeeze ? clampLane(Math.round(squeeze.center)) : null;

    const projectedX = this._predictGoalX(horse, horizonSec);
    const baseProjectedGap = this._goalFrontGap(horses, horse, currentLane, projectedX);
    const candidates = [
      currentLane,
      currentLane - 1,
      currentLane + 1,
      currentLane - 2,
      currentLane + 2,
      currentLane - 3,
      currentLane + 3,
    ]
      .map(v => clampLane(v))
      .filter((v, i, arr) => arr.indexOf(v) === i);
    const styleOutsideBiasBase = (horse.style === '差し' || horse.style === '追込') ? 0.58 : 0.16;
    const closerRoute = horse.style === '差し' || horse.style === '追込';
    const spreadBoost = closerRoute
      ? last3fWeight * 0.55 + staminaRatio * 0.35
      : staminaRatio * 0.12;
    const styleOutsideBias = styleOutsideBiasBase * (0.75 + Math.min(1, spreadBoost));
    const keepStraightFactor = closerRoute ? Math.max(0.35, 1.15 - spreadBoost * 0.55) : 1;
    const lowStamina = staminaRatio < 0.22;
    // 内側で詰まっている時の外脱出補助：
    // currentLane が浅い（=内側）ほど、かつ stuckMs が長いほど、外側候補の評価を持ち上げる。
    // インナー側へ動く候補にはボーナスを与えない（=押し込み合いの悪化を避ける）。
    // ただし squeeze（内突き）が成立している馬は、外に流すと意図と矛盾するため 0 に。
    const innerEscapeStrength = squeeze
      ? 0
      : Math.max(0, Math.min(1, stuckMs / 1000)) *         // 1.0 秒で最大
        Math.max(0, Math.min(1, (4 - currentLane) / 3)) *  // lane 1〜4 で線形に強くなる
        (frontBlocked ? 1 : 0.5);                          // 詰まっている時は満額

    let bestLane = currentLane;
    let bestScore = -Infinity;
    let currentScore = -Infinity;
    candidates.forEach(lane => {
      const staminaLanePenalty = lowStamina ? Math.abs(lane - currentLane) * 1.85 : 0;
      const projectedGap = this._goalFrontGap(horses, horse, lane, projectedX);
      const projectedDensity = this._goalLaneDensity(horses, horse, lane, projectedX);
      const moveCost = Math.abs(lane - currentLane) * GOAL_AI.laneMoveCostPerLane;
      const staminaRisk = Math.max(0, moveCost * 0.18 - staminaRatio * 0.35);
      const blockRisk = Math.max(0, 1 - Math.min(1, projectedGap / Math.max(1, GOAL_BLOCK_X_GAP * 1.3)));
      const safeLaneBonus = jockeyReliability * Math.max(0, projectedGap - baseProjectedGap) * 0.16;
      const styleBonus = lane * styleOutsideBias * (0.45 + last3fWeight * 0.55);
      const projectedGain = Math.min(projectedGap, 92) * GOAL_AI.projectedGapWeight;
      const keepStraightMult = urgeOvertake && !frontBlocked ? 0.36 : 1;
      const keepStraightPenalty = !frontBlocked
        ? Math.abs(lane - currentLane) * 2.9 * keepStraightFactor * keepStraightMult
        : 0;
      const passLaneBonus = urgeOvertake
        ? Math.max(0, projectedGap - baseProjectedGap) * 0.52
        : 0;
      const collisionHorizonCost = this._goalMultiStepCollisionCost(horses, horse, lane);
      // 外側候補のみ加点。lane が currentLane より内側 or 同じならゼロ。
      const innerEscapeBonus = lane > currentLane
        ? innerEscapeStrength * (lane - currentLane) * 1.6
        : 0;
      // 内突き（squeeze）が成立している馬だけに与える、隙間中心方向への強加点。
      // 隙間中心と一致する整数レーンで最大、隣レーンで半減、2 レーン以上ずれるとゼロ。
      // 隙間幅（width）が広いほどボーナスを伸ばす（1.5 頭分=0.9 で発火、上限を設けて暴走防止）。
      // styleOutsideBias / innerEscapeBonus の典型値を上回る程度の強度に設定し、
      // 「能力ゲートを抜けた馬は内突きを最優先」と planner に伝える。
      const splitThroughBonus = squeeze
        ? Math.max(0, 1.2 - Math.abs(lane - squeezeLane)) *
          Math.min(1.4, 0.6 + (squeeze.width - 0.9) * 1.6) *
          2.4
        : 0;
      const score =
        projectedGain -
        projectedDensity * GOAL_AI.densityWeight * (1 + jockeyReliability * 0.18) -
        blockRisk * GOAL_AI.blockRiskWeight * (1 + jockeyReliability * 0.28) -
        moveCost * (1 + jockeyReliability * 0.14 - jockeyAggression * 0.10) -
        staminaRisk -
        keepStraightPenalty -
        collisionHorizonCost -
        staminaLanePenalty +
        styleBonus +
        riderAggression * 0.8 +
        passLaneBonus * (0.85 + riderAggression * 0.35) +
        innerEscapeBonus * (0.9 + jockeyReliability * 0.3) +
        safeLaneBonus +
        splitThroughBonus * (0.78 + jockeyAggression * 0.45);
      if (Math.abs(lane - currentLane) < 0.01) currentScore = score;
      if (score > bestScore) {
        bestScore = score;
        bestLane = lane;
      }
    });
    return {
      lane: bestLane,
      gain: bestScore - currentScore,
      pressure: Math.max(0, Math.min(1, (bestScore - currentScore) / 6.0)),
    };
  }

  _markHorseGoalFinished(horse) {
    if (horse.goalFinished) return;
    horse.goalFinished = true;
    if (!this._goalRankLogged.has(horse.id)) {
      this._goalRankLogged.add(horse.id);
      this._goalRankOrder.push(horse.id);
      if (!this._goalPlacingHeaderLogged) this._goalPlacingHeaderLogged = true;
      const placing = this._goalRankOrder.length;
      this._setPlacingLog(placing, horse);
    }
  }

  _chooseGoalLane(horses, horse, t = 1) {
    const currentLane = clampLane(horse.y);
    const candidates = [
      currentLane,
      currentLane - 1,
      currentLane + 1,
      currentLane - 2,
      currentLane + 2,
      currentLane - 3,
      currentLane + 3,
      currentLane - 4,
      currentLane + 4,
    ]
      .map(v => clampLane(v))
      .filter((v, i, arr) => arr.indexOf(v) === i);

    let bestLane = currentLane;
    let bestScore = -Infinity;
    let currentScore = -Infinity;
    candidates.forEach(lane => {
      const frontGap = this._goalFrontGap(horses, horse, lane);
      const density = this._goalLaneDensity(horses, horse, lane);
      const moveCost = Math.abs(lane - currentLane) * (1.25 - Math.min(0.55, t * 0.55));
      const outsideBias = (horse.style === '差し' || horse.style === '追込')
        ? lane * 0.68
        : lane * 0.18;
      const openLaneBonus = frontGap > GOAL_BLOCK_X_GAP * 1.65 ? 4.5 : 0;
      const score = Math.min(frontGap, 84) * 1.34 - density * 5.8 - moveCost + outsideBias + openLaneBonus;
      if (Math.abs(lane - currentLane) < 0.01) {
        currentScore = score;
      }
      if (score > bestScore) {
        bestScore = score;
        bestLane = lane;
      }
    });
    return { lane: bestLane, score: bestScore, currentScore };
  }

  next(onFinish) {
    if (this.isAnimating) return;
    this.currentIdx++;
    if (this.currentIdx >= this.snapshots.length) {
      this._syncAdvanceButton();
      this._playGoalApproach(() => onFinish());
      return;
    }
    this._renderPhase(this.currentIdx);
  }
}

const SIMULATOR_BOOT =
  typeof document !== 'undefined' &&
  Boolean(document.getElementById('field-canvas'));

// =====================
//  エントリーポイント
// =====================
if (SIMULATOR_BOOT) {
Promise.all([
  fetch('./src/data/race-info.json').then(res => res.json()),
  fetch('./src/data/race-entries.json').then(res => res.json()),
  fetch('./src/data/courses.json').then(res => res.json()),
])
  .then(([raceInfoData, raceEntriesData, courseCatalog]) => {
    if (raceInfoData?.race_id !== raceEntriesData?.race_id) {
      throw new Error(`race_id mismatch: race-info=${raceInfoData?.race_id} race-entries=${raceEntriesData?.race_id}`);
    }
    const raceData = {
      race_id: raceInfoData.race_id,
      race_info: raceInfoData.race_info,
      entries: cloneRaceEntries(raceEntriesData.entries),
    };
    const courseDef = resolveCourseDef(raceData, courseCatalog);
    const runtimeRaceData = { ...raceData, courseDef };
    const phases        = buildPhases(runtimeRaceData.race_info.distance, courseDef);
    const track         = raceData.race_info.track;
    const condition     = raceData.race_info.condition;
    const renderer      = new Renderer('field-canvas', phases.length, track, condition, courseDef);

    /** calcAllParams のユーザー微調整（巡航・瞬発・持久） */
    const userTweaksState = {};
    runtimeRaceData.entries.forEach((_, idx) => {
      userTweaksState[idx] = { cruise: 0, maneuv: 0, sustain: 0 };
    });

    let initialHorses = [];
    let horseMetaByName = new Map();

    let controller = null;
    let simResults = null;
    let simLogs    = null;
    let simSnapshots = null;
    let lastFinishOrderIds = [];
    let hasAggregatedThisRun = false;
    let isReplayPlayback = false;
    /** @type {{ snapshots: object[], simResults: object[], finishOrderIds: number[], initialHorses?: object[], goalRecording?: object[], postGoalCourseFrame?: object } | null} */
    let replayBundle = null;
    let raceStartInitialHorses = null;
    /** 全馬ゴール後・画面外へ抜けた直後のコース描画（集計画面からの復元用） */
    let postGoalCourseFrame = null;

    const btnPlayStep = document.getElementById('btn-play-step');
    const btnPlayAuto = document.getElementById('btn-play-auto');
    const btnPlayReplay = document.getElementById('btn-play-replay');
    const btnPlayReset = document.getElementById('btn-play-reset');
    const playbackDock = document.getElementById('field-playback-dock');
    const btnShowSummary = document.getElementById('btn-show-summary');
    const btnBackToSimulator = document.getElementById('btn-back-to-simulator');
    const btnBackToPreRace = document.getElementById('btn-back-to-pre-race');
    const raceInfoEl = document.getElementById('race-info');
    let autoAdvanceRafId = 0;
    let autoAdvanceActive = false;
    let currentRaceUsedAutoAdvance = false;
    /** @type {'play' | 'complete'} */
    let playbackDockMode = 'play';

    function stopAutoAdvanceLoop() {
      if (autoAdvanceRafId) {
        cancelAnimationFrame(autoAdvanceRafId);
        autoAdvanceRafId = 0;
      }
    }

    function isAutoDrivingRace() {
      return Boolean(controller && autoAdvanceActive);
    }

    function syncStepButtonLabel() {
      if (!btnPlayStep) return;
      if (!controller && playbackDockMode !== 'complete') {
        btnPlayStep.textContent = '▶ スタート';
        btnPlayStep.setAttribute('aria-label', 'レースを開始');
      } else {
        btnPlayStep.textContent = '⏭ 次へ';
        btnPlayStep.setAttribute('aria-label', '次のフェーズへ');
      }
    }

    function syncAutoButtonLabel() {
      if (!btnPlayAuto) return;
      if (autoAdvanceActive) {
        btnPlayAuto.textContent = '⏸ 停止';
        btnPlayAuto.classList.add('is-auto-active');
        btnPlayAuto.setAttribute('aria-label', 'オート再生を停止');
      } else {
        btnPlayAuto.textContent = '▶ オート';
        btnPlayAuto.classList.remove('is-auto-active');
        btnPlayAuto.setAttribute('aria-label', 'オート再生');
      }
    }

    function syncPlaybackDock() {
      if (!playbackDock) return;
      playbackDock.dataset.mode = playbackDockMode === 'complete' ? 'complete' : 'play';
      syncStepButtonLabel();
      syncAutoButtonLabel();
    }

    function saveReplayBundle(goalRecording = null) {
      if (!Array.isArray(simSnapshots) || simSnapshots.length === 0) return;
      if (!Array.isArray(simResults) || simResults.length === 0) return;
      try {
        const horsesSource = raceStartInitialHorses ?? initialHorses;
        const recording = Array.isArray(goalRecording)
          ? goalRecording
          : replayBundle?.goalRecording ?? null;
        const lastFrame = lastGoalRecordingFrame(recording);
        const postGoal = lastFrame
          ? JSON.parse(JSON.stringify(lastFrame))
          : replayBundle?.postGoalCourseFrame ?? postGoalCourseFrame ?? null;
        replayBundle = {
          snapshots: JSON.parse(JSON.stringify(simSnapshots)),
          simResults: JSON.parse(JSON.stringify(simResults)),
          finishOrderIds: Array.isArray(lastFinishOrderIds) ? [...lastFinishOrderIds] : [],
          initialHorses: Array.isArray(horsesSource)
            ? JSON.parse(JSON.stringify(horsesSource))
            : [],
          goalRecording: Array.isArray(recording)
            ? JSON.parse(JSON.stringify(recording))
            : null,
          postGoalCourseFrame: postGoal,
        };
        postGoalCourseFrame = replayBundle.postGoalCourseFrame ?? null;
      } catch {
        replayBundle = null;
      }
    }

    function syncSimulatorChromeForAutoMode() {
      const btnOpenStats = document.getElementById('btn-open-stats');
      const inGoalScene = Boolean(controller?.goalSceneActive);
      const driving = isAutoDrivingRace();
      const raceComplete = playbackDockMode === 'complete';
      if (inGoalScene) {
        stopAutoAdvanceLoop();
        autoAdvanceActive = false;
        controller?.setAdvanceExternallyLocked(true);
        if (btnPlayStep) btnPlayStep.disabled = true;
        if (btnPlayAuto) btnPlayAuto.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = true;
        if (btnBackToPreRace && !btnBackToPreRace.hidden) btnBackToPreRace.disabled = true;
        syncPlaybackDock();
        return;
      }
      if (controller && driving) {
        controller.setAdvanceExternallyLocked(true);
        if (btnPlayStep) btnPlayStep.disabled = true;
        if (btnPlayAuto) btnPlayAuto.disabled = false;
        if (btnPlayReplay) btnPlayReplay.disabled = true;
        if (btnPlayReset) btnPlayReset.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = true;
        if (btnBackToPreRace && !btnBackToPreRace.hidden) btnBackToPreRace.disabled = true;
      } else if (controller) {
        controller.setAdvanceExternallyLocked(false);
        if (btnPlayStep) btnPlayStep.disabled = false;
        if (btnPlayAuto) btnPlayAuto.disabled = false;
        if (btnPlayReplay) btnPlayReplay.disabled = true;
        if (btnPlayReset) btnPlayReset.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
        controller._syncAdvanceButton();
      } else if (raceComplete) {
        if (btnPlayStep) btnPlayStep.disabled = true;
        if (btnPlayAuto) btnPlayAuto.disabled = true;
        if (btnPlayReplay) btnPlayReplay.disabled = !replayBundle;
        if (btnPlayReset) btnPlayReset.disabled = false;
        if (btnShowSummary) {
          btnShowSummary.disabled = !simResults || !simSnapshots;
        }
        if (btnOpenStats) btnOpenStats.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
      } else {
        if (btnPlayStep) btnPlayStep.disabled = false;
        if (btnPlayAuto) btnPlayAuto.disabled = false;
        if (btnPlayReplay) btnPlayReplay.disabled = true;
        if (btnPlayReset) btnPlayReset.disabled = true;
        if (btnShowSummary) btnShowSummary.disabled = true;
        if (btnOpenStats) btnOpenStats.disabled = false;
        if (btnBackToPreRace) btnBackToPreRace.disabled = false;
      }
      syncPlaybackDock();
    }

    function scheduleAutoAdvanceLoop() {
      if (!controller || !autoAdvanceActive) return;
      stopAutoAdvanceLoop();
      const tick = () => {
        if (!controller || !autoAdvanceActive) {
          autoAdvanceRafId = 0;
          syncSimulatorChromeForAutoMode();
          return;
        }
        if (!controller.isAnimating) {
          controller.next(completeRaceAfterGoal);
        }
        autoAdvanceRafId = requestAnimationFrame(tick);
      };
      autoAdvanceRafId = requestAnimationFrame(tick);
    }

    function completeRaceAfterGoal() {
      stopAutoAdvanceLoop();
      const finishingController = controller;
      if (finishingController && Array.isArray(finishingController._goalRankOrder)) {
        lastFinishOrderIds = [...finishingController._goalRankOrder];
      }
      const recordedGoalPlayback = finishingController?.getGoalRecording?.() ?? null;
      setTimeout(() => {
        const shouldAggregate =
          Array.isArray(simResults) &&
          simResults.length &&
          !hasAggregatedThisRun &&
          !isReplayPlayback;
        if (shouldAggregate) {
          const orderIds = buildSummaryPlacingOrderIds(lastFinishOrderIds, simResults);
          addAggregateRun({
            runtimeRaceData,
            userTweaks: userTweaksState,
            marks: {},
            source: currentRaceUsedAutoAdvance ? 'auto' : 'manual',
            orderIds,
          });
          hasAggregatedThisRun = true;
        }
        if (!isReplayPlayback) {
          saveReplayBundle(recordedGoalPlayback);
        }
        isReplayPlayback = false;
        playbackDockMode = 'complete';
        controller = null;
        autoAdvanceActive = false;
        currentRaceUsedAutoAdvance = false;
        syncSimulatorChromeForAutoMode();
      }, 300);
    }

    const currentOptions = () => ({
      reproducible: true,
      seed: runtimeRaceData.race_id,
    });

    const refreshRaceInfo = () => {
      if (raceInfoEl) raceInfoEl.innerHTML = formatRaceInfo(runtimeRaceData);
    };

    function rebuildHorseMetaByName(horses = initialHorses) {
      horseMetaByName = new Map();
      runtimeRaceData.entries.forEach((entry, idx) => {
        const horse = horses[idx] ?? initialHorses[idx];
        if (!horse) return;
        horse.jockeyName = entry.jockey.name;
        horseMetaByName.set(horse.name, {
          gate: horse.gate,
          waku: horse.waku,
        });
      });
    }

    function applyComputedHorsesToUi() {
      initialHorses = calcAllParams(runtimeRaceData, userTweaksState, {});
      rebuildHorseMetaByName(initialHorses);
      renderEntryList(initialHorses);
      updateEntryStaminaBars(initialHorses);
      renderer.resetHorseRenderState();
      renderer.draw(initialHorses, phases[0], 0);
      refreshRaceInfo();
      persistRaceBundleToSession(runtimeRaceData, userTweaksState, {});
    }

    /** 集計画面から戻ったときなど、保存済みのレース結果表示を復元する */
    function applyRestoredRaceVisuals() {
      if (!Array.isArray(simSnapshots) || simSnapshots.length === 0) {
        applyComputedHorsesToUi();
        return;
      }
      const lastIdx = simSnapshots.length - 1;
      const lastSnap = simSnapshots[lastIdx];
      const phase = phases[lastIdx];
      const finalHorses = Array.isArray(lastSnap?.horses)
        ? lastSnap.horses.map(h => ({ ...h }))
        : null;
      if (!finalHorses?.length) {
        applyComputedHorsesToUi();
        return;
      }

      if (Array.isArray(replayBundle?.initialHorses) && replayBundle.initialHorses.length > 0) {
        initialHorses = replayBundle.initialHorses.map(h => ({ ...h }));
      } else {
        initialHorses = calcAllParams(runtimeRaceData, userTweaksState, {});
      }
      rebuildHorseMetaByName(finalHorses);
      finalHorses.forEach(horse => {
        const entry = runtimeRaceData.entries.find((_, i) => i === horse.id);
        if (entry) horse.jockeyName = entry.jockey.name;
      });
      renderEntryList(finalHorses);
      updateEntryStaminaBars(finalHorses);
      renderer.resetHorseRenderState();

      const courseFrame =
        playbackDockMode === 'complete'
          ? (postGoalCourseFrame ??
            replayBundle?.postGoalCourseFrame ??
            lastGoalRecordingFrame(
              replayBundle?.goalRecording ?? loadGoalRecordingFromSession(),
            ))
          : null;

      const drawRestoredCourse = () => {
        if (courseFrame && drawGoalCourseFrame(renderer, courseFrame, phase)) {
          return;
        }
        renderer.draw(finalHorses, phase, 1);
      };

      drawRestoredCourse();
      refreshRaceInfo();
      // iOS Safari ではレイアウト確定前の draw が待機画面に戻って見えることがある
      if (window.matchMedia('(max-width: 1024px)').matches) {
        requestAnimationFrame(() => requestAnimationFrame(drawRestoredCourse));
      }
    }

    function resetSimulatorToIdle() {
      stopAutoAdvanceLoop();
      autoAdvanceActive = false;
      currentRaceUsedAutoAdvance = false;
      isReplayPlayback = false;
      playbackDockMode = 'play';
      hasAggregatedThisRun = false;
      replayBundle = null;
      raceStartInitialHorses = null;
      postGoalCourseFrame = null;
      if (btnShowSummary) btnShowSummary.disabled = true;
      document.getElementById('phase-indicator').textContent = 'スタート';
      document.getElementById('log-panel').innerHTML =
        '<div class="log-entry" style="color:#334;">待機中...</div>';
      syncPlacingPanelsHtml('');

      renderer.resetHorseRenderState();
      renderer.draw(initialHorses, phases[0], 0);
      updateEntryStaminaBars(initialHorses);
      controller = null;
      simResults = null;
      simLogs = null;
      simSnapshots = null;
      lastFinishOrderIds = [];
      hideRaceSummaryScreen();
      try {
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_STATE);
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_GOAL_RECORDING);
        sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
      } catch {
        /* ignore */
      }
      syncSimulatorChromeForAutoMode();
    }

    function loadGoalRecordingFromSession() {
      if (typeof sessionStorage === 'undefined') return null;
      try {
        const raw = sessionStorage.getItem(SESSION_KEY_SIMULATOR_GOAL_RECORDING);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
      } catch {
        return null;
      }
    }

    function rebuildReplayBundleFromSessionParts(parsed, goalRecordingOverride = undefined) {
      if (!Array.isArray(parsed?.snapshots) || !Array.isArray(parsed?.simResults)) return;
      const finishIds = Array.isArray(parsed.finishOrderIds) ? [...parsed.finishOrderIds] : [];
      const legacy = parsed.replayBundle;
      const meta = parsed.replayMeta ?? {};
      let goalRecording = goalRecordingOverride;
      if (goalRecording === undefined) {
        if (Array.isArray(legacy?.goalRecording) && legacy.goalRecording.length > 0) {
          goalRecording = legacy.goalRecording;
        } else {
          goalRecording = loadGoalRecordingFromSession();
        }
      }
      const initialHorsesSource =
        (Array.isArray(meta.initialHorses) && meta.initialHorses.length > 0)
          ? meta.initialHorses
          : (Array.isArray(legacy?.initialHorses) && legacy.initialHorses.length > 0)
            ? legacy.initialHorses
            : [];
      const explicitPostGoal = parsed.postGoalCourseFrame ?? legacy?.postGoalCourseFrame ?? null;
      const resolvedPostGoal =
        explicitPostGoal ?? lastGoalRecordingFrame(goalRecording) ?? null;
      replayBundle = {
        snapshots: JSON.parse(JSON.stringify(parsed.snapshots)),
        simResults: JSON.parse(JSON.stringify(parsed.simResults)),
        finishOrderIds: Array.isArray(legacy?.finishOrderIds) && legacy.finishOrderIds.length
          ? [...legacy.finishOrderIds]
          : finishIds,
        initialHorses: initialHorsesSource.length
          ? JSON.parse(JSON.stringify(initialHorsesSource))
          : [],
        goalRecording: Array.isArray(goalRecording)
          ? JSON.parse(JSON.stringify(goalRecording))
          : null,
        postGoalCourseFrame: resolvedPostGoal
          ? JSON.parse(JSON.stringify(resolvedPostGoal))
          : null,
      };
      postGoalCourseFrame = replayBundle.postGoalCourseFrame ?? null;
    }

    function persistSimulatorStateToSession() {
      if (typeof sessionStorage === 'undefined') return false;
      if (!Array.isArray(simResults) || simResults.length === 0) return false;
      if (!Array.isArray(simSnapshots) || simSnapshots.length === 0) return false;

      const goalRecording = replayBundle?.goalRecording ?? null;
      const postGoal =
        postGoalCourseFrame ??
        replayBundle?.postGoalCourseFrame ??
        lastGoalRecordingFrame(goalRecording);
      const payload = {
        simResults,
        simLogs,
        snapshots: simSnapshots,
        finishOrderIds: Array.isArray(lastFinishOrderIds) ? [...lastFinishOrderIds] : [],
        postGoalCourseFrame: postGoal ? JSON.parse(JSON.stringify(postGoal)) : null,
        replayMeta: {
          initialHorses: Array.isArray(replayBundle?.initialHorses)
            ? JSON.parse(JSON.stringify(replayBundle.initialHorses))
            : (raceStartInitialHorses
              ? JSON.parse(JSON.stringify(raceStartInitialHorses))
              : []),
          finishOrderIds: Array.isArray(replayBundle?.finishOrderIds)
            ? [...replayBundle.finishOrderIds]
            : [],
        },
        ui: {
          phaseText: document.getElementById('phase-indicator')?.textContent ?? 'スタート',
          logHtml: document.getElementById('log-panel')?.innerHTML ?? '',
          placingHtml: document.getElementById('placing-panel')?.innerHTML ?? '',
          playbackDockMode: playbackDockMode === 'complete' ? 'complete' : 'play',
          btnShowSummaryDisabled: Boolean(btnShowSummary?.disabled),
        },
      };

      const tryWrite = (key, value) => {
        sessionStorage.setItem(key, value);
      };

      try {
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_GOAL_RECORDING);
      } catch {
        /* ignore */
      }

      const slimPayload = {
        ...payload,
        simLogs: null,
      };

      const writeAttempts = [
        () => tryWrite(SESSION_KEY_SIMULATOR_STATE, JSON.stringify(payload)),
        () => tryWrite(SESSION_KEY_SIMULATOR_STATE, JSON.stringify(slimPayload)),
      ];

      let coreSaved = false;
      for (const attempt of writeAttempts) {
        try {
          attempt();
          coreSaved = true;
          break;
        } catch {
          /* QuotaExceededError 等（モバイル Safari で起きやすい） */
        }
      }

      if (!coreSaved) return false;

      if (Array.isArray(goalRecording) && goalRecording.length > 0) {
        const fullJson = JSON.stringify(goalRecording);
        const thinned = goalRecording.filter((_, i) => i % 2 === 0);
        const thinnedJson = JSON.stringify(thinned);
        const goalAttempts = [fullJson, thinnedJson];
        for (const json of goalAttempts) {
          try {
            tryWrite(SESSION_KEY_SIMULATOR_GOAL_RECORDING, json);
            break;
          } catch {
            /* ignore */
          }
        }
      }

      return true;
    }

    function createPhaseControllerFromSnapshots(snapshotSource, resultsSource, replayOpts = {}) {
      const horsesForPlayback = Array.isArray(replayOpts.initialHorses)
        ? replayOpts.initialHorses
        : initialHorses;
      return new PhaseController(
        snapshotSource,
        phases,
        renderer,
        horsesForPlayback,
        horseMetaByName,
        resultsSource,
        {
          onGoalSceneStart: () => {
            stopAutoAdvanceLoop();
            autoAdvanceActive = false;
            syncSimulatorChromeForAutoMode();
          },
          isReplayPlayback: Boolean(replayOpts.isReplayPlayback),
          recordGoalPlayback: Boolean(replayOpts.recordGoalPlayback),
          goalRecording: replayOpts.goalRecording ?? null,
          raceId: runtimeRaceData.race_id,
        },
      );
    }

    function startNewRaceSimulation() {
      isReplayPlayback = false;
      try {
        sessionStorage.removeItem(SESSION_KEY_SIMULATOR_STATE);
        sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
      } catch {
        /* ignore */
      }
      if (btnShowSummary) btnShowSummary.disabled = true;
      document.getElementById('log-panel').innerHTML = '';
      syncPlacingPanelsHtml('');

      refreshRaceInfo();
      const sim = runSimulation(runtimeRaceData, currentOptions(), userTweaksState, {}, renderer);
      simResults = sim.results;
      simLogs = sim.logs;
      simSnapshots = sim.snapshots;
      lastFinishOrderIds = [];
      hasAggregatedThisRun = false;

      simResults.forEach(horse => {
        const entry = runtimeRaceData.entries.find((_, i) => i === horse.id);
        if (entry) horse.jockeyName = entry.jockey.name;
      });

      raceStartInitialHorses = JSON.parse(JSON.stringify(initialHorses));
      controller = createPhaseControllerFromSnapshots(simSnapshots, simResults, {
        recordGoalPlayback: true,
      });
      controller.start();
      playbackDockMode = 'play';
      syncSimulatorChromeForAutoMode();
      scrollAfterRaceStartOnNarrowLayout();
      return true;
    }

    function startReplay() {
      if (!replayBundle?.snapshots?.length || !replayBundle?.simResults?.length) return;
      isReplayPlayback = true;
      stopAutoAdvanceLoop();
      playbackDockMode = 'play';
      document.getElementById('log-panel').innerHTML = '';
      syncPlacingPanelsHtml('');
      document.getElementById('phase-indicator').textContent = 'スタート';

      let replaySnapshots;
      let replayResults;
      try {
        replaySnapshots = JSON.parse(JSON.stringify(replayBundle.snapshots));
        replayResults = JSON.parse(JSON.stringify(replayBundle.simResults));
      } catch {
        isReplayPlayback = false;
        playbackDockMode = 'complete';
        syncSimulatorChromeForAutoMode();
        return;
      }

      simSnapshots = replaySnapshots;
      simResults = replayResults;
      lastFinishOrderIds = Array.isArray(replayBundle.finishOrderIds)
        ? [...replayBundle.finishOrderIds]
        : [];

      replayResults.forEach(horse => {
        const entry = runtimeRaceData.entries.find((_, i) => i === horse.id);
        if (entry) horse.jockeyName = entry.jockey.name;
      });

      renderer.resetHorseRenderState();
      const replayInitialHorses = Array.isArray(replayBundle.initialHorses) &&
        replayBundle.initialHorses.length > 0
        ? replayBundle.initialHorses
        : initialHorses;
      controller = createPhaseControllerFromSnapshots(replaySnapshots, replayResults, {
        isReplayPlayback: true,
        goalRecording: Array.isArray(replayBundle.goalRecording) ? replayBundle.goalRecording : null,
        initialHorses: replayInitialHorses,
      });
      controller.start();
      autoAdvanceActive = true;
      syncSimulatorChromeForAutoMode();
      scheduleAutoAdvanceLoop();
      syncAutoButtonLabel();
    }

    /** 狭い画面でレース開始直後にコースが十分見えるようスクロール */
    function scrollAfterRaceStartOnNarrowLayout() {
      if (!window.matchMedia('(max-width: 1024px)').matches) return;
      const fieldViewport = document.getElementById('field-viewport');
      if (!fieldViewport) return;

      const getViewportBottomPx = () => {
        const vv = window.visualViewport;
        if (vv != null) return vv.offsetTop + vv.height;
        return window.innerHeight;
      };

      const applyScroll = () => {
        void fieldViewport.offsetHeight;
        const scrollRoot = document.scrollingElement ?? document.documentElement;
        const y0 = scrollRoot.scrollTop;
        const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
        const Vbottom = getViewportBottomPx();
        const f = fieldViewport.getBoundingClientRect();
        const enterLine = Math.min(Vbottom * 0.42, Vbottom - 80);
        const deltaRaceMin = Math.max(0, Math.ceil(f.top - enterLine));
        const deltaAlignBottom = Math.ceil(f.bottom - Vbottom + 10);
        const delta = Math.max(deltaRaceMin, deltaAlignBottom);
        const nextTop = Math.min(Math.max(0, y0 + delta), maxTop);
        scrollRoot.scrollTo({ top: nextTop, behavior: 'auto' });
      };

      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(applyScroll)),
      );
    }

    let raceControlsBound = false;
    function bindRaceControlsOnce() {
      if (raceControlsBound) return;
      raceControlsBound = true;

      btnPlayStep?.addEventListener('click', () => {
        if (playbackDockMode === 'complete' || btnPlayStep?.disabled || controller?.goalSceneActive) return;
        if (!controller) {
          startNewRaceSimulation();
          return;
        }
        controller.next(completeRaceAfterGoal);
      });

      btnPlayAuto?.addEventListener('click', () => {
        if (playbackDockMode === 'complete' || btnPlayAuto?.disabled || controller?.goalSceneActive) return;
        if (autoAdvanceActive) {
          stopAutoAdvanceLoop();
          autoAdvanceActive = false;
          syncSimulatorChromeForAutoMode();
          return;
        }
        if (!controller) {
          startNewRaceSimulation();
        }
        autoAdvanceActive = true;
        currentRaceUsedAutoAdvance = true;
        syncSimulatorChromeForAutoMode();
        scheduleAutoAdvanceLoop();
      });

      btnPlayReplay?.addEventListener('click', () => {
        if (btnPlayReplay?.disabled) return;
        if (playbackDockMode !== 'complete') return;
        startReplay();
      });

      btnPlayReset?.addEventListener('click', () => {
        if (btnPlayReset?.disabled) return;
        resetSimulatorToIdle();
      });

      btnShowSummary?.addEventListener('click', () => {
        if (!simResults || !simSnapshots) return;
        renderRaceSummaryScreen({
          raceData: runtimeRaceData,
          simResults,
          finishOrderIds: lastFinishOrderIds,
          horseMetaByName,
          snapshots: simSnapshots,
          phases,
          getPhaseLabel: (phase) => renderer.getPhaseName(phase),
        });
      });

      btnBackToSimulator?.addEventListener('click', () => {
        hideRaceSummaryScreen();
      });

      const saveStatsReturnScreen = (screen) => {
        try {
          sessionStorage.setItem(SESSION_KEY_STATS_RETURN_SCREEN, screen);
        } catch {
          /* ignore */
        }
      };

      const saveSummaryStateForReturn = () => {
        if (!simResults || !simSnapshots) return;
        const payload = {
          simResults,
          finishOrderIds: Array.isArray(lastFinishOrderIds) ? [...lastFinishOrderIds] : [],
          snapshots: simSnapshots,
        };
        try {
          sessionStorage.setItem(SESSION_KEY_SUMMARY_STATE, JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      };

      const saveSimulatorStateForReturn = () => {
        if (!Array.isArray(simResults) || simResults.length === 0 || controller) return;
        persistSimulatorStateToSession();
      };

      const openStatsPage = (returnScreen = 'simulator') => {
        saveStatsReturnScreen(returnScreen);
        saveSimulatorStateForReturn();
        if (returnScreen === 'summary') {
          saveSummaryStateForReturn();
        } else {
          try {
            sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
          } catch {
            /* ignore */
          }
        }
        persistRaceBundleToSession(runtimeRaceData, userTweaksState, {});
        window.location.assign('stats.html');
      };
      document.getElementById('btn-open-stats')?.addEventListener('click', () => openStatsPage('simulator'));
      document.getElementById('btn-open-stats-summary')?.addEventListener('click', () => openStatsPage('summary'));

      btnBackToPreRace?.addEventListener('click', () => {
        resetSimulatorToIdle();
        hideRaceSummaryScreen();
        const preRaceEl = document.getElementById('pre-race-editor');
        if (preRaceEl) preRaceEl.hidden = false;
        if (btnBackToPreRace) btnBackToPreRace.hidden = true;
        schedulePreRaceTableFit();
      });
    }

    function preRaceBeforeConfirm() {
      const nextKey = computeBucketKey(runtimeRaceData, userTweaksState, {});
      const agg = loadAggregateState();
      if (agg.runs.length > 0 && agg.bucketKey && agg.bucketKey !== nextKey) {
        const ok = window.confirm(
          'パラメータ（出走内容や微調整）が変わります。これまでの集計はリセットされ、シミュレータ画面へ進みます。よろしいですか？',
        );
        if (!ok) return false;
        clearAggregateState();
      }
      return true;
    }

    const openScreen =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(SESSION_KEY_OPEN_SCREEN)
        : '';
    const openSimulatorDirect =
      openScreen === 'simulator' ||
      openScreen === 'summary' ||
      (typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(SESSION_KEY_OPEN_SIMULATOR) === '1');
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY_OPEN_SIMULATOR);
      sessionStorage.removeItem(SESSION_KEY_OPEN_SCREEN);
    }

    const openPreRaceScreen = () => {
      resetSimulatorToIdle();
      hideRaceSummaryScreen();
      const preRaceEl = document.getElementById('pre-race-editor');
      if (preRaceEl) preRaceEl.hidden = false;
      if (btnBackToPreRace) btnBackToPreRace.hidden = true;
      schedulePreRaceTableFit();
    };

    const tryRestoreSummaryScreen = () => {
      if (openScreen !== 'summary' || !simResults || !simSnapshots) return false;
      renderRaceSummaryScreen({
        raceData: runtimeRaceData,
        simResults,
        finishOrderIds: lastFinishOrderIds,
        horseMetaByName,
        snapshots: simSnapshots,
        phases,
        getPhaseLabel: (phase) => renderer.getPhaseName(phase),
      });
      return true;
    };

    const restoreSimulatorStateFromSession = () => {
      if (typeof sessionStorage === 'undefined') return false;
      const raw = sessionStorage.getItem(SESSION_KEY_SIMULATOR_STATE);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.simResults) || !Array.isArray(parsed?.snapshots)) return false;
        simResults = parsed.simResults;
        simLogs = Array.isArray(parsed.simLogs) ? parsed.simLogs : null;
        simSnapshots = parsed.snapshots;
        lastFinishOrderIds = Array.isArray(parsed.finishOrderIds) ? parsed.finishOrderIds : [];
        postGoalCourseFrame = parsed.postGoalCourseFrame ?? null;
        rebuildReplayBundleFromSessionParts(parsed);
        const ui = parsed.ui ?? {};
        document.getElementById('phase-indicator').textContent = ui.phaseText ?? 'ゴール';
        if (typeof ui.logHtml === 'string') {
          document.getElementById('log-panel').innerHTML = ui.logHtml;
        }
        if (typeof ui.placingHtml === 'string') {
          syncPlacingPanelsHtml(ui.placingHtml);
        }
        playbackDockMode =
          ui.playbackDockMode === 'complete' || ui.btnRunDisabled === true
            ? 'complete'
            : 'play';
        hasAggregatedThisRun = true;
        if (playbackDockMode === 'complete') {
          saveReplayBundle(replayBundle?.goalRecording ?? null);
        }
        if (btnShowSummary) {
          btnShowSummary.disabled =
            ui.btnShowSummaryDisabled !== undefined ? Boolean(ui.btnShowSummaryDisabled) : false;
        }
        return true;
      } catch {
        return false;
      }
    };

    let simulatorScreenOpened = false;

    const openSimulatorScreen = () => {
      const preRaceEl = document.getElementById('pre-race-editor');
      if (preRaceEl) preRaceEl.hidden = true;
      if (btnBackToPreRace) btnBackToPreRace.hidden = false;
      if (!simulatorScreenOpened) {
        simulatorScreenOpened = true;
        const restored = restoreSimulatorStateFromSession();
        if (restored) {
          applyRestoredRaceVisuals();
        } else {
          applyComputedHorsesToUi();
        }
      }
      syncSimulatorChromeForAutoMode();
    };

    bindRaceControlsOnce();

    if (openScreen === 'pre-race') {
      openPreRaceScreen();
    } else if (openScreen === 'summary') {
      openSimulatorScreen();
      let restored = false;
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem(SESSION_KEY_SUMMARY_STATE);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.simResults) && Array.isArray(parsed?.snapshots)) {
              simResults = parsed.simResults;
              simSnapshots = parsed.snapshots;
              lastFinishOrderIds = Array.isArray(parsed.finishOrderIds) ? parsed.finishOrderIds : [];
              restored = tryRestoreSummaryScreen();
            }
          } catch {
            /* ignore parse error */
          }
        }
        sessionStorage.removeItem(SESSION_KEY_SUMMARY_STATE);
      }
      if (!restored && Array.isArray(simResults) && Array.isArray(simSnapshots)) {
        restored = tryRestoreSummaryScreen();
      }
    } else if (!openSimulatorDirect) {
      openSimulatorScreen();
    }

    mountPreRaceEditor(
      runtimeRaceData,
      openSimulatorScreen,
      preRaceBeforeConfirm,
      { openSimulatorDirect },
    );

    // iOS の bfcache 復帰時も完了画面の描画を維持
    window.addEventListener('pageshow', (ev) => {
      if (!ev.persisted) return;
      if (playbackDockMode !== 'complete' || !Array.isArray(simSnapshots) || !simSnapshots.length) {
        return;
      }
      applyRestoredRaceVisuals();
      syncSimulatorChromeForAutoMode();
    });

  })
  .catch(err => {
    console.error('JSONの読み込みに失敗しました:', err);
  });
}

export { runSimulation, resolveCourseDef, formatRaceInfo };
