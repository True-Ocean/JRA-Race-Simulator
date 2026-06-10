# 開発仕様書：Horse Race Simulator

**製品名（UI 表示名）:** Horse Race Simulator  
**バージョン:** 2.1.1（実装準拠・as-built）  
**最終更新:** 2026年6月10日（UI・コードとの照合修正）  
**対象コード:** リポジトリ `main` ブランチ上の完成アプリ

> 本書は初期設計ドラフト（v1.0）を、**実際に動作するコード**に合わせて書き直したものです。数値定数の正は `src/config.js` および `src/engine/constants.js` を参照してください。

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [画面構成とユーザーフロー](#2-画面構成とユーザーフロー)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [データ構造（入力JSON）](#4-データ構造入力json)
5. [能力パラメータ計算](#5-能力パラメータ計算)
6. [オリジナル設定](#6-オリジナル設定)
7. [コース定義とフェーズ管理](#7-コース定義とフェーズ管理)
8. [シミュレーションエンジン](#8-シミュレーションエンジン)
9. [隊列形成（formation）](#9-隊列形成formation)
10. [レーン移動・衝突回避](#10-レーン移動衝突回避)
11. [バトル解決](#11-バトル解決)
12. [スタミナモデル](#12-スタミナモデル)
13. [ゴールシーン](#13-ゴールシーン)
14. [描画・UI（シミュレーター）](#14-描画uiシミュレーター)
15. [レースサマリーとシミュレーション集計](#15-レースサマリーとシミュレーション集計)
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
| 横位置 | **連続レーン 1.0〜18.0**（`CONFIG.LANE_COUNT`）。ゲート番号から初期レーンを線形マッピング（`calcGateSlotLane`） |
| 回り・内ラチ | `courses.json` の `turnDirection`（**左回り＝左が内、右回り＝右が内**）を `Renderer` の `innerRailSide` に反映し、内外ラチ・レーン・馬位置を左右反転 |
| ゲート番号 | 1番＝最内・18番＝最外。左回りは画面左から 1→2→…、右回りは画面右から 1→2→…（`laneToX` + `calcGateSlotLane`） |
| 馬カード | Canvas 上に縦長カード（レーン幅に比例）。枠色の縁取り＋**馬番**（馬名は出馬表・サマリー側） |
| 背景 | 芝＝緑系 HSL、ダート＝茶系。馬場状態で明度を下げ、重・不良時は荒れパッチを追加 |
| コーナー | 外レーンに薄い黄色オーバーレイ。コーナー外回りは `LANE_COEFF` で距離ロス・スタミナ増 |
| フェーズ名 | セグメントラベルまたは比率から日本語名を中央に薄く表示 |
| スタート | フェーズ0・進行0%でゲート横並び表示後、上方向へ展開 |
| レース進行 | **スタート**（フェーズ送り）／**オート**（自動進行）／**リプレイ**／**リセット**（`#field-playback-dock`）。オート中は一時停止も可能 |
| レイアウト | **3カラム:** 出馬表（左）・盤面 Canvas（中央）・レースログ＋着順掲示板（右） |

### ゲームループ（全体フロー）

初回起動時は **シミュレーター画面** が開く（オリジナル設定は必須ではない）。ナビの「オリジナル設定」から任意で脚質・🥕・予想印を編集できる。

```
[JSON 読み込み: race-info + race-entries]
        ↓
[シミュレーター画面を表示（任意: オリジナル設定で編集）]
        ↓
[スタート押下 → calcAllParams → あなたの評価（🥕）で補正 → runSimulation]
        ↓
[PhaseController: フェーズ再生（スタート／オート）→ ゴールシーン（rAF）]
        ↓
[着順・タイム確定 → レースサマリー]
        ↓
[任意: sessionStorage へ集計 run 追加 → stats.html]
```

---

## 2. 画面構成とユーザーフロー

| 画面 | DOM / ファイル | 説明 |
|------|----------------|------|
| **シミュレーター** | `index.html` 本体（サブタイトル「シミュレーター」） | 3カラム、再生ドック（スタート／オート等）、ゴール演出。右カラムにレースログと着順掲示板 |
| **オリジナル設定** | `#pre-race-editor` | 全画面オーバーレイ。脚質・あなたの評価（🥕）・予想印 |
| **レースサマリー** | `#race-summary-screen` | 着順掲示板・各馬のイベント |
| **シミュレーション集計** | `stats.html`（サブタイトル「シミュレーション集計」） | 同一条件バケット内の複数走を集計・比較 |

**主な遷移**

- シミュレーター ↔ オリジナル設定（ナビ「オリジナル設定」／閉じるで「シミュレーター画面」。確定時は「オリジナル設定を反映しますか？」）
- レース完了後 → レースサマリー（`#btn-show-summary`「📊 レースサマリー」）
- シミュレーター / レースサマリー → 集計画面（`#btn-open-stats` 等）
- 集計画面から「前画面に戻る」で、保存済みのシミュレーター状態またはレースサマリーを復元可能

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
- 同一シード・同一入力（`entries` の脚質含む出走表・レース条件・オリジナル設定の🥕）なら、エンジン出力は再現可能（Vitest ゴールデンで検証）。予想印はシミュレーションに直接乗らない

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
        "last_3f_range": { "min": 32.9, "max": 35.4, "avg": 33.8 },
        "career": {
          "class_index": 0.5,
          "goal_class_index": 0.5,
          "stamina_efficiency": 0.5
        }
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
| `horse.ave_3f_range` / `last_3f_range` | 任意。オリジナル設定の「詳細データ」ポップオーバー用の min/max/avg |
| `horse.style` | `大逃げ` / `逃げ` / `先行` / `差し` / `追込` |
| `horse.career` | 任意。重賞実績・`class_index`・`goal_class_index`・`stamina_efficiency` 等（ゴールシーン・スタミナ消費に反映） |

### その他データファイル

| ファイル | 用途 |
|----------|------|
| `src/data/courses.json` | コースセグメント・回り方向・シミュ境界（`simBoundaries`） |
| `src/data/finish-time-baseline.json` | 着順タイム表示の基準 |

コース解決: `src/lib/course-resolve.js` の `resolveCourseDef(raceData, courseCatalog)` が次の順でマッチする。

1. `venueKey` + `surface` + `distance`
2. `race_info.course_id`
3. `venueKey` なしで距離・馬場が一意に決まるコース
4. `generic_one_turn`（汎用ワンターン）
5. `defaultCourseId`（既定: `tokyo_turf_2400`）

---

## 5. 能力パラメータ計算

実装: `src/engine/params.js` の `calcAllParams(raceData)`。ユーザー補正は `rating-adjustments.js` の `calcHorsesWithCarrots` が後段で適用する。

### フェーズ別速度能力 + 騎手分解

出走馬の `ave_3f` / `last_3f` はフィールド内 min-max 正規化して算出する。

| パラメータ | 記号 | 算出概要 |
|-----------|------|----------|
| 形成巡航 | `S_formation` | 脚質テーブル（`STYLE_FORMATION_CRUISE`）。隊列形成期の基準ペース |
| 中盤巡航 | `S_pace` / `S_cruise` | `ave_3f` 正規化 × 80 を [0,100] にクランプ |
| 終盤キック | `S_kick` | `last_3f` 正規化 × 80 を [0,100] にクランプ |
| 立ち回り | `M_maneuv` | `jockey.win_rate * 200` を [0,100] にクランプ |
| 粘り強さ | `S_sustain` | 馬の3着内率×50 + `last_3f` 正規化×30 をクランプ |
| 騎手安定 | `J_reliability` | `top3_rate` を 0.30〜0.65 でスケール |
| 騎手攻勢 | `J_aggression` | `win_rate/top3_rate` を 0.25〜0.55 でスケール |

フェーズ中の実効ベース速度は `phase-speed.js` の `resolvePhaseSpeed` が `S_formation` / `S_pace` / `S_kick` を `phase-context.js` のブレンド係数で加重平均する。

### キャリア実績（任意）

`horse.career` がある場合:

| フィールド | 用途 |
|-----------|------|
| `class_index` | 総合クラス指標（0〜1） |
| `goal_class_index` | ゴールシーン速度用（`career-goal.js` で G1 実績を主に合成） |
| `stamina_efficiency` | スタミナ消費倍率（`stamina-drain.js` の `careerDrainMult`） |
| `graded.G1` 等 | 重賞別出走・勝利・平均着順 |

### スタミナ初期値

```
initialStamina = S_sustain * 2.2
```

（🥕補正適用後も `S_sustain` から再計算）

### 枠番・初期レーン

- `calcWaku(gate, total)`: JRA 枠割り当てルール（8枠、1枠最大3頭）
- `calcGateSlotLane(gate)`: 18枠固定グリッドで 1番（最内）〜18番（最外）へ等間隔配置（内外マージン `GATE_LANE_*_MARGIN`）

### 実行時に付与される主な馬オブジェクトフィールド

`x`（縦位置・sim-x）、`y`（横レーン）、`stamina`、`battlePenalty`、`pathMeters`、`formationTargetRank`、`goalClassIndex`、`careerDrainMult` など（`params.js` 戻り値参照）。

---

## 6. オリジナル設定

実装: `src/ui/pre-race-editor.js` + `src/engine/rating-adjustments.js` + `src/ui/carrot-display.js`。画面上の名称は **オリジナル設定**（DOM ID は歴史的に `#pre-race-editor`）。

### あなたの評価（🥕・シミュレーション補正）

| 項目 | 内容 |
|------|------|
| UI 列名 | **あなたの評価**（🥕バッジの title も同文言） |
| 範囲 | 0〜10（`CARROT_MIN` / `CARROT_MAX`） |
| 補正式 | `carrotsToMultiplier(n) = 1 + n × 0.008`（10個で +8%） |
| 適用先 | `S_pace` / `S_kick` / `S_sustain` / `M_maneuv`（`S_formation` は固定） |
| UI | 各行の ± ステッパー。出馬表・レースサマリー・集計に `🥕×n` バッジ表示 |

> v1.0〜v2.0 設計の「お好み設定」「馬・騎手・調教スライダー（±5%）」は廃止し、**あなたの評価（🥕）** に統合。

### 予想印

- UI 列名: **予想印**
- 選択肢: `◎` `◯` `▲` `△` `★` `☆` `×` `消`（空欄＝なし）
- 印を選ぶと **デフォルト🥕数** が自動設定される（例: `◎`→7、`◯`→6、…、`×`→1）。その後ステッパーで手動変更可能
- 予想印は **複数頭に同じ印を付けられる**（`×` `消` 含む）
- `UNIQUE_MARK_SYMBOLS` は集計画面の**推奨印**表示用。シミュレーション能力式には印は直接乗らず、🥕経由のみ

### 脚質

テーブルから `大逃げ` / `逃げ` / `先行` / `差し` / `追込` を選択。`entries[].horse.style` を上書き。

### 操作

- **反映:** 「オリジナル設定を反映しますか？」（変更時は集計リセット確認付き）のうえ `runSimulation` を再実行
- **設定リセット:** ボタン「設定リセット」。🥕・予想印・脚質を初期化（脚質は JSON 初期値へ）
- **シミュレーター画面:** 閉じるボタンでオリジナル設定を閉じ、シミュレーターへ戻る
- 状態は `sessionStorage`（`aggregate-store.js` の `STORAGE_KEY_BUNDLE`）に `carrotsByHorse` + `marksByHorse` + `entries` を保存
- 集計バケットキー（`computeBucketKey`）は `race_id` + `race_info` + **`entries`（脚質変更を含む）** + **🥕** のハッシュ。予想印（`marksByHorse`）は集計の同一条件判定には含めない（表示・推奨印計算用に別管理）

### 開発用 API（UI 未接続）

`computeBaselineAbilityRanks(raceData)` は🥕未適用の能力順位を返すユーティリティ（`rating-adjustments.js`）。現行 UI では未表示。テスト（`rating-adjustments.test.js`）で検証。

---

## 7. コース定義とフェーズ管理

### フェーズ数（フォールバック）

`src/engine/phase.js`:

```javascript
calcPhaseCount(distance) = max(5, round(distance / 270))
```

コーナー位置はフェーズインデックスの 15% / 35% / 55% / 75% 付近に自動配置。

### コース定義あり（推奨）

`courses.json` の各コース:

| フィールド | 説明 |
|-----------|------|
| `id` | コース ID（`tokyo_turf_1600` 等） |
| `venueKey` / `surface` / `distance` | 解決キー（`finish-times.js` の venue/surface 正規化と対応） |
| `turnDirection` | `"left"`（左回り）または `"right"`（右回り）。描画の `innerRailSide` に使用 |
| `innerRailSide` | 任意。`turnDirection` より優先（`"left"` / `"right"`） |
| `simBoundaries` | シミュレーション境界（下記） |
| `segments[]` | フェーズセグメント配列 |

`segments[]` 各要素:

| フィールド | 説明 |
|-----------|------|
| `id` | セグメント ID（`corner4`, `final` 等） |
| `label` | 画面表示名（「第3コーナー」等） |
| `kind` | `start` / `straight` / `corner` / `final` |
| `simRole` | `launch` / `settle` / `pace` / `kick`（速度ブレンド用） |
| `ratio` | 距離配分（合計で正規化） |
| `cornerNo` | コーナー番号（任意） |

`simBoundaries` の主なフィールド:

| フィールド | 説明 |
|-----------|------|
| `launchThroughSegmentIndex` | スタート〜序盤（launch）終了セグメント |
| `settleThroughSegmentIndex` | 隊列形成（settle）終了セグメント |
| `formationEndRule` | `"beforeFirstCorner"` 時は第1コーナー手前で settle 終了 |
| `kickRemainingMeters` | 終盤キック帯の残り距離（既定 600m） |

`buildPhasesFromCourse` が `distance * ratio` を各フェーズの `distance` に設定。`phase-context.js` の `createPhaseContext` が境界進行率（`launchEndProgress` / `settleEndProgress` 等）を解決し、`phase-speed.js`・`formation.js` が参照する。

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

エントリ: `runSimulation(raceData, options, carrotsByHorse, renderer)`  
戻り値: `{ results, logs, snapshots, phases }`

`raceData.courseDef` は `main.js` 側で `resolveCourseDef` 済みを想定。`createPhaseContext` がコース境界を構築する。

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
baseSpeed = resolvePhaseSpeed(horse, phase, phaseCtx)  // S_formation / S_pace / S_kick のブレンド
paceMult = getFormationStylePaceMult(...) 等          // 隊列形成・脚質補正
staminaMod = stamina > 0 ? 1.0 : 0.7
V_eff = baseSpeed * staminaMod * battlePenalty * paceMult
desiredAdvance = V_eff * (phase.distance / 80)
```

`80` は `SIM_X_METERS_DIVISOR`（`constants.js`）。sim-x と走行距離（m）の換算に使用。

### 着順・タイム

全フェーズ終了後、各馬の `x` とスタミナ・last_3f 等から到達時刻を算出（`simulation.js` 末尾）。UI では `finish-times.js` がタイムラベル・着差を整形。

---

## 9. 隊列形成（formation）

実装: `src/engine/formation.js` + `src/engine/phase-context.js` + `src/engine/battle-formation.js`。全行程の脚質ペーステーブル（`CONFIG.STYLE_PACE`）は **deprecated**。

| 概念 | 説明 |
|------|------|
| `formationTargetRank` | 脚質レンジ内で RNG サンプルした目標隊列位置（0=先頭側, 1=後方） |
| `launch` / `settle` / `pace` / `kick` | `courses.json` の `simRole` と `phase-context` 境界でフェーズ速度ブレンドを切替 |
| `getFormationStylePaceMult` | 形成期（launch/settle）の脚質別ペース微調整 |
| `getFormationOrderBias` | 目標隊列との差に応じた縦位置バイアス |
| `getFormationPreferredLane` | 逃げ・大逃げは内寄りレーンを優先 |
| `FORMATION_LOCK_PHASE`（0.40） | レガシー定数。現行は `phaseCtx.settleEndProgress` 等が優先 |

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

### キャリア効率

`horse.career.stamina_efficiency` から `careerDrainMult`（`stamina-drain.js`）— 経路スタミナ消費の全体倍率に反映。

---

## 13. ゴールシーン

実装: `src/ui/goal-scene.js` + `PhaseController` のゴールラン + `src/engine/goal-stamina-expression.js`。

| 項目 | 内容 |
|------|------|
| 距離イメージ | ゴールライン手前 **200m**（`GOAL_FURLONG_METERS`）を画面に収める |
| 速度 | 各馬の `last_3f` から intrinsic 速度（`goalIntrinsicMpsFromLast3f`）を算出。`goalClassIndex`（キャリア実績）・スタミナ残・進路品質で補正 |
| スタミナ | ゴール専用ドレイン（予備燃焼・先頭粘り等、`goal-scene.js`） |
| 演出 | 進行度ベースの描画、ゴールライン、シーン遷移フェード（`drawGoalCourseFrame`） |
| 記録 | `goalRecording` フレーム列を `SESSION_KEY_SIMULATOR_GOAL_RECORDING` に分離保存（容量対策） |

本編最終フェーズのスナップショットから、ゴール専用の進行・バトル・描画に切り替わる。

---

## 14. 描画・UI（シミュレーター）

### Renderer（`src/ui/renderer.js`）

- Canvas 2D、DPR 対応リサイズ
- `courseDef.turnDirection`（または `innerRailSide`）から `innerRailSide` を解決し、レーン・ラチ・馬・ゲートを左右反転
- `laneToX(lane)`: レーン1＝最内。左回りは X 昇順、右回りは X 降順
- `_drawBackground` / `_drawLanes` / `_drawRails` / `_drawHorses`
- スタートゲート二層描画（`back` / `front`）。各枠は `calcGateSlotLane(gate)` → `laneToX` で配置
- 同一レーン近接時は縦方向オフセットでカード重なり防止
- 盤面上に `#field-placing-overlay` で着順掲示板のオーバーレイも重ねる（右カラムの掲示板と同期）
- シミュレーションエンジンは `turnDirection` を参照しない（レーン1＝最内の論理座標のみ）。左右反転は描画専用

### PhaseController（`src/ui/phase-controller.js`）と再生ドック

- `PhaseController`: シミュレーション結果の `snapshots` を順再生。フェーズ内 `phaseProgress` 0→1 をアニメーション。ゴールシーン本体も担当
- `main.js` + `#field-playback-dock`: **スタート**（初回はシミュレーション実行、以降はフェーズ送り）／**オート**（自動進行・一時停止）／**リプレイ**／**リセット**。ラベル更新は `playback-dock-label.js`
- ログを `#log-panel` に HTML 整形して追記（`race-log.js`）

### 出馬表（左パネル）

- 折りたたみ可能（`entry-panel--collapsed`）
- スタミナバー（`entry-stamina.js`）、脚質バッジ、**あなたの評価（🥕）** バッジ（`carrot-display.js`）

### レスポンシブ

`index.html` 内メディアクエリでモバイル向けレイアウト調整。ゴール時の強制ランドスケープ（Screen Orientation API）は必須ではない。

---

## 15. レースサマリーとシミュレーション集計

### レースサマリー

- **着順掲示板**（枠色・タイム・着差）: `placing-panel.js`, `finish-times.js`
- **各馬のイベント**: スナップショットの `eventLogs` から馬名で抽出（`main.js` `extractHorseEventsBySnapshots`）

### シミュレーション集計（`stats.html`）

- 画面サブタイトル: **シミュレーション集計**。ツールバーに「前画面に戻る」「集計リセット」
- `aggregate-store.js`: `sessionStorage` キー `jra-sim-aggregate-v1`
- バケットキー: `race_id` + `race_info` + `entries`（脚質含む）+ **🥕**（`computeBucketKey`）。予想印はバケットに含めない
- 各 run に着順を `source: 'manual' | 'auto'` で保存（`addAggregateRun`）。集計表示は手動・オートのみ（`manualRunsOnly`）。`source: 'batch'` はレガシーで現行 UI からは追加されない
- 頻度表・ソート可能テーブルで表示（`stats-app.js`）
- 集計表の**推奨印**（`AUTO_MARKS`）と**オリジナル設定の印**（`marksByHorse`）を併記。複合スコア順位も表示

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
├── stats.html              # シミュレーション集計
├── main.js                 # エントリ
├── src/
│   ├── config.js           # ゲームバランス定数
│   ├── engine/             # シミュレーションコア
│   │   ├── simulation.js   # runSimulation
│   │   ├── params.js       # calcAllParams / calcGateSlotLane
│   │   ├── phase.js        # buildPhases
│   │   ├── phase-context.js # launch/settle/pace/kick 境界
│   │   ├── phase-speed.js  # resolvePhaseSpeed
│   │   ├── formation.js    # 隊列形成
│   │   ├── rating-adjustments.js  # 🥕・印
│   │   ├── career-goal.js  # ゴール用クラス指数
│   │   ├── goal-stamina-expression.js
│   │   └── …               # battle / collision / lane-ai 等
│   ├── ui/                 # 描画・再生・オリジナル設定
│   │   ├── renderer.js     # Canvas（回り方向反転含む）
│   │   ├── phase-controller.js
│   │   ├── pre-race-editor.js  # オリジナル設定 UI
│   │   ├── goal-scene.js
│   │   └── carrot-display.js
│   ├── stats/              # 集計・race-info 表示
│   │   ├── aggregate-store.js
│   │   └── stats-app.js
│   ├── lib/
│   │   └── course-resolve.js
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
| `rating-adjustments.test.js` | 🥕補正・印デフォルト・バンドル復元 |
| `phase-context.test.js` | コース境界（launch/settle/kick） |
| `phase-speed.test.js` | フェーズ別速度ブレンド |
| `gate-slot-lane.test.js` | ゲート→レーン配置 |
| `career-goal.test.js` | ゴール用クラス指数 |
| `path-stamina.test.js` | 経路消費 |
| `stamina-drain.test.js` | キャリア効率・消費倍率 |
| 他 | RNG、コース解決、バトル近接・formation、斤量、ゴールスタミナ、params 等 |

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

> 盤面の内ラチ向きなど現行仕様の正は **§1・§14** を参照。下表の「v1.0 設計」列は初期ドラフトまたは旧版の記述。

| v1.0 設計 | 現行実装 |
|-----------|----------|
| 製品名 CARD SIMULATOR | **Horse Race Simulator** |
| 横5レーン（最内〜大外） | **連続18レーン** + ゲート線形配置 |
| お好み設定・10pt 一括配分 | **オリジナル設定**の**あなたの評価（🥕）** 0〜10（1個=+0.8%、10個=+8%） |
| 印 ◎〇▲ のみ | **予想印** ◎◯▲△★☆×消。デフォルト🥕設定用、複数頭に同一印可 |
| 脚質4種 + 全行程 STYLE_PACE | **大逃げ** 追加、**launch/settle/pace/kick** + formation |
| 単一 JSON | **race-info / race-entries** 分割 + courses（`simBoundaries`・`turnDirection`） |
| RaceState シングルトン | **runSimulation** + snapshots |
| 常時60fps ロジック | **フェーズ離散** + rAF 描画のみ |
| 3能力のみ（S_cruise 等） | **S_formation / S_pace / S_kick** 分離 + `resolvePhaseSpeed` |
| キャリア実績なし | `horse.career` 任意（ゴール速度・スタミナ効率） |
| 内ラチ「左回り＝右が内」 | **左回り＝左が内、右回り＝右が内**（`Renderer.innerRailSide`） |
| MVP Phase 1〜3 チェックリスト | **実装済み機能**として本書に統合 |
| 結果・払戻画面 | **レースサマリー** + **stats 集計**（払戻は非対象） |

---

*README.md は利用者向けクイックスタート、本書は開発者向け as-built 仕様として併用する。*
