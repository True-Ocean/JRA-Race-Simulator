---
name: export-race-json
description: >-
  Export PRISM_SCENE PostgreSQL tables to src/data/race-info.json and
  race-entries.json via .venv/bin/python scripts/export_race_json.py. Use when
  the user asks to export race JSON, refresh race data from the database, run
  export_race_json, or update race-info / race-entries from PostgreSQL.
---

# PostgreSQL → JSON エクスポート（jra-race-simulator）

## 実行コマンド（これだけ）

リポジトリルートで:

```bash
.venv/bin/python scripts/export_race_json.py
```

`.venv` と `requirements.txt` のインストールは済んでいる前提。毎回は上記1コマンドのみ実行する。

- 作業ディレクトリ: リポジトリルート
- `python scripts/export_race_json.py` だけは使わない（システム Python には依存関係が無いことがある）
- 出力: `src/data/race-info.json`, `src/data/race-entries.json`（上書き）
- 各馬 `horse` に `career`（`class_index`, `stamina_efficiency`, `graded`）、`ave_3f_range` / `last_3f_range`、`last_3f_raw`、実効 `last_3f` を含む

## Ave-3F / 上り3F の扱い

`HorseRecords` の `Ave-3F`・`上り3F` は次を**集計から除外**する（`scripts/race_export/horse_stats.py`）。

- `0`（海外レースなど計測なしのプレースホルダー）
- 範囲外（Ave-3F: 30.0〜40.0 秒、上り3F: 30.0〜40.0 秒）

除外があった馬は stderr に `excluded invalid 3F data` と件数が出る。選択走に有効値が1件も無い場合はフィールド中央値でフォールバックする。`ave_3f_range` / `last_3f_range` の `min` が `0` になることはない想定。

## エージェントの実行手順

1. リポジトリルートで `.venv/bin/python scripts/export_race_json.py` を実行
2. 成功時は stdout の `race_id`・`entries`・出力パスを伝える
3. stderr の `Warnings` があれば要約する（例: `excluded invalid 3F data`、`no valid Ave-3F`、`HorseRecords missing`、`Jockey stats missing`）
4. 失敗時のみ stderr を要約して原因を切り分ける

## いつ実行するか

- 「JSON をエクスポート」「DB から race データを更新」等の依頼時
- PostgreSQL のレース関連テーブル更新後

## 前提

- PostgreSQL 起動済み
- `.env`: `/Users/trueocean/Desktop/Python_Code/Project_Key/.env`（`DB_NAME=PRISM_SCENE`）

## 失敗時のみ

| 症状 | 対応 |
|------|------|
| `ModuleNotFoundError` | `python3 -m venv .venv` → `.venv/bin/pip install -r requirements.txt` |
| DB / `.env` エラー | PostgreSQL と `.env` の接続設定を確認 |
| `RaceInfo must have exactly 1 row` | `RaceInfo` が1レース分か確認 |

## 関連

- `scripts/export_race_json.py`
- `scripts/race_export/`（集計: `horse_stats.py`、検証: `export.py`）
- `scripts/race_export/test_horse_stats.py`（0 除外の単体テスト）
