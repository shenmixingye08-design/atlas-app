# Memory共有 Production Blocker #3 レポート

## 【ATLAS機能評価】

機能名：Memory共有（PersonalizationContext 単一SoT）  
ユーザー価値：昨日チャットで話した内容を、今日の Automation・Vision・OCR・Word まで全部使える  
差別化：Chat専用 / 表面別 Memory を廃止し、loadMemory → saveMemory の一本道  
繰り返し作業の削減：はい  
AI必要度：低  
優先度：P0

---

## Memory共有図

```
Personal Memory / Work Memory (durable SoT)
        │
        ▼
  loadMemory()  === MemoryProvider + PersonalizationContext
        │
        ▼
  PersonalizationContext（唯一の共有）
  memoryVersion: version / updatedAt / source / checksum
        │
        ▼
  PromptBuilder
        │
        ├─ Chat
        ├─ Commander
        ├─ Planner
        ├─ Automation
        ├─ Scheduler
        ├─ Vision
        ├─ OCR
        ├─ Word / Excel / PDF / PowerPoint
        ├─ Regenerate
        └─ 通知生成
        │
        ▼
  AI実行 → 成果物生成 → saveMemory()
```

---

## 適用機能一覧

| 機能 | チャネル | 経路 |
|---|---|---|
| Chat | `chat` | `loadMemory` / `applyMemoryForChat` |
| Commander | `commander` | `MemoryApply` |
| Planner | `planner` | `applyMemoryForPlanner` |
| Automation | `automation` | `applyMemoryForAutomation` |
| Scheduler | `scheduler` | `resolveSchedulerMemoryDefaults` → MemoryApply |
| Vision | `vision` | `resolveVisionMemoryContext` → MemoryApply（Fail Closed） |
| OCR | `ocr` | `resolveOcrMemoryDictionary` → MemoryApply |
| Word | `word` | `applyMemoryForDeliverable` |
| Excel | `excel` | 同上 |
| PDF | `pdf` | 同上 |
| PowerPoint | `powerpoint` | 同上 |
| Regenerate | `regenerate` | `applyMemoryForRegenerate` |
| 通知 | `notification` | `resolveNotificationPreferencesWithMemorySync` |

禁止（廃止済み）: ChatだけMemory / Automation別Memory / Vision別 / OCR別 / Planner別

---

## 未共有ゼロの証拠

テスト: `lib/memory-apply/memory-apply.test.ts` Phase2  
成果物: `artifacts/memory-share/memory-share-proof.json`

判定条件:

- `shareRatePercent === 100`
- `missingChannels === []`
- `unsharedCount === 0`
- `sharedMemoryIds.length > 0`（全チャネル交差）
- `listForbiddenParallelMemoryResolves() === []`
- CI: `node scripts/ci/assert-memory-share.mjs`

---

## 実行シーケンス

1. `loadMemory()`
2. `PersonalizationContext`（+ MemoryVersion）
3. Prompt生成
4. AI実行
5. 成果物生成
6. `saveMemory()`

Memory未取得（load失敗）→ **Fail Closed**（AI実行禁止）

saveMemory カテゴリ: ユーザー設定 / 口調 / 禁止事項 / 仕事履歴 / 成果物履歴 / 外部サービス状態 / 定期実行履歴 / Vision履歴 / OCR履歴 / 修正履歴
