function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** inner 以内は 1、outer 以上は 0。その間は連続に減衰する。 */
function influence(gap, inner, outer) {
  if (gap <= inner) return 1;
  if (gap >= outer) return 0;
  const span = outer - inner;
  if (!(span > 1e-6)) return 0;
  return 1 - smoothstep((gap - inner) / span);
}

function isAhead(a, b) {
  if (a.x !== b.x) return a.x > b.x;
  return a.id < b.id;
}

/**
 * 画面上の馬カードが重ならないよう、後方の馬だけを連続量で後ろへずらす。
 * 先頭馬の基準位置は動かさない。横方向の追い抜き中は小さな横ずれを足す。
 *
 * @param {Array<{ id: number, x: number, lane: number, baseY: number }>} entries
 * @param {{
 *   cardSpacing?: number,
 *   nearLaneGap?: number,
 *   nearXGap?: number,
 *   maxLateralNudge?: number,
 * }} options
 * @returns {Map<number, { y: number, xNudge: number }>}
 */
export function resolveHorseCardPlacement(entries, options = {}) {
  const cardSpacing = Math.max(0, options.cardSpacing ?? 0);
  const nearLaneGap = Math.max(0.001, options.nearLaneGap ?? 1);
  const nearXGap = Math.max(0.001, options.nearXGap ?? 1);
  const maxLateralNudge = Math.max(0, options.maxLateralNudge ?? 0);
  const nodes = (entries ?? []).map(entry => ({
    id: entry.id,
    x: entry.x,
    lane: entry.lane,
    y: entry.baseY,
    baseY: entry.baseY,
    nudge: 0,
  }));
  const result = new Map(nodes.map(node => [node.id, { y: node.baseY, xNudge: 0 }]));
  if (nodes.length < 2 || cardSpacing <= 0) return result;

  const laneInner = nearLaneGap * 0.45;
  const xInner = nearXGap * 0.28;

  for (let iter = 0; iter < 12; iter += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const laneInf = influence(Math.abs(a.lane - b.lane), laneInner, nearLaneGap);
        const xInf = influence(Math.abs(a.x - b.x), xInner, nearXGap);
        const strength = Math.min(laneInf, xInf);
        if (strength < 0.02) continue;
        const required = cardSpacing * strength;
        const lead = isAhead(a, b) ? a : b;
        const trail = lead === a ? b : a;
        const gap = trail.y - lead.y;
        if (gap >= required - 0.05) continue;
        trail.y += required - gap;
        moved = true;
      }
    }
    if (!moved) break;
  }

  if (maxLateralNudge > 0) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const laneInf = influence(Math.abs(a.lane - b.lane), laneInner, nearLaneGap);
        const xInf = influence(Math.abs(a.x - b.x), xInner, nearXGap);
        const strength = Math.min(laneInf, xInf);
        if (strength < 0.35) continue;
        const lead = isAhead(a, b) ? a : b;
        const trail = lead === a ? b : a;
        const side = Math.sign(trail.lane - lead.lane) || (trail.id > lead.id ? 1 : -1);
        const amount = maxLateralNudge * strength;
        trail.nudge += side * amount;
        lead.nudge -= side * amount * 0.45;
      }
    }
  }

  nodes.forEach(node => {
    const nudge = Math.max(-maxLateralNudge, Math.min(maxLateralNudge, node.nudge));
    result.set(node.id, { y: node.y, xNudge: nudge });
  });
  return result;
}

/**
 * 間隔補正をフレーム間で追従させる。目標が跳んでも描画位置は連続に動く。
 * @param {{ y: number, x: number } | null | undefined} prev
 * @param {{ y: number, x: number }} target
 * @param {number} [dtMs]
 * @param {{ tauY?: number, tauX?: number }} [timing]
 */
export function easeCardAdjust(prev, target, dtMs, timing = undefined) {
  if (!prev || !Number.isFinite(prev.y) || !Number.isFinite(prev.x)) {
    return { y: target.y, x: target.x };
  }
  const dt = Number.isFinite(dtMs) ? dtMs : 16.7;
  if (dt <= 0) return { y: prev.y, x: prev.x };
  const tauY = Number.isFinite(timing?.tauY) ? timing.tauY : (Number.isFinite(timing) ? timing : 130);
  const tauX = Number.isFinite(timing?.tauX) ? timing.tauX : 45;
  const ky = 1 - Math.exp(-Math.min(dt, 80) / Math.max(1, tauY));
  const kx = 1 - Math.exp(-Math.min(dt, 80) / Math.max(1, tauX));
  return {
    y: prev.y + (target.y - prev.y) * ky,
    x: prev.x + (target.x - prev.x) * kx,
  };
}
