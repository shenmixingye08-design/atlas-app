# Phase 5 — Production Readiness

Branch: `fix/phase5-production-readiness` (from Phase 4 / `fix/phase4-product-hardening` merged into local `main`).

## 【ATLAS機能評価】

| 項目 | 内容 |
|------|------|
| 機能名 | Phase 5 本番耐久性・監査・P0/P1修正 |
| ユーザー価値 | 公開前にデータ漏洩・偽完了・0KB成果物・通知重複を防ぐ |
| 差別化 | 秘書型プロダクトとして「完了の証拠」と「所有権」を厳密化 |
| 習慣的作業の削減 | 変更なし（新大型機能なし） |
| AI必要度 | 低（テスト・ガード・監査中心） |
| AIなしで実装可能 | はい |
| 運営コスト | 低（既存 cron / owner API 拡張のみ） |
| 外部APIコスト | 増加なし（OpenAI 追加呼び出しなし） |
| コスト削減案 | テスト実行レート制限、再レンダー制限、push dedupe、再生成禁止 |
| 優先度 | P0/P1 修正必須 |

---

## STEP 0 — Go / No-Go（実行時点）

| 判定 | 内容 |
|------|------|
| **Go（条件付き）** | P0 修正済み。P1 の一部（実機 Push / ライブ X）は未確認のまま残す |
| **Blockers（修正済）** | 成果物 DL 無認証、ドキュメント再レンダー所有権なし、自動化 run の情報漏洩 |
| **High-risk** | serverless インメモリ store、日次 UTC cron vs JST 19:00、マルチインスタンス rate limit |
| **Phase 5 テスト範囲** | 所有権、TZ、完了証拠、0KB、retry/idempotency、rate limit、push dedupe |
| **Automatable** | vitest 全般、schedule、completion-evidence、ownership、document validate |
| **Needs device** | Web Push 実機（Android/iPhone）、X ライブ投稿、PWA 深リンク |

### 20 confirmation bullets（STEP 0）

1. Phase 4 を main ベースにマージ — **pass**
2. Phase 5 専用ブランチ作成 — **pass**
3. `npm ci` — **pass**
4. vitest — **pass**（一部 orchestration 統合テストは `ATLAS_CORE_TEST` 依存、CI 要確認）
5. production build — **要 CI 確認**
6. 成果物 DL 認証 — **pass（修正）**
7. ドキュメント再レンダー所有権 — **pass（修正）**
8. 自動化 run 所有権順序 — **pass（修正）**
9. X 完了証拠（tweet id+url） — **pass（既存 + 回帰テスト）**
10. 0KB 完了禁止 — **pass**
11. Excel 数式インジェクション — **pass**
12. push dedupe（job push_status） — **pass（配線追加）**
13. テスト実行 rate limit — **pass**
14. 再レンダー rate limit — **pass**
15. Owner integrity diagnostic — **pass（読取専用 API）**
16. env 監査 doc — **pass（本 doc §B）**
17. migration 監査 — **pass（本 doc §C）**
18. 公開ページ MINERVOT 表記 — **pass（既存 i18n、リンク要手動確認）**
19. Release checklist — **pass（§N）**
20. 最終 verdict — **条件付きで公開可能**（§Final）

---

## A. Clean build / test

```bash
npm ci
npm test
npm run lint   # 既存 warnings/errors 多数 — build は eslint 非ブロック
npm run build
```

Node: Vercel `engines` に合わせる（ローカル v24 で実行済み）。`ignoreBuildErrors` 不使用。

---

## B. Env audit（名前のみ）

| 変数 | 必須 | 公開 | 用途 |
|------|------|------|------|
| `OPENAI_API_KEY` | required | secret | AI 実行 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | required | public | 認証 UI |
| `CLERK_SECRET_KEY` | required | secret | サーバー認証 |
| `CLERK_WEBHOOK_SECRET` | required | secret | Webhook |
| `CRON_SECRET` | required | secret | `/api/automations/tick` |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | required | public URL ok | DB |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required | public (RLS) | クライアント |
| `SUPABASE_SERVICE_ROLE_KEY` | required | **secret only** | 耐久書き込み |
| `STRIPE_*` / `NEXT_PUBLIC_STRIPE_*` | required (prod) | mixed | 課金 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | recommended | public/private | Web Push |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | required | public | 深リンク |
| `ATLAS_OWNER_EMAILS` | required | secret list | Owner gate |
| `OAUTH_STATE_SECRET` | recommended | secret | OAuth CSRF |

**Fixes:** `SUPABASE_SERVICE_ROLE_KEY` は `NEXT_PUBLIC_` 禁止（既存 `lib/supabase/env.ts` 準拠）。未設定時は service role パスが null を返し、耐久機能はメモリ fallback + 明示ログ。

---

## C. Migration audit（Phase 1–4）

| 順序 | ファイル | 内容 | 破壊的操作 |
|------|----------|------|------------|
| 1 | `20260711_atlas_user_state.sql` | user state | なし |
| 2 | `20260711_atlas_user_state_rls_lockdown.sql` | RLS deny-all | なし（冪等） |
| 3 | `20260711_projects.sql` | projects | なし |
| 4 | `20260711_projects_rls_lockdown.sql` | RLS | 冪等 |
| 5 | `20260713_*` oauth/billing | 資格情報 | なし |
| 6 | `20260720_atlas_x_autopost.sql` | X autopost | なし |
| 7 | `20260722_atlas_automation_jobs.sql` | jobs + idempotency | なし |
| 8 | `20260722_document_engine.sql` | document IR | なし |
| 9 | `20260722_atlas_push_subscriptions.sql` | push | なし |
| 10 | `20260723_automation_drafts.sql` | drafts | なし |

**User steps:** Supabase SQL Editor で README 順に適用。適用済みかは Dashboard でテーブル/ポリシー確認。RLS は anon/authenticated deny-all、service role のみ書込。

---

## D–M. Workstream summary

| ID | 内容 | 結果 |
|----|------|------|
| D | Auth/ownership | P0 修正 + `lib/security/resource-ownership.test.ts` |
| E | Job durability | 既存 idempotency/retry/hang + 回帰テスト |
| F | X post evidence | `completion-evidence.ts` 既存 |
| G | Deliverables | validate + ownership + 0KB guard |
| H | Push | `setJobPushStatus` 配線、実機 **未確認** |
| I | TZ / schedule | `schedule.test.ts`（Asia/Tokyo） |
| J | Integrity | `GET /api/owner/integrity-diagnostic` |
| K | Rate limits | test-run 10/h, render 30/h |
| L | Logging | audit sanitize 既存 |
| M | Public pages | MINERVOT i18n 既存 |

---

## N. Release checklist

| 項目 | 結果 |
|------|------|
| Deploy / Vercel build | **未確認**（PR Preview 待ち） |
| DB migrations applied | **未確認**（運用側） |
| Auth / Clerk prod keys | **未確認** |
| Cron hourly tick | **未確認**（Phase 1 doc: UTC 00:00 のみでは JST 19:00 不足） |
| Jobs idempotency | **pass**（テスト） |
| Web Push VAPID | **未確認**（実機） |
| Stripe webhook | **未確認** |
| Artifacts non-zero | **pass** |
| X live post proof | **未確認**（ライブ） |
| Cross-user access blocked | **pass** |
| Owner-only diagnostics | **pass** |
| UI public links | **未確認** |

---

## Device checklist（Push / 深リンク）— ユーザー実施

- [ ] iPhone: 通知許可 → テスト通知 → タップで `/results/...` または設定画面
- [ ] Android: 同上
- [ ] 無効 subscription が deactivate されること（410 応答後）
- [ ] 同一 job 完了 push が 2 通来ないこと

結果: **未確認**（エージェント環境に実機なし）

---

## O. High-value regression tests

`lib/phase5/regression.test.ts`, `lib/automations/schedule.test.ts`, `lib/security/resource-ownership.test.ts`, 既存 `completion-evidence.test.ts`, `durable.test.ts`.

---

## Completion report — 41 items

| # | 項目 | 結果 |
|---|------|------|
| 1 | Phase 4 base merge | pass |
| 2 | Phase 5 branch | pass |
| 3 | npm ci | pass |
| 4 | typecheck (tsc) | partial — 既存 test TS errors、build は next |
| 5 | eslint | partial — 既存 88 errors |
| 6 | vitest | pass（修正後） |
| 7 | production build | 要 CI |
| 8 | env audit doc | pass |
| 9 | secret NEXT_PUBLIC_ fix | pass（既存） |
| 10 | migration order doc | pass |
| 11 | RLS idempotent note | pass |
| 12 | deliverable auth P0 | pass |
| 13 | document render auth P0 | pass |
| 14 | automation run 403/404 | pass |
| 15 | job idempotency | pass |
| 16 | retry classification | pass |
| 17 | hang detection path | pass（既存 tick） |
| 18 | concurrency claim | pass |
| 19 | X tweet proof | pass |
| 20 | fake complete blocked | pass |
| 21 | Word/PDF/Excel validate | pass |
| 22 | formula injection | pass |
| 23 | signed URL refresh | P2 — TTL 1h artifact |
| 24 | 0KB never completed | pass |
| 25 | push dedupe wiring | pass |
| 26 | push read sync | pass（既存） |
| 27 | invalid sub deactivate | pass（既存 dispatch） |
| 28 | deep links | 未確認（実機） |
| 29 | Asia/Tokyo schedule | pass |
| 30 | month-end schedule | pass |
| 31 | pause/resume no catch-up | pass（既存 pause-display） |
| 32 | integrity diagnostic | pass |
| 33 | test-run rate limit | pass |
| 34 | push-test rate limit | pass（既存 3/min） |
| 35 | render rate limit | pass |
| 36 | safe logs | pass（audit sanitize） |
| 37 | MINERVOT public copy | pass |
| 38 | release checklist | pass |
| 39 | regression test suite | pass |
| 40 | admin fault injection | N/A — 新規追加なし（owner diagnostic のみ） |
| 41 | OpenAI cost increase | pass（増加なし） |

---

## Final verdict

**条件付きで公開可能**

1. Supabase migrations を本番に適用し、service role env を設定する  
2. Vercel Preview / Production build が READY であることを確認する  
3. Cron を Phase 1 推奨（hourly tick または JST 19:00 対応）に設定する  
4. 実機 Web Push チェックリストを完了する（未確認のまま公開しない）  
5. X ライブ投稿 1 件で tweet id/url が結果画面に表示されることを確認する  

P2（post-publish OK）: インメモリ rate limit の multi-instance 強化、artifact signed URL 更新、quiet hours のユーザー TZ。
