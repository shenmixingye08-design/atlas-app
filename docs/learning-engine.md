# Learning Engine（経験学習エンジン）

開発ルールの正: [`ATLAS_RULES.md`](../ATLAS_RULES.md) §8  
Work Memory の上位機能として、仕事の結果を分析し次回の仕事を改善するためのエンジンです。

## 学習サイクル

```
仕事 → 記憶 → 結果 → 分析 → 改善 → 次回へ反映
```

## Work Memory との関係

| レイヤー | 役割 |
|---------|------|
| **Work Memory** | 再利用可能な業務情報の保存・注入 |
| **Learning Engine** | 記憶・イベント・Outcome を集計し、期間分析で改善提案 |

Learning Engine が参照する Work Memory 種別:
`outcome`, `correction`, `result`, `habit`, `template`, `workflow`

## 構成

```
lib/learning-engine/
  types.ts       — 期間・イベント・レポート型
  domains.ts     — 仕事ドメイン推定（拡張可能）
  store.ts       — LearningEvent / LearningReport ストア
  analytics.ts   — 根拠付き分析ロジック
  engine.ts      — 分析実行・イベント記録
  service.ts     — server-only エクスポート
  client.ts      — ブラウザ API
```

## 分析タイミング

- **30 / 90 / 180 / 365 日** — ユーザーが `/settings/learning` で「分析を実行」
- **チャット・依頼中には分析しない**
- **仕事完了時** — `recordLearningEventFromOrchestration` + Work Memory 候補のみ（分析なし）

## 改善提案の生成

`analytics.ts` が Work Memory と Learning Event からメトリクスを算出:

- 作業頻度（ドメイン別イベント数）
- 利用率（template/workflow の usageCount、memoriesUsedCount）
- 修正回数・推移（correction 記憶 + correctionApplied イベント）
- 作業時間（durationMs 平均）
- 完成度（result/outcome 件数）

各提案には **evidence**（根拠文字列）を必ず付与。データ不足時は「十分な学習データがありません。」

## 表示（4項目）

1. 改善点
2. 維持したい点
3. おすすめ
4. 今後の提案

## API

- `GET /api/learning-engine/report?periodDays=30` — 最新レポート
- `POST /api/learning-engine/report` — 分析実行
- `GET /api/learning-engine/reports` — 履歴

## テスト

```bash
npm test -- lib/learning-engine/learning-engine.test.ts
```
