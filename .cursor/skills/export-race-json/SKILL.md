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
- 各馬 `horse` に `career`（`class_index`, `stamina_efficiency`, `graded`）、`last_3f_raw`、実効 `last_3f` を含む

## エージェントの実行手順

1. リポジトリルートで `.venv/bin/python scripts/export_race_json.py` を実行
2. 成功時は stdout の `race_id`・`entries`・出力パスを伝える
3. stderr の `Warnings` があれば要約する
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
- `scripts/race_export/`
