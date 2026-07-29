#!/usr/bin/env node
/**
 * Local / CI release gate for Word + notifications quality.
 * Any required check failure → exit 1 (not production-ready).
 *
 * Usage: node scripts/release-gate.mjs [--skip-build]
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const skipBuild = process.argv.includes("--skip-build");

const checks = [
  !skipBuild && {
    id: "build",
    label: "ビルド",
    command: "npm",
    args: ["run", "build"],
  },
  {
    id: "typecheck",
    label: "型チェック",
    command: "npm",
    args: ["run", "typecheck:gate"],
  },
  {
    id: "lint",
    label: "Lint（Word/通知関連）",
    command: "npm",
    args: ["run", "lint:gate"],
  },
  {
    id: "unit",
    label: "ユニットテスト",
    command: "npm",
    args: ["run", "test:unit:gate"],
  },
  {
    id: "integration",
    label: "統合テスト",
    command: "npm",
    args: ["run", "test:integration"],
  },
  {
    id: "word-e2e",
    label: "Word主要E2E",
    command: "npm",
    args: ["run", "test:word-e2e"],
  },
  {
    id: "notification-e2e",
    label: "通知主要E2E",
    command: "npm",
    args: ["run", "test:notification-e2e"],
  },
].filter(Boolean);

function envOr(name, fallback) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  // Build-time placeholders — never use as real production secrets.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: envOr(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
  ),
  CLERK_SECRET_KEY: envOr(
    "CLERK_SECRET_KEY",
    "sk_test_dummysecretdummysecretdummysecret",
  ),
  ATLAS_DELIVERABLE_STORAGE: envOr("ATLAS_DELIVERABLE_STORAGE", "local"),
  ATLAS_OWNER_EMAILS: envOr("ATLAS_OWNER_EMAILS", "release-gate@example.com"),
  ATLAS_OPERATOR_BUSINESS_NAME: envOr(
    "ATLAS_OPERATOR_BUSINESS_NAME",
    "MINERVOT Gate",
  ),
  ATLAS_OPERATOR_REPRESENTATIVE_NAME: envOr(
    "ATLAS_OPERATOR_REPRESENTATIVE_NAME",
    "Gate Runner",
  ),
  ATLAS_OPERATOR_ADDRESS: envOr("ATLAS_OPERATOR_ADDRESS", "CI"),
  ATLAS_OPERATOR_CONTACT_EMAIL: envOr(
    "ATLAS_OPERATOR_CONTACT_EMAIL",
    "ops@minervot.example",
  ),
};

const results = [];

for (const check of checks) {
  console.log(`\n=== [release-gate] ${check.label} (${check.id}) ===\n`);
  const started = Date.now();
  const proc = spawnSync(check.command, check.args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  const ok = proc.status === 0;
  results.push({
    id: check.id,
    label: check.label,
    ok,
    exitCode: proc.status,
    ms: Date.now() - started,
  });
  if (!ok) {
    console.error(`\n[release-gate] FAILED: ${check.label}`);
    break;
  }
}

const summary = {
  ok: results.every((r) => r.ok) && results.length === checks.length,
  completedAt: new Date().toISOString(),
  results,
  productionReady: false,
};

summary.productionReady = summary.ok;

const outDir = "/opt/cursor/artifacts/release-gate";
try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
} catch {
  // optional artifact path
}

console.log("\n[release-gate] summary:");
console.log(JSON.stringify(summary, null, 2));

if (!summary.productionReady) {
  console.error(
    "\n本番デプロイ可能な状態として扱いません（リリースゲート未達）。",
  );
  process.exit(1);
}

console.log("\nリリースゲート成功 — 本番デプロイ可能な状態です。");
process.exit(0);
