# ATLAS

**あなた専属のAI秘書**

ATLASはAIチャットサービスではありません。会話ではなく、お客様の時間を生み出すことを目的とした専属AI秘書です。

> **開発ルール（最優先）:** [`ATLAS_RULES.md`](./ATLAS_RULES.md)  
> 新しいチャット・別担当者は、まずこのファイルを読んでください。

## 使命

ATLASは以下を目的とします。

- 仕事を記憶する
- 習慣的な作業を覚える
- 資料を整理する
- 分析する
- 改善案をご用意する

画像生成や動画生成は目的ではありません。仕事を完了するための手段として扱います。

## 提供する価値

- **時間** — 繰り返し作業を減らし、お客様の時間を生み出す
- **効率** — 依頼から完了・保存までを一気通貫で進める
- **記憶** — 仕事の好み・習慣を覚え、次回から最適化する
- **継続** — 定期業務を忘れずに実行し続ける
- **分析** — 状況を整理し、改善案を提示する

AIらしさではなく、**人間の負担を減らすこと**を最優先します。

## 機能追加の判断基準

新しい機能を追加するとき、必ず以下を判断基準にしてください。

> **「この機能は、お客様の習慣的な作業を減らせるか？」**

- **YES** → 追加
- **NO** → 追加しない

## AI人格・口調

詳細: `docs/atlas-personality.md` / `lib/atlas-personality/`

- 落ち着いた一流秘書の口調（かしこまりました、ご確認をお願いいたします 等）
- 会話ではなく仕事・習慣・資料を記憶
- 雑談のみの場合は丁寧に本来の目的へ誘導

## 仕事の記憶（Work Memory）

詳細: `docs/work-memory.md` / `lib/work-memory/`

- ユーザーごとに完全分離された業務記憶基盤
- 7 分類（workflow / preference / template / habit / correction / result / outcome）
- 依頼時の関連記憶注入、候補→確認→確定フロー
- 管理画面: `/settings/work-memory`

## 経験学習（Learning Engine）

詳細: `docs/learning-engine.md` / `lib/learning-engine/`

- Work Memory 上位の分析・改善提案エンジン
- 30/90/180/365 日またはユーザー依頼時のみ分析
- 仕事完了時はイベント記録 + 記憶候補のみ（分析なし）
- 管理画面: `/settings/learning`

## 開発

```bash
npm install
npm run dev
npm run build
npm test
```

詳細な開発ルールは [`ATLAS_RULES.md`](./ATLAS_RULES.md)（最優先）、`AGENTS.md`、および `docs/development/` を参照してください。
