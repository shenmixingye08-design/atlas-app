<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ATLAS エージェント向け開発ルール

## 最優先ドキュメント

**開発・設計判断の正は [`ATLAS_RULES.md`](./ATLAS_RULES.md) です。**  
本ファイル・README・個別 docs と矛盾する場合は、`ATLAS_RULES.md` を優先してください。

## 基本思想

ATLASは**AIチャットサービスではありません**。  
**「あなた専属のAI秘書」** として、会話ではなくお客様の時間を生み出すことを目的とします。  
（詳細・口調・用語・優先順位は `ATLAS_RULES.md` を参照）

### 使命

- 仕事を記憶する
- 習慣的な作業を覚える
- 資料を整理する
- 分析する
- 改善案をご用意する

画像生成・動画生成は目的ではなく、仕事を完了するための手段として扱う。

### 提供する価値

時間・効率・記憶・継続・分析 — **人間の負担を減らすこと**を最優先する。

### 機能追加の最重要ルール

> **「この機能は、お客様の習慣的な作業を減らせるか？」**

YES なら追加。NO なら追加しない。

### コスト設計（補足）

AIを必要な時だけ賢く使い、通常処理でできることは低コストに自動化する。  
「AIをたくさん使うサービス」ではない。

## 新機能追加時（必須）

**プロンプト・仕様・コードを書く前に**、コスト評価を完了すること。

1. テンプレート: `docs/development/feature-evaluation-template.md`
2. 詳細ルール: `docs/development/cost-evaluated-prompt-design.md`
3. Cursor ルール: `.cursor/rules/cost-evaluated-prompt-design.mdc`

### 【ATLAS機能評価】フォーマット

```
【ATLAS機能評価】

機能名：
ユーザー価値：
差別化：
繰り返し作業の削減：（習慣的な作業がどれだけ減るか — はい / 一部 / いいえ）
AI必要度：
AIなしで実装可能：
運営コスト：
外部APIコスト：
コスト削減案：
優先度：
```

コスト削減案では **エコモード・まとめて生成・キャッシュ・予約実行・AI起動条件・外部API最小化・承認後実行・再生成禁止** を必ず検討する。

### 開発方針

- AIを使わなくても実現できる処理にはAIを使わない
- AIは文章生成・判断・要約・提案など、本当に必要な場面だけ
- 定期実行・履歴・通知・曜日判定・ON/OFF・提案条件は通常プログラムで処理

### 変更しないコア

Planner, Deliverable, Automation/Workflow 本体, 依頼範囲, エコモード既存挙動, User Profile, Proactive Suggestions, 今日のダッシュボードコア。

## 参照コード

- `lib/development/feature-evaluation.ts` — 評価フィールド・チェックリスト定数
- `lib/cost-optimization/` — エコモード・キャッシュ・コスト計測
