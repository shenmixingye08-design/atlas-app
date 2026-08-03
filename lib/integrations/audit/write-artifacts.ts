/**
 * Write Phase 3-1 CI artifacts under artifacts/ and docs/development/.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExternalAdapterInventoryArtifact,
  buildIntegrationRegistryAuditArtifact,
  buildIntegrationRiskRegisterArtifact,
  buildOauthSecurityAuditArtifact,
  buildPhase32TargetsMarkdown,
  buildTokenStorageAuditArtifact,
} from "./snapshot";

export function writeExternalAdapterAuditArtifacts(
  rootDir: string = process.cwd(),
): string[] {
  const artifactsDir = join(rootDir, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });

  const files: Array<{ path: string; body: string }> = [
    {
      path: join(artifactsDir, "external-adapter-inventory.json"),
      body: `${JSON.stringify(buildExternalAdapterInventoryArtifact(), null, 2)}\n`,
    },
    {
      path: join(artifactsDir, "integration-registry-audit.json"),
      body: `${JSON.stringify(buildIntegrationRegistryAuditArtifact(), null, 2)}\n`,
    },
    {
      path: join(artifactsDir, "oauth-security-audit.json"),
      body: `${JSON.stringify(buildOauthSecurityAuditArtifact(), null, 2)}\n`,
    },
    {
      path: join(artifactsDir, "token-storage-audit.json"),
      body: `${JSON.stringify(buildTokenStorageAuditArtifact(), null, 2)}\n`,
    },
    {
      path: join(artifactsDir, "integration-risk-register.json"),
      body: `${JSON.stringify(buildIntegrationRiskRegisterArtifact(), null, 2)}\n`,
    },
    {
      path: join(rootDir, "docs/development/phase-3-2-targets.md"),
      body: buildPhase32TargetsMarkdown(),
    },
  ];

  for (const file of files) {
    writeFileSync(file.path, file.body, "utf8");
  }

  return files.map((file) => file.path);
}
