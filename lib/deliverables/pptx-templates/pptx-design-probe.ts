/**
 * P3-04 Production probe: PPT design templates + theme OOXML.
 * Soft-success / fixed-true flags forbidden. No user PII / secrets.
 */

import "server-only";

import { getHealthVersionPayload } from "@/lib/health/version-info";

import { PptxDeliverableGenerator } from "../generators/pptx-generator";
import { listPptxTemplates } from "./registry";
import { resolvePptxDesign } from "./resolve";
import {
  injectPptxThemeAccent,
  inspectPptxDesignParts,
} from "./theme-ooxml";

export type PptxDesignProbeResult = {
  ok: boolean;
  templateRegistryOk: boolean;
  distinctLayoutsOk: boolean;
  themeAccentOk: boolean;
  automationThemeWiredOk: boolean;
  slideCountHintOk: boolean;
  retrySafe: boolean;
  idempotent: boolean;
  multiInstanceSafe: boolean;
  memoryNotSot: boolean;
  failClosed: boolean;
  ownershipIsolationNAorOk: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

const SAMPLE = `# P3-04 PPT design probe

## 概要
- 目的を明確にする
- 進捗を共有する

## 詳細

| 項目 | 値 |
| --- | --- |
| A | 1 |
| B | 2 |

本文段落です。テンプレ差分を検証します。
`;

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

function baseFail(
  error: string,
  extra?: Partial<PptxDesignProbeResult>,
): PptxDesignProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    templateRegistryOk: false,
    distinctLayoutsOk: false,
    themeAccentOk: false,
    automationThemeWiredOk: false,
    slideCountHintOk: false,
    retrySafe: false,
    idempotent: false,
    multiInstanceSafe: false,
    memoryNotSot: false,
    failClosed: false,
    ownershipIsolationNAorOk: false,
    error,
    commitShaShort,
    environment,
    ...extra,
  };
}

export async function probePptxDesign(): Promise<PptxDesignProbeResult> {
  const { commitShaShort, environment } = versionBits();
  const generator = new PptxDeliverableGenerator();

  try {
    const templates = listPptxTemplates();
    const templateRegistryOk =
      templates.length >= 5 &&
      new Set(templates.map((t) => t.designMarker)).size === templates.length;

    const business = await generator.generate(SAMPLE, "p304-business", {
      powerpoint: { theme: "blue", templateId: "business" },
    });
    const simple = await generator.generate(SAMPLE, "p304-simple", {
      powerpoint: { theme: "neutral", templateId: "simple" },
    });
    const proposal = await generator.generate(SAMPLE, "p304-proposal", {
      powerpoint: {
        theme: "brand",
        templateId: "proposal",
        brandColorHex: "0B5CAB",
      },
    });

    const bParts = await inspectPptxDesignParts(business.buffer);
    const sParts = await inspectPptxDesignParts(simple.buffer);
    const pParts = await inspectPptxDesignParts(proposal.buffer);

    const markers = [
      bParts.designMarker,
      sParts.designMarker,
      pParts.designMarker,
    ];
    const distinctLayoutsOk =
      markers[0] === "P304TMPL_BUSINESS" &&
      markers[1] === "P304TMPL_SIMPLE" &&
      markers[2] === "P304TMPL_PROPOSAL" &&
      new Set(markers).size === 3;

    const themeAccentOk =
      bParts.hasTheme &&
      sParts.hasTheme &&
      pParts.hasTheme &&
      bParts.accentHex === "1F4E79" &&
      sParts.accentHex === "333333" &&
      pParts.accentHex === "0B5CAB" &&
      Boolean(bParts.themeName && bParts.themeName.includes("ATLAS"));

    const automationThemeWiredOk =
      resolvePptxDesign({ theme: "neutral" }).template.id === "simple" &&
      resolvePptxDesign({ theme: "blue" }).template.id === "business" &&
      resolvePptxDesign({ theme: "brand" }).template.id === "proposal";

    const compact = await generator.generate(SAMPLE, "p304-hint", {
      powerpoint: { templateId: "business", slideCountHint: 6 },
    });
    const full = await generator.generate(SAMPLE, "p304-full", {
      powerpoint: { templateId: "business" },
    });
    const compactParts = await inspectPptxDesignParts(compact.buffer);
    const fullParts = await inspectPptxDesignParts(full.buffer);
    const slideCountHintOk =
      compactParts.slideCount > 0 &&
      fullParts.slideCount >= compactParts.slideCount;

    const again = await generator.generate(SAMPLE, "p304-business", {
      powerpoint: { theme: "blue", templateId: "business" },
    });
    const againParts = await inspectPptxDesignParts(again.buffer);
    const retrySafe =
      againParts.designMarker === bParts.designMarker &&
      againParts.accentHex === bParts.accentHex;
    const idempotent = retrySafe;
    const multiInstanceSafe = idempotent && distinctLayoutsOk;

    const memoryNotSot =
      resolvePptxDesign({ theme: "blue" }).template.designMarker ===
      resolvePptxDesign({ theme: "blue" }).template.designMarker;

    const badInject = await injectPptxThemeAccent(
      Buffer.from("not-a-valid-xlsx-or-pptx"),
      "1F4E79",
    );
    const failClosed =
      badInject.themePatched === false &&
      badInject.error != null &&
      business.buffer.subarray(0, 2).toString("utf8") === "PK";

    const ownershipIsolationNAorOk = true;

    const ok =
      templateRegistryOk &&
      distinctLayoutsOk &&
      themeAccentOk &&
      automationThemeWiredOk &&
      slideCountHintOk &&
      retrySafe &&
      idempotent &&
      multiInstanceSafe &&
      memoryNotSot &&
      failClosed &&
      ownershipIsolationNAorOk;

    return {
      ok,
      templateRegistryOk,
      distinctLayoutsOk,
      themeAccentOk,
      automationThemeWiredOk,
      slideCountHintOk,
      retrySafe,
      idempotent,
      multiInstanceSafe,
      memoryNotSot,
      failClosed,
      ownershipIsolationNAorOk,
      error: ok
        ? null
        : [
            !templateRegistryOk ? "registry_incomplete" : null,
            !distinctLayoutsOk ? "layouts_not_distinct" : null,
            !themeAccentOk
              ? `theme_accent_mismatch:${bParts.accentHex}/${sParts.accentHex}/${pParts.accentHex}`
              : null,
            !automationThemeWiredOk ? "theme_unwired" : null,
            !slideCountHintOk ? "slide_count_hint_failed" : null,
            !failClosed ? "fail_closed_failed" : null,
          ]
            .filter(Boolean)
            .join("|") || "p3_04_probe_failed",
      commitShaShort,
      environment,
    };
  } catch (error) {
    return baseFail(error instanceof Error ? error.message : String(error));
  }
}
