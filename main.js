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
// 斜め後ろ判定の帯: isLaneInShiftPath 全体幅だと「同レーンの真後ろ」まで巻き込むため狭める
const DIAGONAL_REAR_INNER_BAND_OUTER_EPS = 0.16;
const DIAGONAL_REAR_INNER_BAND_INNER_MARGIN = 0.48;
const LANE_WIDTH = CONFIG.LANE_COUNT;
const INNER_HALF_LANE_MAX = Math.max(1, Math.floor(LANE_WIDTH * 0.5));
const LEAD_BATTLE_PHASE_MAX = 0.35;
const EARLY_LEAD_RATIO_MAX = 0.35;
const FINAL_DUEL_PHASE_MIN = 0.80;
const FORMATION_LOCK_PHASE = 0.40;
const PRE_CORNER_PACK_PHASE_MAX = 0.28;
const COLLISION_MIN_Y_GAP = 0.9;
const COLLISION_ITERATIONS = 3;
const COLLISION_ITERATIONS_EARLY = 5;
const COLLISION_EPS = 0.001;
const START_DELAY_BASE_RATE = 0.022;
const STUMBLE_BASE_RATE = 0.008;
const STUMBLE_PHASE_MAX = 0.55;
const GOAL_FURLONG_METERS = 200;
const GOAL_ANIM_FURLONGS = 2;
// 最終2ハロン演出の体感的な尺（秒/ハロン、UI マーカーは同じ 0–1 タイムライン）
const GOAL_SECONDS_PER_FURLONG = 9;
const GOAL_TIME_SCALE = 1.0;
const GOAL_DISTANCE_METERS = GOAL_FURLONG_METERS * GOAL_ANIM_FURLONGS;
const GOAL_BASE_MPS = GOAL_FURLONG_METERS / GOAL_SECONDS_PER_FURLONG;
const GOAL_X_PER_METER = 0.28;
const GOAL_LANE_CHANGE_PER_SEC = 4.2;
const GOAL_BLOCK_X_GAP = 10;
const GOAL_NEAR_LANE_GAP_BASE = 0.95;
const GOAL_NEAR_LANE_GAP_MAX = 1.26;
const GOAL_LANE_CHANGE_COOLDOWN_MS = 520;
const FINAL_LANE_CHANGE_COOLDOWN_PHASES = 2;
const FINAL_FRONT_BLOCK_EXTRA_GAP = 6;
const FINAL_STRAIGHT_RATIO = 0.80;
const LATERAL_SHIFT_SOFT_CAP = 0.42;
const LATERAL_SHIFT_HARD_CAP = 0.26;
// 第3コーナーまでは積極的な内寄せを許容するため横移動上限を緩める
const LATERAL_SHIFT_THROUGH_C3_CAP = 0.75;
const START_LATERAL_SHIFT_CAP = 2.40;
const GOAL_MIN_SPEED_RATIO = 0.58;
const GOAL_MAX_SPEED_RATIO = 1.95;
const GOAL_POST_SCROLL_MS = 1800;
const GOAL_POST_CLEAR_METERS = GOAL_FURLONG_METERS * 1.25;
// ゴール線到達前は先頭が画面上へ抜けすぎないように抑える
const GOAL_PROGRESS_MAX_PRE_LINE = 1.00;
// ゴール線到達後は画面上へしっかり抜けるまで許容する
const GOAL_PROGRESS_MAX_POST_LINE = 1.78;
// ゴールシーン開始時、先頭馬は画面下辺から出現させる
const GOAL_ENTRY_LEADER_START_PROGRESS = 0.0;
// 画面外を含むゴール描画 progress 下限
const GOAL_PROGRESS_MIN = -1.10;
// 切替時の短いカット演出（フェード）時間
const GOAL_SCENE_TRANSITION_MS = 800;
const GOAL_SCENE_TRANSITION_MAX_ALPHA = 0.72;
const GOAL_PROGRESS_TARGET_AT_FINISH = 1.06;
const GOAL_LEADER_ANCHOR_PROGRESS = 0.88;
// 仮想リーダーが上に抜けた時にYで見せる（旧: 0.88 で上方向が潰れていた）
const GOAL_ANCHOR_MAX_PROGRESS = 1.08;
const GOAL_PROGRESS_SPAN = 0.64;
// t < 2/3（残2〜1ﾊﾛﾝ相当）の間は相対差を大きく見せる
const GOAL_EARLY_PHASE_T = 2 / 3;
const GOAL_SPREAD_EARLY_MULT = 1.52;
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
const INNER_CUTIN_BATTLE_COOLDOWN_PHASES = 2;
const INNER_CUTIN_REMATCH_COOLDOWN_PHASES = 4;
const INNER_CUTIN_MIN_INWARD_DELTA = 0.08;
const INNER_CUTIN_WINNER_STAMINA_MULT = 1.15;
const INNER_CUTIN_LOSER_STAMINA_MULT = 1.35;
const THROUGH_C3_LANE_CHANGE_TRIGGER_DELTA = 0.08;
const INNER_POCKET_FRONT_GAP_RATIO = 0.55;
const INNER_POCKET_REAR_GAP_RATIO = 0.35;
const PRE_CORNER_INNER_COMPRESS_ITERS = 3;
const PRE_CORNER_FORCE_INNER_STEP = 0.55;
const PRE_CORNER_MIN_Y_GAP_MULT = 0.88;
const HOME_OUTER_REROUTE_STEPS = 3;
const COLLISION_FRONT_BUFFER_X = 10;
const COLLISION_REAR_BUFFER_X = 14;
const INNER_CUTIN_BUFFER_MULT = 1.25;
const PACK_DENSITY_PENALTY_QUAD = 1.1;
const STAMINA_CORNER_OUTER_PER_LANE = 0.30;
const GOAL_STAMINA_DRAIN_MULT = 1.35;
const GOAL_AI = {
  horizonSec: 1.0,
  predictStepSec: 0.10,
  switchCommitSec: 0.40,
  switchThresholdBase: 1.55,
  aggrBaseByStyle: { '逃げ': 0.36, '先行': 0.47, '差し': 0.66, '追込': 0.78 },
  aggrStaminaGain: 0.46,
  aggrLast3fGain: 0.58,
  laneMoveCostPerLane: 1.25,
  blockRiskWeight: 6.4,
  densityWeight: 4.8,
  projectedGapWeight: 1.25,
  burstAccelBonus: 1.10,
  burstWindowMetersToGoMin: 180,
  burstWindowMetersToGoMax: 350,
  burstCooldownSec: 0.80,
  burstDurationSec: 0.55,
  trafficPenaltyFloor: 0.72,
  goalDrainSprintCap: 1.45,
  visualLateStartT: 0.62,
  visualLateBoost: 0.34,
};

/** 差し/追込: 末脚が速くスタミナに余力があるほど外への先回り意欲が高い（0〜1） */
function getCloserOuterSpreadIntent(horse, last3fMin, last3fMax, last3fSpan) {
  if (horse.style !== '差し' && horse.style !== '追込') return 0;
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  const span = Math.max(0.001, last3fSpan ?? (last3fMax - last3fMin));
  const last3fWeight = Number.isFinite(horse.last3f)
    ? (last3fMax - horse.last3f) / span
    : 0.5;
  const w = Math.max(0, Math.min(1, last3fWeight));
  return Math.max(0, Math.min(1, w * (0.35 + staminaRatio * 0.85)));
}

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
  const last3fValues = horses.map(h => h.last3f).filter(Number.isFinite);
  const last3fMin = last3fValues.length ? Math.min(...last3fValues) : 33;
  const last3fMax = last3fValues.length ? Math.max(...last3fValues) : last3fMin + 1;
  const last3fSpan = Math.max(0.001, last3fMax - last3fMin);
  const last3fNorm = { min: last3fMin, max: last3fMax, span: last3fSpan };

  const globalLogs = [];
  const snapshots  = [];
  const earlyLeadCounts = new Map();
  const earlyLeaderTimeline = [];
  let earlyLeaderSwitches = 0;
  let totalEarlyPhases = 0;
  let prevEarlyLeaderId = null;
  horses.forEach(horse => {
    horse.lastAdvance = 0;
    horse.laneChangeCooldownPhases = 0;
    horse.innerCutInCooldownPhases = 0;
    horse.lastInnerCutInPhase = -999;
    horse.lastInnerCutInOpponentId = null;
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
      ? renderer.getCollisionMetrics(xSpan, phase)
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
          const earlyRunnerBonus = horse.style === '逃げ' ? 0.24
            : horse.style === '先行' ? 0.10
            : 0;
          const baseMult = 0.72
            + ave3fScore * 0.68   // スタートはave3fを強く反映
            + launchSkill * 0.22
            + earlyRunnerBonus;
          const randomMult = 0.88 + rng() * 0.28; // 中程度のばらつき（0.88〜1.16）
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
      const isEarlyInnerBurst = isStartToHomePhase(phase);
      const isThroughThirdCorner = isThroughThirdCornerPhase(phase);
      const isAfterFourthCorner = isAfterFourthCornerPhase(phase);
      const isLateStraight = phase.isFinal || phase.ratio >= FINAL_STRAIGHT_RATIO;
      const currentFrontGap = getFrontGap(horse, clampLane(horse.y), horses);
      const frontBlocked = currentFrontGap < (collisionMetrics.minXGap + FINAL_FRONT_BLOCK_EXTRA_GAP);
      if ((horse.laneChangeCooldownPhases ?? 0) > 0) {
        horse.laneChangeCooldownPhases -= 1;
      }
      if ((horse.innerCutInCooldownPhases ?? 0) > 0) {
        horse.innerCutInCooldownPhases -= 1;
      }
      const isPreCornerPack = isBeforeFirstCornerPhase(phase);
      horse.targetLane = isStartPhase
        ? calcStartPhaseTargetLane(horse, horses, collisionMetrics, phase)
        : isPreCornerPack
          ? calcPreCornerPackTargetLane(horse, phase, horses, collisionMetrics)
          : calcTargetLane(horse, phase, horses, collisionMetrics);
      if (isThroughThirdCorner) {
        horse.targetLane = calcEarlyInnerPriorityLane(horse, horse.targetLane, phase, horses, collisionMetrics);
      }
      if (isThroughThirdCorner) {
        horse.targetLane = Math.min(horse.targetLane, INNER_HALF_LANE_MAX);
      }
      if (isAfterFourthCorner) {
        horse.targetLane = calcPostFourthWideTargetLane(horse, horse.targetLane, phase, horses, last3fNorm);
      }
      if (isEarlyInnerBurst && horse.targetLane > horse.y) {
        horse.targetLane = horse.y;
      }
      const outerSpreadIntent = getCloserOuterSpreadIntent(horse, last3fMin, last3fMax, last3fSpan);
      const allowProactiveLateSpread = isLateStraight && !frontBlocked && outerSpreadIntent > 0.42;
      if (isLateStraight && !frontBlocked && !allowProactiveLateSpread) {
        horse.targetLane = horse.y;
      } else if ((horse.laneChangeCooldownPhases ?? 0) > 0) {
        horse.targetLane = horse.y;
      }
      const laneChangeRate = getLaneChangeRate(phase, horse, last3fNorm);
      const desiredY   = horse.y + (horse.targetLane - horse.y) * laneChangeRate;
      const prevLaneY = horse.y;
      const laneCheck  = resolveLaneMovement(
        rng,
        horse,
        desiredY,
        adjustedAdvance,
        horses,
        phase,
        { frontBlocked, isLateStraight, isStartPhase, isEarlyInnerBurst, collisionMetrics },
        phaseEventLogs,
        globalLogs,
        engagedHorseIds,
      );
      horse.y          = laneCheck.nextY;
      if (isThroughThirdCorner) {
        horse.y = Math.min(horse.y, INNER_HALF_LANE_MAX);
      }
      if (laneCheck.advanceMult != null) {
        adjustedAdvance *= laneCheck.advanceMult;
      }
      if (Number.isFinite(laneCheck.xNudge) && laneCheck.xNudge > 0) {
        horse.x += laneCheck.xNudge;
      }
      const laneShift = Math.abs(horse.y - prevLaneY);
      if (laneShift > 0.001) {
        const laneDrain = laneShift * STAMINA_LANE_CHANGE_COST;
        horse.stamina = Math.max(0, horse.stamina - laneDrain);
        horse.staminaLaneCost += laneDrain;
        if (isLateStraight && laneShift > 0.12) {
          horse.laneChangeCooldownPhases = Math.max(
            horse.laneChangeCooldownPhases ?? 0,
            FINAL_LANE_CHANGE_COOLDOWN_PHASES,
          );
        }
      }
      if (isLateStraight && laneShift > 0.04) {
        const staminaRatioLate = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
        const lateralFatigueMult =
          1 - Math.min(0.06, laneShift * 0.18 * (1.35 - staminaRatioLate * 0.5));
        adjustedAdvance *= lateralFatigueMult;
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

    if (isBeforeFirstCornerPhase(phase) && phase.index > 0) {
      compressPreCornerToInnerLanes(horses, phase, collisionMetrics);
    }

    // ③ 全馬の最終位置を解消して重なりを防ぐ（非接触保証）
    const throughC3Overlap = isThroughThirdCornerPhase(phase);
    const overlapBase = {
      minXGap: collisionMetrics.minXGap,
      minYGap: collisionMetrics.minYGap,
      iterations: throughC3Overlap ? COLLISION_ITERATIONS_EARLY : COLLISION_ITERATIONS,
      keepOrder: true,
      freezeY: throughC3Overlap ? false : phase.ratio < 0.18,
    };
    resolveHorseOverlaps(horses, { ...overlapBase, phase });
    if (isStartToHomePhase(phase) && phase.index > 0) {
      rerouteRearContactsToOuterLane(horses, collisionMetrics);
      resolveHorseOverlaps(horses, {
        ...overlapBase,
        iterations: 1,
        freezeY: false,
        phase,
      });
    }
    if (throughC3Overlap) {
      enforceInnerHalfTrack(horses);
      resolveHorseOverlaps(horses, {
        ...overlapBase,
        iterations: COLLISION_ITERATIONS_EARLY,
        phase,
      });
    }

    if (phase.ratio <= EARLY_LEAD_RATIO_MAX) {
      const leader = [...horses].sort((a, b) => b.x - a.x)[0];
      if (leader) {
        totalEarlyPhases += 1;
        earlyLeadCounts.set(leader.id, (earlyLeadCounts.get(leader.id) ?? 0) + 1);
        earlyLeaderTimeline.push(`P${phase.index + 1}:${leader.name}`);
        if (prevEarlyLeaderId !== null && prevEarlyLeaderId !== leader.id) {
          earlyLeaderSwitches += 1;
          const log = `[序盤先頭] フェーズ${phase.index + 1}で先頭交代 → ${leader.name}`;
          globalLogs.push(log);
          phaseEventLogs.push(log);
        } else if (prevEarlyLeaderId === null) {
          const log = `[序盤先頭] フェーズ${phase.index + 1}先頭 → ${leader.name}`;
          globalLogs.push(log);
          phaseEventLogs.push(log);
        }
        prevEarlyLeaderId = leader.id;
      }
    }

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

  if (snapshots.length > 0 && totalEarlyPhases > 0) {
    const lastEventLogs = snapshots[snapshots.length - 1].eventLogs;
    const leadSummary = [...earlyLeadCounts.entries()]
      .map(([id, leadCount]) => {
        const horse = horses.find(h => h.id === id);
        const name = horse?.name ?? `ID:${id}`;
        const style = horse?.style ?? '-';
        const pct = Math.round((leadCount / totalEarlyPhases) * 100);
        return { name, style, leadCount, pct };
      })
      .sort((a, b) => b.leadCount - a.leadCount);
    lastEventLogs.push('＝＝＝＝＝＝＝＝[序盤先頭サマリ]＝＝＝＝＝＝＝＝');
    for (const row of leadSummary.slice(0, 4)) {
      lastEventLogs.push(`[序盤先頭率] ${row.name}(${row.style}) ${row.leadCount}/${totalEarlyPhases} (${row.pct}%)`);
    }
    lastEventLogs.push(`[序盤先頭推移] ${earlyLeaderTimeline.join(' → ')}`);
    lastEventLogs.push(`[序盤先頭交代回数] ${earlyLeaderSwitches}回`);
  }

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

function resolveLaneMovement(
  rng,
  horse,
  desiredY,
  desiredAdvance,
  allHorses,
  phase,
  context,
  phaseEventLogs,
  globalLogs,
  engagedHorseIds,
) {
  const isLateStraight = Boolean(context?.isLateStraight);
  const frontBlocked = Boolean(context?.frontBlocked);
  const isStartPhase = Boolean(context?.isStartPhase);
  const isEarlyInnerBurst = Boolean(context?.isEarlyInnerBurst);
  const isThroughC3 = isThroughThirdCornerPhase(phase);
  const allowBurstShortCircuit = isEarlyInnerBurst && !isThroughC3;
  const collisionMetrics = context?.collisionMetrics ?? null;
  const minXGapForCollision = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
  const minYGapForCollision = collisionMetrics?.minYGap ?? COLLISION_MIN_Y_GAP;
  const baseY = clampLane(horse.y);
  const desiredDelta = desiredY - baseY;
  const absDesiredDelta = Math.abs(desiredDelta);
  const laneChangeTriggerDelta = isThroughC3 ? THROUGH_C3_LANE_CHANGE_TRIGGER_DELTA : 0.18;
  const wantsLaneChange = absDesiredDelta > laneChangeTriggerDelta;
  if (!wantsLaneChange) {
    return { nextY: baseY, advanceMult: 1 };
  }

  const predictedSpeed = Math.max(0, desiredAdvance);
  const speedRatio = horse.S_cruise > 0 ? predictedSpeed / horse.S_cruise : 1;
  const capBase = allowBurstShortCircuit
    ? START_LATERAL_SHIFT_CAP
    : isLateStraight
      ? LATERAL_SHIFT_HARD_CAP
      : isThroughC3
        ? LATERAL_SHIFT_THROUGH_C3_CAP
        : LATERAL_SHIFT_SOFT_CAP;
  const speedPenalty = Math.max(0, Math.min(0.5, (speedRatio - 0.85) * 0.55));
  const frontBlockBoost = frontBlocked ? 1.30 : 1.0;
  const maxDelta = capBase * (1 - speedPenalty) * frontBlockBoost;
  const limitedDelta = Math.sign(desiredDelta) * Math.min(absDesiredDelta, Math.max(0.10, maxDelta));
  const limitedY = clampLane(baseY + limitedDelta);

  if (isLateStraight && !frontBlocked) {
    return { nextY: baseY, advanceMult: 1 };
  }

  const skipDiagRearForInnerThroughC3 =
    isThroughThirdCornerPhase(phase) && limitedY < baseY - 0.02;
  const diagonalRearHorse =
    allowBurstShortCircuit || skipDiagRearForInnerThroughC3
      ? null
      : findDiagonalRearHorse(horse, limitedY, allHorses);
  if (diagonalRearHorse) {
    if (!engagedHorseIds.has(horse.id) && !engagedHorseIds.has(diagonalRearHorse.id) &&
        shouldBattle(rng, allHorses, horse, diagonalRearHorse)) {
      const result = resolveBattle(rng, horse, diagonalRearHorse, phase);
      applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
      const log = `[バトル:斜め後方割り込み] ${horse.name} が ${diagonalRearHorse.name} の前へ進出 → 勝者: ${result.winner.name}`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
      engagedHorseIds.add(horse.id);
      engagedHorseIds.add(diagonalRearHorse.id);
      if (result.winner.id !== horse.id) {
        return { nextY: baseY, advanceMult: 0.93 };
      }
    } else {
      return { nextY: baseY, advanceMult: 0.96 };
    }
  }

  const blockerXGap = allowBurstShortCircuit ? LATERAL_BLOCK_X_GAP * 0.62 : LATERAL_BLOCK_X_GAP;
  const blockerLaneMargin = allowBurstShortCircuit ? 0.62 : LATERAL_BLOCK_LANE_GAP;
  const laneBlocker =
    isThroughC3 && collisionMetrics
      ? allHorses.find(h => {
        if (h.id === horse.id) return false;
        const frontHorse = h.x >= horse.x ? h : horse;
        const backHorse = h.x >= horse.x ? horse : h;
        const requiredGap = getRequiredXGap(
          frontHorse,
          backHorse,
          minXGapForCollision,
          phase,
          { isInnerCutIn: limitedY < baseY - 0.02 },
        );
        return (
          Math.abs(h.x - horse.x) < requiredGap &&
          Math.abs(h.y - limitedY) < minYGapForCollision
        );
      })
      : allHorses.find(h =>
        h.id !== horse.id &&
        Math.abs(h.x - horse.x) < blockerXGap &&
        isLaneInShiftPath(h.y, baseY, limitedY, blockerLaneMargin)
      );

  if (!laneBlocker) {
    // 移動先で他馬とカード（minXGap × minYGap）が重なる場合は手前で抑制する
    const wouldOverlap = allHorses.some(h => {
      if (h.id === horse.id) return false;
      const frontHorse = h.x >= horse.x ? h : horse;
      const backHorse = h.x >= horse.x ? horse : h;
      const requiredGap = getRequiredXGap(
        frontHorse,
        backHorse,
        minXGapForCollision,
        phase,
        { isInnerCutIn: limitedY < baseY - 0.02 },
      );
      return (
        Math.abs(h.x - horse.x) < requiredGap &&
        Math.abs(h.y - limitedY) < minYGapForCollision &&
        // 元位置で既にすれ違っている馬は対象外（移動で離れる方向ならOK）
        Math.abs(h.y - limitedY) <= Math.abs(h.y - baseY) + 0.02
      );
    });
    if (wouldOverlap) {
      // 半分だけ寄せて後続フェーズに持ち越す
      const halfY = clampLane(baseY + limitedDelta * 0.5);
      const stillOverlap = allHorses.some(h => {
        if (h.id === horse.id) return false;
        const frontHorse = h.x >= horse.x ? h : horse;
        const backHorse = h.x >= horse.x ? horse : h;
        const requiredGap = getRequiredXGap(
          frontHorse,
          backHorse,
          minXGapForCollision,
          phase,
          { isInnerCutIn: halfY < baseY - 0.02 },
        );
        return (
          Math.abs(h.x - horse.x) < requiredGap &&
          Math.abs(h.y - halfY) < minYGapForCollision &&
          Math.abs(h.y - halfY) <= Math.abs(h.y - baseY) + 0.02
        );
      });
      if (stillOverlap) {
        return { nextY: baseY, advanceMult: 0.98 };
      }
      return { nextY: halfY, advanceMult: 0.98 };
    }
    return {
      nextY: limitedY,
      advanceMult: absDesiredDelta > Math.abs(limitedDelta) + 0.05 ? 0.98 : 1,
    };
  }

  if (allowBurstShortCircuit) {
    // スタート〜ホームのみ: 隊列形成を優先し、完全停止させず内へ寄せる。
    const fallbackInnerY = clampLane(baseY + (limitedY - baseY) * 0.55);
    if (fallbackInnerY < baseY - 0.05) {
      return { nextY: fallbackInnerY, advanceMult: 0.99 };
    }
  }

  const shouldTryInnerCutIn =
    isInnerCutInContestScenario(horse, laneBlocker, baseY, limitedY, desiredAdvance, minXGapForCollision);
  if (shouldTryInnerCutIn) {
    const canBattle =
      canTriggerInnerCutInBattle(horse, laneBlocker, phase) &&
      !engagedHorseIds.has(horse.id) &&
      !engagedHorseIds.has(laneBlocker.id) &&
      shouldBattle(rng, allHorses, horse, laneBlocker);
    if (canBattle) {
      const result = resolveWeightedBattle(rng, horse, laneBlocker, {
        cruise: 0.22,
        maneuv: 0.42,
        sustain: 0.20,
        stamina: 0.16,
      }, h => (h.style === '逃げ' || h.style === '先行') ? 2 : 0, {
        impactOptions: {
          loserAlreadyPenalized: true,
          winnerMult: INNER_CUTIN_WINNER_STAMINA_MULT,
          loserMult: INNER_CUTIN_LOSER_STAMINA_MULT,
        },
      });
      markInnerCutInBattlePair(horse, laneBlocker, phase);
      engagedHorseIds.add(horse.id);
      engagedHorseIds.add(laneBlocker.id);
      const log = `[バトル:内前争い] ${horse.name} が ${laneBlocker.name} の前を取りに行く → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
      if (result.winner.id === horse.id) {
        const targetFrontX = laneBlocker.x + minXGapForCollision * 0.28;
        const xNudge = Math.max(0, Math.min(
          Math.max(0, desiredAdvance) * 0.55,
          targetFrontX - horse.x,
        ));
        return { nextY: limitedY, advanceMult: 0.985, xNudge };
      }
      return { nextY: baseY, advanceMult: 0.93 };
    }
    // 連戦抑制・同フェーズ多発を避けるため、バトル不可時は強行せず並走寄りで維持
    return { nextY: baseY, advanceMult: 0.97 };
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
      return { nextY: limitedY, advanceMult: 0.97 };
    }
  }

  return { nextY: baseY, advanceMult: 0.95 };
}

/** 内へシフト時: 自分よりレーンが内側で、真後ろ〜斜め内後ろの帯にいる馬だけを危険とする（同レーン直後ろは除外） */
function isInnerShiftDiagonalRearThreat(horse, fromLane, toLane, h, maxRearGap) {
  const from = clampLane(fromLane);
  const to = clampLane(toLane);
  if (to >= from - 0.02) return false;
  if (h.id === horse.id) return false;
  const rearGap = horse.x - h.x;
  if (rearGap <= 0 || rearGap > maxRearGap) return false;
  const hy = h.y;
  if (hy >= from - DIAGONAL_REAR_INNER_BAND_OUTER_EPS) return false;
  if (hy < to - DIAGONAL_REAR_INNER_BAND_INNER_MARGIN) return false;
  return true;
}

/** 外へシフト時: 外側の斜め後ろ（対称） */
function isOuterShiftDiagonalRearThreat(horse, fromLane, toLane, h, maxRearGap) {
  const from = clampLane(fromLane);
  const to = clampLane(toLane);
  if (to <= from + 0.02) return false;
  if (h.id === horse.id) return false;
  const rearGap = horse.x - h.x;
  if (rearGap <= 0 || rearGap > maxRearGap) return false;
  const hy = h.y;
  if (hy <= from + DIAGONAL_REAR_INNER_BAND_OUTER_EPS) return false;
  if (hy > to + DIAGONAL_REAR_INNER_BAND_INNER_MARGIN) return false;
  return true;
}

function findDiagonalRearHorse(horse, desiredY, allHorses) {
  const targetLane = clampLane(desiredY);
  const fromLane = clampLane(horse.y);
  const maxGap = DIAGONAL_REAR_BLOCK_X_GAP;
  if (targetLane < fromLane - 0.02) {
    return allHorses.find(h => isInnerShiftDiagonalRearThreat(horse, fromLane, targetLane, h, maxGap));
  }
  if (targetLane > fromLane + 0.02) {
    return allHorses.find(h => isOuterShiftDiagonalRearThreat(horse, fromLane, targetLane, h, maxGap));
  }
  return null;
}

function isLaneInShiftPath(lane, fromLane, toLane, margin = 0.9) {
  const laneMin = Math.min(fromLane, toLane) - margin;
  const laneMax = Math.max(fromLane, toLane) + margin;
  return lane >= laneMin && lane <= laneMax;
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

  const requiredGap = getRequiredXGap(front, horse, minForwardGap, phase);
  const currentGap = front.x - horse.x;
  const maxAdvanceWithoutContact = Math.max(0, currentGap - requiredGap);
  if (desiredAdvance <= maxAdvanceWithoutContact) {
    return { advance: desiredAdvance };
  }

  const wantsOvertake = nextX > front.x - requiredGap;
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

  let advance = maxAdvanceWithoutContact;
  if (isThroughThirdCornerPhase(phase) && desiredAdvance > maxAdvanceWithoutContact + 0.01) {
    advance *= 0.94;
  }
  return { advance };
}

function clampLane(v) {
  return Math.max(1, Math.min(LANE_WIDTH, v));
}

function getPhaseBufferMultiplier(phase) {
  if (!phase) return 1.0;
  if (isStartToHomePhase(phase) && phase.index > 0) return 1.15;
  if (isThroughThirdCornerPhase(phase)) return 1.0;
  if (isAfterFourthCornerPhase(phase)) return 0.9;
  return 1.0;
}

function getHorseBufferX(horse, phase) {
  const mult = getPhaseBufferMultiplier(phase);
  let front = COLLISION_FRONT_BUFFER_X;
  let rear = COLLISION_REAR_BUFFER_X;
  if (horse?.style === '逃げ' || horse?.style === '先行') front += 2;
  if (horse?.style === '差し' || horse?.style === '追込') rear += 2;
  return { front: front * mult, rear: rear * mult };
}

function getRequiredXGap(frontHorse, backHorse, baseMinXGap, phase, options = {}) {
  const frontBuf = getHorseBufferX(frontHorse, phase);
  const backBuf = getHorseBufferX(backHorse, phase);
  let required = baseMinXGap + frontBuf.rear + backBuf.front;
  if (options?.isInnerCutIn) required *= INNER_CUTIN_BUFFER_MULT;
  return required;
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
        const front = dx >= 0 ? b : a;
        const back = dx >= 0 ? a : b;
        const requiredXGap = getRequiredXGap(front, back, minXGap, options.phase ?? null);
        if (adx >= requiredXGap || ady >= minYGap) continue;

        const pushX = (requiredXGap - adx) / 2;
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
function calcTargetLane(horse, phase, allHorses, collisionMetrics = null) {
  const currentLane = clampLane(horse.y);
  let preferredLane = getPreferredLaneByStyle(horse, phase);
  if (
    !isThroughThirdCornerPhase(phase) &&
    !phase.isFinal &&
    phase.ratio >= FORMATION_LOCK_PHASE &&
    phase.ratio < 0.80 &&
    horse.settledLane !== undefined
  ) {
    // 序盤で決まった隊列を道中は維持し、極端な横移動を抑える（第3コーナーまでは内寄せ優先のため無効化）
    preferredLane = horse.settledLane * 0.75 + preferredLane * 0.25;
  }
  const [laneMin, laneMax] = getPhaseLaneBand(phase);
  const clampToBand = v => Math.max(laneMin, Math.min(laneMax, clampLane(v)));

  // 第3コーナーまでは「前後の馬の隙間（slot）」を最内優先で取りに行く
  if (isThroughThirdCornerPhase(phase) && currentLane > laneMin + 0.01) {
    const slot = findInnermostOpenSlotLane(horse, allHorses, laneMin, collisionMetrics, phase);
    if (slot != null && slot < currentLane - 0.01) {
      return clampToBand(slot);
    }
  }

  const candidates = [
    preferredLane,
    preferredLane - 1,
    preferredLane + 1,
    ...(phase.isFinal || phase.ratio >= FINAL_STRAIGHT_RATIO ? [preferredLane - 2, preferredLane + 2] : []),
    currentLane,
    currentLane - 1,
    currentLane + 1,
    ...(phase.isFinal || phase.ratio >= FINAL_STRAIGHT_RATIO ? [currentLane - 2, currentLane + 2, currentLane - 3, currentLane + 3] : []),
  ]
    .map(clampToBand)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  let bestLane = clampToBand(currentLane);
  let bestScore = -Infinity;

  for (const lane of candidates) {
    const score = scoreLaneOption(horse, lane, preferredLane, phase, allHorses, currentLane, collisionMetrics);
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
    if (
      isLaneOpenForShift(horse, innerLane, allHorses, phase, collisionMetrics) &&
      isInnerLaneOpenAhead(horse, innerLane, allHorses, phase, collisionMetrics)
    ) {
      bestLane = Math.min(bestLane, innerLane);
    }
  }
  return bestLane;
}

function calcStartPhaseTargetLane(horse, allHorses, collisionMetrics = null, phase = null) {
  const currentLane = clampLane(horse.y);
  // 第3コーナーまでは脚質に依らず最内志向に統一（前後位置の差は脚質差で自然発生）
  const styleLaneFloor = 1.0;

  if (currentLane <= styleLaneFloor + 0.05) return currentLane;

  // 1) 前後の隙間（slot）を最内優先で取る
  const slot = findInnermostOpenSlotLane(horse, allHorses, styleLaneFloor, collisionMetrics, phase);
  if (slot != null && slot < currentLane - 0.01) return slot;

  let bestLane = currentLane;
  for (let lane = currentLane - 1; lane >= styleLaneFloor; lane--) {
    if (!isLaneOpenForShift(horse, lane, allHorses, phase, collisionMetrics)) continue;
    if (!isInnerLaneOpenAhead(horse, lane, allHorses, phase, collisionMetrics)) continue;
    bestLane = lane;
    if (bestLane <= styleLaneFloor) break;
  }

  // 逃げ馬は内に潜りすぎるより「前の空き」を優先する。
  if (horse.style === '逃げ' && bestLane === currentLane) {
    const frontGapNow = getFrontGap(horse, currentLane, allHorses);
    const outerLane = clampLane(currentLane + 1);
    const minXGap = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
    if (
      frontGapNow < minXGap + 6 &&
      outerLane !== currentLane &&
      isLaneOpenForShift(horse, outerLane, allHorses, phase, collisionMetrics)
    ) {
      return outerLane;
    }
  }

  return bestLane;
}

function calcPreCornerPackTargetLane(horse, phase, allHorses, collisionMetrics = null) {
  const currentLane = clampLane(horse.y);
  const [laneMin, laneMax] = getPhaseLaneBand(phase);
  const clampToBand = v => Math.max(laneMin, Math.min(laneMax, clampLane(v)));
  const minAllowedLane = clampToBand(1.0);

  // 1) 前後の隙間（slot）を最内優先で取る
  const slot = findInnermostOpenSlotLane(horse, allHorses, minAllowedLane, collisionMetrics, phase);
  if (slot != null && slot < currentLane - 0.01) return clampToBand(slot);

  let bestLane = currentLane;
  for (let lane = currentLane - 1; lane >= minAllowedLane; lane -= 1) {
    const candidate = clampToBand(lane);
    if (candidate >= bestLane - 0.01) continue;
    if (!isLaneOpenForShift(horse, candidate, allHorses, phase, collisionMetrics)) break;
    if (!isInnerLaneOpenAhead(horse, candidate, allHorses, phase, collisionMetrics)) continue;
    bestLane = candidate;
    if (bestLane <= minAllowedLane + 0.15) break;
  }

  if (bestLane < currentLane - 0.01) return bestLane;

  const fallback = calcTargetLane(horse, phase, allHorses, collisionMetrics);
  return Math.min(fallback, clampToBand(currentLane));
}

function calcEarlyInnerPriorityLane(horse, baseTargetLane, phase, allHorses, collisionMetrics = null) {
  const currentLane = clampLane(horse.y);
  const [laneMin, laneMax] = getPhaseLaneBand(phase);
  const clampToBand = v => Math.max(laneMin, Math.min(laneMax, clampLane(v)));
  const baseTarget = clampToBand(baseTargetLane);
  const innerMost = Math.max(1, Math.min(INNER_HALF_LANE_MAX, laneMin));

  // 1) 前後の隙間（slot）を最内優先で取る
  const slot = findInnermostOpenSlotLane(horse, allHorses, innerMost, collisionMetrics, phase);
  if (slot != null && slot < currentLane - 0.01) {
    return Math.min(clampToBand(slot), currentLane);
  }

  // 2) 連続的に内が空いているレーンを段階的に詰める
  let bestLane = baseTarget;
  for (let lane = currentLane - 1; lane >= innerMost; lane--) {
    const candidate = clampToBand(lane);
    if (candidate >= bestLane - 0.01) continue;
    if (!isLaneOpenForShift(horse, candidate, allHorses, phase, collisionMetrics)) continue;
    if (!isInnerLaneOpenAhead(horse, candidate, allHorses, phase, collisionMetrics)) continue;
    bestLane = candidate;
    if (bestLane <= innerMost + 0.05) break;
  }

  return Math.min(bestLane, currentLane);
}

function calcPostFourthWideTargetLane(horse, baseTargetLane, phase, allHorses, last3fNorm = null) {
  const currentLane = clampLane(horse.y);
  const baseTarget = clampLane(baseTargetLane);
  const staminaRatio = horse.initialStamina > 0 ? horse.stamina / horse.initialStamina : 0;
  let outerSpreadIntent = 0;
  if (last3fNorm && Number.isFinite(last3fNorm.min) && Number.isFinite(last3fNorm.max)) {
    outerSpreadIntent = getCloserOuterSpreadIntent(
      horse,
      last3fNorm.min,
      last3fNorm.max,
      last3fNorm.span,
    );
  }
  const candidates = [
    baseTarget,
    currentLane,
    currentLane + 1,
    currentLane - 1,
    currentLane + 2,
    currentLane - 2,
    currentLane + 3,
    currentLane - 3,
    currentLane + 4,
    currentLane - 4,
  ]
    .map(v => clampLane(v))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  let bestLane = baseTarget;
  let bestScore = -Infinity;
  for (const lane of candidates) {
    const frontGap = getFrontGap(horse, lane, allHorses);
    const density = allHorses.filter(h =>
      h.id !== horse.id &&
      Math.abs(h.x - horse.x) < 26 &&
      Math.abs(h.y - lane) < 0.92
    ).length;
    const staminaDiscountOnOuterMove = Math.max(0.15, staminaRatio) * 0.8;
    const moveCost = Math.abs(lane - currentLane) * 1.05 * (2.0 - staminaDiscountOnOuterMove);
    const outsideBias = lane * (0.55 + outerSpreadIntent * 1.1);
    const openLaneBonus = frontGap > MIN_FORWARD_GAP + 10 ? 6.2 : 0;
    const closerPrepBonus = outerSpreadIntent * 4.0;
    const score = Math.min(frontGap, 92) * 1.08 - density * 4.7 - moveCost + outsideBias + openLaneBonus
      + closerPrepBonus;
    if (score > bestScore) {
      bestScore = score;
      bestLane = lane;
    }
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

function resolveWeightedBattle(rng, a, b, weights, styleBonusFn = () => 0, options = {}) {
  const eA = battleScore(rng, a, weights, styleBonusFn);
  const eB = battleScore(rng, b, weights, styleBonusFn);
  const winner = eA > eB ? a : b;
  const loser  = eA > eB ? b : a;
  loser.battlePenalty = CONFIG.BATTLE_PENALTY;
  loser.battleLosses += 1;
  const impactOptions = options?.impactOptions ?? { loserAlreadyPenalized: false };
  if (options?.skipStaminaImpact !== true) {
    applyBattleStaminaImpact(winner, loser, impactOptions);
  }
  return {
    winner,
    loser,
    eA: Math.round(eA * 10) / 10,
    eB: Math.round(eB * 10) / 10,
  };
}

function applyBattleStaminaImpact(winner, loser, options = {}) {
  const loserAlreadyPenalized = Boolean(options.loserAlreadyPenalized);
  const winnerMult = Number.isFinite(options.winnerMult) ? options.winnerMult : 1.0;
  const loserMult = Number.isFinite(options.loserMult) ? options.loserMult : 1.0;
  const winnerDrain = STAMINA_BATTLE_BASE_COST * winnerMult;
  const loserExtraDrainBase = loserAlreadyPenalized
    ? Math.max(0, STAMINA_BATTLE_LOSER_EXTRA - CONFIG.BATTLE_STAMINA_COST * 0.55)
    : STAMINA_BATTLE_LOSER_EXTRA;
  const loserExtraDrain = loserExtraDrainBase * loserMult;

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

function isInnerCutInContestScenario(horse, laneBlocker, baseY, targetY, desiredAdvance, minXGap) {
  if (!laneBlocker) return false;
  const inwardDelta = baseY - targetY;
  if (inwardDelta < INNER_CUTIN_MIN_INWARD_DELTA) return false;
  // 「内側馬の前をかすめる」ケースのみ対象（内側で近い位置）
  if (laneBlocker.y > baseY - 0.04) return false;
  if (laneBlocker.y < targetY - 0.38) return false;
  const dx = laneBlocker.x - horse.x;
  const nearXBand = minXGap * 0.95;
  if (dx < -nearXBand || dx > nearXBand) return false;
  const projectedX = horse.x + Math.max(0, desiredAdvance) * 0.6;
  return projectedX > laneBlocker.x - minXGap * 0.35;
}

function canTriggerInnerCutInBattle(horse, laneBlocker, phase) {
  if (!horse || !laneBlocker || !phase) return false;
  if ((horse.innerCutInCooldownPhases ?? 0) > 0) return false;
  if ((laneBlocker.innerCutInCooldownPhases ?? 0) > 0) return false;
  const sameOpponentRecently =
    horse.lastInnerCutInOpponentId === laneBlocker.id &&
    (phase.index - (horse.lastInnerCutInPhase ?? -999)) <= INNER_CUTIN_REMATCH_COOLDOWN_PHASES;
  if (sameOpponentRecently) return false;
  return true;
}

function markInnerCutInBattlePair(a, b, phase) {
  if (!a || !b || !phase) return;
  a.innerCutInCooldownPhases = Math.max(a.innerCutInCooldownPhases ?? 0, INNER_CUTIN_BATTLE_COOLDOWN_PHASES);
  b.innerCutInCooldownPhases = Math.max(b.innerCutInCooldownPhases ?? 0, INNER_CUTIN_BATTLE_COOLDOWN_PHASES);
  a.lastInnerCutInOpponentId = b.id;
  b.lastInnerCutInOpponentId = a.id;
  a.lastInnerCutInPhase = phase.index;
  b.lastInnerCutInPhase = phase.index;
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
  // 第3コーナーまで: 脚質に関わらず最内を志向（脚質差は前後ポジションでのみ反映）
  if (isThroughThirdCornerPhase(phase)) {
    if (style === '逃げ') return 1.0;
    if (style === '先行') return 1.05;
    if (style === '差し') return 1.15;
    if (style === '追込') return 1.20;
    return 1.10;
  }
  if (style === '逃げ') return r < 0.80 ? 1.6 : 2.5;
  if (style === '先行') return r < 0.80 ? 2.8 : 3.6;
  if (style === '差し') return r < 0.60 ? 4.8 : (r < 0.80 ? 4.2 : 5.2);
  if (style === '追込') return r < 0.60 ? 5.8 : (r < 0.80 ? 4.8 : 6.0);
  return 3.8;
}

function getLaneChangeRate(phase, horse = null, last3fNorm = null) {
  // スタート〜ホーム直線は一気に内へ寄せて隊列を作る
  if (isStartToHomePhase(phase)) return 0.98;
  if (phase.ratio < FORMATION_LOCK_PHASE) return 0.55;
  if (isThroughThirdCornerPhase(phase) && phase.ratio < 0.80) return 0.55;
  if (
    horse &&
    last3fNorm &&
    Number.isFinite(last3fNorm.min) &&
    Number.isFinite(last3fNorm.max) &&
    isAfterFourthCornerPhase(phase) &&
    !phase.isFinal &&
    phase.ratio < 0.80
  ) {
    const intent = getCloserOuterSpreadIntent(
      horse,
      last3fNorm.min,
      last3fNorm.max,
      last3fNorm.span,
    );
    if (intent > 0.25) return 0.36;
    return 0.22;
  }
  if (phase.ratio < 0.80) return 0.12;
  return 0.20;
}

function getPhaseLaneBand(phase) {
  // 第3コーナーまで: 内半分まで段階的に寄せられるよう帯を INNER_HALF と揃える
  if (isThroughThirdCornerPhase(phase)) return [1, INNER_HALF_LANE_MAX];
  if (isAfterFourthCornerPhase(phase)) return [1, LANE_WIDTH];
  if (phase.ratio < 0.80) return [1, 7];
  if (phase.ratio < 0.92) return [1, 10];
  return [1, LANE_WIDTH];
}

function isBeforeFirstCornerPhase(phase) {
  if (!phase || phase.isCorner || phase.isFinal) return false;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  const segmentLabel = String(phase.segmentLabel ?? '');
  if (segmentId === 'start' || segmentId === 'home') return true;
  if (segmentLabel.includes('スタート') || segmentLabel.includes('ホーム直線')) return true;
  return phase.ratio < PRE_CORNER_PACK_PHASE_MAX;
}

function isStartToHomePhase(phase) {
  if (!phase || phase.isFinal) return false;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  const segmentLabel = String(phase.segmentLabel ?? '');
  if (segmentId === 'start' || segmentId === 'home') return true;
  if (segmentLabel.includes('スタート') || segmentLabel.includes('ホーム直線')) return true;
  return !phase.isCorner && phase.ratio < PRE_CORNER_PACK_PHASE_MAX;
}

/** 第3コーナー終了まで（向正面〜第3コーナー、スタート・ホーム含む）。第4コーナー手前の向正面は含めない。 */
function isThroughThirdCornerPhase(phase) {
  if (!phase || phase.isFinal) return false;
  const cornerNo = Number.isFinite(phase.cornerNo) ? phase.cornerNo : null;
  if (cornerNo != null) return cornerNo <= 3;
  const segmentId = String(phase.segmentId ?? '').toLowerCase();
  if (segmentId === 'corner4' || segmentId === 'final') return false;
  if (
    segmentId === 'start' ||
    segmentId === 'home' ||
    segmentId === 'corner1' ||
    segmentId === 'corner2' ||
    segmentId === 'corner3' ||
    segmentId === 'back'
  ) {
    return true;
  }
  const segmentLabel = String(phase.segmentLabel ?? '');
  if (segmentLabel.includes('第4コーナー') || segmentLabel.includes('最終直線')) return false;
  if (segmentLabel.includes('スタート') || segmentLabel.includes('ホーム直線') || segmentLabel.includes('向正面')) {
    return true;
  }
  if (
    segmentLabel.includes('第1コーナー') ||
    segmentLabel.includes('第2コーナー') ||
    segmentLabel.includes('第3コーナー')
  ) {
    return true;
  }
  return phase.ratio < 0.75;
}

function isAfterFourthCornerPhase(phase) {
  if (!phase) return false;
  if (phase.isFinal) return true;
  const cornerNo = Number.isFinite(phase.cornerNo) ? phase.cornerNo : null;
  if (cornerNo != null) return cornerNo >= 4;
  return phase.ratio >= FINAL_STRAIGHT_RATIO;
}

function enforceInnerHalfTrack(horses) {
  horses.forEach(h => {
    h.y = Math.max(1, Math.min(INNER_HALF_LANE_MAX, clampLane(h.y)));
  });
}

function compressPreCornerToInnerLanes(horses, phase, collisionMetrics) {
  const minXGap = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
  const minYGapBase = collisionMetrics?.minYGap ?? COLLISION_MIN_Y_GAP;
  const minYGap = Math.max(0.72, minYGapBase * PRE_CORNER_MIN_Y_GAP_MULT);
  for (let iter = 0; iter < PRE_CORNER_INNER_COMPRESS_ITERS; iter++) {
    let moved = false;
    const order = [...horses].sort((a, b) => {
      const dy = clampLane(b.y) - clampLane(a.y); // 外側馬を優先して先に内へ寄せる
      if (Math.abs(dy) > 0.01) return dy;
      return b.x - a.x;
    });
    for (const horse of order) {
      const currentLane = clampLane(horse.y);
      if (currentLane <= 1.01) continue;
      const slot = findInnermostOpenSlotLane(
        horse,
        horses,
        1,
        { minXGap, minYGap },
        phase,
        { aggressivePreCorner: true },
      );
      let targetLane = slot != null
        ? Math.min(currentLane, clampLane(slot))
        : Math.max(1, currentLane - PRE_CORNER_FORCE_INNER_STEP);
      if (targetLane >= currentLane - 0.01) continue;
      if (!isLaneOpenForShift(horse, targetLane, horses, phase, { minXGap, minYGap })) {
        const halfLane = Math.max(1, currentLane - (currentLane - targetLane) * 0.5);
        if (!isLaneOpenForShift(horse, halfLane, horses, phase, { minXGap, minYGap })) continue;
        targetLane = halfLane;
      }
      horse.y = targetLane;
      moved = true;
    }
    enforceInnerHalfTrack(horses);
    resolveHorseOverlaps(horses, {
      minXGap,
      minYGap,
      iterations: 1,
      keepOrder: true,
      freezeY: false,
      phase,
    });
    if (!moved) break;
  }
}

function rerouteRearContactsToOuterLane(horses, collisionMetrics) {
  const minXGap = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
  const minYGap = collisionMetrics?.minYGap ?? COLLISION_MIN_Y_GAP;
  const laneMax = Math.min(INNER_HALF_LANE_MAX, LANE_WIDTH);
  const byRearFirst = [...horses].sort((a, b) => a.x - b.x);
  for (const horse of byRearFirst) {
    const blocker = horses.find(h => {
      if (h.id === horse.id) return false;
      if (h.x < horse.x) return false;
      const requiredGap = getRequiredXGap(h, horse, minXGap, null, { isInnerCutIn: true });
      return (
        (h.x - horse.x) < requiredGap &&
        Math.abs(h.y - horse.y) < minYGap * 0.98
      );
    });
    if (!blocker) continue;
    for (let step = 1; step <= HOME_OUTER_REROUTE_STEPS; step++) {
      const candidateLane = clampLane(horse.y + step);
      if (candidateLane > laneMax + 0.01) break;
      const occupied = horses.some(h =>
        h.id !== horse.id &&
        Math.abs(h.x - horse.x) < minXGap &&
        Math.abs(h.y - candidateLane) < minYGap
      );
      if (occupied) continue;
      horse.y = candidateLane;
      break;
    }
  }
}

function scoreLaneOption(horse, lane, preferredLane, phase, allHorses, currentLane, collisionMetrics = null) {
  const through = isThroughThirdCornerPhase(phase);
  const frontGap = getFrontGap(horse, lane, allHorses);
  const nearCount = allHorses.filter(h =>
    h.id !== horse.id &&
    Math.abs(h.x - horse.x) < 28 &&
    Math.abs(h.y - lane) < 0.9
  ).length;

  let score = 0;
  score += Math.min(frontGap, 60) * 0.85;                       // 前方クリア距離
  score -= Math.abs(lane - preferredLane) * (through ? 1.4 : 2.8); // 脚質方針との差
  const densityPenalty = (nearCount * nearCount) * (through ? PACK_DENSITY_PENALTY_QUAD * 0.6 : PACK_DENSITY_PENALTY_QUAD);
  score -= densityPenalty;                                       // 密集回避（過密レーンを二乗で強く嫌う）

  // 距離ロス観点では基本的に内有利（コーナーで増幅）。第3コーナーまでは内志向を強める。
  const innerBiasMult = through ? 2.6 : 1;
  const innerBias = (LANE_WIDTH - lane) * (phase.isCorner ? 0.9 : 0.35) * innerBiasMult;
  score += innerBias;

  // 第3コーナーまでの追加ボーナス: 内側にスペースがあるほど積極的に寄せる
  if (through) {
    const innerNeighbors = allHorses.filter(h =>
      h.id !== horse.id &&
      Math.abs(h.x - horse.x) < 32 &&
      h.y < lane - 0.85
    ).length;
    if (innerNeighbors === 0) score += (LANE_WIDTH - lane) * 0.6;
    if (lane < currentLane - 0.01 && isLaneOpenForShift(horse, lane, allHorses, phase, collisionMetrics)) score += 8;
  }

  // 差し・追込は序盤で外待機、終盤で前進優先（第3コーナーまでは内寄せと矛盾しないよう弱める）
  if (
    !through &&
    (horse.style === '差し' || horse.style === '追込') &&
    phase.ratio < 0.65
  ) {
    score += lane * 0.55;
  }
  if ((horse.style === '差し' || horse.style === '追込') && phase.ratio >= 0.80) {
    score -= lane * 0.35;
  }

  // 逃げ/先行はスタート〜序盤で内のポジション取りを優先。
  // 空いていない場合は無理に寄せないように抑制する。
  if ((horse.style === '逃げ' || horse.style === '先行') && phase.ratio < 0.25) {
    if (lane < currentLane && isInnerLaneOpenAhead(horse, lane, allHorses, phase, collisionMetrics)) {
      score += 12;
    }
    if (lane > currentLane) {
      score -= 5;
    }
  }

  if (frontGap < MIN_FORWARD_GAP + 4) score -= 12;
  if ((phase.isFinal || phase.ratio >= FINAL_STRAIGHT_RATIO) && frontGap > MIN_FORWARD_GAP + 10) {
    // 最終直線で前が空いている場合は不用意な横移動を抑える
    score -= Math.abs(lane - currentLane) * 4.2;
  }
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

/** (cx,cy) を中心に minXGap×minYGap の占有矩形とみなしたとき h と重なるか */
function horseFootprintsOverlapAt(cx, cy, h, minXGap, minYGap) {
  return Math.abs(h.x - cx) < minXGap && Math.abs(h.y - cy) < minYGap;
}

/**
 * 横移動して targetLane に着いたとき、経路上に他馬の「占有」がないか。
 * 第3コーナーまでは getCollisionMetrics の矩形判定のみ（縦隊が経路帯で一律ブロックされないようにする）。
 */
function isLaneOpenForShift(horse, targetLane, allHorses, phase = null, collisionMetrics = null) {
  const toLane = clampLane(targetLane);
  const useFootprint =
    phase != null &&
    isThroughThirdCornerPhase(phase) &&
    collisionMetrics != null &&
    Number.isFinite(collisionMetrics.minXGap) &&
    Number.isFinite(collisionMetrics.minYGap);
  if (useFootprint) {
    const minX = collisionMetrics.minXGap;
    const minY = collisionMetrics.minYGap;
    return !allHorses.some(h =>
      h.id !== horse.id && horseFootprintsOverlapAt(horse.x, toLane, h, minX, minY)
    );
  }
  const fromLane = clampLane(horse.y);
  return !allHorses.some(h =>
    h.id !== horse.id &&
    Math.abs(h.x - horse.x) < LATERAL_BLOCK_X_GAP &&
    isLaneInShiftPath(h.y, fromLane, toLane, 0.85)
  );
}

function isInnerLaneOpenAhead(horse, targetLane, allHorses, phase = null, collisionMetrics = null) {
  const fromLane = clampLane(horse.y);
  const toLane = clampLane(targetLane);
  const through = phase ? isThroughThirdCornerPhase(phase) : false;
  const xForward = through ? 18 : 34;
  const useFootprint =
    through &&
    collisionMetrics != null &&
    Number.isFinite(collisionMetrics.minXGap) &&
    Number.isFinite(collisionMetrics.minYGap);
  if (useFootprint) {
    const minX = collisionMetrics.minXGap;
    const minY = collisionMetrics.minYGap;
    return !allHorses.some(h =>
      h.id !== horse.id &&
      h.x >= horse.x - 10 &&
      h.x <= horse.x + xForward &&
      horseFootprintsOverlapAt(horse.x, toLane, h, minX, minY)
    );
  }
  return !allHorses.some(h =>
    h.id !== horse.id &&
    h.x >= horse.x - 10 &&
    h.x <= horse.x + xForward &&
    isLaneInShiftPath(h.y, fromLane, toLane, 0.82)
  );
}

/**
 * 内側に「前後の馬の隙間（slot）」がある最内レーンを探す。
 * 自分より内側（lane が小さい側）の各候補レーンで、
 *   - 前方の最も近い馬まで minXGap 以上
 *   - 後方の最も近い馬まで minXGap 以上
 *   - 横移動先で他馬の占有矩形と重ならない（第3コーナーまでは isLaneOpenForShift）
 * の3条件を満たす最内のレーンを返す。なければ null。
 */
function findInnermostOpenSlotLane(horse, allHorses, laneMin, collisionMetrics, phase, options = {}) {
  const minXGap = collisionMetrics?.minXGap ?? MIN_FORWARD_GAP;
  const minYGap = collisionMetrics?.minYGap ?? COLLISION_MIN_Y_GAP;
  const aggressivePreCorner = Boolean(options?.aggressivePreCorner);
  const ownBuffer = getHorseBufferX(horse, phase);
  const cur = clampLane(horse.y);
  const start = Math.max(1, Math.ceil(laneMin));
  const end = Math.floor(cur - 0.01);
  // 内側ほど望ましいので start から end の順（最内 → 自分の手前）に走査して即返す
  for (let lane = start; lane <= end; lane++) {
    if (!isLaneOpenForShift(horse, lane, allHorses, phase, collisionMetrics)) continue;
    let frontGap = Infinity;
    let rearGap = Infinity;
    const laneBand = Math.max(0.85, minYGap);
    for (const h of allHorses) {
      if (h.id === horse.id) continue;
      if (Math.abs(h.y - lane) >= laneBand) continue;
      const dx = h.x - horse.x;
      if (dx > 0 && dx < frontGap) frontGap = dx;
      else if (dx < 0 && -dx < rearGap) rearGap = -dx;
    }
    const fullFrontMin = (aggressivePreCorner ? minXGap * 0.90 : minXGap) + ownBuffer.front * 0.35;
    const fullRearMin = (aggressivePreCorner ? minXGap * 0.78 : minXGap) + ownBuffer.rear * 0.30;
    const hasFullSlot = frontGap >= fullFrontMin && rearGap >= fullRearMin;
    if (hasFullSlot) return lane;
    const hasPocketSlot = canInsertIntoInnerPocket(frontGap, rearGap, minXGap, ownBuffer, aggressivePreCorner);
    if (hasPocketSlot) return lane;
  }
  return null;
}

function canInsertIntoInnerPocket(frontGap, rearGap, minXGap, ownBuffer = null, aggressivePreCorner = false) {
  if (!Number.isFinite(frontGap) || !Number.isFinite(rearGap)) return false;
  const frontBuf = ownBuffer?.front ?? 0;
  const rearBuf = ownBuffer?.rear ?? 0;
  const minFront = minXGap * (aggressivePreCorner ? 0.45 : INNER_POCKET_FRONT_GAP_RATIO) + frontBuf * 0.22;
  const minRear = minXGap * (aggressivePreCorner ? 0.25 : INNER_POCKET_REAR_GAP_RATIO) + rearBuf * 0.18;
  return frontGap >= minFront && rearGap >= minRear;
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
    // 最終直線最後のコマでレンダラーが実際に描いた cy を progress 値に逆算して保持し、
    // ゴール演出 1 コマ目で同位置から開始できるようにする。
    const initialRenderProgressById = new Map();
    this.renderer.horseRenderState.forEach((state, id) => {
      if (Number.isFinite(state?.cy)) {
        initialRenderProgressById.set(id, this.renderer.yToProgress(state.cy));
      }
    });
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
      const staminaRatio = h.initialStamina > 0 ? h.stamina / h.initialStamina : 0.5;
      const res = resultsById.get(h.id) ?? h;
      const l3w = Number.isFinite(res.last3f)
        ? (maxLast3f - res.last3f) / last3fSpan
        : 0.5;
      const isCloser = h.style === '差し' || h.style === '追込';
      const startSpeedMult = Math.max(
        0.64,
        Math.min(
          1.08,
          0.70
            + staminaRatio * 0.28
            + l3w * 0.12
            + (isCloser ? 0.06 : 0),
        ),
      );
      return {
        ...h,
        goalMeters: 0,
        goalFinished: false,
        targetLane: h.y,
        goalStartProgress: (baseGoalProgressById.get(h.id) ?? GOAL_ENTRY_LEADER_START_PROGRESS) + goalEntryOffset,
        // どれだけ下から入ってきても、最終的に全馬がゴール線を通過できるよう個別に進捗倍率を持たせる。
        goalProgressScale: 1,
        goalCurrentMps: GOAL_BASE_MPS * startSpeedMult,
        goalAccelState: 0,
        goalLaneCost: 0,
        goalCommitUntilMs: 0,
        goalLaneCooldownUntilMs: 0,
        goalBurstRemainMs: 0,
        goalBurstCooldownUntilMs: 0,
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

    const durationMs = GOAL_DISTANCE_METERS / GOAL_BASE_MPS * 1000 * GOAL_TIME_SCALE;
    const startedAt = performance.now();
    const goalRng = createRng((this.raceData?.race_id ?? 1) + 7919);
    let lastTs = startedAt;
    let goalFrameIndex = 0;

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

      simHorses.sort((a, b) => b.x - a.x);
      simHorses.forEach(horse => {
        if (horse.goalFinished) {
          // ゴール後も画面上に抜けるまで前進を継続する。
          laneIntentById.set(horse.id, 0);
          overtakePressureById.set(horse.id, 0);
          const postGoalMinMps = GOAL_BASE_MPS * 1.08;
          horse.goalCurrentMps = Math.max(postGoalMinMps, horse.goalCurrentMps * 0.996);
          const progressedMeters = Math.max(postGoalMinMps * dt, horse.goalCurrentMps * dt);
          horse.goalMeters = Math.min(
            GOAL_DISTANCE_METERS + GOAL_POST_CLEAR_METERS * 3.2,
            horse.goalMeters + progressedMeters,
          );
          horse.x += progressedMeters * GOAL_X_PER_METER;
          return;
        }
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
        const distRatio = Math.min(1, (horse.goalMeters || 0) / GOAL_DISTANCE_METERS);
        const remainMeters = Math.max(0, GOAL_DISTANCE_METERS - (horse.goalMeters || 0));
        const isCloser = horse.style === '追込' || horse.style === '差し';
        const aggression = this._calcGoalAggression(horse, staminaRatio, last3fWeight, distRatio);
        const frontGapNow = this._goalFrontGap(simHorses, horse, clampLane(horse.y));
        const frontBlockedNow = frontGapNow < GOAL_BLOCK_X_GAP * 1.08;
        const lanePlan = this._planGoalRouteV2(simHorses, horse, {
          t,
          dt,
          elapsedMs: elapsed,
          aggression,
          staminaRatio,
          last3fWeight,
          frontBlocked: frontBlockedNow,
        });
        overtakePressureById.set(horse.id, lanePlan.pressure);
        const canChangeRoute = elapsed >= (horse.goalCommitUntilMs ?? 0) &&
          elapsed >= (horse.goalLaneCooldownUntilMs ?? 0);
        const adaptiveThreshold = Math.max(
          0.72,
          GOAL_AI.switchThresholdBase
            - aggression * 0.45
            + (1 - distRatio) * 0.18
            + (staminaRatio < 0.24 ? 0.14 : 0),
        );
        const straightKeepBias = frontBlockedNow ? 0 : 0.95;
        const shouldSwitch = canChangeRoute &&
          lanePlan.lane !== clampLane(horse.y) &&
          lanePlan.gain > (adaptiveThreshold + straightKeepBias);
        if (shouldSwitch) {
          horse.targetLane = lanePlan.lane;
          horse.goalCommitUntilMs = elapsed + GOAL_AI.switchCommitSec * 1000;
        } else if (Math.abs((horse.targetLane ?? horse.y) - horse.y) < 0.08) {
          horse.targetLane = horse.y;
        }
        const outerSpreadIntentGoal = getCloserOuterSpreadIntent(horse, minLast3f, maxLast3f, last3fSpan);
        const holdProactiveLane =
          isCloser &&
          outerSpreadIntentGoal > 0.38 &&
          distRatio < 0.92;
        if (!frontBlockedNow && !holdProactiveLane) {
          horse.targetLane = horse.y;
        }
        laneIntentById.set(horse.id, Math.max(-1, Math.min(1, (horse.targetLane - horse.y) / 2.2)));
        const laneDelta = horse.targetLane - horse.y;
        let laneShift = 0;
        if (Math.abs(laneDelta) > 0.01) {
          const cutInTarget = this._findGoalCutInRival(simHorses, horse, horse.targetLane);
          if (cutInTarget && !frameEngaged.has(horse.id) && !frameEngaged.has(cutInTarget.id)) {
            if (shouldBattle(goalRng, simHorses, horse, cutInTarget)) {
              const result = resolveBattle(goalRng, horse, cutInTarget, phase);
              applyBattleStaminaImpact(result.winner, result.loser, { loserAlreadyPenalized: true });
              const log = `[バトル:ゴール割り込み] ${horse.name} が ${cutInTarget.name} の前へ進出 → 勝者: ${result.winner.name}`;
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
          const speedRatio = horse.goalCurrentMps / Math.max(1e-6, GOAL_BASE_MPS);
          const speedLimited = speedRatio > 1.15 ? 0.58 : (speedRatio > 1 ? 0.74 : 1.0);
          const laneRate = GOAL_LANE_CHANGE_PER_SEC * speedLimited * (frontBlockedNow ? 1.0 : 0.65);
          const laneStep = Math.sign(laneDelta) * Math.min(Math.abs(laneDelta), laneRate * dt);
          laneShift = Math.abs(laneStep);
          horse.y = clampLane(horse.y + laneStep);
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
        const last3fCloser = last3fWeight * (isCloser ? 1.35 : 1);
        const lateBoost = 0.90
          + 0.22 * Math.pow(t, 0.9)
          + 0.14 * Math.pow(distRatio, 0.72)
          + (isCloser ? 0.10 * Math.pow(Math.min(1, furlongHint), 0.5) : 0);
        const staminaBoost = 0.56 + staminaRatio * 0.54;
        const surge = 0.72 + last3fCloser * 0.32 + fastWeight * 0.18 + styleBoost;
        const closingKick = 1
          + Math.pow(distRatio, 0.58) * (
            (isCloser ? 0.20 : 0.06) * (0.45 + last3fWeight * 0.55)
            + last3fWeight * 0.12
          )
          + Math.pow(t, 1.2) * (
            (horse.style === '追込' ? 0.12 : 0) +
            (horse.style === '差し' ? 0.10 : 0) +
            last3fWeight * 0.06
          );
        const fatiguePenalty = Math.max(0.52, 1 - battleFatigue - (1 - staminaRatio) * 0.32);
        const rescueBoost = elapsed >= durationMs * 1.20
          ? 1 + Math.min(0.45, ((elapsed / durationMs) - 1.20) * 0.70)
          : 1;
        const routeTax = Math.min(0.07, (horse.goalLaneCost ?? 0) * 0.0035);
        const routeTaxMult = 1 - routeTax * (1.15 - staminaRatio * 0.45);
        const targetMps = GOAL_BASE_MPS * lateBoost * staminaBoost * surge * styleTop * closingKick * trafficPenalty * fatiguePenalty * rescueBoost * routeTaxMult;
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
        const minMps = GOAL_BASE_MPS * GOAL_MIN_SPEED_RATIO;
        const maxMps = GOAL_BASE_MPS * GOAL_MAX_SPEED_RATIO;
        horse.goalCurrentMps = Math.max(minMps, Math.min(maxMps, horse.goalCurrentMps + deltaV));
        if (elapsed >= durationMs * 1.45) {
          horse.goalCurrentMps = Math.max(horse.goalCurrentMps, GOAL_BASE_MPS * 1.18);
        }

        const accelDrain = Math.max(0, deltaV) * (1.2 + (isCloser ? 0.45 : 0.15));
        const speedDrain = horse.goalCurrentMps * (0.010 + (horse.style === '逃げ' ? 0.003 : 0));
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

        const deltaMeters = horse.goalCurrentMps * dt;
        const progressedMeters = Math.max(
          GOAL_BASE_MPS * 0.28 * dt,
          elapsed >= durationMs * 1.55 ? deltaMeters * 1.12 : deltaMeters,
        );
        horse.goalMeters = Math.min(
          GOAL_DISTANCE_METERS + GOAL_POST_CLEAR_METERS * 3.2,
          horse.goalMeters + progressedMeters,
        );
        horse.x += progressedMeters * GOAL_X_PER_METER;
      });

      // ゴールシーンではカメラ再配置を使わず、各馬の生の進行量から progress を作る。
      // これで最終直線→ゴールの座標系を連続化し、縦方向の引き延ばし感を防ぐ。
      const goalProgressCap = rawT < 2 / 3
        ? GOAL_PROGRESS_MAX_PRE_LINE
        : GOAL_PROGRESS_MAX_POST_LINE;
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
          Math.max(GOAL_PROGRESS_MIN, Math.min(goalProgressCap, rawProgress)),
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

      this.renderer.draw(simHorses, phase, 1, {
        phaseLabel: 'ゴールシーン',
        furlong: { t },
        goalLine: rawT,
        sceneTransition: {
          t: Math.max(0, Math.min(1, elapsed / GOAL_SCENE_TRANSITION_MS)),
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
      });
      this.lastRenderedHorses = simHorses.map(h => ({ ...h }));
      updateEntryStaminaBars(simHorses);

      const allFinished = simHorses.every(h => h.goalFinished);
      const hardLimitReached = elapsed >= durationMs * 2.5;
      if (hardLimitReached && !allFinished) {
        simHorses.forEach(h => {
          const startProgress = Number.isFinite(h.goalStartProgress)
            ? h.goalStartProgress
            : GOAL_ENTRY_LEADER_START_PROGRESS;
          const progressScale = Number.isFinite(h.goalProgressScale) ? h.goalProgressScale : 1;
          const neededRatio = (GOAL_PROGRESS_TARGET_AT_FINISH - startProgress) /
            Math.max(1e-6, GOAL_PROGRESS_SPAN * progressScale);
          const neededMeters = Math.max(
            GOAL_DISTANCE_METERS + GOAL_POST_CLEAR_METERS * 0.25,
            neededRatio * GOAL_DISTANCE_METERS,
          );
          const deltaMeters = Math.max(0, neededMeters - (h.goalMeters ?? 0));
          h.goalMeters = neededMeters;
          h.x += deltaMeters * GOAL_X_PER_METER;
          this._markHorseGoalFinished(h);
        });
        this.renderer.draw(simHorses, phase, 1, {
          phaseLabel: 'ゴールシーン',
          furlong: { t: 1 },
          goalLine: rawT,
          sceneTransition: {
            t: Math.max(0, Math.min(1, elapsed / GOAL_SCENE_TRANSITION_MS)),
            maxAlpha: GOAL_SCENE_TRANSITION_MAX_ALPHA,
          },
          goalRun: {
            t: 1,
            distanceMeters: GOAL_DISTANCE_METERS,
            progressSpan: GOAL_PROGRESS_SPAN,
            maxProgress: GOAL_PROGRESS_MAX_POST_LINE,
            minProgress: GOAL_PROGRESS_MIN,
            progressById: goalRenderProgressById,
            laneIntentById,
            overtakePressureById,
          },
        });
        this.lastRenderedHorses = simHorses.map(h => ({ ...h }));
        updateEntryStaminaBars(simHorses);
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

  _goalFrontGap(horses, horse, lane, atX = horse.x) {
    const nearLaneGap = this._getGoalNearLaneGap();
    const front = horses
      .filter(h =>
        h.id !== horse.id &&
        h.x > atX &&
        Math.abs(h.y - lane) < nearLaneGap
      )
      .sort((a, b) => a.x - b.x)[0];
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
    const currentMps = horse.goalCurrentMps ?? GOAL_BASE_MPS;
    const deltaMeters = currentMps * horizonSec;
    return horse.x + deltaMeters * GOAL_X_PER_METER;
  }

  _planGoalRouteV2(horses, horse, context = {}) {
    const currentLane = clampLane(horse.y);
    const staminaRatio = context.staminaRatio ?? 0.5;
    const last3fWeight = context.last3fWeight ?? 0.5;
    const aggression = context.aggression ?? 0.5;
    const frontBlocked = Boolean(context.frontBlocked);
    const horizonSec = GOAL_AI.horizonSec;
    const projectedX = this._predictGoalX(horse, horizonSec);
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

    let bestLane = currentLane;
    let bestScore = -Infinity;
    let currentScore = -Infinity;
    candidates.forEach(lane => {
      const projectedGap = this._goalFrontGap(horses, horse, lane, projectedX);
      const projectedDensity = this._goalLaneDensity(horses, horse, lane, projectedX);
      const moveCost = Math.abs(lane - currentLane) * GOAL_AI.laneMoveCostPerLane;
      const staminaRisk = Math.max(0, moveCost * 0.18 - staminaRatio * 0.35);
      const blockRisk = Math.max(0, 1 - Math.min(1, projectedGap / Math.max(1, GOAL_BLOCK_X_GAP * 1.3)));
      const styleBonus = lane * styleOutsideBias * (0.45 + last3fWeight * 0.55);
      const projectedGain = Math.min(projectedGap, 92) * GOAL_AI.projectedGapWeight;
      const keepStraightPenalty = !frontBlocked
        ? Math.abs(lane - currentLane) * 2.9 * keepStraightFactor
        : 0;
      const score =
        projectedGain -
        projectedDensity * GOAL_AI.densityWeight -
        blockRisk * GOAL_AI.blockRiskWeight -
        moveCost -
        staminaRisk -
        keepStraightPenalty +
        styleBonus +
        aggression * 0.8;
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
