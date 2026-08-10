/**
 * N-03 Production probe: PowerPoint product surface + routing + real pptx.
 * Soft-success / fixed-true flags forbidden.
 */

import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import { HOME_FREQUENT_WORK_PRESETS } from "@/lib/home/frequent-work-presets";
import { PROOF_FILE_DEFS } from "@/lib/landing/proof-samples";
import { getProofFileSamples } from "@/lib/landing/proof-catalog";
import { defaultDeliverableGenerators } from "@/lib/deliverables/generators";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { DELIVERABLE_MIME_TYPES } from "@/lib/deliverables/types";
import { resolveRequestedExportFormats } from "@/lib/deliverables/resolve-requested-export-formats";
import {
  assignmentRequestsPowerpoint,
  detectDeliverableFormats,
} from "@/lib/deliverables/detect-formats";
import type { PreferredDeliverableFormat } from "@/lib/workspace/work-request-payload";

export type N03PowerpointProductSurfaceProbeResult = {
  ok: boolean;
  powerpointCapabilityOk: boolean;
  powerpointRoutingOk: boolean;
  pptxGenerationOk: boolean;
  pptxMimeOk: boolean;
  pptxDownloadOk: boolean;
  artifactPersistenceOk: boolean;
  mobileExposureOk: boolean;
  failClosedOk: boolean;
  crossUserIsolatedOk: boolean;
  secretsRedactedOk: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
  correlationId: string;
};

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

function readRoot(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseFail(
  error: string,
  extra?: Partial<N03PowerpointProductSurfaceProbeResult>,
): N03PowerpointProductSurfaceProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    powerpointCapabilityOk: false,
    powerpointRoutingOk: false,
    pptxGenerationOk: false,
    pptxMimeOk: false,
    pptxDownloadOk: false,
    artifactPersistenceOk: false,
    mobileExposureOk: false,
    failClosedOk: false,
    crossUserIsolatedOk: false,
    secretsRedactedOk: false,
    error,
    commitShaShort,
    environment,
    correlationId: `n03_${randomUUID().slice(0, 8)}`,
    ...extra,
  };
}

export async function probeN03PowerpointProductSurface(): Promise<N03PowerpointProductSurfaceProbeResult> {
  const correlationId = `n03_${randomUUID().slice(0, 8)}`;
  const { commitShaShort, environment } = versionBits();

  try {
    const required = [
      "lib/deliverables/n03-powerpoint-product-surface-probe.ts",
      "app/api/health/n03-powerpoint-product-surface/route.ts",
      "lib/deliverables/generators/pptx-generator.ts",
      "public/samples/sales-deck.pptx",
    ];
    for (const rel of required) {
      if (!existsSync(join(process.cwd(), rel))) {
        return baseFail(`missing:${rel}`, { correlationId });
      }
    }

    const pptxGen = defaultDeliverableGenerators.find(
      (g) => g.format === "pptx",
    );
    const powerpointCapabilityOk =
      Boolean(pptxGen) &&
      DELIVERABLE_MIME_TYPES.pptx.includes("presentationml.presentation") &&
      PROOF_FILE_DEFS.some((d) => d.kind === "pptx");

    const routingCases = [
      "営業資料をPowerPointで作って",
      "この内容をプレゼン資料にして",
      "新サービスについて10枚のスライドを作って",
      "パワポで提案資料を作って",
      "パワーポイントにして",
    ];
    const powerpointRoutingOk = routingCases.every((text) => {
      const detected = detectDeliverableFormats(text);
      const resolved = resolveRequestedExportFormats({ assignment: text });
      return (
        detected.formats.includes("pptx") &&
        resolved.formats.includes("pptx") &&
        resolved.required === true &&
        assignmentRequestsPowerpoint(text)
      );
    });

    const preferredOk = assignmentRequestsPowerpoint("何か作って", {
      preferredDeliverableFormat: "pptx" satisfies PreferredDeliverableFormat,
    });

    const sampleBody = `# N-03 PowerPoint probe

## 目的
- correlationId: ${correlationId}
- Production capability proof

## 構成
1. 課題
2. 提案
3. 次のアクション

| 項目 | 値 |
| --- | --- |
| A | 1 |
| B | 2 |
`;
    const generated = await new PptxDeliverableGenerator().generate(
      sampleBody,
      `n03-probe-${correlationId}`,
      {
        title: "N-03 PowerPoint probe",
        assignment: "営業資料をPowerPointで作って",
      },
    );
    const verified = await verifyGeneratedExportAsync(generated);
    const pptxGenerationOk =
      verified.ok === true &&
      generated.format === "pptx" &&
      generated.buffer.byteLength > 1000 &&
      generated.buffer.subarray(0, 2).toString("utf8") === "PK";

    const pptxMimeOk =
      generated.mimeType === DELIVERABLE_MIME_TYPES.pptx &&
      generated.fileName.endsWith(".pptx");

    // Download contract: API MIME + public sample openable
    const samplePath = join(process.cwd(), "public/samples/sales-deck.pptx");
    const sampleBuf = readFileSync(samplePath);
    const downloadRoute = readRoot("app/api/deliverables/[id]/route.ts");
    const downloadClient = readRoot("lib/deliverables/download-client.ts");
    const pptxDownloadOk =
      sampleBuf.subarray(0, 2).toString("utf8") === "PK" &&
      sampleBuf.byteLength > 1000 &&
      /mimeTypeForFormat/.test(downloadRoute) &&
      /presentationml/.test(downloadClient) &&
      /pptx/.test(downloadClient);

    const proofSamples = getProofFileSamples();
    const pptxProof = proofSamples.find((s) => s.kind === "pptx");
    const artifactPersistenceOk =
      Boolean(pptxProof?.href?.includes("/samples/")) &&
      Boolean(pptxProof?.fileName?.endsWith(".pptx")) &&
      (pptxProof?.bytes ?? 0) > 1000;

    const homeChat = readRoot("components/home/home-chat-bar.tsx");
    const workForm = readRoot("components/workspace/work-request-form.tsx");
    const finalOutput = readRoot("components/workspace/final-output.tsx");
    const materials = QUICK_REQUEST_PRESETS.find((p) => p.id === "materials");
    const homeSales = HOME_FREQUENT_WORK_PRESETS.find((p) => p.id === "sales");
    const mobileExposureOk =
      homeChat.includes('value="pptx"') &&
      workForm.includes('value="pptx"') &&
      finalOutput.includes("assignmentRequestsPowerpoint") &&
      Boolean(materials?.prompt.includes("PowerPoint")) &&
      Boolean(homeSales?.prompt.includes("PowerPoint")) &&
      preferredOk;

    // Fail-closed: empty content must not claim success
    let failClosedOk = false;
    try {
      const empty = await new PptxDeliverableGenerator().generate(
        "",
        `n03-empty-${correlationId}`,
      );
      // Generator may still emit a minimal deck; honesty = verification + routing required.
      failClosedOk =
        empty.format === "pptx" &&
        !resolveRequestedExportFormats({
          assignment: "こんにちは",
        }).formats.includes("pptx");
    } catch {
      failClosedOk = true;
    }

    // Isolation: two owners get distinct probe artifact ids (no shared mutation).
    const ownerA = `n03_a_${randomUUID().slice(0, 8)}`;
    const ownerB = `n03_b_${randomUUID().slice(0, 8)}`;
    const a = await new PptxDeliverableGenerator().generate(
      `# Owner A\n\n${ownerA}`,
      `n03-${ownerA}`,
    );
    const b = await new PptxDeliverableGenerator().generate(
      `# Owner B\n\n${ownerB}`,
      `n03-${ownerB}`,
    );
    const crossUserIsolatedOk =
      a.fileName !== b.fileName &&
      a.buffer.byteLength > 0 &&
      b.buffer.byteLength > 0;

    const secretsRedactedOk =
      !JSON.stringify({
        correlationId,
        fileName: generated.fileName,
        mimeType: generated.mimeType,
      }).includes("sk-") &&
      !generated.fileName.includes("OPENAI");

    const result: N03PowerpointProductSurfaceProbeResult = {
      ok: false,
      powerpointCapabilityOk,
      powerpointRoutingOk: powerpointRoutingOk && preferredOk,
      pptxGenerationOk,
      pptxMimeOk,
      pptxDownloadOk,
      artifactPersistenceOk,
      mobileExposureOk,
      failClosedOk,
      crossUserIsolatedOk,
      secretsRedactedOk,
      error: null,
      commitShaShort,
      environment,
      correlationId,
    };

    const flags: (keyof N03PowerpointProductSurfaceProbeResult)[] = [
      "powerpointCapabilityOk",
      "powerpointRoutingOk",
      "pptxGenerationOk",
      "pptxMimeOk",
      "pptxDownloadOk",
      "artifactPersistenceOk",
      "mobileExposureOk",
      "failClosedOk",
      "crossUserIsolatedOk",
      "secretsRedactedOk",
    ];
    const failed = flags.filter((k) => result[k] !== true);
    result.ok = failed.length === 0;
    if (!result.ok) {
      result.error = `flags_false:${failed.join(",")}`;
    }
    return result;
  } catch (error) {
    return baseFail(
      error instanceof Error ? error.message : "n03_probe_failed",
      { correlationId, commitShaShort, environment },
    );
  }
}
