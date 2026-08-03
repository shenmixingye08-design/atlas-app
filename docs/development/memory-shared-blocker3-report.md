# Memory共有 Production Blocker #3 レポート

## 【ATLAS機能評価】

機能名：Memory共有（PersonalizationContext 単一SoT）  
ユーザー価値：昨日チャットで話した内容を、今日の Automation・Vision・OCR・Word まで全部使える  
差別化：Chat専用 / 表面別 Memory を廃止し、loadMemory → saveMemory の一本道  
繰り返し作業の削減：はい  
AI必要度：低  
AIなしで実装可能：はい  
運営コスト：追加AI呼び出しなし  
外部APIコスト：無（Memory自体）  
コスト削減案：エコモード継承 / 同一Contextのまとめて注入 / Personal・Work Memoryキャッシュ / Scheduler予約実行 / Memory取得後のみAI（Fail Closed） / 並列resolve禁止 / 推論は承認後active / checksumで再生成禁止  
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

禁止（廃止済み）: ChatだけMemory / Automation別Memory / Vision別 / OCR別 / Planner別

---

## 適用機能一覧

| 機能 | チャネル | 経路 |
|---|---|---|
| Chat | `chat` | `loadMemory` / `applyMemoryForChat` |
| Commander | `commander` | `loadMemory`（`run-for-user` Fail Closed） |
| Planner | `planner` | `loadMemory` / `applyMemoryForPlanner` |
| Automation | `automation` | `loadMemory` / `applyMemoryForAutomation` |
| Scheduler | `scheduler` | `loadMemory` / `resolveSchedulerMemoryDefaults` |
| Vision | `vision` | `loadMemory` → AI → `saveMemory(vision_history)` |
| OCR | `ocr` | `loadMemory` → 補正 → `saveMemory(ocr_history)` |
| Word | `word` | `loadMemory` / `applyMemoryForDeliverable` → `saveMemory` |
| Excel | `excel` | 同上 |
| PDF | `pdf` | 同上 |
| PowerPoint | `powerpoint` | 同上 |
| Regenerate | `regenerate` | `loadMemory` → `saveMemory(correction_history)` |
| 通知 | `notification` | `loadMemory` / sync overlay（同一 Personal Memory SoT） |

---

## 未共有ゼロの証拠

テスト: `lib/memory-apply/memory-apply.test.ts` Phase2  
成果物: `artifacts/memory-share/memory-share-proof.json`  
CI: `node scripts/ci/assert-memory-share.mjs`

判定条件:

- `shareRatePercent === 100`
- `missingChannels === []`
- `unsharedCount === 0`
- `sharedMemoryIds.length > 0`（全チャネル交差）
- `listForbiddenParallelMemoryResolves() === []`
- 全 adapter が `loadMemory(` を呼ぶ（CI gate）
- Memory未取得 → Fail Closed（AI実行禁止）

---

## 実行シーケンス

1. `loadMemory()`
2. `PersonalizationContext`（+ MemoryVersion: version / updatedAt / source / checksum）
3. Prompt生成
4. AI実行
5. 成果物生成
6. `saveMemory()`

saveMemory カテゴリ: ユーザー設定 / 口調 / 禁止事項 / 仕事履歴 / 成果物履歴 / 外部サービス状態 / 定期実行履歴 / Vision履歴 / OCR履歴 / 修正履歴

---

## ゴール達成定義

「昨日チャットで話した内容を、今日 Automation・Vision・OCR・Word 生成まで全て覚えて使えるAI秘書」  
→ 全AI表面が同一 `PersonalizationContext` を参照し、MemoryVersion で整合性を持ち、未共有ゼロ。
