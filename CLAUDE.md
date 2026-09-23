@AGENTS.md

# MINERVOT プロジェクトマップ（Claude Code 用・毎回最初に読む）

> 目的: 毎回リポジトリ全体を読み直さないための要約。作業前にこのファイルと
> `docs/development/CHECKPOINT.md` を読み、必要なファイルだけ開くこと。
> 設計判断の正は `ATLAS_RULES.md`（コード名 ATLAS = 製品名 MINERVOT）。

## アプリ概要
- 「あなた専属のAI秘書」。依頼 → 調査・制作 → 成果物（docx/xlsx/pdf/pptx）→ 定期自動化（特に毎日のX投稿）。
- Next.js 16.2（App Router, **通常のNext.jsと差分あり → `node_modules/next/dist/docs/` 参照**）、React 19、Tailwind v4、`motion` v13、Vitest、Playwright(e2e/)。

## 主要ディレクトリ
- `app/` ルート。`app/api/*` がAPI（automations, automation-platform, deliverables, commander, stripe, billing, x, worker, webhooks …）。
- `components/` UI。`components/motion/` 共通モーション部品、`components/automation-first/` 現行ホーム系。
- `lib/` ドメインロジック（ほぼ全てにテストが同居 `*.test.ts`）。
- `supabase/migrations/` DB（51本）。`scripts/ci/*-ban.mjs` は CI の禁止パターン検査。
- `docs/development/` 機能評価・監査・運用ドキュメント。

## 重要ファイル
- ログイン後ホーム: `app/projects/page.tsx` → `components/projects/projects-dashboard.tsx` → **`components/automation-first/automation-first-home.tsx`**（flag `automation_first_home_enabled`。偽なら旧 `components/home/secretary-home-dashboard.tsx`）。
- ホームのデータ整形: `lib/automation-first/home-model.ts`, `home-data.ts`, `home-core-state.ts`。
- LP（未ログイン `/`）: `components/landing/landing-page.tsx`。
- デザイントークン/アニメ: `app/globals.css`（:root トークン, `html[data-theme=dark]`, `html.motion-lite`, reduced-motion）、`lib/motion/tokens.ts`。
- 表示確認用サンドボックス: `/dev/automation-first-preview`（非本番・`ATLAS_DEV_PREVIEW_OPEN=1` で開放、フィクスチャ付き）。

## 認証 / API / DB / 課金 / デプロイ
- 認証: Clerk（`proxy.ts` がミドルウェア、公開ルートは `lib/auth/public-routes.ts`、ログイン後 `ATLAS_APP_HOME_PATH=/projects`）。
- DB: Supabase（`lib/supabase/`, RLS/JWT テストあり）。
- 課金: Stripe（`app/api/stripe`, `lib/billing`）。**プラン・本番設定は変更前に必ずユーザー確認**。
- AI: OpenAI SDK（`lib/openai.ts`）。コスト評価必須（AGENTS.md）。
- デプロイ: Vercel（`vercel.json` cron 1本、`vercel.cron.pro.json`）。

## ローカル確認手順（省コスト）
- 型/Lint/関連テスト: `npx tsc --noEmit` / `npx eslint <dir>` / `npx vitest run <対象>`。全体テストは重要変更時のみ。
- 画面確認: `ATLAS_DEV_PREVIEW_OPEN=1 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk CLERK_SECRET_KEY=sk_test_dummy npx next dev -p 3102`
  → Playwright は `executablePath:"/opt/pw-browsers/chromium", args:["--no-proxy-server"]`、cookie `__clerk_db_jwt=dvb_dummy` を付与し `*.clerk.accounts.dev` を abort すると `/dev/automation-first-preview` が描画できる。

## 既知の問題
- `lib/work-asset/phase2.test.ts` "pauses schedule…runNow" が main でも 5s タイムアウト（既存）。

## 変更禁止 / 要注意
- AGENTS.md「変更しないコア」（Planner, Deliverable, Automation/Workflow本体, エコモード, User Profile, Proactive Suggestions, 今日のダッシュボードコア）。
- 進捗・件数・成功を**偽装しない**（`ci:n07-soft-success-ban`, `ci:p1-09-reliability-fabrication-ban`, `ci:n02-unproven-speed-claims-ban`）。モーションは実データの状態変化にのみ使う。

## 最新 CHECKPOINT
→ `docs/development/CHECKPOINT.md`
