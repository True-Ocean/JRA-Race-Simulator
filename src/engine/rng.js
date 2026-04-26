/**
 * Mulberry32 シード付き乱数生成器
 * 同じ seed を渡すと、常に同じ乱数列が得られる（再現性保証）
 */
export function createRng(seed) {
  let s = seed >>> 0; // 符号なし32bit整数に変換
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * [min, max] の範囲で整数乱数を返す
 */
export function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * [min, max] の範囲で浮動小数乱数を返す
 */
export function randFloat(rng, min, max) {
  return rng() * (max - min) + min;
}