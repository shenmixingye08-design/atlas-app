# Production CORE LOOP E2E — Owner セットアップ手順

この手順は **パスワード・Cookie・token をチャットへ貼らない** 前提です。  
認証情報は GitHub Actions Secrets にだけ入れます。

## 何を実現するか

- 一般ユーザーの Google ログインを壊さない
- Production に認証バイパスを追加しない
- Clerk 公式 Playwright ヘルパー（`@clerk/testing/playwright`）で E2E 専用ユーザーの正規セッションを確立する
  - `clerkSetup()` — Testing Token 取得（Production 対応）
  - **必ず** `setupClerkTestingToken({ context })` を最初の navigation 前に実行（FAPI captcha_bypass）
  - Backend で E2E user に identification（`+clerk_test` email または test phone）付与を試行
  - 主経路: 公式 `clerk.signIn({ emailAddress })` / `phone_code` / Sign-in Token ticket
  - `sessions.createSession` は Production では不可（Bad Request）
  - CI は `CORE_LOOP_EXPECT_SHA` と Production `/api/health/version` 一致待ち
- Email/Password ログインの公開有効化は不要（Google 設定も変更しない）
- Playwright が `https://atlasapp.jp` の UI/API 正規経路を通る

## Production 実証で確定した制約（重要）

| 経路 | 結果 |
|---|---|
| `sessions.createSession` | Production で Bad Request（testing-only） |
| Backend `createEmailAddress`（email identifier 未有効時） | `feature_not_enabled` |
| Sign-in Token ticket（identification なし user） | `token doesn't have an associated identification`（run 31475111236） |
| Agent Tasks | この Production Dashboard に設定 UI なし |

**結論:** E2E user に email または phone の identification が必須。コードだけでは Clerk インスタンス設定を有効化できない場合がある。

## なぜ以前の方式を使わないか

1. **`/sign-in?__clerk_ticket=…` URL 方式**  
   Production 証拠で token 発行・HTTP 200 までは成功したが、session が成立せず `/sign-in` ループ + `authApiStatus=401` になった。
2. **Agent Tasks API**  
   現行 Clerk Production Dashboard に該当設定項目が存在しないため、Dashboard 操作前提の解決策にしない。

## 必要な GitHub Secrets

| Secret 名 | 内容 |
|---|---|
| `CLERK_SECRET_KEY` | Production Clerk Secret Key（`sk_live_…`）。Vercel と同じ Production インスタンス |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production Publishable Key（`pk_live_…`）。`clerkSetup()` に必要 |
| `E2E_CLERK_USER_ID` | 検証ユーザー A の Clerk `user_…`（**ATLAS_OWNER_EMAILS に含めない**） |
| `E2E_CLERK_USER_B_ID` | 検証ユーザー B の Clerk `user_…`（isolation 用。A と別） |
| `ATLAS_APP_URL` | 省略可。未設定時は `https://atlasapp.jp` |

## Owner 操作（外部サービス）— identification 付与

ハーネスが `OWNER_SETUP_REQUIRED` で止まっている場合、**次のいずれか 1 つ**を実行してください（Agent Tasks は不要 / Google 設定は変更しない）。

### 推奨 A) Email identifier を有効化（公開 Email/Password ではない）

1. [Clerk Dashboard](https://dashboard.clerk.com) → **Production**（`atlasapp.jp`）
2. **User & Authentication** → **Email** → **Email address** を identifier として有効化  
   - **Email + Password を一般公開ログインとして有効化しない**
3. GitHub Actions の **Verify CORE LOOP Production E2E** を再実行（または harness 変更を merge）  
4. ハーネスが Backend API で `+clerk_test` email を E2E user に自動付与して認証する

### 代替 B) 既存 E2E user に手動で email / phone を付与

1. Clerk Dashboard → **Users**
2. `E2E_CLERK_USER_ID` / `E2E_CLERK_USER_B_ID` の各ユーザーを開く
3. verified な email（推奨: `…+clerk_test@…`）または phone を追加
4. Actions を再実行

### 確認済み不要な操作

- Agent Tasks (Beta) を探す / 有効化する → **不要・UI なし**
- Google ログイン設定の変更 → **禁止**
- Production 認証バイパス追加 → **禁止**

## 実行

1. 本ハーネスの PR を main へ Merge  
2. harness/workflow 変更の push で **Verify CORE LOOP Production E2E** が自動起動  
3. 認証証拠の最低条件:  
   `clerkSetupOk=true` / `clerkSignInOk=true` / `clerkSessionDetected=true` /  
   `authenticatedUserIdMatchesExpected=true` / `authApiStatus=200` / `protectedPageAccessible=true`  
4. その後 jobId → artifact → download → User B isolation まで確認

## 禁止事項

- パスワード・Cookie・session token・Secret Key をチャットへ貼る  
- Owner アカウントを E2E ユーザーに使う  
- Production 認証バイパス route を追加する  
- middleware スキップ / 偽 userId 注入 / 固定 cookie  
- health probe / sample DL だけで CORE LOOP PASS にする  
- 根拠なく Agent Tasks API を必須と主張する  
- 根拠なく ticket-query sign-in URL 方式へ戻す  
