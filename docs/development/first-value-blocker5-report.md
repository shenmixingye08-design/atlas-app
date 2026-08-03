# Production Blocker #5 — First Value Experience Report

Branch: `cursor/first-value-blocker5-83f5`

## 【ATLAS機能評価】

```
機能名：First Value Experience（初回15分価値体験）
ユーザー価値：登録後15分以内に成果物完成〜ダウンロードまで体験し「980円なら安い」と感じる
差別化：Wizard完了禁止 / 即Run / 仕事完了一覧 / 推定と実測の区別 / savedMinutes実測
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
| 2 | Quick Start | PASS — `/automations/quick-start` タイトル・内容・頻度 |
| 3 | 初回体験 | PASS — 保存→即Run→成果物→保存→通知→ダウンロード |
| 4 | Dashboard | PASS — Secretary strip + ROI + proposal |
| 5 | ROI | PASS — 今日/週/月・成功率・Memory適用率、推定/実測区別、savedMinutes実測（Memory適用率の集計は server-only） |
| 6 | Analytics | PASS — signup/first_*/day7/day30/automation_rate |
| 7 | 通知 | PASS — recommendation OFF + list filter（成果物/Automation） |
| 8 | Mobile | PASS — AF home mobile column |
| 9 | Desktop | PASS — 2カラム rail |
| 10 | Screenshot | PASS — `/opt/cursor/artifacts/first-value-blocker5/` |
| 11 | Build | PASS — Typecheck / Lint / Vitest / Build / Quality Gate / Vercel Preview |
| 12 | PASS/FAIL | **PASS** |

## 体験フロー

```
登録 → Welcome終了
  → /automations/quick-start
  → タイトル/内容/頻度（候補は任意）
  → POST /api/first-value/run（即時・Scheduler待ち禁止）
  → generateDeliverables（実ファイル）
  → 保存 + 通知(completed)
  → follow-up Automation(draft) 作成
  → /first-value/complete（仕事完了一覧）
  → ダウンロード（この時点で download step 完了 + 実測ROI記録）
```

空ホーム: Automation0 かつ初回未完了のときだけ「最初の仕事をAIへ任せる」+ 9候補。

## 仕事完了一覧（例）

1. 営業資料 — 完了  
2. 保存 — 完了（Drive接続時はDrive、未接続はアプリ内）  
3. 通知 — 完了  
4. ダウンロード — ユーザー操作で完了  

## Analytics

Events: `signup_landed`, `first_automation_*`, `first_deliverable_ready`, `first_download`, `first_value_completed`, `day7_active`, `day30_active`, `automation_rate_snapshot`, `retention_snapshot`.

## 重要方針

- Wizard完成で終わらない（Quick Startへ直行）
- Scheduler待ち禁止（初回は即Run）
- AI提案は1件のみ
- 広告通知禁止（default OFF + list filter）
- ROIは推定と実測をラベルで区別。初回完了後は `savedMinutes` に実測が入る
