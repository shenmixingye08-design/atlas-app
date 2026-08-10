/**
 * N-03: PowerPoint product surface unit + probe tests.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assignmentRequestsPowerpoint,
  detectDeliverableFormats,
} from "@/lib/deliverables/detect-formats";
import { resolveRequestedExportFormats } from "@/lib/deliverables/resolve-requested-export-formats";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import { HOME_FREQUENT_WORK_PRESETS } from "@/lib/home/frequent-work-presets";
import { PROOF_FILE_DEFS } from "@/lib/landing/proof-samples";

describe("N-03 PowerPoint routing", () => {
  it("routes natural Japanese PowerPoint requests to pptx", () => {
    const cases = [
      "営業資料をPowerPointで作って",
      "この内容をプレゼン資料にして",
      "○○について10枚のスライドを作って",
      "パワポで提案資料を作って",
    ];
    for (const text of cases) {
      const detected = detectDeliverableFormats(text);
      const resolved = resolveRequestedExportFormats({ assignment: text });
      expect(detected.formats).toContain("pptx");
      expect(resolved.formats).toContain("pptx");
      expect(resolved.required).toBe(true);
      expect(assignmentRequestsPowerpoint(text)).toBe(true);
    }
  });

  it("honors preferredDeliverableFormat=pptx", () => {
    expect(
      assignmentRequestsPowerpoint("適当な依頼", {
        preferredDeliverableFormat: "pptx",
      }),
    ).toBe(true);
  });
});

describe("N-03 product surface exposure", () => {
  it("exposes PowerPoint in presets and proof defs", () => {
    const materials = QUICK_REQUEST_PRESETS.find((p) => p.id === "materials");
    expect(materials?.label).toMatch(/PowerPoint/);
    expect(materials?.prompt).toMatch(/PowerPoint/);

    const home = HOME_FREQUENT_WORK_PRESETS.find((p) => p.id === "sales");
    expect(home?.prompt).toMatch(/PowerPoint/);

    expect(PROOF_FILE_DEFS.some((d) => d.kind === "pptx")).toBe(true);
  });
});

describe("N-03 production probe", () => {
  it("reports all required flags true", async () => {
    const { probeN03PowerpointProductSurface } = await import(
      "@/lib/deliverables/n03-powerpoint-product-surface-probe"
    );
    const result = await probeN03PowerpointProductSurface();
    if (!result.ok) {
      expect(result).toMatchObject({ ok: true, error: null });
    }
    expect(result.powerpointCapabilityOk).toBe(true);
    expect(result.powerpointRoutingOk).toBe(true);
    expect(result.pptxGenerationOk).toBe(true);
    expect(result.pptxMimeOk).toBe(true);
    expect(result.pptxDownloadOk).toBe(true);
    expect(result.artifactPersistenceOk).toBe(true);
    expect(result.mobileExposureOk).toBe(true);
    expect(result.failClosedOk).toBe(true);
    expect(result.crossUserIsolatedOk).toBe(true);
    expect(result.secretsRedactedOk).toBe(true);
    expect(result.ok).toBe(true);
  }, 60_000);
});
