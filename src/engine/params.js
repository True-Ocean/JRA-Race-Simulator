import { CONFIG } from '../config.js';
import { calcWeightStaminaMult } from './horse-utils.js';

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
  const minAve3f  = Math.min(...entries.map(e => e.horse.ave_3f));
  const minLast3f = Math.min(...entries.map(e => e.horse.last_3f));

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

    // 生スコア計算
    const rawCruise  = (minAve3f  / horse.ave_3f)  * 80;
    const rawManeuv  = jockeyWinRate * 200;
    const rawSustain = (horseTop3Rate * 50)
                     + (minLast3f / horse.last_3f)  * 30;

    // [0, 100] に正規化
    const S_cruise  = normalize(rawCruise);
    const M_maneuv  = normalize(rawManeuv);
    const S_sustain = normalize(rawSustain);

    // スタミナ初期値
    const initialStamina = S_sustain * 2.2;

    // 枠番・枠色の自動付与
    const total = entries.length;
    const waku  = calcWaku(entry.gate, total);
    const color = CONFIG.JRA_WAKU_COLORS[waku] || '#CCCCCC';

    const startLane = calcInitialLane(entry.gate, entries.length);

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
 * ゲート番号からY座標（レーン 1.0〜LANE_COUNT）を算出
 * コース左右の余白を持たせたうえで線形マッピング
 */
function calcInitialLane(gate, total) {
  const laneMax = CONFIG.LANE_COUNT;
  const innerMargin = Math.max(0, Number(CONFIG.GATE_LANE_INNER_MARGIN) || 0);
  const outerMargin = Math.max(0, Number(CONFIG.GATE_LANE_OUTER_MARGIN) || 0);
  const usableMin = 1 + innerMargin;
  const usableMax = Math.max(usableMin, laneMax - outerMargin);
  if (total <= 1) return Math.max(1, Math.min(laneMax, usableMin));
  const ratio = (gate - 1) / (total - 1);
  const lane = usableMin + ratio * (usableMax - usableMin);
  return Math.max(1, Math.min(laneMax, lane));
}