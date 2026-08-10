# Production CORE LOOP E2E — Owner セットアップ手順

この手順は **パスワード・Cookie・token をチャットへ貼らない** 前提です。  
認証情報は GitHub Actions Secrets にだけ入れます。

## 何を実現するか

- 一般ユーザーの Google ログインを壊さない
- Production に認証バイパスを追加しない
- Clerk 公式 Playwright ヘルパー（`@clerk/testing/playwright`）で E2E 専用ユーザーの正規セッションを確立する
  - `clerkSetup()` — Testing Token 取得
  - `setupClerkTestingToken({ page })` — bot 対策迂回（Testing Token）
  - `createAgentTestingTask({ onBehalfOf: { userId } })` — userId 指定でセッション URL 発行
- Playwright が `https://atlasapp.jp` の UI/API 正規経路を通る
- アプリ側の認証バイパス route は追加しない

## なぜ ticket URL 方式をやめたか

Production 証拠では Sign-in Token / Testing Token の発行と `/sign-in?__clerk_ticket=…` 到達は成功したが、Clerk session が成立せず `authApiStatus=401` のまま `/sign-in` に留まった。  
`clerk.signIn({ emailAddress })` も内部で同じ ticket 戦略を使うため、Google-only Production + userId のみの構成では公式の **Agent Tasks** を正本とする。

## 必要な GitHub Secrets

| Secret 名 | 内容 |
|---|---|
| `CLERK_SECRET_KEY` | Production Clerk Secret Key（`sk_live_…`）。Vercel と同じ Production インスタンス |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production Publishable Key（`pk_live_…`）。`clerkSetup()` に必要。`CLERK_PUBLISHABLE_KEY` でも可 |
| `E2E_CLERK_USER_ID` | 検証ユーザー A の Clerk `user_…`（**ATLAS_OWNER_EMAILS に含めない**） |
| `E2E_CLERK_USER_B_ID` | 検証ユーザー B の Clerk `user_…`（isolation 用。A と別。Owner でもない） |
| `ATLAS_APP_URL` | 省略可。未設定時は `https://atlasapp.jp` |

## Owner 操作（外部サービス）

### 1) Clerk Dashboard

1. [Clerk Dashboard](https://dashboard.clerk.com) を開く  
2. **Production** インスタンス（`atlasapp.jp` / `clerk.atlasapp.jp`）を選択  
3. **Users → Create user** で検証ユーザー A を作成  
   - 用途ラベル例: `minervot-e2e-a@…`（実在メールで可）  
   - **Owner 用メールにしない**（`ATLAS_OWNER_EMAILS` に入れない）  
4. 同様に検証ユーザー B を作成（isolation 用）  
5. 各ユーザー詳細から **User ID**（`user_…`）を控える  
6. **Configure → API Keys** で Production **Secret Key** と **Publishable Key** を確認（値は画面から GitHub へ直接登録。チャットに貼らない）  
7. **Agent Tasks（Beta）** が Production で利用可能であることを確認する  
   - 未有効 / 403 / feature unavailable の場合は Clerk Dashboard または Clerk Support で Agent Tasks を有効化する（Owner 操作）  
   - 一般ユーザー向け Google ログイン設定は変更しない  
   - Email/Password を一般公開有効化しない

> 一般ユーザー向けに Email/Password ログインを公開有効化する必要はありません。  
> Agent Tasks は Backend API + `userId` で短命セッション URL を発行します（アプリの middleware バイパスではない）。

### 2) GitHub → Secrets

1. GitHub: `shenmixingye08-design/atlas-app`  
2. **Settings → Secrets and variables → Actions**  
3. 上記 Secrets を登録（値はチャット・PR・issue に書かない）  
4. 特に `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`（`pk_live_…`）が未登録なら追加する

### 3) 実行

1. 本ハーネスの PR を main へ Merge  
2. Actions: **Verify CORE LOOP Production E2E** を **Run workflow**  
3. 成功時の artifact / ログ（redact 済み JSON）が証拠になる  
4. 認証証拠の最低条件:  
   `clerkSetupOk=true` / `clerkSignInOk=true` / `clerkSessionDetected=true` /  
   `authenticatedUserIdMatchesExpected=true` / `authApiStatus=200` / `protectedPageAccessible=true`

## 禁止事項

- パスワード・Cookie・session token・Secret Key をチャットへ貼る  
- Owner アカウントを E2E ユーザーに使う  
- Production 認証バイパス route を追加する  
- middleware スキップ / 偽 userId 注入 / 固定 cookie  
- health probe / sample DL だけで CORE LOOP PASS にする  
- 根拠なく `/sign-in?ticket=…` 方式へ戻す  
