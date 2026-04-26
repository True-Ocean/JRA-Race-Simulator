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

    this.RAIL_MARGIN = 18;
    this.trackW      = this.W - this.RAIL_MARGIN * 2;
    this.laneW       = this.trackW / CONFIG.LANE_COUNT;

    this.cardW = Math.min(this.laneW * 0.88, 52);
    this.cardH = this.cardW * 1.6;
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

  draw(horses, phase, phaseProgress = 1) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this._drawBackground(phase);
    this._drawLanes(phase);
    this._drawRails();
    // GOALライン・GOALテキストは描画しない
    this._drawHorses(horses, phaseProgress);
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

  _drawHorses(horses, phaseProgress) {
    // スタート表示（phaseProgress=0）：馬番順に最内から詰めて横並び
    if (phaseProgress === 0) {
      this._drawHorsesAtStart(horses);
      return;
    }

    const xValues = horses.map(h => h.x);
    const maxX    = Math.max(...xValues, 1);

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
        const progress    = maxX > 0 ? (horse.x / maxX) * phaseProgress : 0;
        let baseY         = this.progressToY(Math.min(0.93, progress * 0.88 + 0.06));
        const cardSpacing = this.cardH + 4;
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
      const cy   = horseRenderY.get(horse.id) ?? this.progressToY(0.05);
      if (!isFinite(cx) || !isFinite(cy)) return;
      this._drawCard(horse, cx, cy);
    });
  }

  // スタート時：馬番順に最内から詰めて隙間なく横並び
  _drawHorsesAtStart(horses) {
    const startY = this.progressToY(0.04);
    const sorted = [...horses].sort((a, b) => (a.gate ?? a.id) - (b.gate ?? b.id));
    const n      = sorted.length;
    const gap    = 2; // カード間の隙間(px)
    const totalW = n * this.cardW + (n - 1) * gap;
    // 最内レーン(右端)を基準に、右→左方向へ詰めて配置
    const startX = this.W - this.RAIL_MARGIN - this.cardW / 2;
    sorted.forEach((horse, i) => {
      const cx = startX - i * (this.cardW + gap);
      this._drawCard(horse, cx, startY);
    });
  }

  // 馬カード（馬番のみのシンプル表示）
  _drawCard(horse, cx, cy) {
    const ctx = this.ctx;
    const cw  = this.cardW;
    const ch  = this.cardH;
    if (!isFinite(cx) || !isFinite(cy) || cw < 4 || ch < 4) return;

    const frameColor = JRA_WAKU_COLORS[horse.waku] ?? '#888';

    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur  = 5;
    ctx.fillStyle = frameColor;
    this._roundRect(ctx, cx - cw/2, cy - ch/2, cw, ch, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = 1.6;
    this._roundRect(ctx, cx - cw/2, cy - ch/2, cw, ch, 4);
    ctx.stroke();

    // 馬番のみ（中央・見やすく大きめ）
    const gateStr  = String(horse.gate ?? '');
    const numSize  = Math.max(13, cw * 0.56);
    const textColor = (frameColor === '#FFFFFF' || frameColor === '#FFFF00') ? '#000' : '#fff';
    ctx.fillStyle  = textColor;
    ctx.font       = `bold ${numSize}px 'Courier New'`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gateStr, cx, cy + 1);

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
