import { CONFIG } from '../config.js';

/**
 * 頭数に応じてJRA式の枠番（1-8）を算出する
 * JRAの公式ルールに基づく馬番→枠番マッピング
 * @param {number} gate - 馬番（1始まり）
 * @param {number} total - 出走頭数
 * @returns {number} 枠番（1〜8）
 */
function calcWaku(gate, total) {
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
 * 全馬のパラメータを計算して返す
 * @param {Object} raceData - 入力JSON
 * @param {Object} userTweaks - { horseId: { cruise, maneuv, sustain }, ... }
 * @param {Object} marks - { '◎': horseId, '〇': horseId, '▲': horseId }
 * @returns {Array} 計算済み馬オブジェクトの配列
 */
export function calcAllParams(raceData, userTweaks = {}, marks = {}) {
  const entries = raceData.entries;

  // 全馬の最速値を取得（小さいほど速い）
  const minAve3f  = Math.min(...entries.map(e => e.horse.ave_3f));
  const minLast3f = Math.min(...entries.map(e => e.horse.last_3f));

  return entries.map((entry, idx) => {
    const id     = idx;
    const horse  = entry.horse;
    const jockey = entry.jockey;
    const tweak  = userTweaks[id] || { cruise: 0, maneuv: 0, sustain: 0 };

    // 印補正
    let markBonus = 0;
    if (marks['◎'] === id) markBonus = 10;
    else if (marks['〇'] === id) markBonus = 5;
    else if (marks['▲'] === id) markBonus = 3;

    // 3着以内回数 / 全出走数
    const results       = horse.results;
    const top3Count     = results.filter(r => r >= 1 && r <= 3).length;
    const totalRuns     = results.length;
    const top3Rate      = totalRuns > 0 ? top3Count / totalRuns : 0;

    // 生スコア計算
    const rawCruise  = (minAve3f  / horse.ave_3f)  * 80 + tweak.cruise  * 2;
    const rawManeuv  = (jockey.win_rate * 200)      + tweak.maneuv  * 2 + markBonus;
    const rawSustain = (top3Rate * 50)              
                     + (minLast3f / horse.last_3f)  * 30 
                     + tweak.sustain * 2;

    // [0, 100] に正規化
    const normalize = v => Math.max(0, Math.min(100, v));
    const S_cruise  = normalize(rawCruise);
    const M_maneuv  = normalize(rawManeuv);
    const S_sustain = normalize(rawSustain);

    // スタミナ初期値
    const initialStamina = S_sustain * 2.0;

    // 枠番・枠色の自動付与
    const total = entries.length;
    const waku  = calcWaku(entry.gate, total);
    const color = CONFIG.JRA_WAKU_COLORS[waku] || '#CCCCCC';

    return {
      id,
      gate:           entry.gate,
      waku,
      color,
      name:           horse.name,
      style:          horse.style,
      ave3f:          horse.ave_3f,
      last3f:         horse.last_3f,
      S_cruise,
      M_maneuv,
      S_sustain,
      // --- 実行時状態（シミュレーション中に変化） ---
      stamina:        initialStamina,
      initialStamina,
      x:              0,
      y:              calcInitialLane(entry.gate, entries.length),
      targetLane:     calcInitialLane(entry.gate, entries.length),
      battlePenalty:  1.0,    // 次フェーズに適用する速度係数
      distanceLoss:   0,      // コーナー距離ロスの累計
      battleLosses:   0,      // フェーズ内バトル敗北数（スタミナ消費計算用）
      logs:           [],
    };
  });
}

/**
 * ゲート番号からY座標（レーン 1.0〜8.0）を算出
 * ゲート番号をそのままレーン番号にマッピング
 */
function calcInitialLane(gate, total) {
  // 枠順をコース全レーン幅に線形マッピング
  // 18頭立てなら 1〜18 をそのまま使い、少頭数は内外へ均等に広げる
  const laneMax = CONFIG.LANE_COUNT;
  if (total <= 1) return 1;
  const ratio = (gate - 1) / (total - 1);
  const lane = 1 + ratio * (laneMax - 1);
  return Math.max(1, Math.min(laneMax, Math.round(lane)));
}