/**
 * Release gate definition for Word / deliverables / notifications.
 * Used by scripts and docs — failing any check means "not production-ready".
 */

export const RELEASE_GATE_CHECKS = [
  {
    id: "build",
    label: "ビルド",
    command: "npm run build",
    required: true,
  },
  {
    id: "typecheck",
    label: "型チェック",
    command: "npm run typecheck:gate",
    required: true,
  },
  {
    id: "lint",
    label: "Lint",
    command: "npm run lint:gate",
    required: true,
  },
  {
    id: "unit",
    label: "ユニットテスト",
    command: "npm run test:unit:gate",
    required: true,
  },
  {
    id: "integration",
    label: "統合テスト",
    command: "npm run test:integration",
    required: true,
  },
  {
    id: "word-e2e",
    label: "Word主要E2E",
    command: "npm run test:word-e2e",
    required: true,
  },
  {
    id: "notification-e2e",
    label: "通知主要E2E",
    command: "npm run test:notification-e2e",
    required: true,
  },
] as const;

export type ReleaseGateCheckId = (typeof RELEASE_GATE_CHECKS)[number]["id"];

export const RELEASE_GATE_ENV_NOTES = [
  "GitHub Actions の release-gate ジョブを main / PR で必須ステータスにする。",
  "Vercel 自動デプロイを止められない場合は、Ignored Build Step か Preview-only 自動デプロイに留め、Production はゲート成功後に手動 Promote する。",
  "本番に危険な vercel.json 変更（全デプロイ強制停止など）は行わない。",
] as const;
