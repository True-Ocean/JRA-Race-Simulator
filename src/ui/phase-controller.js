import { shouldBattle, resolveBattle } from '../engine/battle.js';
import { createRng } from '../engine/rng.js';
import {

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
  GOAL_MIN_SPEED_RATIO,
  GOAL_MAX_SPEED_RATIO,
  GOAL_POST_SCROLL_MS,
  GOAL_POST_CLEAR_METERS,
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
  GOAL_STAMINA_DRAIN_MULT,
  GOAL_STAMINA_DRAIN_RESERVE_BASE,
  GOAL_STAMINA_DRAIN_RESERVE_STAMINA_GAIN,
  GOAL_FRONT_RUNNER_UNLEASH_SCALE,
  GOAL_AI,
  LANE_WIDTH,
  LATERAL_BLOCK_X_GAP,
  DIAGONAL_REAR_BLOCK_X_GAP,
  USE_SAFE_STAMINA_MODEL,
  SAFE_GOAL_STAMINA_PER_M_REF,
  SAFE_GOAL_STAMINA_PER_M_RANGE,
  SAFE_GOAL_EVENT_FATIGUE_WEIGHT,
  STAMINA_LANE_CHANGE_COST,

} from '../engine/constants.js';
import {
  clampLane,
  applyBattleStaminaImpact,
  isNigeStyle,
  isOonigeStyle,
  getJockeyReliabilityNorm,
  getJockeyAggressionNorm,
  isLaneInShiftPath,
} from '../engine/horse-utils.js';
import {
  goalIntrinsicMpsFromLast3f,
  goalStaminaSpeedMult,
  normalize01,
  calcGoalPathQuality,
  calcGoalEffortNorm,
  calcGoalReserveBurnDrain,
  calcGoalFrontRunnerHoldDrain,
} from './goal-scene.js';
import {
  getBattleLogClass,
  formatLogLineHtml,
  formatSceneHeadingHtml,
} from './race-log.js';
import {
  syncPlacingPanelsHtml,
  appendPlacingRowToPanels,
} from './placing-panel.js';
import { buildFinishTimeRows } from './finish-times.js';
import { updateEntryStaminaBars } from './entry-stamina.js';
import {
  calcGoalChaseUrgency,
  calcPackRankNorm,
  assignStretchFanLanesForPack,
} from '../engine/lane-decision.js';

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
    /** @type {Map<number, number>} ゴールレース開始からの通過経過 ms */
    this._goalFinishedAtById = new Map();
    this.isReplayPlayback = Boolean(playbackHooks.isReplayPlayback);
    this.recordGoalPlayback = Boolean(playbackHooks.recordGoalPlayback);
    this.goalRecording = Array.isArray(playbackHooks.goalRecording)
      ? playbackHooks.goalRecording
      : null;
    this.raceData = {
      race_id: playbackHooks.raceId ?? 1,
      race_info: playbackHooks.raceInfo ?? null,
    };
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

  _appendPlacingRow(rank, horse, finishDisplay = null) {
    appendPlacingRowToPanels(rank, horse, this.horseMetaByName, finishDisplay);
    this._scrollRaceLogToBottom();
  }

  _initializePlacingPanel() {
    syncPlacingPanelsHtml('');
  }

  _setPlacingLog(rank, horse) {
    const finishDisplay = this._getFinishDisplayForPlacing(horse.id, rank);
    this._appendPlacingRow(rank, horse, finishDisplay);
  }

  getGoalRecording() {
    return this._pendingGoalRecording.length > 0 ? this._pendingGoalRecording : null;
  }

  getGoalFinishedAtById() {
    return new Map(this._goalFinishedAtById);
  }

  _getFinishDisplayForPlacing(horseId, rank) {
    const { rows } = buildFinishTimeRows({
      raceInfo: this.raceData?.race_info,
      simResults: this.simResults,
      finishOrderIds: this._goalRankOrder,
      goalFinishedAtById: this._goalFinishedAtById,
    });
    const row = rows.find(r => r.id === horseId);
    if (!row) return null;
    return { timeLabel: row.timeLabel, marginLabel: row.marginLabel };
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
      goalFinishedAtRaceMs: horse.goalFinishedAtRaceMs,
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
      if (Number.isFinite(horse.goalFinishedAtRaceMs)) {
        this._goalFinishedAtById.set(id, horse.goalFinishedAtRaceMs);
      }
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
    this._goalFinishedAtById = new Map();
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
    const last3fNorm = { min: minLast3f, max: maxLast3f, span: last3fSpan };

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

    assignStretchFanLanesForPack(simHorses, {
      last3fNorm,
      phase: { isFinal: true, segmentId: 'final', segmentLabel: '最終直線入口' },
    });
    simHorses.forEach(horse => {
      const blendedLane = clampLane(horse.stretchFanLane ?? horse.y);
      horse.y = blendedLane;
      horse.targetLane = blendedLane;
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
    this._goalFinishedAtById = new Map();

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
        const aggression = this._calcGoalAggression(
          horse,
          staminaRatio,
          last3fWeight,
          distRatio,
          calcPackRankNorm(horse, simHorses),
        );
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
          frontBlockedNow ? 0.28 : 0.40,
          GOAL_AI.switchThresholdBase
            - aggression * 0.52
            + (1 - distRatio) * 0.14
            + (staminaRatio < 0.24 ? 0.12 : 0)
            - (urgePass ? 0.32 : 0)
            - (frontBlockedNow ? 0.38 : 0)
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
        const pathQuality = calcGoalPathQuality(
          frontGapAfterLane,
          trafficPenalty,
          horse.goalStuckMs,
        );
        const packRankNorm = calcPackRankNorm(horse, simHorses);
        const isLeadingPack = packRankNorm <= 0.28;
        const isFrontRunner = isNigeStyle(horse.style) || isOonigeStyle(horse.style);
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
        let staminaUnleash =
          staminaRatio *
          (0.06 + 0.20 * Math.pow(distRatio, 0.55)) *
          (0.85 + last3fWeight * 0.30);
        if (isFrontRunner && isLeadingPack && frontGapAfterLane > GOAL_BLOCK_X_GAP * 0.92) {
          staminaUnleash *= GOAL_FRONT_RUNNER_UNLEASH_SCALE;
        } else if (pathQuality > 0.22) {
          staminaUnleash *= 0.82 + pathQuality * 0.22;
        }
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
        const effortNorm = calcGoalEffortNorm(horse.goalDesiredMps, horse.goalCurrentMps, Math.max(0, deltaV));

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
        const staminaDrainMult =
          GOAL_STAMINA_DRAIN_RESERVE_BASE + staminaRatio * GOAL_STAMINA_DRAIN_RESERVE_STAMINA_GAIN;
        const goalDrain =
          (accelDrain + speedDrain + trafficDrain) *
          dt *
          GOAL_STAMINA_DRAIN_MULT *
          sprintStaminaMult *
          staminaDrainMult;
        const reserveBurn = calcGoalReserveBurnDrain({
          stamina: horse.stamina,
          initialStamina: horse.initialStamina,
          remainMeters,
          goalCurrentMps: horse.goalCurrentMps,
          staminaRatio,
          pathQuality,
          distRatio,
          effortNorm,
          dt,
        });
        const holdDrain = isFrontRunner
          ? calcGoalFrontRunnerHoldDrain({
            initialStamina: horse.initialStamina,
            staminaRatio,
            pathQuality,
            distRatio,
            dt,
            isLeadingPack,
            frontGap: frontGapAfterLane,
            effortNorm,
          })
          : 0;
        const pathBurnScale = pathQuality < 0.14 ? 0.32 : 1;
        horse.stamina = Math.max(
          0,
          horse.stamina - goalDrain - reserveBurn * pathBurnScale - holdDrain,
        );

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
            this._markHorseGoalFinished(horse, elapsed);
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

  _calcGoalAggression(horse, staminaRatio, last3fWeight, distRatio, packRankNorm = 0.5) {
    const base = calcGoalChaseUrgency(horse, staminaRatio, last3fWeight, packRankNorm);
    const value = base + (1 - distRatio) * 0.12;
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
    if (
      !frontBlocked
      && (!frontInCurrent || (frontInCurrent.x - horse.x) > farFrontThreshold)
    ) {
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
    if (!frontBlocked && selfDesired <= frontDesired * gateRatio) {
      // 前方が空いていて追いつけない場合のみ直進維持。詰まり時は外レーン評価を続ける。
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
    const packRankNorm = calcPackRankNorm(horse, horses);
    const chaseUrgency = calcGoalChaseUrgency(horse, staminaRatio, last3fWeight, packRankNorm);
    const fanLane = horse.stretchFanLane ?? clampLane(horse.y);
    const candidates = [
      currentLane,
      currentLane - 1,
      currentLane + 1,
      currentLane - 2,
      currentLane + 2,
      currentLane - 3,
      currentLane + 3,
      fanLane,
      ...(frontBlocked
        ? [currentLane + 4, currentLane + 5, currentLane + 6, currentLane + 7, currentLane + 8]
        : []),
    ]
      .map(v => clampLane(v))
      .filter((v, i, arr) => arr.indexOf(v) === i);
    const spreadBoost = last3fWeight * 0.55 + staminaRatio * 0.35 + packRankNorm * 0.12;
    const routeOutsideBias = frontBlocked ? chaseUrgency * 0.48 : 0;
    const keepStraightFactor = Math.max(0.35, 1.15 - spreadBoost * 0.48);
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
      const gapGain = projectedGap - baseProjectedGap;
      const fanPull = Math.max(0, 2.4 - Math.abs(lane - fanLane) * 0.28) * (frontBlocked ? 0.85 : 0.25);
      const styleBonus = lane > currentLane && frontBlocked
        ? (lane - currentLane) * routeOutsideBias * (0.45 + last3fWeight * 0.55)
        : 0;
      const projectedGain = Math.min(projectedGap, 92) * GOAL_AI.projectedGapWeight
        + Math.max(0, gapGain) * chaseUrgency * 0.85;
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
        fanPull +
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

  _markHorseGoalFinished(horse, goalRaceElapsedMs = 0) {
    if (horse.goalFinished) return;
    horse.goalFinished = true;
    if (!this._goalRankLogged.has(horse.id)) {
      const raceMs = Math.max(0, Number(goalRaceElapsedMs) || 0);
      horse.goalFinishedAtRaceMs = raceMs;
      this._goalFinishedAtById.set(horse.id, raceMs);
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

export { PhaseController };
