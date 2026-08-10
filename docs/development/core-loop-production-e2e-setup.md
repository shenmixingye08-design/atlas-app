# Production CORE LOOP E2E — Owner セットアップ手順

この手順は **パスワード・Cookie・token をチャットへ貼らない** 前提です。  
認証情報は GitHub Actions Secrets にだけ入れます。

## 何を実現するか

- 一般ユーザーの Google ログインを壊さない
- Production に認証バイパスを追加しない
- Clerk **Sign-in Token（ticket）** で E2E 専用ユーザーの正規セッションを短命発行
- Playwright が `https://atlasapp.jp` の UI/API 正規経路を通る

## 必要な GitHub Secrets

| Secret 名 | 内容 |
|---|---|
| `CLERK_SECRET_KEY` | Production Clerk Secret Key（`sk_live_…`）。Vercel と同じ Production インスタンス |
| `E2E_CLERK_USER_ID` | 検証ユーザー A の Clerk `user_…`（**ATLAS_OWNER_EMAILS に含めない**） |
| `E2E_CLERK_USER_B_ID` | 検証ユーザー B の Clerk `user_…`（isolation 用。A と別。Owner でもない） |
| `ATLAS_APP_URL` | 省略可。未設定時は `https://atlasapp.jp` |

任意:

| Secret 名 | 内容 |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production `pk_live_…`（ticket URL 解決の補助。無くても多くの場合動く） |

## Owner 操作（外部サービス）

### 1) Clerk Dashboard

1. [Clerk Dashboard](https://dashboard.clerk.com) を開く  
2. **Production** インスタンス（`atlasapp.jp` / `clerk.atlasapp.jp`）を選択  
3. **Users → Create user** で検証ユーザー A を作成  
   - 用途ラベル例: `minervot-e2e-a@…`（実在メールで可）  
   - **Owner 用メールにしない**（`ATLAS_OWNER_EMAILS` に入れない）  
4. 同様に検証ユーザー B を作成（isolation 用）  
5. 各ユーザー詳細から **User ID**（`user_…`）を控える  
6. **Configure → API Keys** で Production **Secret Key** を確認（値は画面から GitHub へ直接登録。チャットに貼らない）

> 一般ユーザー向けに Email/Password ログインを公開有効化する必要はありません。  
> Sign-in Token（ticket）は既存 Production 戦略のまま使います。

### 2) GitHub → Secrets

1. GitHub: `shenmixingye08-design/atlas-app`  
2. **Settings → Secrets and variables → Actions**  
3. 上記 Secrets を登録（値はチャット・PR・issue に書かない）

### 3) 実行

1. 本ハーネスの PR を main へ Merge  
2. Actions: **Verify CORE LOOP Production E2E** を **Run workflow**  
3. 成功時の artifact / ログ（redact 済み JSON）が証拠になる

## 禁止事項

- パスワード・Cookie・session token・Secret Key をチャットへ貼る  
- Owner アカウントを E2E ユーザーに使う  
- Production 認証バイパス route を追加する  
- health probe / sample DL だけで CORE LOOP PASS にする  
