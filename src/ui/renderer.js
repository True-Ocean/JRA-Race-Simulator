import { CONFIG } from '../config.js';

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
  final:    '最終直線',
};

// JRA枠色（枠番1〜8）
const JRA_WAKU_COLORS = {
  1: '#FFFFFF',
  2: '#000000',
  3: '#FF0000',
  4: '#0000FF',
  5: '#FFFF00',
  6: '#008000',
  7: '#FF6600',
  8: '#FF5FA2',
};

export class Renderer {
  constructor(canvasId, totalPhases, track = '芝', condition = '良') {
    this.canvas       = document.getElementById(canvasId);
    this.ctx          = this.canvas.getContext('2d');
    this.totalPhases  = totalPhases;
    this.track        = track;
    this.condition    = condition;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const wrap        = this.canvas.parentElement;
    this.W            = wrap.clientWidth;
    this.H            = wrap.clientHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;

    this.RAIL_MARGIN = Math.max(10, this.W * 0.02);
    this.trackW      = this.W - this.RAIL_MARGIN * 2;
    this.laneW       = this.trackW / CONFIG.LANE_COUNT;

    // 実寸比に寄せる（目安: レーン幅3.0mに対して馬体幅1.8m）
    const horseToLaneRatio = 1.8 / 3.0;
    this.cardW = Math.max(14, Math.min(this.laneW * horseToLaneRatio, this.laneW * 0.72));
    // 馬体の長さ/幅 ≒ 4.5m / 1.8m
    this.cardH = this.cardW * (4.5 / 1.8);
  }

  // Lane1=右端（最内）、Lane8=左端（大外）
  laneToX(lane) {
    const idx = lane - 1;
    return this.W - this.RAIL_MARGIN - (idx + 0.5) * this.laneW;
  }

  // progress=0 → 下（スタート）、progress=1 → 上（ゴール）
  progressToY(progress) {
    const topMargin    = 20;
    const bottomMargin = 20;
    const usableH      = this.H - topMargin - bottomMargin;
    return this.H - bottomMargin - progress * usableH;
  }

  getPhaseName(phase) {
    if (phase.segmentLabel) return phase.segmentLabel;
    if (phase.index === 0) return PHASE_NAMES.start;
    if (phase.isFinal)    return PHASE_NAMES.final;
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
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this._drawBackground(phase);
    this._drawLanes(phase);
    this._drawRails();
    const gateOpenProgress = options.gateOpenProgress ?? (phaseProgress > 0 ? 1 : 0);
    const gateYOffset = options.gateYOffset ?? 0;
    const gateOpacity = options.gateOpacity ?? 1;
    const forceStartLineup = Boolean(options.forceStartLineup);
    const inGateView = phase.index === 0 && (phaseProgress === 0 || forceStartLineup);
    if (inGateView) {
      this._drawStartingGate(phase, gateOpenProgress, 'back', gateYOffset, gateOpacity);
    } else {
      this._drawStartingGate(phase, gateOpenProgress, 'full', gateYOffset, gateOpacity);
    }
    // GOALライン・GOALテキストは描画しない
    this._drawHorses(horses, phase, phaseProgress, forceStartLineup);
    if (inGateView) {
      this._drawStartingGate(phase, gateOpenProgress, 'front', gateYOffset, gateOpacity);
    }
    this._drawPhaseLabel(phase);
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
      const x = this.W - this.RAIL_MARGIN - lane * this.laneW;
      if (phase.isCorner && lane >= 5) {
        const alpha = (lane - 4) * 0.055;
        ctx.fillStyle = `rgba(234,179,8,${alpha})`;
        ctx.fillRect(x, 0, this.laneW, this.H);
      }
      // レール付近の境界線は描かず、レールの実線を目立たせる
      if (lane === CONFIG.LANE_COUNT) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _drawRails() {
    const ctx = this.ctx;
    const railRight = this.W - this.RAIL_MARGIN + 2; // 内ラチ
    const railLeft  = this.RAIL_MARGIN - 2;          // 外ラチ
    const rails = [
      { x: railRight, postOffset: +8 }, // コース外側=さらに右
      { x: railLeft,  postOffset: -8 }, // コース外側=さらに左
    ];

    rails.forEach(({ x, postOffset }) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth   = 4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.H);
      ctx.stroke();

      const postInterval = 48;
      const postW = 5, postH = 14;
      const postX = x + postOffset - postW / 2;
      for (let y = 10; y < this.H; y += postInterval) {
        ctx.fillStyle   = '#1a4a1a';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur  = 3;
        ctx.fillRect(postX, y, postW, postH);
        ctx.shadowBlur  = 0;
      }
    });
  }

  // フェーズ名ラベル（DOMの#phase-indicatorとは別に盤面内に薄く1つだけ描画）
  _drawPhaseLabel(phase) {
    const ctx  = this.ctx;
    const name = this.getPhaseName(phase);
    ctx.save();
    ctx.font      = `bold ${Math.max(20, this.W * 0.052)}px 'Courier New'`;
    ctx.fillStyle = 'rgba(240,192,64,0.13)';
    ctx.textAlign = 'center';
    ctx.fillText(name, this.W / 2, this.H / 2 + 10);
    ctx.restore();
  }

  _drawHorses(horses, phase, phaseProgress, forceStartLineup = false) {
    // スタート表示（phaseProgress=0）：馬番順に最内から詰めて横並び
    if (phaseProgress === 0 || forceStartLineup) {
      this._drawHorsesAtStart(horses);
      return;
    }

    const xValues = horses.map(h => h.x);
    const maxX = Math.max(...xValues, 1);
    // フェーズ間の見た目ジャンプを抑えるため、毎フレームの最小値再正規化は行わない。
    const minX = 0;
    const span = Math.max(140, maxX - minX);

    const laneGroups = {};
    horses.forEach(horse => {
      const lane = Math.max(1, Math.min(CONFIG.LANE_COUNT, Math.round(horse.y)));
      if (!laneGroups[lane]) laneGroups[lane] = [];
      laneGroups[lane].push(horse);
    });

    const horseRenderY = new Map();
    Object.keys(laneGroups).forEach(lane => {
      const group = laneGroups[lane];
      group.sort((a, b) => b.x - a.x);
      group.forEach((horse, rankInLane) => {
        const normalized = Math.max(0, Math.min(1, (horse.x - minX) / span));
        const easedProgress = Math.pow(normalized, 0.82);
        const progress = easedProgress * phaseProgress;
        let baseY         = this.progressToY(Math.min(0.93, progress * 0.88 + 0.06));
        const cardSpacing = this.cardH + 14;
        let finalY = baseY;
        for (let prev = 0; prev < rankInLane; prev++) {
          const prevY = horseRenderY.get(group[prev].id);
          if (prevY !== undefined && Math.abs(finalY - prevY) < cardSpacing) {
            finalY = prevY + cardSpacing;
          }
        }
        horseRenderY.set(horse.id, finalY);
      });
    });

    const sortedHorses = [...horses].sort((a, b) => a.x - b.x);
    sortedHorses.forEach(horse => {
      const lane = Math.max(1, Math.min(CONFIG.LANE_COUNT, horse.y));
      const cx   = this.laneToX(lane);
      const rawCy = horseRenderY.get(horse.id) ?? this.progressToY(0.05);
      const cy = rawCy;
      if (!isFinite(cx) || !isFinite(cy)) return;
      this._drawCard(horse, cx, cy);
    });
  }

  // スタート時：各ゲート枠の中央に整列
  _drawHorsesAtStart(horses) {
    const horseY = this._getStartInGateCy();
    const sorted = [...horses].sort((a, b) => (a.gate ?? a.id) - (b.gate ?? b.id));
    sorted.forEach(horse => {
      const lane = Math.max(1, Math.min(CONFIG.LANE_COUNT, horse.gate ?? Math.round(horse.y) ?? 1));
      const cx = this.laneToX(lane);
      this._drawCard(horse, cx, horseY);
    });
  }

  _getGateGeometry() {
    // ゲート下辺を画面最下部に寄せる
    const gateY = this.H - 2;
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

  _drawStartingGate(phase, gateOpenProgress, layer = 'full', gateYOffset = 0, gateOpacity = 1) {
    if (phase.index !== 0 && gateOpenProgress >= 1) return;
    const ctx = this.ctx;
    const { gateY: baseGateY, gateH } = this._getGateGeometry();
    const gateY = baseGateY + gateYOffset;
    const open = Math.max(0, Math.min(1, gateOpenProgress));
    const drawBack = layer === 'full' || layer === 'back';
    const drawFront = layer === 'full' || layer === 'front';
    const frameColor = '#8ea0ad';
    const barColor = '#5c6e7b';
    const closedDoorColor = { r: 47, g: 58, b: 68 };
    const openDoorColor = { r: 36, g: 118, b: 46 };
    const plateColor = '#c9a646';
    const leftX = this.RAIL_MARGIN;
    const rightX = this.W - this.RAIL_MARGIN;

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

    for (let lane = 1; lane <= CONFIG.LANE_COUNT; lane++) {
      const xLeft = this.W - this.RAIL_MARGIN - lane * this.laneW;
      const cellW = this.laneW;

      if (drawBack) {
        ctx.fillStyle = frameColor;
        ctx.fillRect(xLeft, gateY - gateH, cellW, gateH);
        ctx.strokeStyle = 'rgba(15,24,30,0.65)';
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
      const doorAlpha = Math.min(0.38, Math.max(0.08, 1 - open * 0.92));

      if (drawFront) {
        ctx.fillStyle = `rgba(${dr},${dg},${db},${doorAlpha})`;
        ctx.fillRect(doorX, doorTop, doorW, doorH);

        ctx.fillStyle = barColor;
        ctx.fillRect(xLeft + cellW * 0.12, gateY - gateH + doorH + 7, cellW * 0.76, 6);

        ctx.fillStyle = plateColor;
        const plateW = Math.max(8, cellW * 0.46);
        const plateH = 12;
        const plateX = xLeft + (cellW - plateW) / 2;
        const plateY = gateY - gateH - 16;
        this._roundRect(ctx, plateX, plateY, plateW, plateH, 3);
        ctx.fill();

        ctx.fillStyle = '#1f2932';
        ctx.font = `bold ${Math.max(9, cellW * 0.24)}px 'Courier New'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(lane), xLeft + cellW / 2, plateY + plateH / 2 + 0.5);
      }
    }

    if (drawFront) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(leftX, gateY + 1);
      ctx.lineTo(rightX, gateY + 1);
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

    const frameColor = JRA_WAKU_COLORS[horse.waku] ?? '#888';
    const bodyW      = cw * 0.88;
    const bodyH      = ch * 0.74;
    const headW      = cw * 0.50;
    const headH      = ch * 0.18;

    // 胴体
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur  = 4;
    ctx.fillStyle   = frameColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ch * 0.04, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

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
    const numSize  = Math.max(11, cw * 0.54);
    const textColor = (frameColor === '#FFFFFF' || frameColor === '#FFFF00') ? '#000' : '#fff';
    ctx.fillStyle  = textColor;
    ctx.font       = `bold ${numSize}px 'Courier New'`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gateStr, cx, cy + ch * 0.05);

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
