import { CONFIG } from '../config.js';
import { calcWeightStaminaMult } from './horse-utils.js';
import { calcCareerDrainMult } from './stamina-drain.js';
import { resolveGoalClassIndex } from './career-goal.js';

/** 隊列形成期の脚質ベース巡航（馬群内差を小さく保つ） */
const STYLE_FORMATION_CRUISE = {
  '大逃げ': 52,
  '逃げ': 50,
  '先行': 48,
  '差し': 46,
  '追込': 44,
};

/**
 * 頭数に応じてJRA式の枠番（1-8）を算出する
 * JRAの公式ルールに基づく馬番→枠番マッピング
 * @param {number} gate - 馬番（1始まり）
 * @param {number} total - 出走頭数
 * @returns {number} 枠番（1〜8）
 */
export function calcWaku(gate, total) {
  // JRAの枠番割り当てルール:
  // - 基本は8枠で、各枠に馬を後ろの枠から順に2頭ずつ積み上げる
  // - 余り頭数 = total - 8
  // - 余りを8枠→7枠→…の順に2頭ずつ割り当て（端数は最後の枠に）
  // 例) 12頭: 余り4頭 → 8枠+2頭, 7枠+2頭
  //     18頭: 余り10頭 → 8枠+2頭, 7枠+2頭, 6枠+2頭, 5枠+2頭, 4枠+2頭
  //           → 結果: 1〜4枠=1頭, 5〜8枠=2頭  ※18頭は7,8枠が3頭になる特殊ケース
  //
  // 正確には: 余りを後ろの枠から2頭ずつ割り当て、
  // さらに余りが残れば再び後ろの枠から積み増す（1枠あたり最大3頭まで）

  if (total <= 8) return gate;

  // 各枠の収容数を計算する（1始まりの配列、インデックス1〜8を使用）
  const capacity = new Array(9).fill(1); // 全枠まず1頭
  let extra = total - 8;

  // 後ろの枠から順に1頭ずつ追加していく（最大3頭/枠）
  for (let round = 0; extra > 0; round++) {
    for (let w = 8; w >= 1 && extra > 0; w--) {
      if (capacity[w] < 3) {
        capacity[w]++;
        extra--;
      }
    }
  }

  // 馬番から枠番を逆引き
  let assigned = 0;
  for (let w = 1; w <= 8; w++) {
    assigned += capacity[w];
    if (gate <= assigned) return w;
  }
  return 8; // フォールバック
}

/**
 * 全馬のパラメータを計算して返す（DB由来ベース値。ユーザー調整は rating-adjustments.js）
 * @param {Object} raceData - 入力JSON
 * @returns {Array} 計算済み馬オブジェクトの配列
 */
export function calcAllParams(raceData) {
  const entries = raceData.entries;

  // 全馬の最速値を取得（小さいほど速い）
  const ave3fValues = entries.map(e => e.horse.ave_3f).filter(Number.isFinite);
  const last3fValues = entries.map(e => e.horse.last_3f).filter(Number.isFinite);
  const minAve3f  = Math.min(...ave3fValues);
  const maxAve3f  = Math.max(...ave3fValues);
  const minLast3f = Math.min(...last3fValues);
  const maxLast3f = Math.max(...last3fValues);
  const ave3fSpan = Math.max(0.001, maxAve3f - minAve3f);
  const last3fSpan = Math.max(0.001, maxLast3f - minLast3f);

  return entries.map((entry, idx) => {
    const id     = idx;
    const horse  = entry.horse;
    const jockey = entry.jockey;

    const normalize = v => Math.max(0, Math.min(100, v));
    const scaleRate = (value, min, max) => normalize(((value - min) / (max - min)) * 100);

    // 3着以内回数 / 全出走数
    const results       = horse.results;
    const top3Count     = results.filter(r => r >= 1 && r <= 3).length;
    const totalRuns     = results.length;
    const horseTop3Rate = totalRuns > 0 ? top3Count / totalRuns : 0;

    // 騎手成績は「勝負に行く力」と「崩さず乗る力」を分けて扱う
    const jockeyWinRate  = Number.isFinite(jockey.win_rate) ? jockey.win_rate : 0;
    const hasJockeyTop3Rate = Number.isFinite(jockey.top3_rate);
    const jockeyTop3Rate = hasJockeyTop3Rate ? jockey.top3_rate : 0.5;
    const winWithinTop3Rate = jockeyWinRate / Math.max(0.01, jockeyTop3Rate);
    const J_reliability  = hasJockeyTop3Rate ? scaleRate(jockeyTop3Rate, 0.30, 0.65) : 50;
    const J_aggression   = hasJockeyTop3Rate
      ? scaleRate(winWithinTop3Rate, 0.25, 0.55)
      : 50;

    // 生スコア: フェーズ別に分離（形成=脚質 / 中盤=Ave-3F / 終盤=上り3F）
    const aveNorm = (maxAve3f - horse.ave_3f) / ave3fSpan;
    const lastNorm = (maxLast3f - horse.last_3f) / last3fSpan;
    const rawPace = (0.35 + aveNorm * 0.65) * 80;
    const rawKick = (0.35 + lastNorm * 0.65) * 80;
    const rawManeuv = jockeyWinRate * 200;
    const rawSustain = (horseTop3Rate * 50) + (0.35 + lastNorm * 0.65) * 30;

    const S_formation = STYLE_FORMATION_CRUISE[horse.style] ?? 47;
    const S_pace = normalize(rawPace);
    const S_kick = normalize(rawKick);
    const S_cruise = S_pace;
    const M_maneuv = normalize(rawManeuv);
    const S_sustain = normalize(rawSustain);

    // スタミナ初期値
    const initialStamina = S_sustain * 2.2;

    // 枠番・枠色の自動付与
    const total = entries.length;
    const waku  = calcWaku(entry.gate, total);
    const color = CONFIG.JRA_WAKU_COLORS[waku] || '#CCCCCC';

    const startLane = calcGateSlotLane(entry.gate);

    const career = horse.career ?? null;
    const classIndex = Number.isFinite(career?.class_index) ? career.class_index : 0.5;
    const goalClassIndex = resolveGoalClassIndex(career);
    const staminaEfficiency = Number.isFinite(career?.stamina_efficiency)
      ? career.stamina_efficiency
      : 0.5;
    const careerDrainMult = calcCareerDrainMult(staminaEfficiency);

    return {
      id,
      gate:           entry.gate,
      waku,
      color,
      name:           horse.name,
      style:          horse.style,
      sexAge:         horse.sex_age ?? '',
      weight:         horse.weight ?? null,
      weightStaminaMult: calcWeightStaminaMult(horse.weight),
      ave3f:          horse.ave_3f,
      last3f:         horse.last_3f,
      last3fRaw:      horse.last_3f_raw ?? horse.last_3f,
      classIndex,
      goalClassIndex,
      staminaEfficiency,
      careerDrainMult,
      careerGraded:   career?.graded ?? null,
      S_formation,
      S_pace,
      S_kick,
      S_cruise,
      M_maneuv,
      S_sustain,
      J_reliability,
      J_aggression,
      // --- 実行時状態（シミュレーション中に変化） ---
      stamina:        initialStamina,
      initialStamina,
      x:              0,
      startLane,
      y:              startLane,
      targetLane:     startLane,
      battlePenalty:  1.0,    // 次フェーズに適用する速度係数
      distanceLoss:   0,      // コーナー距離ロスの累計
      pathMeters:     0,      // 累積走行経路長（m）
      pathAtPhaseStart: 0,
      staminaPathCost: 0,
      battleLosses:   0,      // フェーズ内バトル敗北数（スタミナ消費計算用）
      logs:           [],
    };
  });
}

/**
 * ゲート番号（1〜LANE_COUNT）からレーン位置を算出。
 * 18枠固定グリッドで内埒側（1番）から外埒側（18番）へ等間隔配置。
 */
export function calcGateSlotLane(gate) {
  const laneMax = CONFIG.LANE_COUNT;
  const slotCount = CONFIG.LANE_COUNT;
  const innerMargin = Math.max(0, Number(CONFIG.GATE_LANE_INNER_MARGIN) || 0);
  const outerMargin = Math.max(0, Number(CONFIG.GATE_LANE_OUTER_MARGIN) || 0);
  const usableMin = 1 + innerMargin;
  const usableMax = Math.max(usableMin, laneMax - outerMargin);
  const clampedGate = Math.max(1, Math.min(slotCount, Number(gate) || 1));
  if (slotCount <= 1) return Math.max(1, Math.min(laneMax, usableMin));
  const ratio = (clampedGate - 1) / (slotCount - 1);
  const lane = usableMin + ratio * (usableMax - usableMin);
  return Math.max(1, Math.min(laneMax, lane));
}
