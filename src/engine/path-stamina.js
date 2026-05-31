import { CONFIG } from '../config.js';
import { laneIndex } from './phase.js';
import {
  PATH_STAMINA_PER_M,
  LANE_TO_METERS,
  SIM_X_METERS_DIVISOR,
} from './constants.js';
import { isFourthCornerPhase } from './phase-helpers.js';

/**
 * シミュ x 進行（1フェーズあたり V_eff * phase.distance/80）と名目距離を揃える換算。
 * @param {number} phaseDistanceM
 */
export function simXToMetersScale(phaseDistanceM) {
  const d = Number.isFinite(phaseDistanceM) ? phaseDistanceM : 0;
  return d > 0 ? d / SIM_X_METERS_DIVISOR : 0;
}

/**
 * 2点間の走行経路長（m）。縦=sim-x、横=レーン幅。
 */
export function calcPathSegmentMeters(prevX, prevY, nextX, nextY, phaseDistanceM) {
  const scale = simXToMetersScale(phaseDistanceM);
  const dx = (Number(nextX) - Number(prevX)) * scale;
  const dy = (Number(nextY) - Number(prevY)) * LANE_TO_METERS;
  const seg = Math.hypot(dx, dy);
  return seg > 1e-9 ? seg : 0;
}

/**
 * 形成期: まっすぐ走れる距離をバジェットとし、斜め進路では前進・横移を同率で抑える。
 * 馬番非依存 — 意図した laneDelta と desiredAdvance のみで判定する。
 * @returns {{ advance: number, lateralScale: number }}
 */
export function applyPathBudget(desiredAdvance, laneDelta, phaseDistanceM) {
  const advance = Math.max(0, Number(desiredAdvance) || 0);
  const absLaneDelta = Math.abs(Number(laneDelta) || 0);
  if (absLaneDelta < 1e-9 || advance < 1e-9) {
    return { advance, lateralScale: 1 };
  }
  const scale = simXToMetersScale(phaseDistanceM);
  const forwardM = advance * scale;
  const lateralM = absLaneDelta * LANE_TO_METERS;
  const pathM = Math.hypot(forwardM, lateralM);
  if (pathM <= forwardM + 1e-9) {
    return { advance, lateralScale: 1 };
  }
  const ratio = forwardM / pathM;
  return {
    advance: advance * ratio,
    lateralScale: ratio,
  };
}

/**
 * コーナー外回りなど: 1m あたりのスタミナ倍率（LANE_COEFF を流用）。
 */
export function calcLanePathFactor(laneY, phase) {
  const lane = laneIndex(laneY);
  const isCorner = Boolean(phase?.isCorner) || isFourthCornerPhase(phase);
  if (!isCorner) return 1.0;
  const coeff = CONFIG.LANE_COEFF[lane];
  return Number.isFinite(coeff) && coeff > 0 ? coeff : 1.0;
}

/**
 * 経路セグメントに対するスタミナ消費量（予備ライン前の raw 値）。
 */
export function calcPathStaminaDrain(segmentMeters, trackMod, laneY, phase) {
  if (segmentMeters <= 0) return 0;
  const mod = Number.isFinite(trackMod) && trackMod > 0 ? trackMod : 1.0;
  const laneFactor = calcLanePathFactor(laneY, phase);
  return segmentMeters * PATH_STAMINA_PER_M * mod * laneFactor;
}

/**
 * UI 補間用: 経路・前進の進捗率 0〜1。
 */
export function calcPathInterpT(fromHorse, toHorse, currentX, currentPathMeters) {
  const fromPath = Number(fromHorse?.pathMeters) || 0;
  const toPath = Number(toHorse?.pathMeters) || 0;
  const pathSpan = toPath - fromPath;

  let tPath = 0;
  if (pathSpan > 1e-6 && Number.isFinite(currentPathMeters)) {
    tPath = (currentPathMeters - fromPath) / pathSpan;
  }

  const fromX = Number(fromHorse?.x) || 0;
  const toX = Number(toHorse?.x) || 0;
  const xSpan = toX - fromX;
  let tX = 0;
  if (xSpan > 1e-6 && Number.isFinite(currentX)) {
    tX = (currentX - fromX) / xSpan;
  } else if (Math.abs(xSpan) <= 1e-6) {
    tX = tPath;
  }

  const t = pathSpan > 1e-6 ? Math.max(tPath, tX) : tX;
  return Math.max(0, Math.min(1, t));
}

/**
 * 補間表示用スタミナ（フェーズ内の経路進捗に合わせる）。
 */
export function interpolateStaminaForDisplay(fromHorse, toHorse, t) {
  const fromS = Number(fromHorse?.stamina) || 0;
  const toS = Number(toHorse?.stamina) || 0;
  const clamped = Math.max(0, Math.min(1, t));
  return fromS + (toS - fromS) * clamped;
}
