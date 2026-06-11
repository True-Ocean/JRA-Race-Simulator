export const CONFIG = {
  LANE_COUNT:              18,
  GATE_LANE_INNER_MARGIN:  1.0,
  GATE_LANE_OUTER_MARGIN:  1.0,
  TRACK_RAIL_MARGIN_RATIO: 0.045,
  TRACK_RAIL_MARGIN_MIN:   22,
  LANE_CHANGE_RATE:        0.15,
  BATTLE_BASE_RATE:        0.68,
  BATTLE_SAME_LANE_BONUS:  0.18,
  BATTLE_CROWD_BONUS:      0.28,
  /** ゴールシーンのみ shouldBattle に加算（近接条件は維持） */
  GOAL_BATTLE_RATE_BONUS:  0.14,
  STAMINA_CRITICAL:        0.3,
  STAMINA_MODIFIER_FULL:   1.0,
  STAMINA_MODIFIER_EMPTY:  0.7,
  BATTLE_PENALTY:          0.85,
  BATTLE_STAMINA_COST:     2,
  CORNER_STAMINA_COST:     3,
  ROUGHZONE_STAMINA_MULT:  1.2,
  GOAL_BASE_MS:            3000,
  GOAL_SPREAD_MS:          2000,
  DISPLAY_OFFSET_Y:        0.2,

  /** 本編: 先頭馬の前進に連動してラチ支柱をスクロール（ゴールシーンは常に無効） */
  TRACK_RAIL_SCROLL_ENABLED: true,
  /** 馬 x の想定スパン（renderer の描画正規化と合わせる） */
  TRACK_RAIL_SCROLL_X_SPAN:  140,
  /** スクロール量の微調整係数 */
  TRACK_RAIL_SCROLL_GAIN:    0.88,

  LANE_COEFF: [0, 1.0, 1.0, 1.01, 1.01, 1.02, 1.02, 1.03, 1.03, 1.04, 1.04, 1.05, 1.05, 1.06, 1.06, 1.07, 1.07, 1.08, 1.08],

  // JRA枠番カラー（1〜8枠）
  JRA_WAKU_COLORS: [
    null, "#FFFFFF", "#000000", "#FF0000", "#0000FF", "#FFFF00", "#008000", "#FFA500", "#FF5FA2"
  ],

  TRACK_MODIFIER: {
    '芝':    { '良': 1.0, '稍重': 1.1, '重': 1.2, '不良': 1.35 },
    'ダート': { '良': 1.0, '稍重': 1.05, '重': 1.1, '不良': 1.2 },
  },

  // @deprecated 全行程ペースは廃止（formation.js の隊列形成期ペースを使用）
  STYLE_PACE: {
    '逃げ':  [1.42, 1.26, 1.12, 1.00, 0.90, 0.83, 0.76, 0.70, 0.66], // 序盤優位を明確化しつつ終盤失速
    '大逃げ': [1.50, 1.34, 1.18, 1.03, 0.92, 0.84, 0.76, 0.69, 0.64], // 序盤の先手を強化しつつ中盤以降に失速余地を残す
    '先行':  [1.14, 1.11, 1.08, 1.04, 1.00, 0.96, 0.92, 0.89, 0.88], // 安定先行
    '差し':  [0.88, 0.90, 0.92, 0.98, 1.05, 1.12, 1.18, 1.22, 1.25], // 後半加速
    '追込':  [0.80, 0.82, 0.84, 0.88, 0.95, 1.10, 1.22, 1.35, 1.40], // 終盤爆発
  },
};