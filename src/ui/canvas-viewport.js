/** レイアウト未確定（0×0）とみなす下限 */
export const MIN_CANVAS_LAYOUT_PX = 2;

/** これ未満の幅・高さ変化ではビットマップを張り替えない（1px 振動で点滅するため） */
export const CANVAS_RESIZE_TOLERANCE_PX = 2;

/** バックグラウンド復帰時に 1 フレームへ載せられる最大経過 ms */
export const MAX_ANIMATION_FRAME_MS = 50;

export function isDocumentHidden(doc = typeof document !== 'undefined' ? document : null) {
  return Boolean(doc?.hidden);
}

/**
 * Canvas のビットマップを張り替えるべきか。
 * 同じ width/height を再代入すると内容が消えるため、変化がないときは false。
 */
export function shouldApplyCanvasResize(prev, next) {
  const w = Number(next?.w);
  const h = Number(next?.h);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return false;
  if (w < MIN_CANVAS_LAYOUT_PX || h < MIN_CANVAS_LAYOUT_PX) return false;
  const dpr = Number(next?.dpr);
  if (prev && prev.dpr === dpr && prev.w >= MIN_CANVAS_LAYOUT_PX && prev.h >= MIN_CANVAS_LAYOUT_PX) {
    if (
      Math.abs(prev.w - w) < CANVAS_RESIZE_TOLERANCE_PX
      && Math.abs(prev.h - h) < CANVAS_RESIZE_TOLERANCE_PX
    ) {
      return false;
    }
  }
  return true;
}

export function clampAnimationDtMs(dtMs, maxMs = MAX_ANIMATION_FRAME_MS) {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  const cap = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : MAX_ANIMATION_FRAME_MS;
  return Math.min(cap, dtMs);
}

/**
 * リサイズ前後の座標をスケール。極端な縦横比変化では破棄してスナップ描画に任せる。
 * @param {Map<number, { cx?: number, cy?: number }>} stateMap
 */
export function scaleHorseRenderPositions(stateMap, prevW, prevH, nextW, nextH) {
  if (!(stateMap instanceof Map) || stateMap.size === 0) return;
  if (!(prevW > 1 && prevH > 1 && nextW > 1 && nextH > 1)) {
    stateMap.clear();
    return;
  }
  const sx = nextW / prevW;
  const sy = nextH / prevH;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    stateMap.clear();
    return;
  }
  if (sx < 0.4 || sx > 2.5 || sy < 0.4 || sy > 2.5) {
    stateMap.clear();
    return;
  }
  stateMap.forEach((state) => {
    if (!state) return;
    if (Number.isFinite(state.cx)) state.cx *= sx;
    if (Number.isFinite(state.cy)) state.cy *= sy;
    if (Number.isFinite(state.baseCy)) state.baseCy *= sy;
  });
}
