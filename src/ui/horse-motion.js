const EPS = 1e-7;

/** 馬体を囲む矩形。中心間に必要な幅・長さ（余白込み）を全シーンで共有する。 */
export function horseClearance(cardW, cardH) {
  return { width: cardW * 1.08, length: cardH * 1.04 };
}

/** 移動前後だけでなく、2頭の線形移動の途中に馬体が交差するか（連続衝突判定）。 */
export function pathsOverlap(a0, a1, b0, b1, { width, length }) {
  let enter = 0;
  let leave = 1;
  for (const [axis, size] of [['cx', width], ['cy', length]]) {
    const p = a0[axis] - b0[axis];
    const v = (a1[axis] - a0[axis]) - (b1[axis] - b0[axis]);
    const bound = size - EPS;
    if (Math.abs(v) < EPS) {
      if (Math.abs(p) >= bound) return false;
      continue;
    }
    const t0 = (-bound - p) / v;
    const t1 = (bound - p) / v;
    enter = Math.max(enter, Math.min(t0, t1));
    leave = Math.min(leave, Math.max(t0, t1));
    if (enter >= leave - 1e-9) return false;
  }
  // 接して離れる瞬間を浮動小数点誤差で「侵入」と扱うと、追従列が停止してしまう。
  return enter < leave - 1e-9;
}

/** 初期配置・リサイズのみ。重なった初期状態から走り始めないよう、後続を後ろに並べる。 */
export function arrangeHorsePoses(poses, clearance) {
  const placed = new Map();
  [...poses].sort((a, b) => a[1].cy - b[1].cy || a[0] - b[0]).forEach(([id, pose]) => {
    const next = { ...pose };
    for (const front of placed.values()) {
      if (Math.abs(front.cx - next.cx) < clearance.width) {
        next.cy = Math.max(next.cy, front.cy + clearance.length);
      }
    }
    placed.set(id, next);
  });
  return placed;
}

/**
 * AIの希望進路を安全な実移動へ制限する。押し戻しや架空の横回避は行わない。
 * 前方から順に、決定済みの軌跡と未決定の現在地の双方を予約する。
 * 各軌跡は相手の停止にも安全なので、後続を止めても既決定の安全性を壊さない。
 */
export function advanceHorsePoses(previous, targets, clearance, {
  dtMs = 16.7, maxLateralSpeed = Infinity, maxForwardSpeed = Infinity, cameraShift = 0,
} = {}) {
  if (!previous.size) return arrangeHorsePoses(targets, clearance);
  const dt = Math.max(0, Math.min(80, dtMs)) / 1000;
  if (dt === 0) return new Map([...previous].filter(([id]) => targets.has(id)));
  const starts = new Map([...targets].map(([id, target]) => {
    const prev = previous.get(id) ?? target;
    return [id, { ...prev, cy: prev.cy + cameraShift }];
  }));
  const result = new Map();
  const sorted = [...starts].sort((a, b) => a[1].cy - b[1].cy || a[0] - b[0]);
  for (const [id, start] of sorted) {
    const target = targets.get(id);
    const dx = Math.max(-maxLateralSpeed * dt, Math.min(maxLateralSpeed * dt, target.cx - start.cx));
    // カメラ以外の後退はさせない。前が空くまで追従し、空いてから進路を取る。
    const dy = Math.max(-maxForwardSpeed * dt, Math.min(0, target.cy - start.cy));
    const safe = end => sorted.every(([otherId, otherStart]) => otherId === id
      || !pathsOverlap(start, end, otherStart, result.get(otherId) ?? otherStart, clearance));
    const candidate = (vx, vy) => {
      const at = t => ({ cx: start.cx + vx * t, cy: start.cy + vy * t });
      if (safe(at(1))) return at(1);
      let low = 0;
      let high = 1;
      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        if (safe(at(mid))) low = mid;
        else high = mid;
      }
      // 接触境界ぴったりで止めず、ごく小さい余裕を残す。次フレームの
      // 座標変換の丸めで初期侵入と判定され、先頭まで停止するのを防ぐ。
      const buffered = at(Math.max(0, low - 1e-4));
      return safe(buffered) ? buffered : at(low);
    };
    let end = candidate(dx, dy);
    // 斜行先が塞がっていても、直進で安全に追従できるなら前進を続ける。
    if (Math.abs(end.cy - (start.cy + dy)) > EPS && Math.abs(dx) > EPS) {
      const forward = candidate(0, dy);
      if (forward.cy < end.cy - EPS) end = forward;
      // 前が完全に塞がったときは、希望方向へ横に出ることだけを許す。
      if (Math.abs(end.cy - start.cy) < EPS) {
        const lateral = candidate(dx, 0);
        if (Math.abs(lateral.cx - start.cx) > Math.abs(end.cx - start.cx)) end = lateral;
      }
    }
    result.set(id, { ...target, ...end });
  }
  return result;
}
