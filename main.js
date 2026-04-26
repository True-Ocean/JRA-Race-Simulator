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

// =====================
//  シミュレーション（全フェーズ一括計算）
// =====================
function runSimulation(raceData, options = {}, userTweaks = {}, marks = {}) {
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

  for (const phase of phases) {
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
      const log = `[Battle] ${result.winner.name} vs ${result.loser.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
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
            const log = `[Irregular:好発] ${horse.name} がスタートダッシュを決める（+${gainPct}%）`;
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

      // 前方間隔チェック（前が塞がれていて仕掛ける場合はバトル）
      const forwardCheck = resolveForwardMovement(
        rng,
        horse,
        adjustedAdvance,
        horses,
        phase,
        phaseEventLogs,
        globalLogs,
        engagedHorseIds,
      );
      horse.x += forwardCheck.advance;

      applyCornerLoss(phase, horse);

      const cons    = calcStaminaCons(phase, horse, trackMod);
      horse.stamina = Math.max(0, horse.stamina - cons);

      horse.battleLosses  = 0;
      horse.battlePenalty = 1.0;

      // レースログはバトル関連のみを表示するため、通常の進行ログは出力しない
    }

    // ③ 全馬の最終位置を解消して重なりを防ぐ（非接触保証）
    resolveHorseOverlaps(horses, {
      minXGap: MIN_FORWARD_GAP,
      minYGap: COLLISION_MIN_Y_GAP,
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
  if (logLine.startsWith('[Irregular:出遅れ]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[Irregular:好発]')) return 'log-entry irregular irregular-start';
  if (logLine.startsWith('[Irregular:つまづき]')) return 'log-entry irregular irregular-stumble';
  if (!logLine.startsWith('[Battle')) return 'log-entry';
  if (logLine.startsWith('[Battle:先頭争い]') || logLine.startsWith('[Battle:先頭集団争い]')) return 'log-entry battle battle-lead';
  if (logLine.startsWith('[Battle:コーナーポジション]')) return 'log-entry battle battle-corner';
  if (logLine.startsWith('[Battle:直線叩き合い]')) return 'log-entry battle battle-final';
  if (logLine.startsWith('[Battle:進路]')) return 'log-entry battle battle-lane';
  if (logLine.startsWith('[Battle:前詰まり]') || logLine.startsWith('[Battle:同レーン進路競合]')) return 'log-entry battle battle-block';
  return 'log-entry battle battle-default';
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

function resolveLaneMovement(rng, horse, desiredY, allHorses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
  const laneBlocker = allHorses.find(h =>
    h.id !== horse.id &&
    Math.abs(h.x - horse.x) < LATERAL_BLOCK_X_GAP &&
    Math.abs(h.y - desiredY) < LATERAL_BLOCK_LANE_GAP
  );

  if (!laneBlocker) {
    return { nextY: clampLane(desiredY) };
  }

  const wantsLaneChange = Math.abs(desiredY - horse.y) > 0.18;
  if (!wantsLaneChange) {
    return { nextY: clampLane(horse.y) };
  }

  // 進路変更を強行したいときは既存バトル判定を利用
  if (!engagedHorseIds.has(horse.id) && !engagedHorseIds.has(laneBlocker.id) &&
      shouldBattle(rng, allHorses, horse, laneBlocker)) {
    const result = resolveBattle(rng, horse, laneBlocker, phase);
    const log = `[Battle:進路] ${horse.name} が ${laneBlocker.name} に進路争い → 勝者: ${result.winner.name}`;
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
      const log = `[Irregular:出遅れ] ${horse.name} がスタートで遅れる（-${lossPct}%）`;
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
      const log = `[Irregular:つまづき] ${horse.name} がつまづく（-${lossPct}%）`;
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

function resolveForwardMovement(rng, horse, desiredAdvance, allHorses, phase, phaseEventLogs, globalLogs, engagedHorseIds) {
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
  const maxAdvanceWithoutContact = Math.max(0, currentGap - MIN_FORWARD_GAP);
  if (desiredAdvance <= maxAdvanceWithoutContact) {
    return { advance: desiredAdvance };
  }

  const wantsOvertake = nextX > front.x - MIN_FORWARD_GAP;
  if (wantsOvertake &&
      !engagedHorseIds.has(horse.id) && !engagedHorseIds.has(front.id) &&
      shouldBattle(rng, allHorses, horse, front)) {
    const result = resolveBattle(rng, horse, front, phase);
    const laneGap = Math.abs(front.y - horse.y).toFixed(2);
    const frontGap = Math.max(0, front.x - horse.x).toFixed(1);
    const log = `[Battle:同レーン進路競合] ${horse.name} が ${front.name} を交わしに行く (前方差:${frontGap}, レーン差:${laneGap}) → 勝者: ${result.winner.name}`;
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
  const log = `[Battle:先頭集団争い] ${a.name} vs ${b.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
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
    const log = `[Battle:コーナーポジション] ${a.name} vs ${blocker.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
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
      const log = `[Battle:直線叩き合い] ${a.name} vs ${b.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
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
  loser.stamina -= CONFIG.BATTLE_STAMINA_COST;
  if (loser.stamina < 0) loser.stamina = 0;
  return {
    winner,
    loser,
    eA: Math.round(eA * 10) / 10,
    eB: Math.round(eB * 10) / 10,
  };
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
            <div class="param-bar-bg"><div class="param-bar stamina-remain-bar" style="width:${staminaRemainPct}%"></div></div>
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

function updateEntryStaminaBars(horses) {
  horses.forEach(horse => {
    const rowEl = document.querySelector(`[data-horse-id="${horse.id}"]`);
    if (!rowEl) return;
    const pct = getStaminaRemainPct(horse);
    const barEl = rowEl.querySelector('.stamina-remain-bar');
    const valEl = rowEl.querySelector('.stamina-remain-val');
    if (barEl) barEl.style.width = `${pct}%`;
    if (valEl) valEl.textContent = `${pct}`;
  });
}

function renderPhaseRanking(horses) {
  const rankingEl = document.getElementById('phase-ranking');
  if (!rankingEl) return;
  rankingEl.innerHTML = '';

  const order = [...horses].sort((a, b) => b.x - a.x);
  order.forEach((horse, i) => {
    const rank = i + 1;
    const waku = JRA_WAKU_COLORS[horse.waku] ?? { bg: '#888', text: '#fff' };
    const row = document.createElement('div');
    row.className = `phase-rank-row${rank <= 3 ? ` rank-${rank}` : ''}`;
    row.innerHTML = `
      <div class="phase-rank-num">${rank}</div>
      <div class="phase-rank-gate" style="background:${waku.bg};color:${waku.text};">${horse.gate ?? ''}</div>
      <div class="phase-rank-name">${horse.name}</div>
      <div class="phase-rank-meta">ST ${getStaminaRemainPct(horse)}%</div>
    `;
    rankingEl.appendChild(row);
  });
}

// =====================
//  フェーズ手動進行コントローラー（ステップバイステップ）
// =====================
class PhaseController {
  constructor(snapshots, phases, renderer, initialHorses = []) {
    this.snapshots   = snapshots;
    this.phases      = phases;
    this.renderer    = renderer;
    this.initialHorses = initialHorses.map(h => ({ ...h }));
    this.currentIdx  = 0;
    this.lastRenderedHorses = null;
    this._logQueue   = [];
    this._logTimer   = null;

    this.btnNext   = document.getElementById('btn-next');
    this.btnRun    = document.getElementById('btn-run');
    this.btnReset  = document.getElementById('btn-reset');
    this.logPanel  = document.getElementById('log-panel');
    this.indicator = document.getElementById('phase-indicator');
    this.isAnimating = false;
    this.frameCount  = 24; // 1フェーズを細かく刻む
    this.frameMs     = 70; // 1コマの表示時間
  }

  start() {
    this.currentIdx = 0;
    this._renderPhase(0);
    this.btnNext.disabled = false;
    this.btnNext.textContent = '▶▶ 次のフェーズ';
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
    renderPhaseRanking(fromForAnimation ?? snap.horses);

    // 最終フェーズの次は「ゴール判定」
    if (idx === this.snapshots.length - 1) {
      this.btnNext.textContent = '🏁 ゴール判定';
    }
  }

  // 馬カードをアニメーションで表示（段階的に進行度を上げる）
  _animateHorses(fromHorses, toHorses, phase, isFirstPhase = false) {
    this.isAnimating      = true;
    this.btnNext.disabled = true;

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
        const moveProgress = Math.max(0, Math.min(1, (frame - holdFrames) / moveFrames));
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
        renderPhaseRanking(rendered);
        if (frame >= totalFrames) {
          this.lastRenderedHorses = toHorses.map(h => ({ ...h }));
          this.isAnimating = false;
          this.btnNext.disabled = false;
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
      renderPhaseRanking(tweened);
      if (progress >= 1) {
        this.lastRenderedHorses = toHorses.map(h => ({ ...h }));
        this.isAnimating = false;
        this.btnNext.disabled = false;
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
    const div  = document.createElement('div');
    div.className = getBattleLogClass(line);
    div.textContent = line;
    this.logPanel.appendChild(div);
    this.logPanel.scrollTop = this.logPanel.scrollHeight;
    this._logTimer = setTimeout(() => this._flushNextLog(), 80);
  }

  next(onFinish) {
    if (this.isAnimating) return;
    this.currentIdx++;
    if (this.currentIdx >= this.snapshots.length) {
      this.btnNext.disabled = true;
      onFinish();
      return;
    }
    this._renderPhase(this.currentIdx);
  }
}

// =====================
//  ゴール時の順位反映（右上パネル）
// =====================
function showResults(results) {
  renderPhaseRanking(results);
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

    // 騎手名をhorseオブジェクトに付与
    runtimeRaceData.entries.forEach((entry, idx) => {
      if (initialHorses[idx]) {
        initialHorses[idx].jockeyName = entry.jockey.name;
      }
    });

    // 出馬表初期描画
    renderEntryList(initialHorses);
    updateEntryStaminaBars(initialHorses);
    renderPhaseRanking(initialHorses);

    // 初期盤面
    renderer.draw(initialHorses, phases[0], 0);

    let controller = null;
    let simResults = null;
    let simLogs    = null;

    const btnRun   = document.getElementById('btn-run');
    const btnNext  = document.getElementById('btn-next');
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

    // レース開始
    btnRun.addEventListener('click', () => {
      btnRun.disabled   = true;
      btnNext.disabled  = false;
      btnReset.disabled = false;
      document.getElementById('phase-ranking').innerHTML = '';
      document.getElementById('log-panel').innerHTML = '';
      btnNext.textContent = '▶▶ 次のフェーズ';

      const simOptions = currentOptions();
      refreshRaceInfo(simOptions);
      const sim  = runSimulation(runtimeRaceData, simOptions);
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

      controller = new PhaseController(sim.snapshots, phases, renderer, initialHorses);
      controller.start();
    });

    // 次のフェーズ／ゴール判定
    btnNext.addEventListener('click', () => {
      if (!controller) return;
      controller.next(() => {
        setTimeout(() => {
          showResults(simResults);
          btnNext.disabled    = true;
          btnReset.disabled   = false;
          btnNext.textContent = '▶▶ 次のフェーズ';
        }, 300);
      });
    });

    // リセット
    btnReset.addEventListener('click', () => {
      btnRun.disabled   = false;
      btnNext.disabled  = true;
      btnReset.disabled = true;
      btnNext.textContent = '▶▶ 次のフェーズ';
      document.getElementById('phase-indicator').textContent = 'スタート';
      document.getElementById('phase-ranking').innerHTML =
        '<div class="log-entry" style="color:#334;">待機中...</div>';
      document.getElementById('log-panel').innerHTML =
        '<div class="log-entry" style="color:#334;">待機中...</div>';

      renderer.draw(initialHorses, phases[0], 0);
      updateEntryStaminaBars(initialHorses);
      renderPhaseRanking(initialHorses);
      controller = null;
    });
  })
  .catch(err => {
    console.error('JSONの読み込みに失敗しました:', err);
  });
