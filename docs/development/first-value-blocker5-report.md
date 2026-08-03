# Production Blocker #5 — First Value Experience Report

Branch: `cursor/first-value-blocker5-83f5`

## 【ATLAS機能評価】

```
機能名：First Value Experience（初回15分価値体験）
ユーザー価値：登録後15分以内に成果物完成〜ダウンロードまで体験
差別化：Wizard完了禁止 / 即Run / 仕事完了一覧 / 推定と実測の区別
繰り返し作業の削減：はい
AI必要度：中（本文はテンプレ保証、LLM必須にしない）
AIなしで実装可能：一部
運営コスト：低〜中（初回1回の成果物生成）
外部APIコスト：成果物生成時のみ
優先度：P0
```

## 提出チェックリスト

| # | 項目 | 結果 |
|---|---|---|
| 1 | Home | PASS — AI秘書ダッシュボード（今日終わった/実行中/次の予定/最近の成果物/AI提案） |
| 2 | Quick Start | PASS — `/automations/quick-start` タイトル・内容・頻度のみ |
| 3 | 初回体験 | PASS — 保存→即Run（Scheduler待ち禁止）→成果物保証 |
| 4 | Dashboard | PASS — Secretary strip + ROI + proposal |
| 5 | ROI | PASS — 今日/週/月・成功率・Memory適用率、推定/実測区別 |
| 6 | Analytics | PASS — signup/first_*/retention helpers |
| 7 | 通知 | PASS — recommendation default OFF、成果物/Automation中心 |
| 8 | Mobile | PASS — AF home mobile column + bottom nav既存 |
| 9 | Desktop | PASS — 2カラム rail |
| 10 | Screenshot | 下記 artifacts |
| 11 | Build | Typecheck / Vitest / CI gate |
| 12 | PASS/FAIL | **CONDITIONAL PASS**（Previewライブ実測はops依存） |

## 体験フロー

```
登録 → Welcome終了
  → /automations/quick-start
  → 候補選択（任意）+ タイトル/内容/頻度
  → POST /api/first-value/run（即時）
  → generateDeliverables（実ファイル）
  → 通知(completed)
  → /first-value/complete（仕事完了一覧）
  → ダウンロード
```

空ホーム: 「最初の仕事をAIへ任せる」+ 9候補（営業資料〜PowerPoint）。

## Analytics

Events: `signup_landed`, `first_automation_*`, `first_deliverable_ready`, `first_download`, `first_value_completed`, retention helpers (`day7`/`day30`).

## 重要方針

- Wizard完成で終わらない（Quick Startへ直行）
- Scheduler待ち禁止（初回は即Run）
- AI提案は1件のみ
- 広告通知（recommendation）デフォルトOFF
- ROIは推定と実測をラベルで区別（偽メトリクス禁止）
