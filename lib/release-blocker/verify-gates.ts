import { readFileSync, existsSync } from "fs";
import { join } from "path";

/** Static source checks that heavy routes enforce billing + rate limit. */
export function verifyHeavyRoutesBillingGated(
  root = process.cwd()
): boolean {
  const files = [
    "app/api/vision/analyze/route.ts",
    "app/api/pptx/create/route.ts",
    "app/api/excel/create/route.ts",
    "app/api/artifacts/convert/route.ts",
  ];
  for (const rel of files) {
    const path = join(root, rel);
    if (!existsSync(path)) return false;
    const src = readFileSync(path, "utf8");
    if (!src.includes("requireBillingAiUsage")) return false;
    if (!src.includes("enforceAiRateLimit")) return false;
  }
  return true;
}

export function verifyKnowledgeRequiresUserId(root = process.cwd()): boolean {
  const path = join(
    root,
    "lib/knowledge/repositories/server-knowledge-repository.ts"
  );
  if (!existsSync(path)) return false;
  const src = readFileSync(path, "utf8");
  return (
    src.includes("knowledge_userId_required") &&
    src.includes("__atlasKnowledgeStoreV2") &&
    src.includes("if (!filter?.userId)")
  );
}

export function verifyCompanyPerUser(root = process.cwd()): boolean {
  const path = join(root, "lib/company-templates/store.ts");
  if (!existsSync(path)) return false;
  const src = readFileSync(path, "utf8");
  return src.includes("__atlasActiveCompanyByUser") && src.includes("userId");
}

export function verifyMarketplacePerUser(root = process.cwd()): boolean {
  const path = join(root, "lib/workflow-marketplace/installed-store.ts");
  if (!existsSync(path)) return false;
  const src = readFileSync(path, "utf8");
  return (
    src.includes("__atlasInstalledWorkflowPackagesByUser") &&
    src.includes("marketplace_userId_required")
  );
}
