# Work Memory（仕事の記憶）

開発ルールの正: [`ATLAS_RULES.md`](../ATLAS_RULES.md) §7  
ATLAS の **Work Memory** は、会話全体ではなく「今後の仕事に再利用できる情報」だけを、お客様ごとに記憶する基盤です。

## 設計方針

- **ユーザー完全分離** — `userId` 単位の in-memory ストア（`globalThis.__atlasWorkMemoryStore`）。他ユーザーの記憶は参照不可。
- **選択的保存** — 会話ログの無条件保存は行わない。
- **機密除外** — パスワード、APIキー、決済情報等は `lib/work-memory/security.ts` でブロック。
- **確認後確定** — 重要な候補は `isUserConfirmed: true` になるまで候補として保持。

## データ構造

`WorkMemoryRecord`（`lib/work-memory/types.ts`）:

| フィールド | 説明 |
|-----------|------|
| `id` | 一意 ID |
| `userId` | Clerk ユーザー ID |
| `type` | workflow / preference / template / habit / correction / result / outcome |
| `title` | 表示名 |
| `summary` | 概要テキスト |
| `structuredData` | 再利用用 JSON |
| `sourceType` | 保存元種別 |
| `sourceReference` | 参照 ID（任意） |
| `tags` | タグ |
| `confidence` | AI 推定信頼度（内部値） |
| `isUserConfirmed` | ユーザー確認済みか |
| `isActive` | 有効か（無効化で利用停止） |
| `usageCount` / `lastUsedAt` | 利用統計 |

## 記憶が保存される条件

`lib/work-memory/learning.ts` のシグナル検出:

1. 同種依頼の繰り返し（フィンガープリント 2 回以上）
2. 「次からも」「いつもの形式で」等の継続指定
3. 「覚えて」「保存して」等の明示依頼（高信頼度は即確定可）
4. 参考資料の利用示唆
5. 修正前後の差分（correction 候補）
6. 定期・習慣的作業パターン

推測のみの場合は **候補** として `/settings/work-memory` に表示し、ユーザー確認後に確定します。

## 記憶が利用される流れ

1. 依頼 POST `/api/orchestrate`
2. `skipWorkMemory: true` でなければ、かつ設定 ON なら `getWorkMemoriesForAssignment(userId, assignment)` で検索
3. 関連記憶を `metadata.workMemory` として Planner に注入
4. レスポンスに `workMemory.used` を付与 → ワークスペースに「過去の仕事の進め方を反映しています。」と表示
5. 完了後 `learnFromOrchestrationWorkMemory` で候補作成

## API

| エンドポイント | 用途 |
|---------------|------|
| `GET/POST /api/work-memory` | 一覧・作成 |
| `GET/PATCH/DELETE /api/work-memory/[id]` | 詳細・編集・削除 |
| `POST /api/work-memory/reset` | 種類別/全削除 |
| `GET/PATCH /api/work-memory/settings` | ON/OFF |
| `GET /api/work-memory/preview?assignment=` | 利用予定プレビュー |
| `POST /api/work-memory/correction` | 修正差分学習 |
| `POST /api/work-memory/candidates/[id]/confirm` | 候補確定 |
| `POST /api/work-memory/candidates/[id]/reject` | 候補却下 |

## UI

- 管理: `/settings/work-memory`
- 依頼画面: 「今回は過去の記憶を使わない」チェック、利用バナー

## 既存 ATLAS Memory との関係

- **ATLAS Memory** (`/settings/memory`) — 利用傾向・文体などの長期学習
- **Work Memory** (`/settings/work-memory`) — 仕事手順・テンプレ・修正・成果など構造化された業務記憶

両方が Orchestrator の Planner コンテキストに注入されます。

## テスト

```bash
npm test -- lib/work-memory/work-memory.test.ts
```

## 今回未実装（意図的にスコープ外）

- 30日分析、自動通知、SNS/家計簿分析との連携
- 永続 DB（Supabase）への保存 — 現状は user-memory と同様 in-memory
- データエクスポート ZIP への work memory セクション追加（次フェーズ）
