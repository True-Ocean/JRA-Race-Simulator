---
name: vitest
description: Run Vitest tests for jra-race-simulator (npm test, watch mode, simulation golden tests). Use when the user asks to run tests, Vitest, npm test, verify reproducibility, or check engine changes after editing src/engine/.
---

# Vitest（jra-race-simulator）

## コマンド（リポジトリルートで実行）

| コマンド | 用途 |
|---------|------|
| `npm test` | 全テストを1回実行 |
| `npm run test:watch` | ウォッチモード（`src/engine/` 編集中） |
| `npx vitest run tests/simulation.test.js` | シミュレーションのみ |
| `npx vitest run tests/rng.test.js` | RNG のみ |

## エージェントの実行手順

1. リポジトリルートで Shell を実行
2. 通常は `npm test` を実行（ユーザーが watch を明示したときだけ `npm run test:watch`）
3. 失敗時は stderr を要約し、修正方針を提案

## いつ実行するか

- `src/engine/` 配下を変更した後
- ユーザーが「テストして」「Vitest 回して」と依頼したとき
- コミット前の確認としてユーザーが求めたとき

## 失敗時の判断

| 症状 | 対応 |
|------|------|
| 再現性テスト失敗 | seed / RNG / 非決定的処理を疑う |
| ゴールデンテスト失敗 | 意図したロジック変更なら `tests/fixtures/golden-snapshot.json` を更新 |
| `marks` 関連エラー | `runSimulation(..., {}, {}, null)` — marks は `{}` |

## テスト対象外

- ゴールシーン（`PhaseController` / rAF）
- Canvas / `Renderer`
- ブラウザ UI

これらはブラウザ手動確認。

## IDE ショートカット（このリポジトリ）

- **Cmd+Shift+T** — Vitest 全件（Tasks: Run Test Task）
- **Cmd+Shift+Alt+T** — Vitest ウォッチ

## 関連ファイル

- `tests/simulation.test.js` — 再現性 + ゴールデン
- `tests/fixtures/golden-snapshot.json` — seed=1 の正解値
- `tests/helpers/load-race-fixture.js` — 本番 JSON からフィクスチャ組み立て
