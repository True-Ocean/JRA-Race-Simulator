/** 重賞実績（特に G1 平均着順）からゴールシーン用の class スコアを算出 */

const CAREER_FINISH_SPAN = 8;
const GOAL_CLASS_G1_BLEND = 0.72;

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function finishScore(avgFinish) {
  return clamp01(1 - (avgFinish - 1) / CAREER_FINISH_SPAN);
}

/**
 * G1 のみから 0..1 スコア（平均着順が良いほど高い・出走2走で頭打ち）
 * @param {{ runs?: number, wins?: number, avg_finish?: number | null } | null | undefined} g1
 */
export function calcG1ClassScore(g1) {
  if (!g1 || !g1.runs) return null;
  const avg = g1.avg_finish;
  const fs = Number.isFinite(avg) ? finishScore(avg) : 0.45;
  const winBonus = Math.min(g1.wins ?? 0, 2) * 0.1;
  const confidence = Math.min((g1.runs ?? 0) / 2, 1);
  return clamp01((fs * 0.8 + winBonus) * confidence);
}

/**
 * ゴールシーン速度に使う実績指数（G1 着順を主、全体 class_index を従）
 * @param {object | null | undefined} career
 */
export function resolveGoalClassIndex(career) {
  if (!career) return 0.5;
  if (Number.isFinite(career.goal_class_index)) {
    return clamp01(career.goal_class_index);
  }
  const g1Score = calcG1ClassScore(career.graded?.G1);
  const overall = Number.isFinite(career.class_index) ? career.class_index : 0.5;
  if (g1Score == null) return clamp01(overall);
  return clamp01(GOAL_CLASS_G1_BLEND * g1Score + (1 - GOAL_CLASS_G1_BLEND) * overall);
}
