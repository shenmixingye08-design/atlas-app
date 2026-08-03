# Phase 3-1 External Live Adapter Audit

監査日: 2026-08-03  
対象: main 実コード（本番 Secret 変更・実 API 大量実行なし）

## 総括

- **V2 Automation の外部 Adapter はすべて未配線**（`isLiveAdapterWired` は vision/OCR のみ）。未登録/未配線は fail-closed。
- **UI/API および Legacy 経路では** Google Drive / Gmail / Calendar / Dropbox / WordPress / X / LINE / Web Push / Supabase Storage が実 Provider に到達し得る。
- **Production Live（V2 完了経路）は外部 OAuth Adapter としては存在しない。** Storage のみ Production Live。
- **sandbox/stub 接続成功経路がコード上存在する**（legacy connect / stubConnectService）。V2 実行成功には落ちないが、接続状態の誤表示は P0。

## 判定

| 質問 | 判定 |
|------|------|
| Production で本物の外部連携が現在存在する | **YES**（UI/API・Legacy 一部） / V2 外部 **NO** |
| Production で sandbox/stub fallback が存在する | **YES**（接続 stub / legacy placeholder。V2 実行成功 fallback は **NO**） |
| Phase 判定 | 監査完了条件を満たせば **PASS** |

## 分類サマリ

| 分類 | サービス |
|------|----------|
| Production Live | Supabase Storage |
| Partial | Google Drive, Gmail, Google Calendar, Dropbox, WordPress, X, LINE, Push, Email Delivery |
| Stub | Notion, YouTube |
| UI Only | Slack, Discord |
| Unsupported | Outlook, Teams, Webhook, S3/R2 |
| Sandbox / Mock / OAuth Only | （単独分類なし — sandbox は execution simulator、OAuth は Partial 内） |

## Phase 3-2 対象（最大5）

1. Google Drive  
2. Gmail  
3. Google Calendar  
4. Dropbox  
5. WordPress  

X は後回し。詳細: `docs/development/phase-3-2-targets.md`

## 成果物

- `lib/integrations/audit/**` — inventory / registry / oauth / token / risks / diagnostics
- `artifacts/*.json` — CI artifact（vitest 生成）
- `scripts/ci/external-adapter-audit.mjs` — 差分ゲート

## 変更禁止コアへの影響

なし（Planner / Deliverable / Automation 本体 / Scheduler / Queue / Worker / Memory は未変更。Registry 読み取りと監査・テスト・CI のみ）。
