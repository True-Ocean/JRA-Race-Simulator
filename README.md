# JRA Race Simulator

中央競馬を題材にした、ブラウザ上で動くレースシミュレーターです。出走馬の能力・脚質・コース条件などをもとにレースを再現し、プレレース編集・ゴール後のサマリー・複数走の集計まで一連の流れを操作できます。

> **注意:** 本プロジェクトは JRA および関係各社の公式製品ではありません。

## 免責事項

**Disclaimer:** This application is for entertainment purposes only. It does not provide financial or betting advice. Users are responsible for their own decisions.

**免責事項：** 本アプリはエンターテインメントを目的としており、金融または勝馬投票（賭博）に関する助言を提供するものではありません。利用者は自己の責任において本アプリを使用するものとします。

Created by シャノワール. All rights reserved.

## 主な機能

| 画面 | 説明 |
|------|------|
| **シミュレーター** | コース上のレース進行をフェーズ単位で再生。バトル・スタミナ・レーン争いなどを可視化 |
| **お好み設定** | 出走表の編集、評価スライダー（馬・騎手・調教）、印の付与 |
| **レースサマリー** | ゴール後の着順・タイム・馬ごとのイベントログ |
| **集計** (`stats.html`) | 複数シミュレーション結果の集計・比較（セッションストレージに保存） |

シミュレーションエンジンは `src/engine/` に集約され、Vitest によるゴールデンテストで再現性を検証しています。

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

デフォルトの出走情報は次の JSON に含まれています。

- `src/data/race-info.json` — 開催・コース・馬場状態など
- `src/data/race-entries.json` — 出走馬・騎手・脚質・能力値など
- `src/data/courses.json` — コース定義
- `src/data/finish-time-baseline.json` — タイム基準

PostgreSQL（PRISM_SCENE 等）からエクスポートする場合は、Python 環境を用意したうえで `scripts/race_export/config.py` の `.env` パスを自分の環境に合わせて編集し、以下を実行します。

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/export_race_json.py
```

## プロジェクト構成

```
jra-race-simulator/
├── index.html          # メイン UI（シミュレーター・お好み設定・サマリー）
├── stats.html          # 集計画面
├── main.js             # アプリのエントリポイント
├── src/
│   ├── engine/         # シミュレーションコア（RNG・フェーズ・バトル等）
│   ├── ui/             # 描画・プレレース編集・ゴールシーン
│   ├── stats/          # 集計ストア・レース表示
│   ├── data/           # レース JSON・コースデータ
│   └── config.js       # シミュレーション定数
├── tests/              # Vitest（simulation.test.js 等）
└── scripts/            # DB → JSON エクスポート（任意）
```

## 開発のヒント

- エンジンやパラメータを変更したら `npm test` でゴールデンと単体テストを確認してください。意図した挙動変更の場合は `tests/fixtures/golden-snapshot.json` の更新が必要になることがあります。
- シミュレーションの乱数はシード可能な RNG（`src/engine/rng.js`）を使用しています。

## ライセンス・著作権

Created by シャノワール. All rights reserved.

ソースコードの利用・再配布条件についてはリポジトリオーナーに問い合わせてください。
