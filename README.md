# Horse Race Simulator

中央競馬を題材にした、ブラウザ上で動くレースシミュレーターです。画面上の表示名は **Horse Race Simulator** です。出走馬の能力・脚質・コース条件などをもとにレースを再現し、オリジナル設定・ゴール後のレースサマリー・複数走のシミュレーション集計まで一連の流れを操作できます。

> **注意:** 本プロジェクトは JRA および関係各社の公式製品ではありません。

## 免責事項

**Disclaimer:** This application is for entertainment purposes only. It does not provide financial or betting advice. Users are responsible for their own decisions.

**免責事項：** 本アプリはエンターテインメントを目的としており、金融または勝馬投票（賭博）に関する助言を提供するものではありません。利用者は自己の責任において本アプリを使用するものとします。

Created by シャノワール. All rights reserved.

## 主な機能

| 画面 | 説明 |
|------|------|
| **シミュレーター** | コース上のレース進行をフェーズ単位で再生。バトル・スタミナ・レーン争いなどを可視化 |
| **オリジナル設定** | 脚質の変更、あなたの評価（🥕）、予想印の付与 |
| **レースサマリー** | ゴール後の着順掲示板・各馬のイベント |
| **シミュレーション集計** (`stats.html`) | 複数シミュレーション結果の集計・比較（セッションストレージに保存） |

シミュレーションエンジンは `src/engine/` に集約され、Vitest によるゴールデンテストで再現性を検証しています。

初回起動時はシミュレーター画面が開きます。脚質・🥕・予想印の編集はナビの **オリジナル設定** から行います。レース進行は **スタート**（フェーズ送り）と **オート**（自動進行）の両方に対応しています。

開発者向けの詳細仕様は [Development_Instruction.md](./Development_Instruction.md) を参照してください。

## 技術スタック

- **フロントエンド:** 素の HTML / CSS / JavaScript（ES Modules、ビルド不要）
- **テスト:** [Vitest](https://vitest.dev/)
- **データ更新（任意）:** Python 3 + PostgreSQL（`scripts/export_race_json.py`）

## クイックスタート

### 1. 依存関係（テスト用）

```bash
npm install
```

### 2. ローカルサーバーを起動

ES Modules を使うため、`file://` で直接開かず、HTTP サーバー経由で配信してください。

```bash
# 例: Python 付属サーバー（リポジトリルートで実行）
python3 -m http.server 8080
```

動作確認には `npm run preview` も使えます（Python 3 が必要）。こちらは自動再読み込みを行わないため、コード編集・テスト中もレースの観察を続けられます。変更を反映するときだけブラウザーを手動更新してください。

Go Live はファイル変更を接続中の全ブラウザーへ通知するため、Cursor と Safari が同時に再読み込みされる場合があります。テスト・説明書・作業用ファイルは `.vscode/settings.json` で監視対象から除外しています。設定変更後は Go Live の停止・再起動が必要です（アプリ本体の保存による更新は継続します）。

点滅の切り分けにはローカルURLへ `?debug=flicker` を付け、「画面診断」→「診断記録を表示・更新」を使えます。`live-server-message` は開発サーバーの更新通知、`boot` のページ番号増加はページ再読み込み、`canvas-resize` は盤面のサイズ変更です。同期した点滅だけでは原因は断定できないため、発生時の記録で区別します。

ブラウザで次を開きます。

- メイン: [http://localhost:8080/](http://localhost:8080/)
- 集計: [http://localhost:8080/stats.html](http://localhost:8080/stats.html)

### 3. テストの実行

```bash
npm test
```

ウォッチモード:

```bash
npm run test:watch
```

VS Code / Cursor では `.vscode/tasks.json` に Vitest 用タスクが定義されています。

## レースデータについて

公開するのは、その回のG1 **1レースだけ**です。G1ごとに新しい出走データとコースレイアウトを受け取り、次のJSONを更新して公開版を差し替えます。利用者向けのレース／コース選択、過去レースの公開、汎用コースへの自動代替は行いません。

- `src/data/race-info.json` — 開催・コース・馬場状態など
- `src/data/race-entries.json` — 出走馬・騎手・脚質・能力値など
- `src/data/courses.json` — コース定義
- `src/data/finish-time-baseline.json` — タイム基準

更新時は `race-info.json` と `race-entries.json` の `race_id` を揃え、レースごとに別IDを使います。提供されたレイアウトを `courses.json` に追加・更新し、競馬場・芝／ダート・距離が一致することを確認してください。登録済みの実コース定義は残せますが、それ自体が過去レースの公開にはなりません。

未登録・不一致・不正なコースでは、エラーを表示してレース開始を止めます。ブラウザに残った別レースの結果・リプレイ・集計は現行レースとして復元しません。古いデータ自体を削除する処理ではありません。

同じ公開レースの結果は、更新後も馬番・着順・ゴール時点の余力を復元します。ただし保存容量不足などで走行記録が残っていない場合、リプレイは無効になります。同じ結果を装って再計算することはありません。

PostgreSQL（PRISM_SCENE 等）からエクスポートする場合は、Python 環境を用意したうえで `scripts/race_export/config.py` の `.env` パスを自分の環境に合わせて編集し、以下を実行します。

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/export_race_json.py
```

## プロジェクト構成

```
jra-race-simulator/
├── index.html                  # メイン UI（シミュレーター・オリジナル設定・レースサマリー）
├── stats.html                  # シミュレーション集計画面
├── main.js                     # アプリのエントリポイント
├── Development_Instruction.md  # 開発者向け as-built 仕様書
├── src/
│   ├── config.js               # シミュレーション定数
│   ├── engine/                 # シミュレーションコア（RNG・フェーズ・バトル等）
│   ├── ui/                     # 描画・オリジナル設定・ゴールシーン
│   ├── stats/                  # 集計ストア・レース表示
│   ├── lib/                    # コース解決（course-resolve.js）
│   └── data/                   # レース JSON・コースデータ
├── tests/                      # Vitest（simulation.test.js 等）
└── scripts/                    # DB → JSON エクスポート（任意）
```

## 開発のヒント

- エンジンやパラメータを変更したら `npm test` でゴールデンと単体テストを確認してください。意図した挙動変更の場合は `tests/fixtures/golden-snapshot.json` の更新が必要になることがあります。
- 新規レースは毎回乱数シードを更新し、同じ出走表でも展開・結果が変わり得ます。脚質は作戦の傾向であり、着順を固定するルールではありません。リプレイは記録済みの走行を再生します。
- エンジンの検証では、同一シード・出走表（脚質含む）・レース条件・🥕設定で再現できます（予想印は能力に直接影響しません）。ゴールシーンにもその走行のシードを渡します。
- 余力は道中とゴールで共通の走行負荷から消費し、バーは実残量を表示します。競り合い・進路・仕掛けによって消費が変わり、残量低下は速度・加速に連続的に影響します。
- 消費モデル更新に伴い、旧モデルの集計・レースサマリー・再生記録と現行データは保存キー `v2` で分離しています。旧データ自体は削除せず、出走表・オリジナル設定の保存は維持します。
- 画面仕様・エンジン詳細・データ形式は `Development_Instruction.md` が正です。

## ライセンス・著作権

Created by シャノワール. All rights reserved.

ソースコードの利用・再配布条件についてはリポジトリオーナーに問い合わせてください。
