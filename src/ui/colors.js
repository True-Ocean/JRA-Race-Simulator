/** JRA枠色（枠番1〜8）— 出馬表・掲示板・サマリー等のUIバッジ用 */
export const JRA_WAKU_COLORS = {
  1: { bg: '#FFFFFF', text: '#000000', label: '1枠' },
  2: { bg: '#000000', text: '#FFFFFF', label: '2枠' },
  3: { bg: '#FF0000', text: '#FFFFFF', label: '3枠' },
  4: { bg: '#0000FF', text: '#FFFFFF', label: '4枠' },
  5: { bg: '#FFFF00', text: '#000000', label: '5枠' },
  6: { bg: '#008000', text: '#FFFFFF', label: '6枠' },
  7: { bg: '#FF6600', text: '#FFFFFF', label: '7枠' },
  8: { bg: '#FF5FA2', text: '#000000', label: '8枠' },
};

/** Canvas上の馬体枠色（バッジの bg をそのまま使用） */
export function getWakuFrameColor(waku) {
  return JRA_WAKU_COLORS[waku]?.bg ?? '#888';
}
