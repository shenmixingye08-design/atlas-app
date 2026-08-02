# 成果物好み学習（Deliverable Preference Learning）

## 概要

Personal Memory（`atlasPersonalMemory`）を拡張し、成果物の修正 Diff から好みを候補化し、承認後のみ正式 Memory へ反映します。

## Memory 分離

| 層 | 表現 |
|----|------|
| 全体 | `appliesTo.global` |
| Automation 別 | `appliesTo.automationIds` |
| 成果物カテゴリ | `appliesTo.workCategories` |
| 会社別 | `appliesTo.companyIds` |
| テンプレート別 | `appliesTo.templateIds` |

## 優先順位

1. 今回の明示指示  
2. Automation 専用 Memory  
3. 成果物カテゴリ Memory  
4. 会社 Memory  
5. 全体 Memory  
6. システム推論（active のみ・通常は候補）

## Migration

追加テーブル不要。既存 durable domain `atlasPersonalMemory` の JSON に
`workCategories` / `companyIds` / `templateIds` を追加。読込時 `normalizeAppliesTo` で後方互換。

## API

- `POST /api/personal-memory/learn-diff`
- `GET /api/personal-memory/suggestions`
- `POST /api/personal-memory/apply-preview`
- `POST /api/personal-memory/[id]/decide`（はい / 今回だけ / いいえ）
- `POST /api/personal-memory/[id]/session-disable`

## 禁止事項の実装対応

- 推測のみで active 化しない（候補→承認）
- 1回修正で確定しない（`CORRECTION_REPEAT_THRESHOLD`）
- OFF / paused / session-disable は注入しない
- カテゴリ・Automation を跨がない（`selectRelevantMemories`）
