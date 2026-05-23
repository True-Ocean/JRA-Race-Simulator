import { CONFIG } from '../config.js';

export const MIN_FORWARD_GAP = 38;
export const LATERAL_BLOCK_X_GAP = 42;
export const LATERAL_BLOCK_LANE_GAP = 1.15;
export const DIAGONAL_REAR_BLOCK_X_GAP = 30;
export const DIAGONAL_REAR_BLOCK_LANE_GAP = 1.05;
// 斜め後ろ判定の帯: isLaneInShiftPath 全体幅だと「同レーンの真後ろ」まで巻き込むため狭める
export const DIAGONAL_REAR_INNER_BAND_OUTER_EPS = 0.16;
export const DIAGONAL_REAR_INNER_BAND_INNER_MARGIN = 0.48;
export const LANE_WIDTH = CONFIG.LANE_COUNT;
export const INNER_HALF_LANE_MAX = Math.max(1, Math.floor(LANE_WIDTH * 0.5));
export const LEAD_BATTLE_PHASE_MAX = 0.35;
export const EARLY_LEAD_RATIO_MAX = 0.35;
export const FINAL_DUEL_PHASE_MIN = 0.80;
export const FORMATION_LOCK_PHASE = 0.40;
export const PRE_CORNER_PACK_PHASE_MAX = 0.28;
export const COLLISION_MIN_Y_GAP = 0.9;
export const COLLISION_ITERATIONS = 3;
export const COLLISION_ITERATIONS_EARLY = 7;
export const COLLISION_EPS = 0.001;
export const START_DELAY_BASE_RATE = 0.022;
export const STUMBLE_BASE_RATE = 0.008;
export const STUMBLE_PHASE_MAX = 0.55;
export const EARLY_TROUBLE_DECAY_PER_100M = 0.88;
export const EARLY_ORDER_TIE_NOISE = 1.2;
export const EARLY_OUTER_NIGE_START_RATIO = 0.60;
export const EARLY_OUTER_NIGE_ADV_GAIN_MAX = 0.18;
export const EARLY_OUTER_NIGE_DRAIN_PER_100M = 0.45;
/** スタートフェーズのみ: STYLE_PACE 先頭バケットを 1.0 へ寄せる（逃げ・大逃げの一気離れ抑制） */
export const START_PHASE_NIGE_PACE_BLEND = 0.58;
/** スタートフェーズのみ: 理想ギャップ追い込み（gapCatchBoost）に掛ける係数 */
export const START_PHASE_GAP_CATCH_SCALE = 0.22;
/** スタートフェーズのみ: 外ライン逃げダッシュの強さ */
export const START_PHASE_OUTER_NIGE_SCALE = 0.52;
export const OONIGE_BURST_ROLL_MIN = 0.92;
export const OONIGE_BURST_ROLL_MAX = 1.12;
export const OONIGE_BURST_PHASE_JITTER_MIN = 0.97;
export const OONIGE_BURST_PHASE_JITTER_MAX = 1.03;
export const OONIGE_DRAIN_BURST_LINK_GAIN = 1.4;
export const OONIGE_PHASE_DRAIN_EARLY_MULT = 0.88;
export const OONIGE_PHASE_DRAIN_LATE_MULT = 1.10;
export const FRONTRUN_ROLL_MIN = 0.94;
export const FRONTRUN_ROLL_MAX = 1.10;
export const OONIGE_LATE_DRAIN_BASE_PER_100M = 1.24;
export const OONIGE_LATE_DRAIN_LEAD_GAIN = 1.08;
/**
 * スタミナ設計（展開駆動）
 * - 競争圧: 本番で「追われ・離せ・争い」→ 消費増（脚質ラベルでは決めない）
 * - 実行圧: ゴールで「脚を入れている」→ 燃焼増（着順の答え合わせはしない）
 * - 大逃げ巡航で温存 → 競争圧上昇で再消費 → 必要ならゴールで使い切りも可
 * - 競争なしで後方・高残もあり得る（バー緑は常にバグではない）
 */
/** 安全策: 新スタミナモデル（イベント主導 + 距離微小消費）を段階導入 */
export const USE_SAFE_STAMINA_MODEL = true;
/** 新モデル: 距離起因の微小消費（1m あたり） */
export const SAFE_BASE_STAMINA_PER_M = 0.0048;
/** 新モデル: 進路変更イベント消費倍率 */
export const SAFE_LANE_EVENT_DRAIN_MULT = 0.45;
/** 新モデル: コーナー外回しイベント消費倍率 */
export const SAFE_CORNER_EVENT_DRAIN_MULT = 0.35;
/** 新モデル: 余剰加速イベント消費倍率 */
export const SAFE_ACCEL_EVENT_DRAIN_MULT = 0.62;
/** SAFEモデル下: 逃げ・大逃げのペース拡大ドレインを旧式の何割で復活させるか */
export const SAFE_NIGE_PACE_DRAIN_MULT = 0.42;
/** SAFE + 逃げ: 序盤〜中盤（ratio≤0.55）のフェーズ倍率 */
export const SAFE_NIGE_EARLY_PACE_PHASE_MULT = 1.45;
/** SAFE + 逃げ: 第4コーナー以降のフェーズ倍率 */
export const SAFE_NIGE_LATE_PACE_PHASE_MULT = 0.92;
/** SAFE + 大逃げ: 序盤のフェーズ倍率（逃げより抑える） */
export const SAFE_OONIGE_EARLY_PACE_PHASE_MULT = 1.05;
/** 大逃げ巡航: 2着との差がこの値(m相当)以上で巡航判定に入りやすくする */
export const OONIGE_CRUISE_SECOND_GAP_MIN = 10;
/** 大逃げ巡航: gapNeedNorm がこの以下なら「十分離せた」とみなす */
export const OONIGE_CRUISE_GAP_NEED_MAX = 0.12;
/** 大逃げ巡航時のペースドレイン倍率（SAFE復活分に掛ける） */
export const OONIGE_CRUISE_DRAIN_MULT_MIN = 0.08;
export const OONIGE_CRUISE_DRAIN_MULT_MAX = 0.26;
/** SAFE + 大逃げ: バースト連動ドレインの巡航時上限（旧式 link×10 を抑える） */
export const OONIGE_CRUISE_BURST_LINK_SCALE = 2.2;
/** 新モデル: 終盤でイベント疲労を速度へ反映する重み */
export const SAFE_GOAL_EVENT_FATIGUE_WEIGHT = 0.42;
/** 新モデル: 終盤の stamina/m 正規化基準 */
export const SAFE_GOAL_STAMINA_PER_M_REF = 0.030;
export const SAFE_GOAL_STAMINA_PER_M_RANGE = 0.090;
/** スタート初速のうちこの倍率までは能力域とみなし、accel スタミナは超過分のみ課金 */
export const START_BURST_STAMINA_FREE_CAP = 1.14;
/** 逃げ・大逃げの「ペース拡大」追加ドレイン: 追い込み必要時の下限 */
export const NIGE_PACE_EXTRA_DRAIN_FLOOR = 0.34;
/** 先頭キープ時のペースドレイン下限（楽先頭でもゼロにしない） */
export const NIGE_PACE_LEAD_HOLD_DRAIN_FLOOR = 0.58;
/** 先頭で2着に余裕があるときの accel ドレイン下限 */
export const NIGE_ACCEL_LEAD_EASE_MIN = 0.62;
/** kick 予備ライン上限（initial 比）逃げ・大逃げ */
export const KICK_RESERVE_FLOOR_NIGE_MAX = 0.17;
export const KICK_RESERVE_FLOOR_OONIGE_MAX = 0.13;
export const KICK_EARLY_DRAIN_NIGE_MULT = 1.04;
/** 2着が1フェーズでこれ以上詰めたら競争圧（chasePressure） */
export const CHASE_GAP_CLOSE_PER_PHASE = 2.5;
export const CHASE_GAP_CLOSE_PRESSURE_GAIN = 0.92;
/** 外ラチ逃げダッシュ: 先頭で十分離れているときのドレイン倍率 */
export const NIGE_OUTER_DASH_CLEAR_LEAD_MULT = 0.58;
/** 4角以降大逃げ: 楽に先頭をキープしているときの late ドレイン倍率 */
export const OONIGE_LATE_CLEAR_LEAD_MULT = 0.62;
export const OONIGE_LATE_CLEAR_LEAD_GAP = 20;
// ゴールシーンは「ゴールラインから 200m 手前〜ゴール」が画面に収まるイメージ。
// last_3f（最終3ハロン≈600m の通過秒）から intrinsic 速度を出し、スタミナ残量で毎フレーム上限を締める。
export const GOAL_FURLONG_METERS = 200;
export const GOAL_TIME_SCALE = 1.0;
export const GOAL_DISTANCE_METERS = GOAL_FURLONG_METERS;
export const GOAL_LAST3F_DISTANCE_M = 600;
export const GOAL_LAST3F_SEC_CLAMP_MIN = 27;
export const GOAL_LAST3F_SEC_CLAMP_MAX = 41;
export const GOAL_LAST3F_FALLBACK_SEC = 33.5;
export const GOAL_X_PER_METER = 0.28;
export const GOAL_LANE_CHANGE_PER_SEC = 4.2;
export const GOAL_BLOCK_X_GAP = 10;
/** ゴールシーン同一レーン内で後方馬の x が前馬に食い込まないよう保つ最小間隔（シミュ x 単位） */
export const GOAL_MIN_PACK_GAP_X = GOAL_BLOCK_X_GAP * 0.9;
export const GOAL_NEAR_LANE_GAP_BASE = 0.95;
export const GOAL_NEAR_LANE_GAP_MAX = 1.26;
export const GOAL_LANE_CHANGE_COOLDOWN_MS = 520;
export const FINAL_LANE_CHANGE_COOLDOWN_PHASES = 2;
export const FINAL_FRONT_BLOCK_EXTRA_GAP = 6;
export const FINAL_STRAIGHT_RATIO = 0.80;
/** 第3コーナー終了時点（第4コーナー開始フェーズ）のスタミナ比率がこれ未満だと外への先回り意欲を大きく抑える */
export const POST_C3_STAMINA_SPREAD_FLOOR = 0.24;
/** 前が塞がり外進路を取る馬の横移動上限（最終直線） */
export const LATERAL_SHIFT_BLOCKED_CAP = 2.58;
/** 最終直線: 前方ブロック判定の追加ギャップ（本番より緩め） */
export const FINAL_STRAIGHT_SPREAD_BLOCK_EXTRA = 3;
/** 最終直線: 同x帯クラスタのすり分け幅（m） */
export const FINAL_STRAIGHT_X_BAND = 9;
/** 第4コーナー中の能動横移動上限（遠心力ドリフトは別） */
export const LATERAL_SHIFT_CORNER4_CAP = 0.34;
/** 最終直線入口の能動レーン変更を1フェーズ内で繰り返す回数 */
export const STRETCH_LANE_SUBSTEPS = 9;
/** 第4コーナー中の stretchKick 倍率（入口フェーズとの差別化） */
export const CORNER4_STRETCH_KICK_SCALE = 0.42;
/** 最終直線入口: 差し・追込の縦伸び上限倍率 */
export const SPUR_ENTRY_ADVANCE_MULT_CAP = 1.42;
/** 最終直線入口フェーズのみ、縦方向の前進倍率に掛けるブースト */
export const SPUR_ENTRY_VERTICAL_BOOST = 1.14;
/** 最終直線入口の stretchKick に掛ける倍率（第4コーナーとは別） */
export const SPUR_ENTRY_STRETCH_KICK_MULT = 1.12;
/** 進路コミット維持フェーズ数（慣性・ジグザグ抑制） */
export const LANE_COMMIT_PHASES = 2;
/** ローカル前方判定の最大距離（真前の馬のみ） */
export const LOCAL_FRONT_MAX_X = 20;
/** 遠心力 drift のスタミナ消費（能動レーン変更コストへの倍率） */
export const CENTRIFUGAL_DRIFT_STAMINA_MULT = 0.22;
export const LATERAL_SHIFT_SOFT_CAP = 0.42;
export const LATERAL_SHIFT_HARD_CAP = 0.26;
// 第3コーナーまでは積極的な内寄せを許容するため横移動上限を緩める
export const LATERAL_SHIFT_THROUGH_C3_CAP = 0.75;
export const START_LATERAL_SHIFT_CAP = 2.40;
export const GOAL_MIN_SPEED_RATIO = 0.58;
export const GOAL_MAX_SPEED_RATIO = 1.95;
export const GOAL_POST_SCROLL_MS = 700;
export const GOAL_POST_CLEAR_METERS = GOAL_FURLONG_METERS * 1.25;
export const RACE_SUMMARY_HEADER_LINE = 'ここまでのレースサマリ';
export const RACE_SUMMARY_SCENE_LABELS = new Set([
  'スタート',
  'ホーム直線',
  '第1コーナー',
  '第2コーナー',
  '向正面',
  '第3コーナー',
  '第4コーナー',
  '最終直線入口',
  '最終直線',
  'スタート〜1コーナー手前',
  '3〜4コーナー中間',
  '4コーナー〜直線',
]);
// ゴールシーン progress の上限（画面外まで抜ける余地）
export const GOAL_PROGRESS_MAX_POST_LINE = 1.78;
// ゴールシーン開始時、先頭馬は画面下辺から出現させる
export const GOAL_ENTRY_LEADER_START_PROGRESS = 0.0;
// 画面外を含むゴール描画 progress 下限
export const GOAL_PROGRESS_MIN = -1.10;
// 切替時のカット演出（フェード）時間
export const GOAL_SCENE_TRANSITION_MS = 1500;
export const GOAL_SCENE_TRANSITION_MAX_ALPHA = 0.82;
export const GOAL_PROGRESS_TARGET_AT_FINISH = 1.06;
export const GOAL_LEADER_ANCHOR_PROGRESS = 0.88;
// 仮想リーダーが上に抜けた時にYで見せる（旧: 0.88 で上方向が潰れていた）
export const GOAL_ANCHOR_MAX_PROGRESS = 1.08;
export const GOAL_PROGRESS_SPAN = 0.64;
// t < 2/3（ゴール接近の前半〜中盤）の間は相対差を大きく見せる
export const GOAL_EARLY_PHASE_T = 2 / 3;
export const GOAL_SPREAD_EARLY_MULT = 1.52;
export const GOAL_ANCHOR_FOLLOW_SCALE = 0.92;
export const GOAL_CAMERA_LERP = 0.085;
export const GOAL_CAMERA_LERP_MAX = 0.16;
export const GOAL_ANCHOR_DYNAMIC_BOOST = 0.12;
export const STAMINA_LANE_CHANGE_COST = 0.45;
export const STAMINA_ACCEL_COST = 0.10;
export const STAMINA_EARLY_ACCEL_MULT = 1.10;
export const STAMINA_BATTLE_BASE_COST = 0.8;
export const STAMINA_BATTLE_LOSER_EXTRA = 1.6;
export const STAMINA_BATTLE_TRACKER_GAIN = 0.2;
/** 斤量スタミナ補正の基準（kg）。3歳牡の一般的な斤量 */
export const WEIGHT_STAMINA_REF_KG = 57;
/** 基準から1kgあたりのスタミナ消耗倍率（バトル・加速のみ） */
export const WEIGHT_STAMINA_PER_KG = 0.015;
export const WEIGHT_STAMINA_MULT_MIN = 0.85;
export const WEIGHT_STAMINA_MULT_MAX = 1.15;
export const INNER_CUTIN_BATTLE_COOLDOWN_PHASES = 2;
export const INNER_CUTIN_REMATCH_COOLDOWN_PHASES = 4;
export const INNER_CUTIN_MIN_INWARD_DELTA = 0.08;
export const INNER_CUTIN_WINNER_STAMINA_MULT = 1.15;
export const INNER_CUTIN_LOSER_STAMINA_MULT = 1.35;
export const THROUGH_C3_LANE_CHANGE_TRIGGER_DELTA = 0.08;
export const INNER_RAIL_GAP_OPTIONS = [0.5, 1.0, 1.5, 2.0];
export const INNER_RAIL_GAP_WEIGHTS = [0.38, 0.34, 0.20, 0.08];
export const INNER_POCKET_FRONT_GAP_RATIO = 0.55;
export const INNER_POCKET_REAR_GAP_RATIO = 0.35;
export const PRE_CORNER_INNER_COMPRESS_ITERS = 3;
export const PRE_CORNER_FORCE_INNER_STEP = 0.55;
export const PRE_CORNER_MIN_Y_GAP_MULT = 0.88;
export const HOME_OUTER_REROUTE_STEPS = 3;
export const COLLISION_FRONT_BUFFER_X = 10;
export const COLLISION_REAR_BUFFER_X = 14;
export const INNER_CUTIN_BUFFER_MULT = 1.25;
export const PACK_DENSITY_PENALTY_QUAD = 1.1;
export const STAMINA_CORNER_OUTER_PER_LANE = 0.30;
export const GOAL_STAMINA_DRAIN_MULT = 1.35;
/** ゴールシーン終了時の目標スタミナ残量（initial 比） */
export const GOAL_STAMINA_BURN_TARGET_RATIO = 0.12;
/** 残スタミナをゴールまで燃やす燃焼の強さ（距離×mps 式は使わない穏やかな時間ベース） */
export const GOAL_STAMINA_BURN_RESERVE_MULT = 0.62;
/** 燃焼が効き始める distRatio（これ未満はほぼ燃やさない） */
export const GOAL_STAMINA_BURN_DIST_START = 0.18;
/** 既存 goalDrain に掛けるベース＋高残量補正（穏やか） */
export const GOAL_STAMINA_DRAIN_RESERVE_BASE = 0.94;
export const GOAL_STAMINA_DRAIN_RESERVE_STAMINA_GAIN = 0.28;
/** 先頭逃げ・大逃げの末脚開放（staminaUnleash）抑制 */
export const GOAL_FRONT_RUNNER_UNLEASH_SCALE = 0.22;
/** 先頭逃げ・大逃げの粘りドレイン（initial 比・秒） */
export const GOAL_FRONT_RUNNER_HOLD_DRAIN_PER_SEC = 0.011;
/** 1フレームで燃やせる burnable の上限比率（瞬間枯れ防止） */
export const GOAL_STAMINA_BURN_MAX_FRAME_FRAC = 0.045;
/** 実行圧: goalDesired と現速度の差・加速から燃焼へ反映する重み */
export const GOAL_EFFORT_BURN_WEIGHT = 0.58;
/** 先頭僅差時の粘りドレイン追加倍率 */
export const GOAL_TIGHT_LEAD_HOLD_MULT = 1.55;
export const GOAL_AI = {
  horizonSec: 1.0,
  predictStepSec: 0.10,
  switchCommitSec: 0.40,
  /** 進路切替に必要なスコア差（低いほど左右に振りやすい） */
  switchThresholdBase: 1.12,
  aggrBaseByStyle: { '逃げ': 0.36, '先行': 0.47, '差し': 0.66, '追込': 0.78 },
  aggrStaminaGain: 0.46,
  aggrLast3fGain: 0.58,
  laneMoveCostPerLane: 1.25,
  blockRiskWeight: 6.4,
  densityWeight: 4.8,
  projectedGapWeight: 1.25,
  burstAccelBonus: 1.10,
  // GOAL_DISTANCE が 200m のため「残り〇m」の窓を区間に合わせる（最後の直線ドライブ帯）
  burstWindowMetersToGoMin: 90,
  burstWindowMetersToGoMax: 205,
  burstCooldownSec: 0.80,
  burstDurationSec: 0.55,
  trafficPenaltyFloor: 0.72,
  goalDrainSprintCap: 1.45,
  visualLateStartT: 0.62,
  visualLateBoost: 0.34,
  /** 短期軌道予測での接触ペナルティ（進路スコアから減算） */
  collisionHorizonWeight: 5.5,
  /** 「進路上の遅い馬」を探す前方距離上限（シミュ x 単位）。これ以上前方は無視する */
  passSeekMaxForwardX: 40,
};
