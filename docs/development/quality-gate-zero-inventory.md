# Quality Gate Zero — Failure Inventory（修正前）

採取日時: 2026-08-02  
ブランチ: `cursor/quality-gate-zero-4b7a`（main起点）  
コマンド: `npm run typecheck` / `npm run lint` / `npm test` / `npm run build`  
（lockfile は npm。pnpm は利用可能だが `package-lock.json` 厳守のため npm scripts を正とする）

## 修正前件数

| Gate | 結果 |
|---|---|
| TypeScript | **43 errors** FAIL |
| ESLint | **79 errors / 66 warnings** FAIL |
| Vitest | **8 failed / 1018 passed** FAIL |
| Build（envなし） | **FAIL**（`/owner/account-deletions` prerender） |

## TypeScript Root Causes

| Root Cause | 件数 | 影響 | 修正方針 | 回帰リスク | 順 |
|---|---:|---|---|---|---:|
| Untyped `vi.fn` → 0-arg/null-only 推論 | 19 | test | `typeof` で mock 型付け | 低 | 1 |
| Stale fixture vs current schema | 13 | test | fixtureを現行型に整合 | 低 | 2 |
| Incomplete cast to domain types | 5 | test | normalize/fixture builder | 低 | 3 |
| DOM global assign typing | 3 | test | `vi.stubGlobal` | 低 | 4 |
| `NODE_ENV` readonly | 3 | test | `vi.stubEnv` | 低 | 5 |

## ESLint Root Causes

| Root Cause | 件数 | 影響 | 修正方針 | 回帰リスク | 順 |
|---|---:|---|---|---|---:|
| `react-hooks/set-state-in-effect` data-load | 48 | UI mount | sync setState を effect から分離 | 中 | 3 |
| `react-hooks/set-state-in-effect` derived | 19 | UI | 派生値は render で計算 | 中 | 2 |
| `react-hooks/set-state-in-effect` timer | 3 | UI | lazy init / reducer | 中 | 4 |
| `react-hooks/purity` | 3 | error pages | `useId` / effect内時刻 | 低 | 1 |
| `react-hooks/refs` | 2 | UI | refをrenderで読まない | 中 | 1 |
| `prefer-const` | 4 | lib | const化 | 低 | 1 |
| unused-vars (warnings) | 62 | 全域 | 削除 | 低 | 5 |
| unused eslint-disable | 4 | tests | コメント削除 | 低 | 1 |

## Vitest Root Causes

| Root Cause | 件数 | 本物/古い期待 | 修正方針 |
|---|---:|---|---|
| AI employee phase IDs stale | 3 | 古い期待＋mapper未更新 | 現行4フェーズへ整合 |
| Notification prefs bypass via lineEvent | 2 | **本番不具合** | fail-closed |
| Worker prose validation | 1 | 古い期待 | 無効ケースへ更新 |
| Vision photo deliverables | 1 | 本番寄り | 生成経路修正 |
| Document model summary role | 1 | 本番寄り | structure修正 |

## Build

- 条件: `NODE_ENV=production` で prerender
- 必須env: `ATLAS_OWNER_EMAILS` が page 評価時に要求される
- 修正: `connection()` で request-time に遅延、runtime は fail-closed 維持
