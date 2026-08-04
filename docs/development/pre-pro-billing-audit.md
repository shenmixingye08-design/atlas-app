# Pre-production billing audit draft

目的: 現在のコード実態に基づく公開前課金監査の下書き。  
このエージェント環境では live production / external service の成功確認は行っていない。成功実績は捏造しない。

## 40-item structured summary

1. **総合判定案: C。** production build と unit test suite は成功しているが、live verification と remote migration apply が未確認のため B/A 判定は不可。
2. **Hobby cron approach adopted.** `vercel.json` は `/api/automations/tick` を `0 0 * * *` の1日1回に固定している。
3. **Pro cron path is documented.** `vercel.cron.pro.json` は Pro 移行後の毎分 cron 用テンプレートとして分離されている。
4. **Hobby limitation remains.** X定期投稿や retry を分単位で保証するには Hobby cron だけでは不足する。
5. **Manual tick path remains.** `/api/automations/tick` は `CRON_SECRET` または Owner session で手動実行できる設計。
6. **Cron auth is fail-closed in production.** `CRON_SECRET` 未設定時、Production tick は 503 を返す。
7. **Scheduled cron kill-switch exists.** `ENABLE_SCHEDULED_CRON=false` で認証後も due 処理を skip できる。
8. **Stripe production guard exists.** Production では Stripe secret/publishable key の未設定・test key・mode mismatch を拒否する。
9. **Stripe webhook guard exists.** Production webhook は `STRIPE_WEBHOOK_SECRET` も要求する。
10. **Checkout uses server allowlist.** client から free-form `priceId` を受け取らず、planId から server env の Price ID を解決する。
11. **Stripe Price amount check exists.** Checkout 前に Stripe Price を retrieve し、JPY金額・currency・monthly interval を plan定義と照合する。
12. **Price mismatch fails closed.** retrieve failure / amount mismatch / currency mismatch / interval mismatch は checkout block 扱い。
13. **Duplicate subscription guard exists.** local durable state と Stripe customer subscriptions を見て、同一/別有料プランの二重Checkoutを拒否する。
14. **Plan change path prefers Portal.** 既存有料契約がある場合は Checkout ではなく Billing Portal を案内する設計。
15. **Production redirect host is pinned.** Production checkout success/cancel は canonical origin を使い、`*.vercel.app` への戻りで Clerk cookie を失う問題を避ける実装。
16. **Webhook idempotency exists.** Stripe event id は Supabase table または non-production disk fallback で重複処理を避ける。
17. **Handled webhook events are explicit.** checkout completed, subscription created/updated/deleted, invoice paid/succeeded/failed, charge refunded を処理対象にしている。
18. **Webhook failure behavior is retry-aware.** handled failure は 500 で Stripe retry、unhandled/skipped は 200 ack。
19. **Billing durable migration exists.** `20260713_atlas_billing_subscriptions.sql` が subscriptions と webhook event ledger を作成する。
20. **Billing Supabase apply is unverified.** remote Supabase に migration が適用済みかはこの環境では未確認。
21. **Clerk production guard exists.** Production では Clerk publishable/secret key 未設定と development key を拒否する。
22. **Owner route guard exists.** Production Owner routes は `ATLAS_OWNER_EMAILS` 未設定時に fail closed。
23. **Operator legal info still needs evidence.** 特商法envの有無は未確認。未設定なら placeholder/fallback と warning。
24. **Supabase service role is central.** Billing, OAuth credentials, Push, Jobs, user state は `SUPABASE_SERVICE_ROLE_KEY` 前提の server writes。
25. **RLS design is deny-all.** relevant migrations は `anon, authenticated` を deny-all にし、service role bypass 前提。
26. **Storage policy is not part of current SQL.** Phase 1〜5 migrations do not create Supabase Storage buckets/policies.
27. **X OAuth durability exists.** X token table migration and credential persistence path exist, but live connected-account state is unverified.
28. **X live post verification is not proven here.** `scripts/verify-x-post-live.mjs` はあるが、この agent では real post / confirm / cleanup を実行していない。
29. **Android/iPhone push verification is not proven here.** docs already mark real-device Web Push as 未確認; this agent did not test a real device permission flow.
30. **Clerk login UI verification is not proven here.** Playwright scripts exist, but this agent did not run a live Clerk login UI flow.
31. **Stripe test mode/live mode end-to-end is not proven here.** This agent did not create a real test/live checkout session, pay invoice, receive webhook, or verify portal.
32. **Remote Supabase migrations are not proven here.** Table existence, policies, and service-role write/read on the remote project remain 未確認.
33. **P0 remaining: set and verify production env.** Clerk, Stripe live keys, Stripe webhook secret, Price IDs, Supabase service role, Cron secret, site/app URLs, owner emails, legal info must be confirmed without exposing values.
34. **P0 remaining: apply/verify Supabase migrations.** Phase 1〜5 SQL must be applied in order and verified in the remote Supabase dashboard/CLI.
35. **P0 remaining: Stripe live/test flow.** At minimum, run Stripe test mode checkout + webhook replay; before paid public launch, confirm live mode configuration without charging unintended users.
36. **P0 remaining: Clerk protected route/login flow.** Confirm sign-in, sign-up, protected route redirect, Owner denial/allow, and post-checkout return on the production domain.
37. **P0 remaining: Cron/tick production behavior.** Confirm Hobby daily cron fires, manual tick works with secret/Owner, unauthorized tick is rejected, and `ENABLE_SCHEDULED_CRON=false` skips due work.
38. **P1 remaining: X and automation reliability.** Confirm connected X user token refresh, scheduled slot idempotency, no duplicate post, failed-job retry, stale-running recovery, and owner incident visibility.
39. **P1 remaining: Push and mobile UX.** Confirm web push subscription/save/send on HTTPS with at least one Android device and one iPhone/Safari-supported path as applicable.
40. **Release recommendation.** Current local/code-side evidence supports **C**: production build and full unit suite pass, but live X / Android / Clerk UI / Stripe Test Mode / remote migrations remain unverified. Upgrade to **B** only after live env and remote migration checks are verified with evidence. Reserve **A** only after live-domain, live-mode-safe, device, cron, and rollback evidence exists.

## What was fixed / code reality observed

- Production build: **SUCCESS** after the SSR push fix (`npm run build` succeeded in this agent).
- Focused ownership / pause-resume / deliverable / xlsx / x-post / billing unit tests: **passing** in the current code-side verification set; the full suite also passes.
- Full suite after stale expectation fixes: **passing** (`npm test`: 118 test files, 616 tests).
- Hobby cron is intentionally daily in `vercel.json`; every-minute cron is isolated to `vercel.cron.pro.json`.
- `/api/automations/tick` keeps authenticated manual execution and has a scheduled-processing kill-switch.
- Stripe production guard rejects missing/test/mismatched keys.
- Stripe checkout rejects client-supplied Price IDs and checks Stripe Price amount/currency/interval before session creation.
- Duplicate subscription guard blocks accidental double subscriptions and routes plan changes to the Billing Portal.
- Production billing redirects avoid `*.vercel.app` and use the canonical app domain path.
- Stripe webhook path verifies signatures, handles idempotency, and returns retry-appropriate status codes.
- Supabase migrations exist for billing subscriptions, webhook idempotency, OAuth credentials, X auto-post settings/runs, Web Push subscriptions, and automation jobs.
- RLS in these migrations is deny-all for `anon` and `authenticated`; server service-role access is the intended write path.

## Could not be verified in this agent environment

- X live post creation/confirmation/deletion.
- Android device or iPhone real Web Push permission and delivery.
- Clerk login UI with real hosted credentials/session.
- Stripe Test Mode or live mode Checkout, Portal, invoice, webhook delivery.
- Remote Supabase migration apply status, table policies, or service-role writes.
- Vercel Hobby cron actually firing after deployment.
- Production environment variable presence in Vercel/Clerk/Stripe/Supabase dashboards.

## Honest billing judgment

- **Current evidence supports C, not B or A.**
- Code-side checks now passing: production build; focused ownership/pause-resume/deliverable/xlsx/x-post/billing unit tests; full `npm test` suite.
- Live X, Android/iPhone push, Clerk UI, Stripe Test Mode, and remote Supabase migrations are still unverified in this agent environment.
- Choose **C** while live env and remote migration evidence is missing.
- Choose **B** only after production/preview env presence, remote Supabase migrations, Clerk login, and Stripe test checkout+webhook are verified with logs/screenshots.
- Choose **A** only with live-domain end-to-end evidence, rollback notes, no secret exposure, and explicit confirmation that no unintended live charges/posts occurred.
