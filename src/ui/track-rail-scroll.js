import { CONFIG } from '../config.js';

/** @returns {number|null} */
export function findLeaderX(horses) {
  if (!Array.isArray(horses) || horses.length === 0) return null;
  let maxX = -Infinity;
  for (const horse of horses) {
    const x = Number(horse?.x);
    if (Number.isFinite(x) && x > maxX) maxX = x;
  }
  return Number.isFinite(maxX) ? maxX : null;
}

/** シミュ x 1 単位あたりのラチ支柱スクロール量（px） */
export function calcTrackRailPixelsPerX(renderer) {
  const topMargin = 20;
  const bottomMargin = 20;
  const usableH = renderer.H - topMargin - bottomMargin;
  const span = Number(CONFIG.TRACK_RAIL_SCROLL_X_SPAN) || 140;
  const gain = Number(CONFIG.TRACK_RAIL_SCROLL_GAIN) || 0.88;
  return (usableH / Math.max(1, span)) * gain;
}

export function createTrackRailScrollState() {
  return { scrollY: 0, prevLeaderX: null };
}

export function resetTrackRailScrollState(state) {
  if (!state) return;
  state.scrollY = 0;
  state.prevLeaderX = null;
}

/**
 * 先頭馬のフレーム間 Δx に応じて累積スクロール量を更新する。
 * @param {{ scrollY: number, prevLeaderX: number|null }} state
 * @param {object[]} horses
 * @param {object} renderer
 * @param {{ freeze?: boolean }} [options] - true のときスクロールしない（スタート隊列・ゴール遷移など）
 * @returns {number} 描画用 trackScrollY
 */
export function advanceTrackRailScroll(state, horses, renderer, options = {}) {
  if (!state) return 0;
  const enabled = CONFIG.TRACK_RAIL_SCROLL_ENABLED !== false;
  const freeze = Boolean(options.freeze);
  const leaderX = findLeaderX(horses);

  if (!enabled || freeze) {
    if (freeze && leaderX != null) {
      state.prevLeaderX = leaderX;
    }
    return state.scrollY;
  }

  if (leaderX == null) {
    return state.scrollY;
  }

  if (state.prevLeaderX != null) {
    const deltaX = leaderX - state.prevLeaderX;
    if (deltaX > 1e-6) {
      state.scrollY += deltaX * calcTrackRailPixelsPerX(renderer);
    }
  }
  state.prevLeaderX = leaderX;
  return state.scrollY;
}
