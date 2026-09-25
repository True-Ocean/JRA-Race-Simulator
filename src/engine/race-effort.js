import { GOAL_DISTANCE_METERS } from './constants.js';

const PROFILES = {
  '大逃げ': { launch: 0.88, cruise: 0.76, kick: 560 },
  '逃げ': { launch: 0.80, cruise: 0.65, kick: 520 },
  '先行': { launch: 0.66, cruise: 0.50, kick: 550 },
  '差し': { launch: 0.42, cruise: 0.34, kick: 580 },
  '追込': { launch: 0.34, cruise: 0.28, kick: 460 },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = v => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

/** 本編と最後の200mで同じレース距離を二重消費しないための配分。 */
export function getRaceDistanceBudget(totalDistance) {
  const total = Number.isFinite(totalDistance) && totalDistance > 0 ? totalDistance : 1200;
  const goal = Math.min(GOAL_DISTANCE_METERS, total);
  return { total, main: total - goal, goal };
}

/** 必ず移動前の隊列を渡す。処理順で競争圧が変わらないようにする。 */
export function getRaceEffortContext(horse, pack, gapUnit = 38) {
  const others = pack.filter(h => h.id !== horse.id);
  const gap = Math.max(1, gapUnit);
  const leaderX = Math.max(horse.x, ...others.map(h => h.x));
  const rankNorm = others.length
    ? others.filter(h => h.x > horse.x + 1e-6).length / others.length : 0;
  const nearFront = leaderX - horse.x < gap * 2;
  const rivals = others.filter(h =>
    Math.abs(h.x - horse.x) < gap * 1.6 && Math.abs(h.y - horse.y) < 3,
  );
  const pressure = nearFront ? clamp(rivals.length / 3, 0, 1) : 0;
  const frontBlocked = others.some(h =>
    h.x > horse.x && h.x - horse.x < gap * 1.2 && Math.abs(h.y - horse.y) < 0.9,
  );
  return { rankNorm, pressure, frontBlocked };
}

/**
 * 脚質は作戦の初期値。現在の順位・競り合い・進路・残り距離で実際の負荷を決める。
 * effort は速度そのものではなく、能力のうちどの程度を使って走るか（0..1）。
 */
export function resolveRaceEffort(horse, {
  totalDistance, remainingMeters, distanceMeters = 0,
  rankNorm = 0.5, pressure = 0, frontBlocked = false,
}) {
  const { total } = getRaceDistanceBudget(totalDistance);
  const remain = clamp(remainingMeters, 0, total);
  const profile = PROFILES[horse.style] ?? PROFILES['先行'];
  const targetRank = Number.isFinite(horse.formationTargetRank) ? horse.formationTargetRank : rankNorm;
  const positionPressure = clamp(rankNorm - targetRank, 0, 1);
  const launch = 1 - smoothstep((total - remain) / Math.min(280, total * 0.25));
  const aggression = clamp((horse.J_aggression ?? 50) / 100, 0, 1);
  const kickStart = Math.min(total * 0.46, profile.kick)
    + positionPressure * 80 + (aggression - 0.5) * 60 + (horse.kickTimingOffset ?? 0);
  const kick = smoothstep((kickStart - remain) / Math.max(80, kickStart * 0.65));
  const cruise = profile.cruise + (profile.launch - profile.cruise) * launch;
  let desired = cruise * (1 - kick) + 0.99 * kick;
  desired += (pressure * 0.12 + positionPressure * 0.08) * (1 - kick * 0.65);
  desired += horse.effortBias ?? 0;
  // 前が開くまで追い切れない。進路が開いた後は同じ状態からなめらかに仕掛ける。
  if (frontBlocked) desired -= 0.12 * kick + 0.04;
  desired = clamp(desired, 0.22, 1);
  if (!Number.isFinite(horse.raceEffort)) return desired;
  const response = 1 - Math.exp(-Math.max(0, distanceMeters) / 45);
  return horse.raceEffort + (desired - horse.raceEffort) * response;
}

export function getStaminaRatio(horse) {
  if (!(horse?.initialStamina > 0) || !Number.isFinite(horse.stamina)) return 0;
  return clamp(horse.stamina / horse.initialStamina, 0, 1);
}

/** 最後の35%から連続的に疲労が効く。枯渇しても走行自体は続ける。 */
export function staminaSpeedMultiplier(ratio) {
  return 0.74 + 0.26 * smoothstep(ratio / 0.35);
}

export function staminaAccelMultiplier(ratio) {
  return 0.55 + 0.45 * smoothstep(ratio / 0.40);
}

export function effortSpeedMultiplier(effort) {
  return 0.94 + clamp(effort, 0, 1) * 0.10;
}
