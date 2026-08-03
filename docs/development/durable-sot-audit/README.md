# 1-1 Durable SoT Audit

新機能追加ではありません。MINERVOT 本番状態のうち、

- process memory / `globalThis` / `Map` / `Set`
- local file / `.data` / JSON
- `localStorage` / `sessionStorage`
- fire-and-forget / detached promise

に依存している箇所を main 実コードから可視化し、Durable SoT 移行対象を確定するフェーズです。

## 【ATLAS機能評価】（監査ゲート）

機能名：Durable SoT Audit（観測・診断のみ）

ユーザー価値：再起動・デプロイで仕事が消える / 二重実行 / 誤 completed を防ぐための前提可視化

差別化：会話ログではなく「仕事の永続 SoT」を監査対象にする

繰り返し作業の削減：はい — 障害調査と手動リカバリの習慣的負担を減らす前提作り

AI必要度：不要

AIなしで実装可能：はい

運営コスト：CI 静的スキャン + 軽量 Vitest。外部 API なし

外部APIコスト：無

コスト削減案：

- エコモード：該当なし（AI不使用）
- まとめて生成：静的スキャン一括
- キャッシュ再利用：baseline fingerprint
- 予約実行：CI artifact
- AI起動条件：なし
- 外部API最小化：なし
- 承認後実行：移行は後続 Phase
- 再生成禁止：baseline 差分ゲートで新規悪化のみ FAIL

優先度：P0（移行の前提）

## 成果物

| Artifact | 生成元 |
|---|---|
| `artifacts/durable-sot-audit/durable-sot-audit.json` | `scripts/ci/durable-sot-audit.mjs` |
| `process-memory-inventory.json` | 同上 |
| `file-fallback-inventory.json` | 同上 |
| `browser-storage-inventory.json` | 同上 |
| `detached-promise-inventory.json` | 同上 |
| `diff-gate.json` | baseline 差分 |
| `migration-plan.md` | 本ディレクトリ（手書き+コード根拠） |
| `lib/persistence/durable-sot-audit/*` | ドメイン SoT / 再起動 / 複数 instance / P0–P2 |

## CI

- Quality Gate は既存問題では FAIL しない
- baseline（`baselines/durable-sot-audit.baseline.json`）より **新規** の危険 fingerprint のみ FAIL
- artifact は upload される

## 実行

```bash
npm run ci:durable-sot-audit
npm test -- --run lib/persistence/durable-sot-audit
```

## 禁止事項（本 Phase）

Queue / Worker / Scheduler 全面置換、DB migration 本実装、UI 変更、mock 成功、複数 Phase 同時実装は行わない。
