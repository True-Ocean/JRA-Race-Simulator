import { CONFIG } from '../config.js';
import { calcGateSlotLane } from '../engine/params.js';
import { getWakuFrameColor } from './colors.js';
import {
  scaleHorseRenderPositions,
  shouldApplyCanvasResize,
} from './canvas-viewport.js';
import { advanceHorsePoses, arrangeHorsePoses, horseClearance } from './horse-motion.js';
import { recordDisplayDiagnostic } from './display-diagnostics.js';

const TRACK_BASE_COLOR = {
  '芝':    { h: 120, s: 55, l: 22 },
  'ダート': { h: 30,  s: 40, l: 28 },
};

const CONDITION_L_OFFSET = {
  '良':   0,
  '稍重': -2,
  '重':   -5,
  '不良': -9,
};

const PHASE_NAMES = {
  start:    'スタート',
  straight: '直線',
  corner1:  '第1コーナー',
  corner2:  '第2コーナー',
  corner3:  '第3コーナー',
  corner4:  '第4コーナー',
  back:     '向正面',
  final:    '最終直線入口',
};

export class Renderer {
  constructor(canvasId, totalPhases, track = '芝', condition = '良', courseDef = null) {
    this.canvas       = document.getElementById(canvasId);
    this.ctx          = this.canvas.getContext('2d');
    this.totalPhases  = totalPhases;
    this.track        = track;
    this.condition    = condition;
    this.courseDef    = courseDef ?? null;
    this.innerRailSide = this._resolveInnerRailSide(this.courseDef);
    this.horseRenderState = new Map();
    /** @type {{ horses: object[], phase: object, phaseProgress: number, options: object } | null} */
    this._lastDraw = null;
    this.W = 0;
    this.H = 0;
    this._dpr = 0;
    this._resizeRaf = 0;
    this._resize();
    this._onViewportResize = () => this._scheduleResize();
    window.addEventListener('resize', this._onViewportResize);
    window.visualViewport?.addEventListener('resize', this._onViewportResize);
    if (typeof ResizeObserver !== 'undefined') {
      const wrap = this.canvas?.parentElement;
      if (wrap) {
        this._resizeObserver = new ResizeObserver(() => this._scheduleResize());
        this._resizeObserver.observe(wrap);
      }
    }
    this.canvas?.addEventListener('contextlost', (event) => {
      event.preventDefault();
    });
    this.canvas?.addEventListener('contextrestored', () => {
      this._dpr = 0;
      if (!this.syncLayout()) this.redrawLast();
    });
  }

  _scheduleResize() {
    if (this._resizeRaf) return;
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = 0;
      this._resize();
    });
  }

  /** タブ復帰・pageshow など、レイアウト確定後に即時同期して再描画する */
  syncLayout() {
    if (this._resizeRaf) {
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = 0;
    }
    return this._resize();
  }

  redrawLast() {
    if (!this._lastDraw) return false;
    recordDisplayDiagnostic('redraw-last');
    const { horses, phase, phaseProgress, options } = this._lastDraw;
    // 復帰・リサイズの再描画でレースや間隔補正の時間を進めない。
    this.draw(horses, phase, phaseProgress, { ...options, motionDtMs: 0, horseSmoothing: 0 });
    return true;
  }

  _resolveInnerRailSide(courseDef = null) {
    const side = String(courseDef?.innerRailSide ?? '').toLowerCase();
    if (side === 'left' || side === 'right') return side;
    const turnDirection = String(courseDef?.turnDirection ?? '').toLowerCase();
    if (turnDirection === 'left' || turnDirection === 'right') return turnDirection;
    return 'right';
  }

  _getRailX(kind = 'inner') {
    const innerOnRight = this.innerRailSide === 'right';
    if (kind === 'inner') {
      return innerOnRight ? (this.W - this.RAIL_MARGIN + 2) : (this.RAIL_MARGIN - 2);
    }
    return innerOnRight ? (this.RAIL_MARGIN - 2) : (this.W - this.RAIL_MARGIN + 2);
  }

  _laneLeftX(lane) {
    const cx = this.laneToX(lane);
    return cx - this.laneW / 2;
  }

  _resize() {
    const wrap = this.canvas?.parentElement;
    if (!wrap || !this.canvas) return false;
    const nextW = wrap.clientWidth;
    const nextH = wrap.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const prevW = this.W;
    const prevH = this.H;
    if (!shouldApplyCanvasResize(
      { w: prevW, h: prevH, dpr: this._dpr },
      { w: nextW, h: nextH, dpr },
    )) {
      return false;
    }

    this.W = nextW;
    this.H = nextH;
    this._dpr = dpr;
    recordDisplayDiagnostic('canvas-resize', { prevW, prevH, width: nextW, height: nextH, dpr });
    // 表示サイズは CSS（inset: 0）に任せ、インライン幅指定で 0×0 固定や再フローを起こさない
    this.canvas.width = Math.max(1, Math.round(this.W * dpr));
    this.canvas.height = Math.max(1, Math.round(this.H * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 内外ラチの外側に余白を確保し、ラチ外演出を見切れにくくする
    this.RAIL_MARGIN = Math.max(
      Number(CONFIG.TRACK_RAIL_MARGIN_MIN) || 22,
      this.W * (Number(CONFIG.TRACK_RAIL_MARGIN_RATIO) || 0.045),
    );
    this.trackW      = this.W - this.RAIL_MARGIN * 2;
    this.laneW       = this.trackW / CONFIG.LANE_COUNT;

    // 実寸比に寄せる（目安: レーン幅3.0mに対して馬体幅1.8m）
    const horseToLaneRatio = 1.8 / 3.0;
    // 狭い画面でもゲート間隔を超える最低幅を強制しない。
    this.cardW = Math.min(Math.max(14, this.laneW * horseToLaneRatio), this.laneW * 0.72);
    // 馬体の長さ/幅 ≒ 4.5m / 1.8m
    this.cardH = this.cardW * (4.5 / 1.8);
    scaleHorseRenderPositions(this.horseRenderState, prevW, prevH, this.W, this.H);
    this.horseRenderState = arrangeHorsePoses(this.horseRenderState, this.getHorseClearance());
    this.redrawLast();
    return true;
  }

  resetHorseRenderState() {
    recordDisplayDiagnostic('reset-horse-render-state');
    this.horseRenderState.clear();
  }

  /**
   * ゴールシーン本編 1 コマ目: 最終直線の描画位置から、goal progress に合わせてスナップする。
   * @param {Array<{ id: number, y?: number }>} horses
   * @param {Map<number, number>} progressById
   */
  syncGoalRenderState(horses, progressById) {
    if (!progressById) return;
    const poses = new Map();
    horses.forEach(horse => {
      const progress = progressById.get(horse.id);
      if (!Number.isFinite(progress)) return;
      const lane = Math.max(1, Math.min(CONFIG.LANE_COUNT, horse.y ?? 1));
      const cy = this.progressToY(progress);
      const cx = this.laneToX(lane);
      poses.set(horse.id, { cx, cy, baseCy: cy });
    });
    this.horseRenderState = arrangeHorsePoses(poses, this.getHorseClearance());
  }

  getHorseClearance() {
    return horseClearance(this.cardW, this.cardH);
  }

  xToLane(x) {
    return 0.5 + (this.innerRailSide === 'left'
      ? x - this.RAIL_MARGIN : this.W - this.RAIL_MARGIN - x) / this.laneW;
  }

  // Lane1=最内（innerRailSide に応じて左右反転）
  laneToX(lane) {
    const idx = lane - 1;
    if (this.innerRailSide === 'left') {
      return this.RAIL_MARGIN + (idx + 0.5) * this.laneW;
    }
    return this.W - this.RAIL_MARGIN - (idx + 0.5) * this.laneW;
  }

  // progress=0 → 下（スタート）、progress=1 → 上（ゴール）
  progressToY(progress) {
    const topMargin    = 20;
    const bottomMargin = 20;
    const usableH      = this.H - topMargin - bottomMargin;
    return this.H - bottomMargin - progress * usableH;
  }

  yToProgress(y) {
    const topMargin    = 20;
    const bottomMargin = 20;
    const usableH      = this.H - topMargin - bottomMargin;
    return (this.H - bottomMargin - y) / Math.max(1, usableH);
  }

  /**
   * 描画サイズをもとに、シミュレーション/描画で使う非接触しきい値を返す。
   * @param {number} xSpan - main.js 側と同じ x スパン
   * @param {object|null} phase - フェーズ情報（横方向間隔の補正に使用）
   */
  getCollisionMetrics(xSpan = 140, phase = null) {
    const topMargin = 20;
    const bottomMargin = 20;
    const usableH = this.H - topMargin - bottomMargin;
    const pxPerXUnit = usableH / Math.max(1, xSpan);

    // 接触判定と描画の馬体寸法を揃える。序盤だけ幅を縮めると、
    // AIが通れると判断した場所で描画側が押し戻し続けてしまう。
    const safeForwardPx = this.cardH * 1.10 + 4;
    const safeLateralPx = this.cardW * 1.12;
    const isEarlyPhase = Number.isFinite(phase?.index) && phase.index <= 1;
    const earlyXMult = isEarlyPhase ? 1.08 : 1.0;
    const earlyYMult = isEarlyPhase ? 1.10 : 1.0;

    return {
      minXGap: (safeForwardPx * earlyXMult) / Math.max(0.001, pxPerXUnit),
      minYGap: (safeLateralPx * earlyYMult) / Math.max(0.001, this.laneW),
      drawNearLaneGap: safeLateralPx / Math.max(0.001, this.laneW),
      drawNearXGap: safeForwardPx / Math.max(0.001, pxPerXUnit),
      drawCardSpacingPx: safeForwardPx + 2,
    };
  }

  getPhaseName(phase) {
    if (phase.isFinal)    return PHASE_NAMES.final;
    if (phase.segmentLabel) return phase.segmentLabel;
    if (phase.index === 0) return PHASE_NAMES.start;
    if (phase.isCorner) {
      const r = phase.ratio;
      if (r < 0.3)  return PHASE_NAMES.corner1;
      if (r < 0.5)  return PHASE_NAMES.corner2;
      if (r < 0.7)  return PHASE_NAMES.corner3;
      return PHASE_NAMES.corner4;
    }
    const r = phase.ratio;
    if (r < 0.2)  return 'スタート〜1コーナー手前';
    if (r < 0.45) return PHASE_NAMES.back;
    if (r < 0.65) return '3〜4コーナー中間';
    return '4コーナー〜直線';
  }

  draw(horses, phase, phaseProgress = 1, options = {}) {
    recordDisplayDiagnostic('draw');
    this._lastDraw = { horses, phase, phaseProgress, options };
    if (!(this.W > 1 && this.H > 1) || !this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this._drawBackground(phase);
    this._drawLanes(phase);
    const trackScrollY = this._resolveTrackScrollY(options);
    this._drawRails(trackScrollY);
    const gateOpenProgress = options.gateOpenProgress ?? (phaseProgress > 0 ? 1 : 0);
    const gateYOffset = options.gateYOffset ?? 0;
    const gateOpacity = options.gateOpacity ?? 1;
    const fieldSize = horses?.length ?? 0;
    const forceStartLineup = Boolean(options.forceStartLineup);
    const inGateView = phase.index === 0 && (phaseProgress === 0 || forceStartLineup);
    if (inGateView) {
      this._drawStartingGate(phase, gateOpenProgress, 'back', gateYOffset, gateOpacity, fieldSize);
    } else {
      this._drawStartingGate(phase, gateOpenProgress, 'full', gateYOffset, gateOpacity, fieldSize);
    }
    const furlongLayout = options.furlong
      ? this._drawFurlongMarkers(options.furlong.t ?? 0)
      : null;
    const drawOptions = { ...options };
    if (drawOptions.goalRun && furlongLayout) {
      drawOptions.goalRun = { ...drawOptions.goalRun, ...furlongLayout };
    }
    this._drawPhaseLabel(phase, options.phaseLabel);
    this._drawHorses(horses, phase, phaseProgress, forceStartLineup, drawOptions);
    if (options.goalLine !== undefined) {
      this._drawGoalBandAtTop(options.goalLine, furlongLayout);
    }
    if (inGateView) {
      this._drawStartingGate(phase, gateOpenProgress, 'front', gateYOffset, gateOpacity, fieldSize);
    }
    if (options.sceneTransition) {
      this._drawSceneTransition(options.sceneTransition);
    }
  }

  _drawBackground(phase) {
    const ctx  = this.ctx;
    const base = TRACK_BASE_COLOR[this.track] ?? TRACK_BASE_COLOR['芝'];
    const lOff = CONDITION_L_OFFSET[this.condition] ?? 0;
    const l    = base.l + lOff;
    const color1 = `hsl(${base.h}, ${base.s}%, ${l + 3}%)`;
    const color2 = `hsl(${base.h}, ${base.s - 5}%, ${l}%)`;
    const grad = ctx.createLinearGradient(0, this.H, 0, 0);
    grad.addColorStop(0, color2);
    grad.addColorStop(1, color1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);
    if (this.track === '芝' && (this.condition === '重' || this.condition === '不良')) {
      this._drawRoughPatches();
    }
  }

  _drawRoughPatches() {
    const ctx = this.ctx;
    let seed = 42;
    const rand = () => {
      seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
      return (seed >>> 0) / 0xFFFFFFFF;
    };
    ctx.fillStyle = 'rgba(100,70,30,0.22)';
    for (let i = 0; i < 18; i++) {
      const x = rand() * this.W;
      const y = rand() * this.H;
      const r = 12 + rand() * 28;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawLanes(phase) {
    const ctx = this.ctx;
    for (let lane = 1; lane <= CONFIG.LANE_COUNT; lane++) {
      const left = this._laneLeftX(lane);
      if (phase.isCorner && lane >= 5) {
        const alpha = (lane - 4) * 0.055;
        ctx.fillStyle = `rgba(234,179,8,${alpha})`;
        ctx.fillRect(left, 0, this.laneW, this.H);
      }
      // レール付近の境界線は描かず、レールの実線を目立たせる
      if (lane === CONFIG.LANE_COUNT) continue;
      const boundaryX = this.innerRailSide === 'right'
        ? left
        : (left + this.laneW);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(boundaryX, 0);
      ctx.lineTo(boundaryX, this.H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _resolveTrackScrollY(options = {}) {
    if (CONFIG.TRACK_RAIL_SCROLL_ENABLED === false) return 0;
    if (options.goalRun) return 0;
    const scrollY = Number(options.trackScrollY);
    return Number.isFinite(scrollY) && scrollY >= 0 ? scrollY : 0;
  }

  _drawRails(trackScrollY = 0) {
    const ctx = this.ctx;
    const innerRailX = this._getRailX('inner');
    const outerRailX = this._getRailX('outer');
    const innerOutwardSign = this.innerRailSide === 'right' ? 1 : -1;
    const outerOutwardSign = -innerOutwardSign;
    const rails = [
      { x: innerRailX, postOffset: innerOutwardSign * 8 },
      { x: outerRailX, postOffset: outerOutwardSign * 8 },
    ];

    const postInterval = 48;
    const postW = 5;
    const postH = 14;
    const scrollOffset = trackScrollY % postInterval;

    rails.forEach(({ x, postOffset }) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth   = 4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.H);
      ctx.stroke();

      const postX = x + postOffset - postW / 2;
      const startY = 10 + scrollOffset - postInterval;
      for (let y = startY; y < this.H + postInterval; y += postInterval) {
        ctx.fillStyle = '#1a4a1a';
        ctx.fillRect(postX, y, postW, postH);
      }
    });
  }

  _drawFurlongMarkers(t) {
    const y2 = this.H - 28;
    const goalY = this.H * 0.08;
    return { y2, goalY };
  }

  _drawGoalBandAtTop(t, furlongLayout = null) {
    const ctx = this.ctx;
    // 表示後は最上部付近に固定する（ライン自体は移動しない）。
    const y = this.H * 0.08;
    if (y < -20 || y > this.H + 26) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(59,130,246,0.98)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(this.RAIL_MARGIN, y);
    ctx.lineTo(this.W - this.RAIL_MARGIN, y);
    ctx.stroke();
    ctx.restore();
  }

  _drawSceneTransition(transition) {
    const tRaw = Number.isFinite(transition?.t) ? transition.t : 0;
    if (tRaw <= 0 || tRaw >= 1) return;
    const t = Math.max(0, Math.min(1, tRaw));
    const maxAlpha = Number.isFinite(transition?.maxAlpha)
      ? Math.max(0, Math.min(1, transition.maxAlpha))
      : 0.4;
    // 前半で暗転し、後半で戻すシンプルなカット演出（Preset A）。
    const alpha = Math.sin(t * Math.PI) * maxAlpha;
    if (alpha <= 0.001) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  // フェーズ名ラベル（DOMの#phase-indicatorとは別に盤面中央に描画）
  _drawPhaseLabel(phase, overrideLabel = null) {
    const ctx  = this.ctx;
    const name = overrideLabel ?? this.getPhaseName(phase);
    const fontPx = Math.max(30, this.W * 0.078);
    ctx.save();
    ctx.font = `bold ${fontPx}px 'Courier New'`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = this.W / 2;
    const cy = this.H / 2 + 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.26)';
    ctx.lineWidth = Math.max(2.5, fontPx * 0.07);
    ctx.lineJoin = 'round';
    ctx.strokeText(name, cx, cy);
    ctx.fillStyle = 'rgba(255,252,248,0.58)';
    ctx.fillText(name, cx, cy);
    ctx.restore();
  }

  _drawHorses(horses, phase, phaseProgress, forceStartLineup = false, options = {}) {
    const inStartLineup = phaseProgress === 0 || forceStartLineup;
    const isGoalRun = Boolean(options.goalRun);
    const span = Math.max(140, ...horses.map(h => h.x));
    const targets = new Map(horses.map(horse => {
      const lane = inStartLineup ? calcGateSlotLane(horse.gate ?? 1)
        : Math.max(1, Math.min(CONFIG.LANE_COUNT, horse.y));
      let progress = Math.pow(Math.max(0, Math.min(1, horse.x / span)), 0.82) * phaseProgress;
      if (isGoalRun) {
        progress = options.goalRun.progressById?.get(horse.id)
          ?? ((horse.goalStartProgress ?? 0.2)
            + (horse.goalMeters ?? 0) / (options.goalRun.distanceMeters ?? 200)
              * (options.goalRun.progressSpan ?? 0.64) * (horse.goalProgressScale ?? 1));
      } else {
        if (options.goalClimb) {
          const weight = Math.max(0, Math.min(1, options.goalClimb.byId?.get(horse.id) ?? 0.5));
          progress += Math.max(0, Math.min(1, options.goalClimb.t ?? 0)) * 0.35 * (0.4 + weight * 0.6);
        }
        progress = Math.max(-0.25, Math.min(0.95, progress * 0.90 + 0.02));
        if (phase.index === 0) {
          // 通常走行の下端ではなくゲート内から発進し、区間末で通常の座標式に合流する。
          // 基準位置の段差をカメラ後退と誤認し、隊列全体を下げていたのを防ぐ。
          const gateProgress = this.yToProgress(this._getStartInGateCy());
          progress = Math.max(gateProgress,
            progress + (gateProgress - 0.02) * Math.max(0, 1 - phaseProgress));
        }
      }
      const cy = inStartLineup ? this._getStartInGateCy() : this.progressToY(progress);
      return [horse.id, { cx: this.laneToX(lane), cy, baseCy: cy }];
    }));

    // 先頭基準の表示倍率変化による後退は、隊列全体の同じカメラ移動として扱う。
    // 個体ごとの押し戻しを混ぜると、安全だった間隔を再び潰してしまう。
    let cameraShift = 0;
    if (!inStartLineup && !isGoalRun) {
      const shifts = [...targets].map(([id, target]) => {
        const prev = this.horseRenderState.get(id);
        return Number.isFinite(prev?.baseCy) ? target.baseCy - prev.baseCy : 0;
      }).sort((a, b) => a - b);
      cameraShift = phase.index === 0 ? 0 : Math.max(0, shifts[Math.floor(shifts.length / 2)] ?? 0);
      const dt = Math.max(0, Math.min(80, options.motionDtMs ?? 16.7)) / 1000;
      targets.forEach((target, id) => {
        const prev = this.horseRenderState.get(id);
        if (!Number.isFinite(prev?.baseCy)) return;
        // 詰まりが解消しても、遅れを一気に取り返して前へ飛び出さない。
        const advance = Math.max(0, prev.baseCy - target.baseCy) + this.cardH * 0.8 * dt;
        target.cy = Math.max(target.cy, prev.cy + cameraShift - advance);
      });
    }
    const poses = advanceHorsePoses(this.horseRenderState, targets, this.getHorseClearance(), {
      dtMs: options.horseSmoothing === 0 ? 0 : options.motionDtMs,
      maxLateralSpeed: this.laneW * 2,
      maxForwardSpeed: this.H * 0.8,
      cameraShift,
    });
    this.horseRenderState = poses;
    [...horses].sort((a, b) => a.x - b.x).forEach(horse => {
      const pose = poses.get(horse.id);
      if (pose && Number.isFinite(pose.cx) && Number.isFinite(pose.cy)) {
        this._drawCard(horse, pose.cx, pose.cy);
      }
    });
  }

  // スタート時：各ゲート枠の中央に整列
  _drawHorsesAtStart(horses) {
    const horseY = this._getStartInGateCy();
    const sorted = [...horses].sort((a, b) => (a.gate ?? a.id) - (b.gate ?? b.id));
    sorted.forEach(horse => {
      const lane = calcGateSlotLane(horse.gate ?? 1);
      const cx = this.laneToX(lane);
      this._drawCard(horse, cx, horseY);
    });
  }

  _getGateGeometry() {
    // コース下端余白（progressToY の bottomMargin）に揃え、枠線のはみ出しで見切れないようにする
    const bottomMargin = 20;
    const gateY = this.H - bottomMargin;
    const gateH = Math.max(34, this.H * 0.082);
    return { gateY, gateH };
  }

  _getStartInGateCy() {
    const { gateY, gateH } = this._getGateGeometry();
    const gateTop = gateY - gateH;
    // 馬体中央をゲートの内部に寄せて、待機時に「ゲート内」に見える位置に固定する
    return gateTop + gateH * 0.46;
  }

  _getStartFrontCy() {
    const { gateY, gateH } = this._getGateGeometry();
    const gateTop = gateY - gateH;
    // ゲートを出た直後の見た目位置（必ずゲート前方=画面上側）
    return gateTop - this.cardH * 0.30;
  }

  _drawStartingGate(phase, gateOpenProgress, layer = 'full', gateYOffset = 0, gateOpacity = 1, fieldSize = 0) {
    if (phase.index !== 0 && gateOpenProgress >= 1) return;
    const ctx = this.ctx;
    const { gateY: baseGateY, gateH } = this._getGateGeometry();
    const gateY = baseGateY + gateYOffset;
    const open = Math.max(0, Math.min(1, gateOpenProgress));
    const drawBack = layer === 'full' || layer === 'back';
    const drawFront = layer === 'full' || layer === 'front';
    const activeFrameColor = '#8ea0ad';
    const inactiveFrameColor = '#6a7580';
    const activeBarColor = '#5c6e7b';
    const inactiveBarColor = '#4a5560';
    const closedDoorColor = { r: 47, g: 58, b: 68 };
    const openDoorColor = { r: 36, g: 118, b: 46 };
    const activePlateColor = '#c9a646';
    const inactivePlateColor = '#7a8490';
    const leftX = this.RAIL_MARGIN;
    const rightX = this.W - this.RAIL_MARGIN;
    const slotCount = CONFIG.LANE_COUNT;
    const activeSlots = Math.max(0, Math.min(slotCount, Math.round(fieldSize)));

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, gateOpacity));
    if (drawFront) {
      ctx.strokeStyle = 'rgba(220,232,240,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(leftX, gateY - gateH - 4);
      ctx.lineTo(rightX, gateY - gateH - 4);
      ctx.stroke();
    }

    const firstLane = calcGateSlotLane(1);
    const secondLane = calcGateSlotLane(2);
    const cellW = Math.max(this.laneW * 0.58, Math.abs(this.laneToX(secondLane) - this.laneToX(firstLane)) * 0.92);
    for (let gate = 1; gate <= slotCount; gate++) {
      const isActive = gate <= activeSlots;
      const lane = calcGateSlotLane(gate);
      const xLeft = this.laneToX(lane) - cellW / 2;

      if (drawBack) {
        ctx.fillStyle = isActive ? activeFrameColor : inactiveFrameColor;
        ctx.fillRect(xLeft, gateY - gateH, cellW, gateH);
        ctx.strokeStyle = isActive ? 'rgba(15,24,30,0.65)' : 'rgba(15,24,30,0.38)';
        ctx.lineWidth = 1;
        ctx.strokeRect(xLeft, gateY - gateH, cellW, gateH);
      }

      const doorH = gateH * 0.63;
      const doorTop = gateY - gateH + 4;
      const doorX = xLeft + cellW * 0.08;
      const doorW = cellW * 0.84;
      const dr = Math.round(closedDoorColor.r + (openDoorColor.r - closedDoorColor.r) * open);
      const dg = Math.round(closedDoorColor.g + (openDoorColor.g - closedDoorColor.g) * open);
      const db = Math.round(closedDoorColor.b + (openDoorColor.b - closedDoorColor.b) * open);
      const doorAlphaBase = isActive ? 1 : 0.55;
      const doorAlpha = Math.min(0.38, Math.max(0.08, (1 - open * 0.92) * doorAlphaBase));

      if (drawFront) {
        ctx.fillStyle = `rgba(${dr},${dg},${db},${doorAlpha})`;
        ctx.fillRect(doorX, doorTop, doorW, doorH);

        ctx.fillStyle = isActive ? activeBarColor : inactiveBarColor;
        const barH = 6;
        const barTop = Math.min(gateY - gateH + doorH + 7, gateY - barH - 1);
        ctx.fillRect(xLeft + cellW * 0.12, barTop, cellW * 0.76, barH);

        const plateW = Math.max(8, cellW * 0.46);
        const plateH = 12;
        const plateX = xLeft + (cellW - plateW) / 2;
        const plateY = gateY - gateH - 16;
        ctx.fillStyle = isActive ? activePlateColor : inactivePlateColor;
        this._roundRect(ctx, plateX, plateY, plateW, plateH, 3);
        ctx.fill();

        ctx.fillStyle = '#1f2932';
        ctx.font = `bold ${Math.max(9, cellW * 0.24)}px 'Courier New'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(gate), xLeft + cellW / 2, plateY + plateH / 2 + 0.5);
      }
    }

    if (drawFront) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(leftX, gateY - 1);
      ctx.lineTo(rightX, gateY - 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 馬カード（ミニアイコン寄り: 上から見た馬体）
  _drawCard(horse, cx, cy) {
    const ctx = this.ctx;
    const cw  = this.cardW;
    const ch  = this.cardH;
    if (!isFinite(cx) || !isFinite(cy) || cw < 4 || ch < 4) return;

    const frameColor = getWakuFrameColor(horse.waku);
    const bodyW      = cw * 0.88;
    const bodyH      = ch * 0.74;
    const headW      = cw * 0.50;
    const headH      = ch * 0.18;

    // 胴体（shadowBlur は Safari で毎フレーム点滅するため使わない）
    ctx.fillStyle   = frameColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ch * 0.04, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // 頭（進行方向側）
    ctx.fillStyle = frameColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - ch * 0.40, headW / 2, headH / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // 脚（ミニマルな4本線）
    ctx.strokeStyle = 'rgba(0,0,0,0.40)';
    ctx.lineWidth   = Math.max(1, cw * 0.10);
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.22, cy - bodyH * 0.12);
    ctx.lineTo(cx - bodyW * 0.30, cy + bodyH * 0.22);
    ctx.moveTo(cx + bodyW * 0.22, cy - bodyH * 0.12);
    ctx.lineTo(cx + bodyW * 0.30, cy + bodyH * 0.22);
    ctx.moveTo(cx - bodyW * 0.18, cy + bodyH * 0.12);
    ctx.lineTo(cx - bodyW * 0.26, cy + bodyH * 0.42);
    ctx.moveTo(cx + bodyW * 0.18, cy + bodyH * 0.12);
    ctx.lineTo(cx + bodyW * 0.26, cy + bodyH * 0.42);
    ctx.stroke();

    // 輪郭
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = Math.max(1, cw * 0.08);
    ctx.beginPath();
    ctx.ellipse(cx, cy + ch * 0.04, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 馬番（背中中央）
    const gateStr  = String(horse.gate ?? '');
    const numSize  = Math.min(Math.max(11, cw * 0.54), ch * 0.65);
    const textColor = (frameColor === '#FFFFFF' || frameColor === '#FFFF00') ? '#000' : '#fff';
    ctx.fillStyle  = textColor;
    ctx.font       = `bold ${numSize}px 'Courier New'`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gateStr, cx, cy + ch * 0.05, cw * 0.96);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  _roundRect(ctx, x, y, w, h, r) {
    const mr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + mr, y);
    ctx.lineTo(x + w - mr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + mr);
    ctx.lineTo(x + w, y + h - mr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - mr, y + h);
    ctx.lineTo(x + mr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - mr);
    ctx.lineTo(x, y + mr);
    ctx.quadraticCurveTo(x, y, x + mr, y);
    ctx.closePath();
  }
}
