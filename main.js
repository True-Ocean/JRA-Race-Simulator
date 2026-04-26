import { createRng }      from './src/engine/rng.js';
import { calcAllParams }  from './src/engine/params.js';
import { buildPhases, calcStaminaCons, applyCornerLoss, laneIndex, getStylePaceMultiplier }
                          from './src/engine/phase.js';
import { detectContacts, shouldBattle, resolveBattle }
                          from './src/engine/battle.js';
import { CONFIG }         from './src/config.js';
import { Renderer }       from './src/ui/renderer.js';

// JRA枠色（枠番1〜8）
const JRA_WAKU_COLORS = {
  1: { bg: '#FFFFFF', text: '#000000', label: '1枠' },
  2: { bg: '#000000', text: '#FFFFFF', label: '2枠' },
  3: { bg: '#FF0000', text: '#FFFFFF', label: '3枠' },
  4: { bg: '#0000FF', text: '#FFFFFF', label: '4枠' },
  5: { bg: '#FFFF00', text: '#000000', label: '5枠' },
  6: { bg: '#008000', text: '#FFFFFF', label: '6枠' },
  7: { bg: '#FF6600', text: '#FFFFFF', label: '7枠' },
  8: { bg: '#FF5FA2', text: '#000000', label: '8枠' },
};

const MIN_FORWARD_GAP = 38;
const LATERAL_BLOCK_X_GAP = 42;
const LATERAL_BLOCK_LANE_GAP = 1.15;
const DIAGONAL_REAR_BLOCK_X_GAP = 30;
const DIAGONAL_REAR_BLOCK_LANE_GAP = 1.05;
const LANE_WIDTH = CONFIG.LANE_COUNT;
const LEAD_BATTLE_PHASE_MAX = 0.35;
const FINAL_DUEL_PHASE_MIN = 0.80;
const FORMATION_LOCK_PHASE = 0.40;
const COLLISION_MIN_Y_GAP = 0.9;
const COLLISION_ITERATIONS = 3;
const COLLISION_EPS = 0.001;
const START_DELAY_BASE_RATE = 0.022;
const STUMBLE_BASE_RATE = 0.008;
const STUMBLE_PHASE_MAX = 0.55;
const GOAL_FURLONG_METERS = 200;
const GOAL_ANIM_FURLONGS = 2;
const GOAL_SECONDS_PER_FURLONG = 12;
const GOAL_TIME_SCALE = 1.0;
const GOAL_DISTANCE_METERS = GOAL_FURLONG_METERS * GOAL_ANIM_FURLONGS;
const GOAL_BASE_MPS = GOAL_FURLONG_METERS / GOAL_SECONDS_PER_FURLONG;
const GOAL_X_PER_METER = 0.28;
const GOAL_LANE_CHANGE_PER_SEC = 4.2;
const GOAL_BLOCK_X_GAP = 10;
const GOAL_NEAR_LANE_GAP = 0.85;
const GOAL_MIN_SPEED_RATIO = 0.58;
const GOAL_MAX_SPEED_RATIO = 1.95;
const GOAL_POST_SCROLL_MS = 1800;
const GOAL_LEADER_ANCHOR_PROGRESS = 0.88;
const GOAL_ANCHOR_FOLLOW_SCALE = 0.92;
const GOAL_CAMERA_LERP = 0.085;
const GOAL_CAMERA_LERP_MAX = 0.16;
const GOAL_ANCHOR_DYNAMIC_BOOST = 0.12;
const STAMINA_LANE_CHANGE_COST = 0.45;
const STAMINA_ACCEL_COST = 0.10;
const STAMINA_EARLY_ACCEL_MULT = 1.10;
const STAMINA_BATTLE_BASE_COST = 0.8;
const STAMINA_BATTLE_LOSER_EXTRA = 1.6;
const STAMINA_BATTLE_TRACKER_GAIN = 0.2;
const STAMINA_CORNER_OUTER_PER_LANE = 0.30;
const GOAL_STAMINA_DRAIN_MULT = 1.35;

// =====================
//  シミュレーション（全フェーズ一括計算）
// =====================
function runSimulation(raceData, options = {}, userTweaks = {}, marks = {}, renderer = null) {
  const seedBase = options.seed ?? raceData.race_id;
  const rng      = createRng(seedBase);
  const horses    = calcAllParams(raceData, userTweaks, marks);
  const courseDef = raceData.courseDef ?? null;
  const phases    = buildPhases(raceData.race_info.distance, courseDef);
  const track     = raceData.race_info.track;
  const condition = raceData.race_info.condition;
  const trackMod  = CONFIG.TRACK_MODIFIER[track]?.[condition] ?? 1.0;
  const ave3fValues = horses.map(h => h.ave3f).filter(v => Number.isFinite(v));
  const ave3fMin = ave3fValues.length ? Math.min(...ave3fValues) : 0;
  const ave3fMax = ave3fValues.length ? Math.max(...ave3fValues) : 1;
  const ave3fSpan = Math.max(0.001, ave3fMax - ave3fMin);

  const globalLogs = [];
  const snapshots  = [];
  horses.forEach(horse => {
    horse.lastAdvance = 0;
    horse.staminaLaneCost = 0;
    horse.staminaAccelCost = 0;
    horse.staminaBattleCost = 0;
    horse.staminaCornerCost = 0;
    horse.battleFatigue = 0;
  });

  for (const phase of phases) {
    const xValues = horses.map(h => h.x);
    const maxX = Math.max(...xValues, 1);
    const xSpan = Math.max(140, maxX);
    const collisionMetrics = renderer
      ? renderer.getCollisionMetrics(xSpan)
      : { minXGap: MIN_FORWARD_GAP, minYGap: COLLISION_MIN_Y_GAP };

    // ① フェーズ特化バトル判定
    const threshold      = phase.distance * 0.8;
    const contacts       = detectContacts(horses, threshold);
    const phaseEventLogs = [];
    const engagedHorseIds = new Set();

    resolveLeadBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds);
    resolveCornerPositionBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds);
    resolveFinalStraightDuel(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds);

    for (const { a, b } of contacts) {
      if (engagedHorseIds.has(a.id) || engagedHorseIds.has(b.id)) continue;
      if (!shouldBattle(rng, horses, a, b)) continue;
      const result = resolveBattle(rng, a, b, phase);
      applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
      const log = `[バトル:進路争い] ${result.winner.name} vs ${result.loser.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
      engagedHorseIds.add(a.id);
      engagedHorseIds.add(b.id);
      break;
    }

    // ② 各馬の移動（衝突回避 + ブロック時バトル）
    const order = [...horses].sort((a, b) => b.x - a.x);
    for (const horse of order) {
      const staminaMod = horse.stamina > 0
        ? CONFIG.STAMINA_MODIFIER_FULL
        : CONFIG.STAMINA_MODIFIER_EMPTY;

      const paceMult = getStylePaceMultiplier(horse.style, phase.ratio);
      const V_eff    = horse.S_cruise * staminaMod * horse.battlePenalty * paceMult;
      const desiredAdvance = V_eff * (phase.distance / 80);
      const irregularMult = applyIrregularEvents(
        rng,
        horse,
        phase,
        phaseEventLogs,
        globalLogs,
      );
      let adjustedAdvance = desiredAdvance * irregularMult;

      // スタート直後は能力差 + 反応差で前後にばらつきを作る
      // （以降フェーズは通常ロジックに戻す）
      if (phase.index === 0) {
        if (horse.startBurstFactor === undefined) {
          // ave3fが短いほどスタート初速を高める（逃げ適性を強く反映）
          const ave3fScore = Number.isFinite(horse.ave3f)
            ? (ave3fMax - horse.ave3f) / ave3fSpan
            : 0.5;
          const launchSkill = (horse.S_cruise * 0.30 + horse.M_maneuv * 0.20) / 100;
          const earlyRunnerBonus = horse.style === '逃げ' ? 0.16
            : horse.style === '先行' ? 0.08
            : 0;
          const baseMult = 0.68
            + ave3fScore * 0.72   // スタートはave3fをより強く反映
            + launchSkill * 0.22
            + earlyRunnerBonus;
          const randomMult = 0.80 + rng() * 0.44; // 反応差を拡大（0.80〜1.24）
          horse.startBurstFactor = baseMult * randomMult;
          if (horse.startBurstFactor >= 1.22) {
            const gainPct = Math.round((horse.startBurstFactor - 1) * 100);
            const log = `[好スタート] ${horse.name} がスタートダッシュを決める（+${gainPct}%）`;
            globalLogs.push(log);
            phaseEventLogs.push(log);
          }
        }
        adjustedAdvance *= horse.startBurstFactor;
      }

      // 序盤で隊列を固めるため、一定フェーズで現レーンを基準化
      if (horse.settledLane === undefined && phase.ratio >= FORMATION_LOCK_PHASE) {
        horse.settledLane = clampLane(horse.y);
      }

      // スタートフェーズでは「空いていれば内へ詰める」挙動を優先する
      const isStartPhase = phase.index === 0;
      horse.targetLane = isStartPhase
        ? calcStartPhaseTargetLane(horse, horses)
        : calcTargetLane(horse, phase, horses);
      const laneChangeRate = getLaneChangeRate(phase);
      const desiredY   = horse.y + (horse.targetLane - horse.y) * laneChangeRate;
      const prevLaneY = horse.y;
      const laneCheck  = resolveLaneMovement(
        rng,
        horse,
        desiredY,
        horses,
        phase,
        phaseEventLogs,
        globalLogs,
        engagedHorseIds,
      );
      horse.y          = laneCheck.nextY;
      const laneShift = Math.abs(horse.y - prevLaneY);
      if (laneShift > 0.001) {
        const laneDrain = laneShift * STAMINA_LANE_CHANGE_COST;
        horse.stamina = Math.max(0, horse.stamina - laneDrain);
        horse.staminaLaneCost += laneDrain;
      }

      // 前方間隔チェック（前が塞がれていて仕掛ける場合はバトル）
      const forwardCheck = resolveForwardMovement(
        rng,
        horse,
        adjustedAdvance,
        horses,
        collisionMetrics.minXGap,
        phase,
        phaseEventLogs,
        globalLogs,
        engagedHorseIds,
      );
      horse.x += forwardCheck.advance;

      const accelAmount = Math.max(0, forwardCheck.advance - (horse.lastAdvance ?? 0));
      if (accelAmount > 0.001) {
        const earlyMult = horse.style === '逃げ' && phase.ratio <= 0.35 ? STAMINA_EARLY_ACCEL_MULT : 1.0;
        const accelDrain = accelAmount * STAMINA_ACCEL_COST * earlyMult;
        horse.stamina = Math.max(0, horse.stamina - accelDrain);
        horse.staminaAccelCost += accelDrain;
      }
      horse.lastAdvance = forwardCheck.advance;

      applyCornerLoss(phase, horse);
      if (phase.isCorner) {
        const lane = laneIndex(horse.y);
        const outerDrain = Math.max(0, lane - 3) * STAMINA_CORNER_OUTER_PER_LANE;
        if (outerDrain > 0) {
          horse.stamina = Math.max(0, horse.stamina - outerDrain);
          horse.staminaCornerCost += outerDrain;
        }
      }

      const cons    = calcStaminaCons(phase, horse, trackMod);
      horse.stamina = Math.max(0, horse.stamina - cons);

      horse.battleLosses  = 0;
      horse.battlePenalty = 1.0;

      // レースログはバトル関連のみを表示するため、通常の進行ログは出力しない
    }

    // ③ 全馬の最終位置を解消して重なりを防ぐ（非接触保証）
    resolveHorseOverlaps(horses, {
      minXGap: collisionMetrics.minXGap,
      minYGap: collisionMetrics.minYGap,
      iterations: COLLISION_ITERATIONS,
      keepOrder: true,
      freezeY: phase.ratio < 0.18,
    });

    snapshots.push({
      phaseIndex: phase.index,
      isCorner:   phase.isCorner,
      isFinal:    phase.isFinal,
      ratio:      phase.ratio,
      eventLogs:  phaseEventLogs,
      horses:     horses.map(h => ({ ...h })),
    });
  }

  // ③ 最終タイム算出
  const results = horses.map(horse => {
    const staminaBonus = horse.initialStamina > 0
      ? (horse.stamina / horse.initialStamina) * 0.1 : 0;
    const V_final     = horse.S_cruise * (horse.stamina > 0 ? 1.0 : 0.7);
    const arrivalTime = (raceData.race_info.distance + horse.distanceLoss)
                      / (V_final * (1 + staminaBonus));
    return { ...horse, arrivalTime };
  });
  results.sort((a, b) => a.arrivalTime - b.arrivalTime);

  return { results, logs: globalLogs, snapshots, phases };
}

function getBattleLogClass(logLine) {
  if (logLine === '＝＝＝＝＝＝＝＝[着順]＝＝＝＝＝＝＝＝') return 'log-entry placing';
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

function formatLogLineHtml(logLine, horseMetaByName) {
  const tagMatch = logLine.match(/^\[[^\]]+\]/);
  if (!tagMatch) return decorateHorseNames(logLine, horseMetaByName);

  const tagText = tagMatch[0];
  const restText = logLine.slice(tagText.length).trimStart();
  const tagClass = getLogTagClass(logLine);
  const tagHtml = `<span class="${tagClass}">${escapeHtml(tagText)}</span>`;
  const bodyHtml = decorateHorseNames(restText, horseMetaByName);
  return `${tagHtml} ${bodyHtml}`;
}

function formatRaceInfo(raceData, courseDef, simOptions) {
  const info = raceData.race_info;
  const courseLabel = courseDef?.name ?? 'コース定義なし（自動生成）';
  const seedLabel = simOptions.reproducible ? `${simOptions.seed}` : 'ランダム';
  return [
    `レースID: <b>${raceData.race_id}</b>`,
    `条件: <b>${info.track}</b> / <b>${info.distance}m</b> / <b>${info.condition}</b>`,
    `コース: <b>${courseLabel}</b>`,
    `乱数: <b>${seedLabel}</b> (${simOptions.reproducible ? '再現性ON' : '再現性OFF'})`,
  ].join('　｜　');
}

function resolveCourseDef(raceData, courseCatalog) {
  const requestedId = raceData?.race_info?.course_id;
  const courses = courseCatalog?.courses ?? [];
  if (requestedId) {
    const found = courses.find(c => c.id === requestedId);
    if (found) return found;
  }
  if (courseCatalog?.defaultCourseId) {
    const fallback = courses.find(c => c.id === courseCatalog.defaultCourseId);
    if (fallback) return fallback;
  }
  return null;
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

function resolveLaneMovement(rng, horse, desiredY, allHorses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  const wantsLaneChange = Math.abs(desiredY - horse.y) > 0.18;
  if (wantsLaneChange && hasDiagonalRearRisk(horse, desiredY, allHorses)) {
    return { nextY: clampLane(horse.y) };
  }

  const laneBlocker = allHorses.find(h =>
    h.id !== horse.id &&
    Math.abs(h.x - horse.x) < LATERAL_BLOCK_X_GAP &&
    Math.abs(h.y - desiredY) < LATERAL_BLOCK_LANE_GAP
  );

  if (!laneBlocker) {
    return { nextY: clampLane(desiredY) };
  }

  if (!wantsLaneChange) {
    return { nextY: clampLane(horse.y) };
  }

  // 進路変更を強行したいときは既存バトル判定を利用
  if (!engagedHorseIds.has(horse.id) && !engagedHorseIds.has(laneBlocker.id) &&
      shouldBattle(rng, allHorses, horse, laneBlocker)) {
    const result = resolveBattle(rng, horse, laneBlocker, phase);
    applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
    const log = `[バトル:進路争い] ${horse.name} が ${laneBlocker.name} に進路争い → 勝者: ${result.winner.name}`;
    globalLogs.push(log);
    phaseEventLogs.push(log);
    engagedHorseIds.add(horse.id);
    engagedHorseIds.add(laneBlocker.id);
    if (result.winner.id === horse.id) {
      return { nextY: clampLane(desiredY) };
    }
  }

  return { nextY: clampLane(horse.y) };
}

function hasDiagonalRearRisk(horse, desiredY, allHorses) {
  const targetLane = clampLane(desiredY);
  return allHorses.some(h => {
    if (h.id === horse.id) return false;
    const rearGap = horse.x - h.x;
    if (rearGap <= 0 || rearGap > DIAGONAL_REAR_BLOCK_X_GAP) return false;
    return Math.abs(h.y - targetLane) < DIAGONAL_REAR_BLOCK_LANE_GAP;
  });
}

function applyIrregularEvents(rng, horse, phase, phaseEventLogs, globalLogs) {
  if (horse.startIrregularChecked === undefined) horse.startIrregularChecked = false;
  if (horse.stumbleCooldown === undefined) horse.stumbleCooldown = 0;

  let mult = 1.0;

  if (phase.index === 0 && !horse.startIrregularChecked) {
    horse.startIrregularChecked = true;
    const startDelayRate = calcStartDelayRate(horse);
    if (rng() < startDelayRate) {
      const lossRatio = 0.22 + rng() * 0.16;
      mult *= (1 - lossRatio);
      const lossPct = Math.round(lossRatio * 100);
      const log = `[出遅れ] ${horse.name} がスタートで遅れる（-${lossPct}%）`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
    }
  }

  if (horse.stumbleCooldown > 0) {
    horse.stumbleCooldown -= 1;
    return mult;
  }

  if (phase.ratio <= STUMBLE_PHASE_MAX) {
    const stumbleRate = calcStumbleRate(horse);
    if (rng() < stumbleRate) {
      const lossRatio = 0.12 + rng() * 0.14;
      mult *= (1 - lossRatio);
      horse.stumbleCooldown = 2;
      horse.stamina = Math.max(0, horse.stamina - (1.0 + rng() * 2.0));
      const lossPct = Math.round(lossRatio * 100);
      const log = `[つまずき] ${horse.name} がつまずく（-${lossPct}%）`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
    }
  }

  return mult;
}

function calcStartDelayRate(horse) {
  const maneuvWeakness = Math.max(0, (100 - horse.M_maneuv) / 100);
  const styleAdj = horse.style === '逃げ' ? 0.86
    : horse.style === '先行' ? 0.92
      : horse.style === '差し' ? 1.05
        : 1.12;
  const rate = START_DELAY_BASE_RATE * (0.65 + maneuvWeakness * 0.9) * styleAdj;
  return Math.max(0.004, Math.min(0.055, rate));
}

function calcStumbleRate(horse) {
  const maneuvWeakness = Math.max(0, (100 - horse.M_maneuv) / 100);
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  const fatigue = Math.max(0, 1 - staminaRatio);
  const rate = STUMBLE_BASE_RATE * (0.7 + maneuvWeakness * 0.8 + fatigue * 0.45);
  return Math.max(0.002, Math.min(0.03, rate));
}

function resolveForwardMovement(rng, horse, desiredAdvance, allHorses, minForwardGap, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  const nextX = horse.x + desiredAdvance;
  const frontCandidates = allHorses
    .filter(h =>
      h.id !== horse.id &&
      h.x > horse.x &&
      Math.abs(h.y - horse.y) < 0.8
    )
    .sort((a, b) => a.x - b.x);

  const front = frontCandidates[0];
  if (!front) {
    return { advance: desiredAdvance };
  }

  const currentGap = front.x - horse.x;
  const maxAdvanceWithoutContact = Math.max(0, currentGap - minForwardGap);
  if (desiredAdvance <= maxAdvanceWithoutContact) {
    return { advance: desiredAdvance };
  }

  const wantsOvertake = nextX > front.x - minForwardGap;
  if (wantsOvertake &&
      !engagedHorseIds.has(horse.id) && !engagedHorseIds.has(front.id) &&
      shouldBattle(rng, allHorses, horse, front)) {
    const result = resolveBattle(rng, horse, front, phase);
    applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
    const laneGap = Math.abs(front.y - horse.y).toFixed(2);
    const frontGap = Math.max(0, front.x - horse.x).toFixed(1);
    const log = `[バトル:同レーン争い] ${horse.name} が ${front.name} を交わしに行く (前方差:${frontGap}, レーン差:${laneGap}) → 勝者: ${result.winner.name}`;
    globalLogs.push(log);
    phaseEventLogs.push(log);
    engagedHorseIds.add(horse.id);
    engagedHorseIds.add(front.id);
    if (result.winner.id === horse.id) {
      return { advance: desiredAdvance };
    }
  }

  return { advance: maxAdvanceWithoutContact };
}

function clampLane(v) {
  return Math.max(1, Math.min(LANE_WIDTH, v));
}

function resolveHorseOverlaps(horses, options = {}) {
  const minXGap = options.minXGap ?? MIN_FORWARD_GAP;
  const minYGap = options.minYGap ?? COLLISION_MIN_Y_GAP;
  const iterations = options.iterations ?? COLLISION_ITERATIONS;
  const keepOrder = options.keepOrder ?? true;
  const freezeY = options.freezeY ?? false;
  if (!Array.isArray(horses) || horses.length < 2) return;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < horses.length; i++) {
      const a = horses[i];
      for (let j = i + 1; j < horses.length; j++) {
        const b = horses[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx >= minXGap || ady >= minYGap) continue;

        const pushX = (minXGap - adx) / 2;
        const pushY = freezeY ? 0 : (minYGap - ady) / 2;
        const sx = dx === 0 ? (i % 2 === 0 ? -1 : 1) : Math.sign(dx);
        const sy = dy === 0 ? (i % 2 === 0 ? -1 : 1) : Math.sign(dy);

        // 前後方向を優先し、レーン方向で補助的に分離する
        a.x -= pushX * sx;
        b.x += pushX * sx;
        if (!freezeY) {
          a.y = clampLane(a.y - pushY * sy);
          b.y = clampLane(b.y + pushY * sy);
        }
        moved = true;
      }
    }

    if (keepOrder) enforceForwardOrder(horses, minXGap);
    horses.forEach(h => {
      h.y = clampLane(h.y);
      if (h.x < 0) h.x = 0;
    });
    if (!moved) break;
  }
}

function enforceForwardOrder(horses, minXGap) {
  const byFront = [...horses].sort((a, b) => b.x - a.x);
  for (let i = 1; i < byFront.length; i++) {
    const front = byFront[i - 1];
    const back = byFront[i];
    const gap = front.x - back.x;
    if (gap + COLLISION_EPS >= minXGap) continue;
    back.x = Math.max(0, front.x - minXGap);
  }
}

// =====================
//  レーン移動AI（8レーン対応）
// =====================
function calcTargetLane(horse, phase, allHorses) {
  const currentLane = clampLane(horse.y);
  let preferredLane = getPreferredLaneByStyle(horse, phase);
  if (!phase.isFinal && phase.ratio >= FORMATION_LOCK_PHASE && phase.ratio < 0.80 && horse.settledLane !== undefined) {
    // 序盤で決まった隊列を道中は維持し、極端な横移動を抑える
    preferredLane = horse.settledLane * 0.75 + preferredLane * 0.25;
  }
  const [laneMin, laneMax] = getPhaseLaneBand(phase);
  const clampToBand = v => Math.max(laneMin, Math.min(laneMax, clampLane(v)));
  const candidates = [
    preferredLane,
    preferredLane - 1,
    preferredLane + 1,
    currentLane,
    currentLane - 1,
    currentLane + 1,
  ]
    .map(clampToBand)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  let bestLane = clampToBand(currentLane);
  let bestScore = -Infinity;

  for (const lane of candidates) {
    const score = scoreLaneOption(horse, lane, preferredLane, phase, allHorses, currentLane);
    if (score > bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }

  // 内側が空いている場合は、基本的に1段ずつ内へ詰める
  // （終盤の急な外持ち出しを優先したいケース以外）
  const canPreferInner = phase.ratio < 0.92;
  if (canPreferInner && currentLane > laneMin) {
    const innerLane = clampToBand(currentLane - 1);
    if (isLaneOpenForShift(horse, innerLane, allHorses) && isInnerLaneOpenAhead(horse, innerLane, allHorses)) {
      bestLane = Math.min(bestLane, innerLane);
    }
  }
  return bestLane;
}

function calcStartPhaseTargetLane(horse, allHorses) {
  const currentLane = clampLane(horse.y);
  let bestLane = currentLane;

  // ゲートを出た直後は、進路が確保できる範囲で内へ詰める。
  for (let lane = currentLane - 1; lane >= 1; lane--) {
    if (!isLaneOpenForShift(horse, lane, allHorses)) break;
    if (!isInnerLaneOpenAhead(horse, lane, allHorses)) break;
    bestLane = lane;
  }
  return bestLane;
}

function resolveLeadBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (phase.ratio > LEAD_BATTLE_PHASE_MAX) return;
  const sorted = [...horses].sort((a, b) => b.x - a.x);
  if (sorted.length < 2) return;
  const leadX = sorted[0].x;
  const leadPack = sorted.filter(h =>
    (leadX - h.x) <= 26 &&
    (h.style === '逃げ' || h.style === '先行') &&
    !engagedHorseIds.has(h.id)
  );
  if (leadPack.length < 2) return;

  let pair = null;
  for (let i = 0; i < leadPack.length; i++) {
    for (let j = i + 1; j < leadPack.length; j++) {
      if (Math.abs(leadPack[i].y - leadPack[j].y) < 1.4) {
        pair = [leadPack[i], leadPack[j]];
        break;
      }
    }
    if (pair) break;
  }
  if (!pair) return;
  const [a, b] = pair;
  if (!shouldBattle(rng, horses, a, b)) return;

  const result = resolveWeightedBattle(rng, a, b, {
    cruise: 0.45,
    maneuv: 0.35,
    sustain: 0.05,
    stamina: 0.15,
  });
  const log = `[バトル:先頭争い] ${a.name} vs ${b.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
  phaseEventLogs.push(log);
  globalLogs.push(log);
  engagedHorseIds.add(a.id);
  engagedHorseIds.add(b.id);
}

function resolveCornerPositionBattle(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (!phase.isCorner) return;

  const candidates = horses
    .filter(h => !engagedHorseIds.has(h.id))
    .map(h => ({ horse: h, desired: getPreferredLaneByStyle(h, phase) }))
    .filter(item => item.desired < item.horse.y - 0.35)
    .sort((a, b) => b.horse.x - a.horse.x);

  for (const item of candidates) {
    const a = item.horse;
    const blocker = horses.find(h =>
      h.id !== a.id &&
      !engagedHorseIds.has(h.id) &&
      h.y < a.y &&
      (a.y - h.y) < 1.25 &&
      Math.abs(h.x - a.x) < 24
    );
    if (!blocker) continue;
    if (!shouldBattle(rng, horses, a, blocker)) continue;

    const result = resolveWeightedBattle(rng, a, blocker, {
      cruise: 0.20,
      maneuv: 0.55,
      sustain: 0.05,
      stamina: 0.20,
    });
    const log = `[バトル:コーナー争い] ${a.name} vs ${blocker.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
    phaseEventLogs.push(log);
    globalLogs.push(log);
    engagedHorseIds.add(a.id);
    engagedHorseIds.add(blocker.id);
    return;
  }
}

function resolveFinalStraightDuel(rng, horses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  if (!(phase.isFinal || phase.ratio >= FINAL_DUEL_PHASE_MIN)) return;

  const sorted = [...horses].sort((a, b) => b.x - a.x);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (engagedHorseIds.has(a.id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (engagedHorseIds.has(b.id)) continue;
      if (Math.abs(a.x - b.x) > 18) continue;
      if (Math.abs(a.y - b.y) > 1.6) continue;
      if (!shouldBattle(rng, horses, a, b)) continue;

      const result = resolveWeightedBattle(rng, a, b, {
        cruise: 0.30,
        maneuv: 0.15,
        sustain: 0.45,
        stamina: 0.10,
      }, horse => (horse.style === '差し' || horse.style === '追込') ? 4 : 0);
      const log = `[バトル:直線争い] ${a.name} vs ${b.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
      phaseEventLogs.push(log);
      globalLogs.push(log);
      engagedHorseIds.add(a.id);
      engagedHorseIds.add(b.id);
      return;
    }
  }
}

function resolveWeightedBattle(rng, a, b, weights, styleBonusFn = () => 0) {
  const eA = battleScore(rng, a, weights, styleBonusFn);
  const eB = battleScore(rng, b, weights, styleBonusFn);
  const winner = eA > eB ? a : b;
  const loser  = eA > eB ? b : a;
  loser.battlePenalty = CONFIG.BATTLE_PENALTY;
  loser.battleLosses += 1;
  applyBattleStaminaImpact(winner, loser, { loserAlreadyPenalized: false });
  return {
    winner,
    loser,
    eA: Math.round(eA * 10) / 10,
    eB: Math.round(eB * 10) / 10,
  };
}

function applyBattleStaminaImpact(winner, loser, options = {}) {
  const loserAlreadyPenalized = Boolean(options.loserAlreadyPenalized);
  const winnerDrain = STAMINA_BATTLE_BASE_COST;
  const loserExtraDrain = loserAlreadyPenalized
    ? Math.max(0, STAMINA_BATTLE_LOSER_EXTRA - CONFIG.BATTLE_STAMINA_COST * 0.55)
    : STAMINA_BATTLE_LOSER_EXTRA;

  winner.stamina = Math.max(0, winner.stamina - winnerDrain);
  loser.stamina = Math.max(0, loser.stamina - loserExtraDrain);

  winner.staminaBattleCost = (winner.staminaBattleCost ?? 0) + winnerDrain;
  loser.staminaBattleCost = (loser.staminaBattleCost ?? 0) + loserExtraDrain;
  // 勝者までフェーズ消費を積み上げると枯渇が早すぎるため、追跡加算は敗者中心にする。
  winner.battleLosses = (winner.battleLosses ?? 0) + STAMINA_BATTLE_TRACKER_GAIN * 0.25;
  loser.battleLosses = (loser.battleLosses ?? 0) + STAMINA_BATTLE_TRACKER_GAIN;
  winner.battleFatigue = (winner.battleFatigue ?? 0) + winnerDrain * 0.35;
  loser.battleFatigue = (loser.battleFatigue ?? 0) + loserExtraDrain * 0.45;
}

function battleScore(rng, horse, weights, styleBonusFn) {
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  return (
    horse.S_cruise * weights.cruise +
    horse.M_maneuv * weights.maneuv +
    horse.S_sustain * weights.sustain +
    (staminaRatio * 100) * weights.stamina +
    styleBonusFn(horse) +
    (rng() * 10 - 5)
  );
}

function getPreferredLaneByStyle(horse, phase) {
  const r = phase.ratio;
  const style = horse.style;
  if (style === '逃げ') return r < 0.80 ? 1.6 : 2.5;
  if (style === '先行') return r < 0.80 ? 2.8 : 3.6;
  if (style === '差し') return r < 0.60 ? 4.8 : (r < 0.80 ? 4.2 : 5.2);
  if (style === '追込') return r < 0.60 ? 5.8 : (r < 0.80 ? 4.8 : 6.0);
  return 3.8;
}

function getLaneChangeRate(phase) {
  // スタート直後はポジション取りを素早く終え、以降は落ち着かせる
  if (phase.ratio < 0.12) return 0.62;
  if (phase.ratio < FORMATION_LOCK_PHASE) return 0.40;
  if (phase.ratio < 0.80) return 0.12;
  return 0.20;
}

function getPhaseLaneBand(phase) {
  // スタート直後の過密を避けるため、序盤は横幅を広めに使う。
  if (phase.ratio < 0.10) return [1, 12];
  if (phase.ratio < 0.80) return [1, 8];
  if (phase.ratio < 0.92) return [1, 10];
  return [1, LANE_WIDTH];
}

function scoreLaneOption(horse, lane, preferredLane, phase, allHorses, currentLane) {
  const frontGap = getFrontGap(horse, lane, allHorses);
  const nearCount = allHorses.filter(h =>
    h.id !== horse.id &&
    Math.abs(h.x - horse.x) < 28 &&
    Math.abs(h.y - lane) < 0.9
  ).length;

  let score = 0;
  score += Math.min(frontGap, 60) * 0.85;           // 前方クリア距離
  score -= Math.abs(lane - preferredLane) * 2.8;    // 脚質の基本方針との差
  score -= nearCount * 4.5;                         // 密集回避

  // 距離ロス観点では基本的に内有利（コーナーで増幅）
  const innerBias = (LANE_WIDTH - lane) * (phase.isCorner ? 0.9 : 0.35);
  score += innerBias;

  // 差し・追込は序盤で外待機、終盤で前進優先
  if ((horse.style === '差し' || horse.style === '追込') && phase.ratio < 0.65) {
    score += lane * 0.55;
  }
  if ((horse.style === '差し' || horse.style === '追込') && phase.ratio >= 0.80) {
    score -= lane * 0.35;
  }

  // 逃げ/先行はスタート〜序盤で内のポジション取りを優先。
  // 空いていない場合は無理に寄せないように抑制する。
  if ((horse.style === '逃げ' || horse.style === '先行') && phase.ratio < 0.25) {
    if (lane < currentLane && isInnerLaneOpenAhead(horse, lane, allHorses)) {
      score += 12;
    }
    if (lane > currentLane) {
      score -= 5;
    }
  }

  if (frontGap < MIN_FORWARD_GAP + 4) score -= 12;
  return score;
}

function getFrontGap(horse, lane, allHorses) {
  const front = allHorses
    .filter(h =>
      h.id !== horse.id &&
      h.x > horse.x &&
      Math.abs(h.y - lane) < 0.8
    )
    .sort((a, b) => a.x - b.x)[0];
  if (!front) return 999;
  return front.x - horse.x;
}

function isLaneOpenForShift(horse, targetLane, allHorses) {
  return !allHorses.some(h =>
    h.id !== horse.id &&
    Math.abs(h.y - targetLane) < 0.9 &&
    Math.abs(h.x - horse.x) < LATERAL_BLOCK_X_GAP
  );
}

function isInnerLaneOpenAhead(horse, targetLane, allHorses) {
  return !allHorses.some(h =>
    h.id !== horse.id &&
    Math.abs(h.y - targetLane) < 0.9 &&
    h.x >= horse.x - 6 &&
    h.x <= horse.x + 30
  );
}

// =====================
//  出馬表の初期描画（充実版）
// =====================
function renderEntryList(horses) {
  const listEl = document.getElementById('entry-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  horses.forEach(horse => {
    const waku = JRA_WAKU_COLORS[horse.waku] ?? { bg: '#888', text: '#fff' };
    const staminaRemainPct = getStaminaRemainPct(horse);
    const staminaBarClass = getStaminaBarClassName(staminaRemainPct);

    const row = document.createElement('div');
    row.className        = 'entry-row';
    row.dataset.horseId  = horse.id;
    // 左端に枠色の帯を border-left で表示
    row.style.borderLeft = `5px solid ${waku.bg}`;
    row.style.boxShadow  = `inset 3px 0 8px rgba(0,0,0,0.18)`;
    row.innerHTML = `
      <div class="entry-gate" style="background:${waku.bg};color:${waku.text};border:1px solid rgba(255,255,255,0.3);">${horse.gate}</div>
      <div class="entry-info">
        <div class="entry-head">
          <div class="entry-name">${horse.name}</div>
          <div class="entry-jockey">🏇 ${horse.jockeyName ?? ''} / ${horse.style}</div>
        </div>
        <div class="entry-params">
          <div class="param-row">
            <span class="param-label">残ST</span>
            <div class="param-bar-bg"><div class="param-bar ${staminaBarClass}" style="width:${staminaRemainPct}%"></div></div>
            <span class="param-val stamina-remain-val">${staminaRemainPct}</span>
          </div>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

function getStaminaRemainPct(horse) {
  if (!horse || horse.initialStamina <= 0) return 0;
  const ratio = (horse.stamina / horse.initialStamina) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

function getStaminaBarClassName(staminaPct) {
  if (staminaPct < 25) return 'stamina-remain-bar is-critical';
  if (staminaPct < 50) return 'stamina-remain-bar is-warning';
  return 'stamina-remain-bar';
}

function updateEntryStaminaBars(horses) {
  horses.forEach(horse => {
    const rowEl = document.querySelector(`[data-horse-id="${horse.id}"]`);
    if (!rowEl) return;
    const pct = getStaminaRemainPct(horse);
    const barEl = rowEl.querySelector('.stamina-remain-bar');
    const valEl = rowEl.querySelector('.stamina-remain-val');
    if (barEl) {
      barEl.style.width = `${pct}%`;
      barEl.className = `param-bar ${getStaminaBarClassName(pct)}`;
    }
    if (valEl) valEl.textContent = `${pct}`;
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
  ) {
    this.snapshots   = snapshots;
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

    this.btnAdvance = document.getElementById('btn-run');
    this.btnReset  = document.getElementById('btn-reset');
    this.logPanel  = document.getElementById('log-panel');
    this.indicator = document.getElementById('phase-indicator');
    this.isAnimating = false;
    this.frameCount  = 24; // 1フェーズを細かく刻む
    this.frameMs     = 70; // 1コマの表示時間
  }

  start() {
    this.currentIdx = 0;
    this.renderer.resetHorseRenderState();
    this._renderPhase(0);
    this.btnAdvance.disabled = false;
    this.btnAdvance.textContent = '▶▶ 次のフェーズ';
  }

  _renderPhase(idx) {
    const snap  = this.snapshots[idx];
    const phase = this.phases[idx];
    const prev  = idx > 0 ? this.snapshots[idx - 1] : null;
    const fromForAnimation = this.lastRenderedHorses
      ?? prev?.horses
      ?? this.initialHorses;

    // 馬カードをアニメーション付きで描画（前フェーズ位置から開始）
    this._animateHorses(fromForAnimation, snap.horses, phase, idx === 0);

    // フェーズ名をインジケーターに反映
    this.indicator.textContent = this.renderer.getPhaseName(phase);

    // ログをステップバイステップで1行ずつ表示
    this._enqueueLogs(snap.eventLogs);
    updateEntryStaminaBars(fromForAnimation ?? snap.horses);

    // 最終フェーズの次は「ゴール判定」
    if (idx === this.snapshots.length - 1) {
      this.btnAdvance.textContent = '🏁 ゴール判定';
    }
  }

  // 馬カードをアニメーションで表示（段階的に進行度を上げる）
  _animateHorses(fromHorses, toHorses, phase, isFirstPhase = false) {
    this.isAnimating      = true;
    this.btnAdvance.disabled = true;

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
        if (frame >= totalFrames) {
          this.lastRenderedHorses = toHorses.map(h => ({ ...h }));
          this.isAnimating = false;
          this.btnAdvance.disabled = false;
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
      if (progress >= 1) {
        this.lastRenderedHorses = toHorses.map(h => ({ ...h }));
        this.isAnimating = false;
        this.btnAdvance.disabled = false;
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

  _appendLog(line) {
    const div  = document.createElement('div');
    div.className = getBattleLogClass(line);
    div.innerHTML = formatLogLineHtml(line, this.horseMetaByName);
    this.logPanel.appendChild(div);
    this.logPanel.scrollTop = this.logPanel.scrollHeight;
  }

  _playGoalApproach(onDone) {
    if (!Array.isArray(this.simResults) || this.simResults.length === 0) {
      onDone?.();
      return;
    }

    const lastIdx = this.snapshots.length - 1;
    const finalSnap = this.snapshots[lastIdx];
    const phase = this.phases[lastIdx];
    const baseHorses = (this.lastRenderedHorses ?? finalSnap.horses).map(h => ({ ...h }));

    const arrivalTimes = this.simResults.map(h => h.arrivalTime).filter(v => Number.isFinite(v));
    if (arrivalTimes.length === 0) {
      onDone?.();
      return;
    }
    const minArrival = Math.min(...arrivalTimes);
    const maxArrival = Math.max(...arrivalTimes);
    const arrivalSpan = Math.max(1e-9, maxArrival - minArrival);
    const fastWeightById = new Map(
      this.simResults.map(horse => {
        const fastness = (maxArrival - horse.arrivalTime) / arrivalSpan;
        return [horse.id, Math.max(0, Math.min(1, fastness))];
      }),
    );

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
    const simHorses = baseHorses.map(h => {
      const staminaRatio = h.initialStamina > 0 ? h.stamina / h.initialStamina : 0.5;
      return {
        ...h,
        goalMeters: 0,
        goalFinished: false,
        targetLane: h.y,
        goalStartProgress: calcFinalMappedProgress(h.x),
        goalCurrentMps: GOAL_BASE_MPS * (0.72 + staminaRatio * 0.30),
        goalAccelState: 0,
        goalLaneCost: 0,
      };
    });

    const durationMs = GOAL_DISTANCE_METERS / GOAL_BASE_MPS * 1000 * GOAL_TIME_SCALE;
    const startedAt = performance.now();
    let lastTs = startedAt;

    this.isAnimating = true;
    this.btnAdvance.disabled = true;
    this.indicator.textContent = 'ゴールシーン';
    this._goalRankLogged = new Set();
    this._goalRankOrder = [];
    this._goalPlacingHeaderLogged = false;
    this._goalLineDiffById = new Map();
    this._goalAllFinishedAtMs = null;
    this._goalCameraRawProgress = null;
    this._appendLog('[ゴール前] 最終直線の攻防、ゴール到達順を表示します');

    const step = (ts) => {
      const dt = Math.max(0.001, Math.min(0.12, (ts - lastTs) / 1000));
      lastTs = ts;
      const elapsed = ts - startedAt;
      const rawT = elapsed / durationMs;
      const t = Math.max(0, Math.min(1, rawT));

      simHorses.sort((a, b) => b.x - a.x);
      simHorses.forEach(horse => {
        if (horse.goalFinished) return;
        const result = resultsById.get(horse.id) ?? horse;
        const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0.5;
        const fastWeight = fastWeightById.get(horse.id) ?? 0.5;
        const last3fWeight = Number.isFinite(result.last3f)
          ? (maxLast3f - result.last3f) / last3fSpan
          : 0.5;
        const styleBoost = horse.style === '追込' ? 0.16
          : horse.style === '差し' ? 0.13
            : horse.style === '先行' ? 0.04
              : 0;
        const styleTop = horse.style === '追込' ? 1.12
          : horse.style === '差し' ? 1.08
            : horse.style === '先行' ? 1.02
              : 0.98;
        const battleFatigue = Math.min(0.38, (horse.battleFatigue ?? 0) * 0.035);

        const laneChoice = this._chooseGoalLane(simHorses, horse, t);
        const laneImprovement = laneChoice.score - laneChoice.currentScore;
        const frontGapNow = this._goalFrontGap(simHorses, horse, horse.y);
        const shouldSwitch = laneChoice.lane !== clampLane(horse.y) && (
          laneImprovement > 2.2 || frontGapNow < GOAL_BLOCK_X_GAP * 1.8
        );
        if (shouldSwitch) {
          horse.targetLane = laneChoice.lane;
        } else if (Math.abs((horse.targetLane ?? horse.y) - horse.y) < 0.08) {
          horse.targetLane = horse.y;
        }
        const laneDelta = horse.targetLane - horse.y;
        let laneShift = 0;
        if (Math.abs(laneDelta) > 0.01) {
          const laneStep = Math.sign(laneDelta) * Math.min(Math.abs(laneDelta), GOAL_LANE_CHANGE_PER_SEC * dt);
          laneShift = Math.abs(laneStep);
          horse.y = clampLane(horse.y + laneStep);
        }
        if (laneShift > 0) {
          const laneDrain = laneShift * STAMINA_LANE_CHANGE_COST * 0.70;
          horse.goalLaneCost += laneDrain;
          horse.stamina = Math.max(0, horse.stamina - laneDrain);
        }

        const frontGapAfterLane = this._goalFrontGap(simHorses, horse, horse.y);
        const trafficPenalty = frontGapAfterLane < GOAL_BLOCK_X_GAP
          ? Math.max(0.55, frontGapAfterLane / GOAL_BLOCK_X_GAP)
          : 1.0;
        const lateBoost = 0.86 + t * 0.30;
        const staminaBoost = 0.56 + staminaRatio * 0.54;
        const surge = 0.72 + last3fWeight * 0.30 + fastWeight * 0.18 + styleBoost;
        const closingKick = 1 + Math.pow(t, 1.75) * (
          (horse.style === '追込' ? 0.16 : 0) +
          (horse.style === '差し' ? 0.11 : 0) +
          last3fWeight * 0.09
        );
        const fatiguePenalty = Math.max(0.52, 1 - battleFatigue - (1 - staminaRatio) * 0.32);
        const rescueBoost = elapsed >= durationMs * 1.20
          ? 1 + Math.min(0.45, ((elapsed / durationMs) - 1.20) * 0.70)
          : 1;
        const targetMps = GOAL_BASE_MPS * lateBoost * staminaBoost * surge * styleTop * closingKick * trafficPenalty * fatiguePenalty * rescueBoost;
        const accelBase = 2.3 + last3fWeight * 1.9 + (horse.style === '追込' || horse.style === '差し' ? 1.1 : 0.2);
        const accel = Math.max(0.5, accelBase * (0.62 + staminaRatio * 0.72));
        const mpsDiff = targetMps - horse.goalCurrentMps;
        const deltaV = Math.sign(mpsDiff) * Math.min(Math.abs(mpsDiff), accel * dt);
        const minMps = GOAL_BASE_MPS * GOAL_MIN_SPEED_RATIO;
        const maxMps = GOAL_BASE_MPS * GOAL_MAX_SPEED_RATIO;
        horse.goalCurrentMps = Math.max(minMps, Math.min(maxMps, horse.goalCurrentMps + deltaV));
        if (elapsed >= durationMs * 1.45) {
          horse.goalCurrentMps = Math.max(horse.goalCurrentMps, GOAL_BASE_MPS * 1.18);
        }

        const accelDrain = Math.max(0, deltaV) * (1.2 + (horse.style === '追込' || horse.style === '差し' ? 0.45 : 0.15));
        const speedDrain = horse.goalCurrentMps * (0.010 + (horse.style === '逃げ' ? 0.003 : 0));
        const trafficDrain = (1 - trafficPenalty) * 0.85;
        const goalDrain = (accelDrain + speedDrain + trafficDrain) * dt * GOAL_STAMINA_DRAIN_MULT;
        horse.stamina = Math.max(0, horse.stamina - goalDrain);

        const deltaMeters = horse.goalCurrentMps * dt;
        const progressedMeters = Math.max(
          GOAL_BASE_MPS * 0.28 * dt,
          elapsed >= durationMs * 1.55 ? deltaMeters * 1.12 : deltaMeters,
        );
        horse.goalMeters = Math.min(GOAL_DISTANCE_METERS + GOAL_FURLONG_METERS * 0.30, horse.goalMeters + progressedMeters);
        horse.x += progressedMeters * GOAL_X_PER_METER;
      });

      const goalRenderProgressById = this._buildGoalRenderProgressMap(
        simHorses,
        GOAL_DISTANCE_METERS,
        0.58,
        t,
      );
      const goalLineY = this._getScrollingGoalLineY(rawT);
      if (goalLineY != null) {
        simHorses.forEach(horse => {
          if (horse.goalFinished) return;
          const noseY = this._estimateGoalNoseY(
            horse,
            GOAL_DISTANCE_METERS,
            0.58,
            goalRenderProgressById,
          );
          const diff = noseY - goalLineY;
          const prevDiff = this._goalLineDiffById.get(horse.id);
          this._goalLineDiffById.set(horse.id, diff);
          const crossedLine = (prevDiff == null && diff <= 0) || (prevDiff != null && prevDiff > 0 && diff <= 0);
          const reachedDistance = horse.goalMeters >= GOAL_DISTANCE_METERS;
          if (crossedLine || reachedDistance) {
            this._markHorseGoalFinished(horse);
          }
        });
      }

      this.renderer.draw(simHorses, phase, 1, {
        furlong: { t },
        goalLine: rawT,
        goalRun: {
          distanceMeters: GOAL_DISTANCE_METERS,
          progressSpan: 0.58,
          progressById: goalRenderProgressById,
        },
      });
      this.lastRenderedHorses = simHorses.map(h => ({ ...h }));
      updateEntryStaminaBars(simHorses);

      const allFinished = simHorses.every(h => h.goalFinished);
      const hardLimitReached = elapsed >= durationMs * 2.5;
      if (hardLimitReached && !allFinished) {
        simHorses.forEach(h => {
          if (h.goalMeters >= GOAL_DISTANCE_METERS) return;
          const remain = GOAL_DISTANCE_METERS - h.goalMeters;
          h.goalMeters = GOAL_DISTANCE_METERS + GOAL_FURLONG_METERS * 0.08;
          h.x += remain * GOAL_X_PER_METER;
          this._markHorseGoalFinished(h);
        });
        this.renderer.draw(simHorses, phase, 1, {
          furlong: { t: 1 },
          goalLine: rawT,
          goalRun: {
            distanceMeters: GOAL_DISTANCE_METERS,
            progressSpan: 0.58,
            progressById: goalRenderProgressById,
          },
        });
        this.lastRenderedHorses = simHorses.map(h => ({ ...h }));
        updateEntryStaminaBars(simHorses);
      }
      if (simHorses.every(h => h.goalFinished) && this._goalAllFinishedAtMs == null) {
        this._goalAllFinishedAtMs = elapsed;
      }
      const canFinish =
        this._goalAllFinishedAtMs != null &&
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

  _goalFrontGap(horses, horse, lane) {
    const front = horses
      .filter(h =>
        h.id !== horse.id &&
        h.x > horse.x &&
        Math.abs(h.y - lane) < GOAL_NEAR_LANE_GAP
      )
      .sort((a, b) => a.x - b.x)[0];
    if (!front) return 999;
    return front.x - horse.x;
  }

  _goalLaneDensity(horses, horse, lane) {
    return horses.filter(h =>
      h.id !== horse.id &&
      Math.abs(h.y - lane) < 0.95 &&
      Math.abs(h.x - horse.x) < 22
    ).length;
  }

  _getScrollingGoalLineY(rawT) {
    const goalProgress = (rawT - 2 / 3) * 3;
    if (goalProgress < 0) return null;
    const yTop = -this.renderer.H * 0.08;
    const yBottom = this.renderer.H * 1.08;
    return yTop + (yBottom - yTop) * goalProgress;
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
      return Math.max(0.05, Math.min(1.14, forced));
    }
    const advanceRatio = Math.max(0, Math.min(1.25, (horse.goalMeters ?? 0) / Math.max(1, distanceMeters)));
    const startProgress = Number.isFinite(horse.goalStartProgress)
      ? horse.goalStartProgress
      : 0.20;
    const progress = startProgress + advanceRatio * progressSpan;
    return Math.max(0.05, Math.min(1.14, progress));
  }

  _buildGoalRenderProgressMap(horses, distanceMeters, progressSpan, t = 0) {
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
    const dynamicScale =
      GOAL_ANCHOR_FOLLOW_SCALE + GOAL_ANCHOR_DYNAMIC_BOOST * (1 - tClamped);

    const anchoredById = new Map();
    horses.forEach(horse => {
      const raw = rawById.get(horse.id) ?? GOAL_LEADER_ANCHOR_PROGRESS;
      const anchored =
        GOAL_LEADER_ANCHOR_PROGRESS + (raw - this._goalCameraRawProgress) * dynamicScale;
      anchoredById.set(horse.id, Math.max(0.05, Math.min(GOAL_LEADER_ANCHOR_PROGRESS, anchored)));
    });
    return anchoredById;
  }

  _markHorseGoalFinished(horse) {
    if (horse.goalFinished) return;
    horse.goalFinished = true;
    if (!this._goalRankLogged.has(horse.id)) {
      this._goalRankLogged.add(horse.id);
      this._goalRankOrder.push(horse.id);
      if (!this._goalPlacingHeaderLogged) {
        this._goalPlacingHeaderLogged = true;
        this._appendLog('＝＝＝＝＝＝＝＝[着順]＝＝＝＝＝＝＝＝');
      }
      const placing = this._goalRankOrder.length;
      this._appendLog(`${placing}着 ${horse.name}`);
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
      this.btnAdvance.disabled = true;
      this._playGoalApproach(() => onFinish());
      return;
    }
    this._renderPhase(this.currentIdx);
  }
}

// =====================
//  エントリーポイント
// =====================
Promise.all([
  fetch('./src/data/sample.json').then(res => res.json()),
  fetch('./src/data/courses.json').then(res => res.json()),
])
  .then(([raceData, courseCatalog]) => {
    const courseDef = resolveCourseDef(raceData, courseCatalog);
    const runtimeRaceData = { ...raceData, courseDef };
    const phases        = buildPhases(runtimeRaceData.race_info.distance, courseDef);
    const track         = raceData.race_info.track;
    const condition     = raceData.race_info.condition;
    const renderer      = new Renderer('field-canvas', phases.length, track, condition);
    const initialHorses = calcAllParams(runtimeRaceData);
    const horseMetaByName = new Map();

    // 騎手名をhorseオブジェクトに付与
    runtimeRaceData.entries.forEach((entry, idx) => {
      if (initialHorses[idx]) {
        initialHorses[idx].jockeyName = entry.jockey.name;
        horseMetaByName.set(initialHorses[idx].name, {
          gate: initialHorses[idx].gate,
          waku: initialHorses[idx].waku,
        });
      }
    });

    // 出馬表初期描画
    renderEntryList(initialHorses);
    updateEntryStaminaBars(initialHorses);

    // 初期盤面
    renderer.resetHorseRenderState();
    renderer.draw(initialHorses, phases[0], 0);

    let controller = null;
    let simResults = null;
    let simLogs    = null;

    const btnRun   = document.getElementById('btn-run');
    const btnReset = document.getElementById('btn-reset');
    const reproducibleToggle = document.getElementById('toggle-reproducible');
    const raceInfoEl = document.getElementById('race-info');
    let lastSeed = runtimeRaceData.race_id;

    const currentOptions = () => {
      const reproducible = Boolean(reproducibleToggle?.checked);
      if (reproducible) {
        lastSeed = runtimeRaceData.race_id;
      } else {
        lastSeed = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
      }
      return { reproducible, seed: lastSeed };
    };

    const refreshRaceInfo = (options) => {
      raceInfoEl.innerHTML = formatRaceInfo(runtimeRaceData, courseDef, options);
    };

    refreshRaceInfo({ reproducible: true, seed: runtimeRaceData.race_id });
    reproducibleToggle?.addEventListener('change', () => {
      const opts = reproducibleToggle.checked
        ? { reproducible: true, seed: runtimeRaceData.race_id }
        : { reproducible: false, seed: 'ランダム' };
      raceInfoEl.innerHTML = formatRaceInfo(runtimeRaceData, courseDef, opts);
    });

    // レース開始／次フェーズ進行（単一ボタン）
    btnRun.addEventListener('click', () => {
      if (!controller) {
        btnReset.disabled = false;
        document.getElementById('log-panel').innerHTML = '';
        btnRun.textContent = '▶▶ 次のフェーズ';

        const simOptions = currentOptions();
        refreshRaceInfo(simOptions);
        const sim  = runSimulation(runtimeRaceData, simOptions, {}, {}, renderer);
        simResults = sim.results;
        simLogs    = sim.logs;

        // 騎手名をシミュレーション結果にも付与
        runtimeRaceData.entries.forEach((entry, idx) => {
          if (simResults[idx]) {
            // idで対応する結果を探す
          }
        });
        simResults.forEach(horse => {
          const entry = runtimeRaceData.entries.find((_, i) => i === horse.id);
          if (entry) horse.jockeyName = entry.jockey.name;
        });

        controller = new PhaseController(
          sim.snapshots,
          phases,
          renderer,
          initialHorses,
          horseMetaByName,
          sim.results,
        );
        controller.start();
        return;
      }

      controller.next(() => {
        setTimeout(() => {
          btnRun.disabled    = true;
          btnReset.disabled  = false;
          btnRun.textContent = '✅ レース終了';
          controller = null;
        }, 300);
      });
    });

    // リセット
    btnReset.addEventListener('click', () => {
      btnRun.disabled   = false;
      btnReset.disabled = true;
      btnRun.textContent = '▶ レース開始';
      document.getElementById('phase-indicator').textContent = 'スタート';
      document.getElementById('log-panel').innerHTML =
        '<div class="log-entry" style="color:#334;">待機中...</div>';

      renderer.resetHorseRenderState();
      renderer.draw(initialHorses, phases[0], 0);
      updateEntryStaminaBars(initialHorses);
      controller = null;
    });
  })
  .catch(err => {
    console.error('JSONの読み込みに失敗しました:', err);
  });
