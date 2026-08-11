# Production CORE LOOP E2E — Owner セットアップ手順

この手順は **パスワード・Cookie・token をチャットへ貼らない** 前提です。  
認証情報は GitHub Actions Secrets にだけ入れます。

## 何を実現するか

- 一般ユーザーの Google ログインを壊さない
- Production に認証バイパスを追加しない
- Clerk 公式 Playwright ヘルパー（`@clerk/testing/playwright`）で E2E 専用ユーザーの正規セッションを確立する
  - `clerkSetup()` — Testing Token 取得（Production 対応）
  - email がある場合: `clerk.signIn({ emailAddress })`
  - E2E user に email が無い場合: Backend `emailAddresses.createEmailAddress` で verified な `+clerk_test` アドレスを付与（公開の Email/Password 設定は変更しない）
  - **必ず** `setupClerkTestingToken({ context })` を最初の navigation 前に実行（FAPI captcha_bypass）
  - 主経路: 公式 `clerk.signIn({ emailAddress })`（内部で Sign-in Token + ticket）
  - 予備: 公式 `clerk.signIn({ signInParams: { strategy:'ticket' }})`
  - `sessions.createSession` は Clerk 文档どおり Production では不可（Bad Request）。最後の診断用のみ
  - CI は `CORE_LOOP_EXPECT_SHA`（= `github.sha`）と Production `/api/health/version` が一致するまで待ってから検証する（デプロイ競合防止）
- Email/Password ログインの公開有効化は不要（Google 設定も変更しない）
- Playwright が `https://atlasapp.jp` の UI/API 正規経路を通る

## なぜ以前の方式を使わないか

1. **`/sign-in?__clerk_ticket=…` URL 方式**  
   Production 証拠で token 発行・HTTP 200 までは成功したが、session が成立せず `/sign-in` ループ + `authApiStatus=401` になった。
2. **Agent Tasks API**  
   現行 Clerk Production Dashboard（Configure / Features / Developers / Instance）に該当設定項目が存在しないため、Dashboard 操作前提の解決策にしない。

## 必要な GitHub Secrets

| Secret 名 | 内容 |
|---|---|
| `CLERK_SECRET_KEY` | Production Clerk Secret Key（`sk_live_…`）。Vercel と同じ Production インスタンス |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production Publishable Key（`pk_live_…`）。`clerkSetup()` に必要 |
| `E2E_CLERK_USER_ID` | 検証ユーザー A の Clerk `user_…`（**ATLAS_OWNER_EMAILS に含めない**） |
| `E2E_CLERK_USER_B_ID` | 検証ユーザー B の Clerk `user_…`（isolation 用。A と別） |
| `ATLAS_APP_URL` | 省略可。未設定時は `https://atlasapp.jp` |

ハーネスは起動時に **publishable frontendApi** と **secret が E2E user を読めること** を安全に照合する（鍵本体はログに出さない）。

## Owner 操作（外部サービス）

### 1) Clerk Dashboard — Users

1. [Clerk Dashboard](https://dashboard.clerk.com) → **Production**（`atlasapp.jp`）  
2. 検証ユーザー A / B が存在し、User ID（`user_…`）が GitHub Secrets に登録済みであること  
3. email 識別子は任意（無くても userId Sign-in Token 経路で認証する）  
4. **一般ユーザー向け Email/Password を公開有効化しない**  
5. **Google ログイン設定を変更しない**

### 2) GitHub Secrets

上記 Secrets が Repository Secrets に揃っていること（値はチャットに貼らない）。

### 3) 実行

1. 本ハーネスの PR を main へ Merge  
2. `scripts/ci/core-loop-production-e2e.mjs` または本 workflow を含む push は、Actions **Verify CORE LOOP Production E2E** を **自動起動**する（手動 Run 不要）  
3. Production `/api/health/version` の SHA が merge を含むことを確認（E2E は Production URL を叩く）  
4. 認証証拠の最低条件:  
   `clerkSetupOk=true` / `clerkSignInOk=true` / `clerkSessionDetected=true` /  
   `authenticatedUserIdMatchesExpected=true` / `authApiStatus=200` / `protectedPageAccessible=true`  
5. 必要なら Actions から手動 `workflow_dispatch` も可能

## 禁止事項

- パスワード・Cookie・session token・Secret Key をチャットへ貼る  
- Owner アカウントを E2E ユーザーに使う  
- Production 認証バイパス route を追加する  
- middleware スキップ / 偽 userId 注入 / 固定 cookie  
- health probe / sample DL だけで CORE LOOP PASS にする  
- 根拠なく Agent Tasks API を必須と主張する  
- 根拠なく ticket-query sign-in URL 方式へ戻す  
