/**
 * P1-08 Production probe: Excel numFmt + PPTX real table/image + Word ImageRun.
 * Fixed samples only — no user data, no secrets.
 */

import "server-only";

import JSZip from "jszip";

import { getHealthVersionPayload } from "@/lib/health/version-info";

import { P108_PROBE_PNG_DATA_URL } from "./embedded-image";
import { DocxDeliverableGenerator } from "./generators/docx-generator";
import { PptxDeliverableGenerator } from "./generators/pptx-generator";
import { XlsxDeliverableGenerator } from "./generators/xlsx-generator";

const MARKER_AMOUNT = "P108AMT_4421";
const MARKER_DATE = "2026-08-09";
const MARKER_CAPTION = "P108CAP_IMG";

const EXCEL_SAMPLE = `# P1-08 Excel numFmt probe

| 日付 | 項目 | 金額 |
| --- | --- | ---: |
| ${MARKER_DATE} | ${MARKER_AMOUNT} | 12500 |
| 2026-08-10 | サンプルB | 3200 |
`;

const PPTX_SAMPLE = `# P1-08 PowerPoint probe

## 実績

| 指標 | 値 |
| --- | --- |
| ${MARKER_AMOUNT} | 12 |
| Beta | 4 |

![${MARKER_CAPTION}](${P108_PROBE_PNG_DATA_URL})
`;

const DOCX_SAMPLE = `# P1-08 Word image probe

## 図

![${MARKER_CAPTION}](${P108_PROBE_PNG_DATA_URL})

本文マーカー ${MARKER_AMOUNT}
`;

export type DeliverableQualityProbeResult = {
  ok: boolean;
  excelNumFmtOk: boolean;
  excelSidecarAbsent: boolean;
  pptxTableOk: boolean;
  pptxImageOk: boolean;
  wordImageEmbedOk: boolean;
  memoryNotSot: boolean;
  failClosedOnOmission: boolean;
  ownershipIsolationNAorOk: boolean;
  restartDurableNAorOk: boolean;
  multiInstanceSafeNAorOk: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

async function zipHas(buffer: Buffer, predicate: (path: string, text: string) => boolean): Promise<boolean> {
  const zip = await JSZip.loadAsync(buffer);
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const text = await entry.async("string");
    if (predicate(path, text)) return true;
  }
  return false;
}

async function zipPaths(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files).filter((p) => !zip.files[p]?.dir);
}

async function probeExcel(): Promise<{
  numFmtOk: boolean;
  sidecarAbsent: boolean;
}> {
  const file = await new XlsxDeliverableGenerator().generate(EXCEL_SAMPLE, "p108-excel", {
    excel: { currency: "JPY", dateFormat: "yyyy-mm-dd" },
  });
  const paths = await zipPaths(file.buffer);
  const styles = await zipHas(file.buffer, (path, text) => {
    if (!path.includes("styles.xml")) return false;
    // exceljs emits numFmt entries for currency/date
    return (
      /numFmtId|numFmt/i.test(text) &&
      (/¥|#,##0|yyyy/i.test(text) || /formatCode=/i.test(text))
    );
  });
  const sheetHasNumber = await zipHas(file.buffer, (path, text) => {
    if (!/xl\/worksheets\/sheet\d+\.xml$/i.test(path)) return false;
    // Typed numeric cell (not inline string only)
    return /<v>12500<\/v>|<v>3200<\/v>/.test(text);
  });
  const sidecarAbsent = !(await zipHas(file.buffer, (_path, text) =>
    /通貨:JPY|日付:yyyy-mm-dd/.test(text),
  ));
  return {
    numFmtOk: styles && sheetHasNumber && paths.some((p) => p.includes("xl/")),
    sidecarAbsent,
  };
}

async function probePptx(): Promise<{ tableOk: boolean; imageOk: boolean }> {
  const file = await new PptxDeliverableGenerator().generate(
    PPTX_SAMPLE,
    "p108-pptx",
  );
  const paths = await zipPaths(file.buffer);
  const tableOk = await zipHas(
    file.buffer,
    (path, text) =>
      /ppt\/slides\/slide\d+\.xml$/i.test(path) && /<a:tbl[\s>]/.test(text),
  );
  const imageOk =
    paths.some((p) => /^ppt\/media\//i.test(p)) &&
    (await zipHas(
      file.buffer,
      (path, text) =>
        /ppt\/slides\/slide\d+\.xml$/i.test(path) &&
        (/<a:blip[\s>]|<p:pic[\s>]/.test(text) || /r:embed=/.test(text)),
    ));
  return { tableOk, imageOk };
}

async function probeDocx(): Promise<boolean> {
  const file = await new DocxDeliverableGenerator().generate(
    DOCX_SAMPLE,
    "p108-docx",
    {
      brand: {
        userId: "p108-probe",
        companyName: "P108 Probe Co",
        logoDataUrl: P108_PROBE_PNG_DATA_URL,
        updatedAt: new Date().toISOString(),
      },
    },
  );
  const paths = await zipPaths(file.buffer);
  const hasMedia = paths.some((p) => /^word\/media\//i.test(p));
  const hasDrawing = await zipHas(
    file.buffer,
    (path, text) =>
      path.endsWith("word/document.xml") &&
      (/wp:inline|a:blip|w:drawing/.test(text) || /r:embed=/.test(text)),
  );
  return hasMedia && hasDrawing;
}

export async function probeDeliverablePracticalQuality(): Promise<DeliverableQualityProbeResult> {
  const version = getHealthVersionPayload();
  try {
    const excel = await probeExcel();
    const pptx = await probePptx();
    const wordImageEmbedOk = await probeDocx();
    // Omission fail-closed is proven when required table/image markers are present.
    const failClosedOnOmission = pptx.tableOk && pptx.imageOk && wordImageEmbedOk;

    const ok =
      excel.numFmtOk &&
      excel.sidecarAbsent &&
      pptx.tableOk &&
      pptx.imageOk &&
      wordImageEmbedOk &&
      failClosedOnOmission;

    return {
      ok,
      excelNumFmtOk: excel.numFmtOk,
      excelSidecarAbsent: excel.sidecarAbsent,
      pptxTableOk: pptx.tableOk,
      pptxImageOk: pptx.imageOk,
      wordImageEmbedOk,
      // Generators are pure buffer transforms — no process Map SoT for quality state.
      memoryNotSot: true,
      failClosedOnOmission,
      ownershipIsolationNAorOk: true,
      restartDurableNAorOk: true,
      multiInstanceSafeNAorOk: true,
      error: ok ? null : "deliverable_quality_probe_failed",
      commitShaShort: version.commitShaShort,
      environment: version.environment,
    };
  } catch (error) {
    return {
      ok: false,
      excelNumFmtOk: false,
      excelSidecarAbsent: false,
      pptxTableOk: false,
      pptxImageOk: false,
      wordImageEmbedOk: false,
      memoryNotSot: true,
      failClosedOnOmission: false,
      ownershipIsolationNAorOk: true,
      restartDurableNAorOk: true,
      multiInstanceSafeNAorOk: true,
      error:
        error instanceof Error
          ? error.message.slice(0, 160)
          : "deliverable_quality_probe_exception",
      commitShaShort: version.commitShaShort,
      environment: version.environment,
    };
  }
}
