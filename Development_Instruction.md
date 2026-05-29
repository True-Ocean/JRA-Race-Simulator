# 開発仕様書：JRA RACE SIMULATOR

**バージョン:** 2.0（実装準拠・as-built）  
**最終更新:** 2026年5月29日  
**対象コード:** リポジトリ `main` ブランチ上の完成アプリ

> 本書は初期設計ドラフト（v1.0）を、**実際に動作するコード**に合わせて書き直したものです。数値定数の正は `src/config.js` および `src/engine/constants.js` を参照してください。

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [画面構成とユーザーフロー](#2-画面構成とユーザーフロー)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [データ構造（入力JSON）](#4-データ構造入力json)
5. [能力パラメータ計算](#5-能力パラメータ計算)
6. [お好み設定（プレレース編集）](#6-お好み設定プレレース編集)
7. [コース定義とフェーズ管理](#7-コース定義とフェーズ管理)
8. [シミュレーションエンジン](#8-シミュレーションエンジン)
9. [隊列形成（formation）](#9-隊列形成formation)
10. [レーン移動・衝突回避](#10-レーン移動衝突回避)
11. [バトル解決](#11-バトル解決)
12. [スタミナモデル](#12-スタミナモデル)
13. [ゴールシーン](#13-ゴールシーン)
14. [描画・UI（シミュレーター）](#14-描画uiシミュレーター)
15. [レースサマリーと集計](#15-レースサマリーと集計)
16. [ログ仕様](#16-ログ仕様)
17. [技術スタックとプロジェクト構成](#17-技術スタックとプロジェクト構成)
18. [テストと再現性](#18-テストと再現性)
19. [データ更新（任意）](#19-データ更新任意)
20. [付録A：主要定数の参照先](#付録a主要定数の参照先)
21. [付録B：初期設計（v1.0）からの主な変更](#付録b初期設計v10からの主な変更)

---

## 1. プロジェクト概要

### コンセプト

中央競馬のレース展開を、縦長コース上の**ポジション争い・数値バトル・スタミナ管理**として抽象化したブラウザシミュレーター。出走馬データから能力値を算出し、ユーザーが事前に「読み」を調整したうえで、フェーズ単位のレース進行を再生して着順・タイムを導出する。

> **免責:** 本アプリは JRA および関係各社の公式製品ではない。エンターテインメント目的であり、投票助言を提供しない（`README.md` 参照）。

### 盤面ビジュアルの基本方針

| 項目 | 実装内容 |
|------|----------|
| 進行方向 | 上向き（画面下＝スタート、画面上＝ゴール） |
| 横位置 | **連続レーン 1.0〜18.0**（`CONFIG.LANE_COUNT`）。ゲート番号から初期レーンを線形マッピング |
| 内ラチ | `courses.json` の `turnDirection`（左回り＝右が内、右回り＝左が内）に応じて内外ラチを描画 |
| 馬カード | Canvas 上に縦長カード（レーン幅に比例）。枠色の縁取り＋馬番・馬名 |
| 背景 | 芝＝緑系 HSL、ダート＝茶系。馬場状態で明度を下げ、重・不良時は荒れパッチを追加 |
| コーナー | 外レーンに薄い黄色オーバーレイ。コーナー外回りは `LANE_COEFF` で距離ロス・スタミナ増 |
| フェーズ名 | セグメントラベルまたは比率から日本語名を中央に薄く表示 |
| スタート | フェーズ0・進行0%でゲート横並び表示後、上方向へ展開 |
| 手動進行 | 各フェーズ処理後に一時停止。「次のフェーズ」／最終フェーズ後はゴール判定へ |
| レイアウト | **3カラム:** 出馬表（左）・盤面 Canvas（中央）・レースログ（右） |

### ゲームループ（全体フロー）

```
[JSON 読み込み: race-info + race-entries]
        ↓
[calcAllParams → お好み設定で補正]
        ↓
[runSimulation: 全フェーズ一括計算 + スナップショット]
        ↓
[PhaseController: フェーズ再生 → ゴールシーン（rAF）]
        ↓
[着順・タイム確定 → レースサマリー]
        ↓
[任意: sessionStorage へ集計 run 追加 → stats.html]
```

---

## 2. 画面構成とユーザーフロー

| 画面 | DOM / ファイル | 説明 |
|------|----------------|------|
| **シミュレーター** | `index.html` 本体 | 3カラム、フェーズ再生、ゴール演出、掲示板 |
| **お好み設定** | `#pre-race-editor` | 全画面オーバーレイ。脚質・評価スライダー・印 |
| **レースサマリー** | `#race-summary-screen` | 着順・タイム・馬別イベントログ |
| **集計** | `stats.html` | 同一条件バケット内の複数走を集計・比較 |

**主な遷移**

- シミュレーター ↔ お好み設定（設定反映でシミュレーション再実行）
- レース完了後 → レースサマリー（`#btn-show-summary`）
- シミュレーター / サマリー → `stats.html`（戻る先は `sessionStorage` に保存）
- 集計画面から戻ると、保存済みのシミュレーター状態またはサマリーを復元可能

エントリポイントは `main.js`。UI ロジックは `src/ui/`、集計は `src/stats/`。

---

## 3. アーキテクチャ

### 責務分離

| 層 | 場所 | 役割 |
|----|------|------|
| **計算エンジン** | `src/engine/` | 純粋に近い関数群。`runSimulation` が1レース分の結果を返す |
| **描画** | `src/ui/renderer.js` 他 | Canvas 描画、ゴールシーン、ログ HTML |
| **アプリ制御** | `main.js`, `phase-controller.js` | 画面遷移、再生制御、session 永続化 |

初期設計にあったシングルトン `RaceState` は採用していない。馬配列は `runSimulation` 内で生成・更新され、フェーズごとの状態は `snapshots[]` に記録される。

### 乱数の再現性

- `src/engine/rng.js` の **Mulberry32**（`createRng(seed)`）
- デフォルトシード: `raceData.race_id`（`runSimulation` の `options.seed` で上書き可）
- 同一シード・同一入力（出走表・お好み設定・印）なら、エンジン出力は再現可能（Vitest ゴールデンで検証）

### 更新モデル

- **ロジック:** フェーズ単位の離散更新（`simulation.js` の `for (const phase of phases)`）
- **アニメーション:** `PhaseController` が `requestAnimationFrame` でフェーズ内進行・ゴールシーンを補間描画
- 設計書 v1.0 にあった「常時 60fps で全ロジック更新」ではない

---

## 4. データ構造（入力JSON）

レースデータは **2ファイル** に分割して読み込む（`main.js` が fetch）。

### `src/data/race-info.json`

```json
{
  "race_id": 20260531,
  "race_info": {
    "date": "2026-05-31",
    "venue": "東京競馬場",
    "grade": "G1",
    "age_condition": "３歳",
    "race_name": "東京優駿",
    "track": "芝",
    "distance": 2400,
    "condition": "良",
    "course_id": "tokyo_turf_2400"
  }
}
```

| フィールド | 説明 |
|-----------|------|
| `race_id` | 乱数シードの既定値 |
| `race_info.track` | `"芝"` または `"ダート"` |
| `race_info.condition` | `"良"` / `"稍重"` / `"重"` / `"不良"` |
| `race_info.distance` | レース距離（m） |
| `race_info.course_id` | 任意。`courses.json` の手動指定用 |

### `src/data/race-entries.json`

```json
{
  "race_id": 20260531,
  "entries": [
    {
      "gate": 1,
      "horse": {
        "name": "馬名",
        "sex_age": "牡3",
        "weight": 57,
        "style": "差し",
        "ave_3f": 37.0,
        "last_3f": 33.8,
        "results": [3, 2, 3, 1],
        "ave_3f_range": { "min": 35.6, "max": 39.2, "avg": 37.0 },
        "last_3f_range": { "min": 32.9, "max": 35.4, "avg": 33.8 }
      },
      "jockey": {
        "name": "騎手名",
        "win_rate": 0.18,
        "top3_rate": 0.27
      }
    }
  ]
}
```

| フィールド | 説明 |
|-----------|------|
| `gate` | 馬番（1始まり） |
| `horse.results` | 着順配列。`0` は着外（6着以下） |
| `horse.ave_3f` / `last_3f` | 秒。小さいほど速い |
| `horse.style` | `大逃げ` / `逃げ` / `先行` / `差し` / `追込` |

### その他データファイル

| ファイル | 用途 |
|----------|------|
| `src/data/courses.json` | コースセグメント（フェーズ名・コーナー位置） |
| `src/data/finish-time-baseline.json` | 着順タイム表示の基準 |

コース解決: `src/lib/course-resolve.js` の `resolveCourseDef(raceData, courseCatalog)` が `venue` + `track` + `distance` でマッチ。なければ `course_id`、最後に `defaultCourseId`。

---

## 5. 能力パラメータ計算

実装: `src/engine/params.js` の `calcAllParams(raceData)`。

### 3能力 + 騎手分解

| パラメータ | 記号 | 算出概要 |
|-----------|------|----------|
| 巡航速度 | `S_cruise` | `(min(ave_3f) / 当該 ave_3f) * 80` を [0,100] にクランプ |
| 立ち回り | `M_maneuv` | `win_rate * 200` を [0,100] にクランプ |
| 粘り強さ | `S_sustain` | 3着内率×50 + `(min(last_3f)/last_3f)*30` をクランプ |
| 騎手安定 | `J_reliability` | `top3_rate` を 0.30〜0.65 でスケール |
| 騎手攻勢 | `J_aggression` | `win_rate/top3_rate` を 0.25〜0.55 でスケール |

### スタミナ初期値

```
initialStamina = S_sustain * 2.2
```

（お好み設定適用後も `S_sustain` から再計算）

### 枠番・初期レーン

- `calcWaku(gate, total)`: JRA 枠割り当てルール（8枠、1枠最大3頭）
- `calcInitialLane(gate, total)`: レーン 1〜18 の usable 範囲へ線形配置（内外マージン `GATE_LANE_*_MARGIN`）

### 実行時に付与される主な馬オブジェクトフィールド

`x`（縦位置・sim-x）、`y`（横レーン）、`stamina`、`battlePenalty`、`pathMeters`、`formationTargetRank` など（`params.js` 戻り値参照）。

---

## 6. お好み設定（プレレース編集）

実装: `src/ui/pre-race-editor.js` + `src/engine/rating-adjustments.js`。

### 評価スライダー

| 軸 | 範囲 | 効き方 |
|----|------|--------|
| 馬 | -5〜+5 | `S_sustain` に `horseMult^0.5`、`S_cruise` に `horseMult` の一部 |
| 騎手 | -5〜+5 | `M_maneuv` に `jockeyMult` |
| 調教 | -5〜+5 | `S_cruise` に `trainingMult^0.25`、`S_sustain` に `trainingMult` |

1段階 = **±1%**（`ratingToMultiplier`: `1 + rating * 0.01`）。

> v1.0 設計の「合計10ptを3能力に振り分け」は廃止。

### 印

- 選択肢: `◎` `◯` `▲` `△` `★` `☆` `×` `消`（空欄＝なし）
- `◎` `◯` `▲` `△` `★` `☆` は **各1頭まで**（`UNIQUE_MARK_SYMBOLS`）
- 印はシミュレーション本体の能力式には直接乗らない（UI・集計バケット識別用）

### 脚質

テーブルから `大逃げ` / `逃げ` / `先行` / `差し` / `追込` を選択。`entries[].horse.style` を上書き。

### 操作

- **設定反映:** 集計リセット確認のうえ `runSimulation` を再実行
- **設定リセット:** スライダー・印・脚質を初期化
- 状態は `sessionStorage`（`aggregate-store.js`）にバンドル保存され、集計のバケットキーにも含まれる

---

## 7. コース定義とフェーズ管理

### フェーズ数（フォールバック）

`src/engine/phase.js`:

```javascript
calcPhaseCount(distance) = max(5, round(distance / 270))
```

コーナー位置はフェーズインデックスの 15% / 35% / 55% / 75% 付近に自動配置。

### コース定義あり（推奨）

`courses.json` の `segments[]` 各要素:

| フィールド | 説明 |
|-----------|------|
| `id` | セグメント ID（`corner4`, `final` 等） |
| `label` | 画面表示名（「第3コーナー」等） |
| `kind` | `start` / `straight` / `corner` / `final` |
| `ratio` | 距離配分（合計で正規化） |
| `cornerNo` | コーナー番号（任意） |

`buildPhasesFromCourse` が `distance * ratio` を各フェーズの `distance` に設定。

### フェーズオブジェクト（実行時）

```javascript
{
  index, distance, ratio,        // 0〜1 の進行率
  isCorner, isFinal,
  segmentId, segmentLabel, kind, cornerNo  // コース定義時
}
```

フェーズ名表示: `Renderer.getPhaseName(phase)`（セグメントラベル優先）。

---

## 8. シミュレーションエンジン

エントリ: `runSimulation(raceData, options, ratingAdjustments, renderer)`  
戻り値: `{ results, logs, snapshots, phases }`

### 1フェーズの処理順（概要）

```
1. フェーズ開始（pathAtPhaseStart 記録、C4通過時 staminaRatioAfterC3）
2. 描画メトリクス取得（renderer がある場合）
3. フェーズ特化バトル（battle-phase.js: 先頭争い・コーナー位置・終盤決戦）
4. 接触ペア検出 → 通常バトル（最大1組/フェーズ）
5. 各馬を前から順に:
   a. V_eff 算出・縦移動意図
   b. スタート/隊列形成/不規則イベント
   c. targetLane 決定（lane-ai / lane-decision）
   d. 横移動・衝突解決（collision.js）
   e. 経路スタミナ消費（path-stamina.js）
6. コーナー距離ロス（applyCornerLoss）
7. フェーズ終了: battlePenalty リセット、スナップショット保存
```

### 実効速度

```
paceMult = getFormationPaceMultiplier(...)   // 隊列形成期のみ ≠ 1
staminaMod = stamina > 0 ? 1.0 : 0.7
V_eff = S_cruise * staminaMod * battlePenalty * paceMult
desiredAdvance = V_eff * (phase.distance / 80)
```

`80` は `SIM_X_METERS_DIVISOR`（`constants.js`）。sim-x と走行距離（m）の換算に使用。

### 着順・タイム

全フェーズ終了後、各馬の `x` とスタミナ・last_3f 等から到達時刻を算出（`simulation.js` 末尾）。UI では `finish-times.js` がタイムラベル・着差を整形。

---

## 9. 隊列形成（formation）

実装: `src/engine/formation.js`。全行程の脚質ペーステーブル（`CONFIG.STYLE_PACE`）は **deprecated**。

| 概念 | 説明 |
|------|------|
| `formationTargetRank` | 脚質レンジ内で RNG サンプルした目標隊列位置（0=先頭側, 1=後方） |
| `FORMATION_LOCK_PHASE`（0.40） | これより前を「隊列形成期」とみなす |
| `getFormationPaceMultiplier` | 形成期のみ ave3f・スタートバーストで微調整 |
| `getFormationOrderBias` | 目標隊列との差に応じた縦位置バイアス |
| `getFormationPreferredLane` | 逃げ・大逃げは内寄りレーンを優先 |

脚質別目標レンジ例: 大逃げ 0.00〜0.08、逃げ 0.00〜0.18、先行 0.12〜0.38、差し 0.35〜0.72、追込 0.55〜0.92。

---

## 10. レーン移動・衝突回避

| モジュール | 役割 |
|-----------|------|
| `lane-ai.js` | 脚質・フェーズ・周辺馬から `targetLane` を算出 |
| `lane-decision.js` | ローカル抜け・スパート進入・内ポケット等の高度判断 |
| `collision.js` | 前後・斜め後ろブロック、重なり解消、序盤の内寄せ圧縮 |

横位置 `y` は連続値（1.0〜18.0）。`laneIndex(y)` は表示用に丸め。

**レーン変更率:** `CONFIG.LANE_CHANGE_RATE`（0.15）をベースに、フェーズ・脚質で変動（`getLaneChangeRate`）。

衝突・描画の最小間隔は `Renderer.getCollisionMetrics` が頭数・フェーズに応じて動的に返し、バトル近接判定（`battle.js`）と共有する。

---

## 11. バトル解決

### 通常バトル（`battle.js`）

- **発動条件:** 2頭が `isPairBattleProximity` 内、かつ `shouldBattle` の確率判定
- **基本確率:** `BATTLE_BASE_RATE`（0.68）+ 同レーン/隣接レーン補正 + 密集ボーナス
- **1フェーズ最大1組**（`engagedHorseIds` で打ち切り）

**勝敗:**

```
e = M_maneuv * 0.6 + S_cruise * 0.4 + rand(-5, 5)
```

敗者: `battlePenalty`（騎手安定で軽減）、`BATTLE_STAMINA_COST` 消費、次フェーズまで速度ペナルティ。

### フェーズ特化バトル（`battle-phase.js`）

- 先頭争い（序盤・`LEAD_BATTLE_PHASE_MAX` 以前）
- コーナー位置取り
- 最終直線の決戦（`FINAL_DUEL_PHASE_MIN` 以降）

### ゴールシーン

`PhaseController` 内で別ロジック。近接幅は `buildGoalBattleProximityLimits`。`GOAL_BATTLE_RATE_BONUS` を加算可能。

---

## 12. スタミナモデル

### 馬場係数

`CONFIG.TRACK_MODIFIER[track][condition]` — 経路消費・旧式フェーズ消費に乗算。

### 経路ベース消費（現行）

フラグ: `USE_PATH_BASED_STAMINA = true`（`constants.js`）

- フェーズ内の移動セグメントごとに `calcPathSegmentMeters` → `calcPathStaminaDrain`
- コーナー外レーンは `LANE_COEFF[lane]` で追加消費
- レーン変更・加速・バトルはイベントとして別トラッカー（`staminaLaneCost` 等）

### 安全策モデル

`USE_SAFE_STAMINA_MODEL = true` 時、イベント疲労スコアが終盤速度に反映（`SAFE_GOAL_EVENT_FATIGUE_WEIGHT` 等）。

### 枯渇時

`stamina <= 0` → `STAMINA_MODIFIER_EMPTY`（0.7）を `V_eff` に適用。

### 斤量

`horse.weight` から `weightStaminaMult`（`horse-utils.js`）— バトル消費等に反映。

---

## 13. ゴールシーン

実装: `src/ui/goal-scene.js` + `PhaseController` のゴールラン。

| 項目 | 内容 |
|------|------|
| 距離イメージ | ゴールライン手前 **200m**（`GOAL_FURLONG_METERS`）を画面に収める |
| 速度 | 各馬の `last_3f` から intrinsic 速度を算出し、スタミナ残で上限 |
| 演出 | 横スクロール的カメラ追従、フurlong マーカー、シーン遷移フェード |
| 記録 | `goalRecording` フレーム列を sessionStorage に分離保存（容量対策） |

本編最終フェーズのスナップショットから、ゴール専用の進行・バトル・描画に切り替わる。

---

## 14. 描画・UI（シミュレーター）

### Renderer（`src/ui/renderer.js`）

- Canvas 2D、DPR 対応リサイズ
- `_drawBackground` / `_drawLanes` / `_drawRails` / `_drawHorses`
- スタートゲート二層描画（`back` / `front`）
- 同一レーン近接時は縦方向オフセットでカード重なり防止

### PhaseController（`src/ui/phase-controller.js`）

- シミュレーション結果の `snapshots` を順再生
- フェーズ内 `phaseProgress` 0→1 をアニメーション
- 再生速度・一時停止・「次のフェーズ」ボタン
- ログを `#log-panel` に HTML 整形して追記（`race-log.js`）

### 出馬表（左パネル）

- 折りたたみ可能（`entry-panel--collapsed`）
- スタミナバー（`entry-stamina.js`）、脚質バッジ、印表示

### レスポンシブ

`index.html` 内メディアクエリでモバイル向けレイアウト調整。ゴール時の強制ランドスケープ（Screen Orientation API）は必須ではない。

---

## 15. レースサマリーと集計

### レースサマリー

- 着順掲示板（枠色・タイム・着差）: `placing-panel.js`, `finish-times.js`
- 馬別イベント: スナップショットの `eventLogs` から馬名で抽出（`main.js` `extractHorseEventsBySnapshots`）

### 集計（`stats.html`）

- `aggregate-store.js`: `sessionStorage` キー `jra-sim-aggregate-v1`
- バケットキー: `race_id` + 出走・条件・スライダー・印のハッシュ（`computeBucketKey`）
- 各 run に着順・1着馬名等を保存し、頻度表・ソート可能テーブルで表示（`stats-app.js`）

---

## 16. ログ仕様

### フォーマット例

```
[バトル:進路争い] 馬A vs 馬B → 勝者: 馬A (E: 72.3 vs 68.1)
[好スタート] 馬名 がスタートダッシュを決める（+15%）
```

- グローバルログ: `runSimulation` の `logs[]`
- フェーズログ: 各スナップショットの `eventLogs[]`
- UI: `formatLogLineHtml` で馬名・バトル種別を色分け

レースサマリー用の見出し行（`RACE_SUMMARY_HEADER_LINE`）は馬別イベントから除外。

---

## 17. 技術スタックとプロジェクト構成

| 項目 | 採用 |
|------|------|
| フロント | HTML / CSS / JavaScript（ES Modules、**ビルド不要**） |
| テスト | Vitest |
| データ更新（任意） | Python 3 + PostgreSQL → `scripts/export_race_json.py` |
| UI フレームワーク | なし（バニラ JS） |
| アニメーション | Canvas 描画 + `requestAnimationFrame`（ゴール・フェーズ補間） |

```
jra-race-simulator/
├── index.html              # メイン UI
├── stats.html              # 集計
├── main.js                 # エントリ
├── src/
│   ├── config.js           # ゲームバランス定数
│   ├── engine/             # シミュレーションコア
│   ├── ui/                 # 描画・再生・プレレース
│   ├── stats/              # 集計・race-info 表示
│   ├── lib/                # コース解決等
│   └── data/               # JSON データ
├── tests/                  # Vitest
└── scripts/                # DB エクスポート
```

---

## 18. テストと再現性

```bash
npm test          # 単体 + simulation ゴールデン
npm run test:watch
```

| テスト | 内容 |
|--------|------|
| `simulation.test.js` | 同一 `race_id` で結果が一致（ゴールデンスナップショット） |
| `formation.test.js` | 隊列目標の脚質レンジ |
| `rating-adjustments.test.js` | スライダー補正 |
| `path-stamina.test.js` | 経路消費 |
| 他 | RNG、コース解決、バトル近接、斤量、ゴールスタミナ等 |

エンジン変更で意図的に結果を変えた場合は `tests/fixtures/golden-snapshot.json` の更新が必要。

---

## 19. データ更新（任意）

PostgreSQL（PRISM_SCENE 等）から JSON を再生成:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/export_race_json.py
```

出力: `src/data/race-info.json`, `src/data/race-entries.json`  
詳細: `.cursor/skills/export-race-json/SKILL.md`

---

## 付録A：主要定数の参照先

**ゲームバランス（頻繁に触る）:** `src/config.js`

| 定数 | 既定値（抜粋） |
|------|----------------|
| `LANE_COUNT` | 18 |
| `BATTLE_BASE_RATE` | 0.68 |
| `BATTLE_PENALTY` | 0.85 |
| `STAMINA_MODIFIER_EMPTY` | 0.7 |
| `TRACK_MODIFIER` | 芝/ダート × 馬場状態 |

**シミュレーション詳細:** `src/engine/constants.js`（衝突間隔、ゴール AI、スタミナフラグ、隊列ロック比率など）

> 定数を本書に全部転載しない。変更時はコードを正とし、必要なら本書の説明段落のみ更新する。

---

## 付録B：初期設計（v1.0）からの主な変更

| v1.0 設計 | 現行実装 |
|-----------|----------|
| 製品名 CARD SIMULATOR | **RACE SIMULATOR** |
| 横5レーン（最内〜大外） | **連続18レーン** + ゲート線形配置 |
| 10pt 一括配分 | **馬・騎手・調教** の ±5 スライダー（各±5%） |
| 印 ◎〇▲ のみ | ◎◯▲△★☆×消、重複ルール拡張 |
| 脚質4種 + 全行程 STYLE_PACE | **大逃げ** 追加、形成期 **formation** へ移行 |
| 単一 JSON | **race-info / race-entries** 分割 + courses |
| RaceState シングルトン | **runSimulation** + snapshots |
| 常時60fps ロジック | **フェーズ離散** + rAF 描画のみ |
| MVP Phase 1〜3 チェックリスト | **実装済み機能**として本書に統合 |
| 結果・払戻画面 | **レースサマリー** + **stats 集計**（払戻は非対象） |

---

*README.md は利用者向けクイックスタート、本書は開発者向け as-built 仕様として併用する。*
