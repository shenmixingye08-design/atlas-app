import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";

export type DeployCheckItem = {
  id: string;
  title: string;
  required: boolean;
  status: "done" | "skipped" | "failed" | "not_run";
  evidence: string;
};

export type RollbackDrillResult = {
  attempted: boolean;
  passed: boolean;
  environment: string;
  notes: string;
  steps: string[];
};

export const DEPLOY_CHECKLIST_TEMPLATE: Omit<
  DeployCheckItem,
  "status" | "evidence"
>[] = [
  { id: "pre_deploy", title: "pre-deploy check", required: true },
  { id: "migration_dry_run", title: "migration dry-run", required: true },
  { id: "backup_confirm", title: "backup確認", required: true },
  { id: "typecheck", title: "型チェック", required: true },
  { id: "lint", title: "lint", required: true },
  { id: "unit", title: "unit test", required: true },
  { id: "integration", title: "integration test", required: true },
  { id: "e2e_smoke", title: "E2E smoke test", required: true },
  { id: "canary", title: "canaryまたは段階公開", required: true },
  { id: "health", title: "health check", required: true },
  { id: "post_deploy", title: "post-deploy verification", required: true },
  { id: "rollback_decision", title: "rollback判定", required: true },
  { id: "rollback_exec", title: "rollback実行", required: true },
  { id: "rollback_verify", title: "rollback後確認", required: true },
];

/**
 * Controlled rollback drill in agent environment.
 * Does NOT claim production Vercel rollback success.
 */
export function runRollbackDrill(): RollbackDrillResult {
  const steps = [
    "記録: 現在のgit HEADを before とする",
    "合成: deploy marker ファイルを作成（新バージョン）",
    "判定: health失敗を想定し rollback を決定",
    "実行: marker を削除し before 状態へ戻す",
    "確認: marker 不在 = ロールバック成功（ローカル制御環境）",
  ];

  const markerDir = "/tmp/minervot-rollback-drill";
  const marker = `${markerDir}/deploy-marker.txt`;
  try {
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(marker, `deployed_at=${new Date().toISOString()}`);
    if (!existsSync(marker)) {
      return {
        attempted: true,
        passed: false,
        environment: "agent-local",
        notes: "marker作成失敗",
        steps,
      };
    }
    rmSync(marker);
    const rolledBack = !existsSync(marker);
    return {
      attempted: true,
      passed: rolledBack,
      environment: "agent-local",
      notes:
        "制御されたローカル環境でのロールバック手順演習。本番Vercel/DB migration rollbackは未実施。アプリのみ戻してDBが壊れるケースは未検証。",
      steps,
    };
  } catch (e) {
    return {
      attempted: true,
      passed: false,
      environment: "agent-local",
      notes: e instanceof Error ? e.message : "rollback drill error",
      steps,
    };
  }
}

export function evaluateDeployReadiness(items: DeployCheckItem[]): {
  ready: boolean;
  missing: string[];
} {
  const missing = items
    .filter((i) => i.required && i.status !== "done")
    .map((i) => i.id);
  return { ready: missing.length === 0, missing };
}
