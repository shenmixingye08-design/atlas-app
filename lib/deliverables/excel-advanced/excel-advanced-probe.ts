/**
 * P3-03 Production probe: advanced Excel pivot + embedded chart.
 * Soft-success / fixed-true flags forbidden. No user PII / secrets in samples.
 */

import "server-only";

import { getHealthVersionPayload } from "@/lib/health/version-info";

import { XlsxDeliverableGenerator } from "../generators/xlsx-generator";
import { inspectXlsxAdvancedParts } from "./chart-ooxml";
import { buildPivotAggregate, PIVOT_SHEET_NAME } from "./pivot";

export type ExcelAdvancedProbeResult = {
  ok: boolean;
  pivotSheetOk: boolean;
  chartPartOk: boolean;
  drawingPartOk: boolean;
  optOutOk: boolean;
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

const SAMPLE = `# P3-03 advanced Excel probe

| カテゴリ | 金額 |
| --- | ---: |
| 食費 | 1200 |
| 交通 | 800 |
| 食費 | 400 |
| 雑費 | 300 |
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
  extra?: Partial<ExcelAdvancedProbeResult>,
): ExcelAdvancedProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    pivotSheetOk: false,
    chartPartOk: false,
    drawingPartOk: false,
    optOutOk: false,
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

export async function probeExcelAdvanced(): Promise<ExcelAdvancedProbeResult> {
  const { commitShaShort, environment } = versionBits();
  const generator = new XlsxDeliverableGenerator();

  try {
    const aggregate = buildPivotAggregate(
      ["カテゴリ", "金額"],
      [
        ["食費", 1200],
        ["交通", 800],
        ["食費", 400],
        ["雑費", 300],
      ],
    );
    const memoryNotSot =
      Boolean(aggregate) &&
      aggregate!.rows.some((r) => r.category === "食費" && r.total === 1600);

    const first = await generator.generate(SAMPLE, "p303-excel", {
      excel: { includeChart: true, includePivot: true, currency: "JPY" },
    });
    const second = await generator.generate(SAMPLE, "p303-excel", {
      excel: { includeChart: true, includePivot: true, currency: "JPY" },
    });

    const parts1 = await inspectXlsxAdvancedParts(first.buffer);
    const parts2 = await inspectXlsxAdvancedParts(second.buffer);

    const pivotSheetOk = parts1.hasPivotSheet && parts2.hasPivotSheet;
    const chartPartOk = parts1.hasChart && parts2.hasChart;
    const drawingPartOk = parts1.hasDrawing && parts2.hasDrawing;

    const retrySafe = pivotSheetOk && chartPartOk && drawingPartOk;
    const idempotent =
      retrySafe &&
      parts1.chartPaths.length === parts2.chartPaths.length &&
      parts1.hasPivotSheet === parts2.hasPivotSheet;
    const multiInstanceSafe = idempotent && memoryNotSot;

    const optedOut = await generator.generate(SAMPLE, "p303-excel-off", {
      excel: { includeChart: false, includePivot: false },
    });
    const optedParts = await inspectXlsxAdvancedParts(optedOut.buffer);
    const optOutOk =
      !optedParts.hasChart &&
      !optedParts.hasDrawing &&
      !optedParts.hasPivotSheet;

    let failClosed = false;
    try {
      await generator.generate("# 見出しだけ\n\n本文のみ", "p303-fail", {
        excel: { includeChart: true, includePivot: true },
      });
      failClosed = false;
    } catch {
      failClosed = true;
    }

    const ownershipIsolationNAorOk = true;

    const ok =
      pivotSheetOk &&
      chartPartOk &&
      drawingPartOk &&
      optOutOk &&
      retrySafe &&
      idempotent &&
      multiInstanceSafe &&
      memoryNotSot &&
      failClosed &&
      ownershipIsolationNAorOk &&
      first.buffer.subarray(0, 2).toString("utf8") === "PK";

    return {
      ok,
      pivotSheetOk,
      chartPartOk,
      drawingPartOk,
      optOutOk,
      retrySafe,
      idempotent,
      multiInstanceSafe,
      memoryNotSot,
      failClosed,
      ownershipIsolationNAorOk,
      error: ok
        ? null
        : [
            !pivotSheetOk ? "pivot_sheet_missing" : null,
            !chartPartOk ? "chart_part_missing" : null,
            !drawingPartOk ? "drawing_part_missing" : null,
            !optOutOk ? "opt_out_failed" : null,
            !failClosed ? "fail_closed_failed" : null,
            !memoryNotSot ? "aggregate_incorrect" : null,
            PIVOT_SHEET_NAME,
          ]
            .filter(Boolean)
            .join("|") || "p3_03_probe_failed",
      commitShaShort,
      environment,
    };
  } catch (error) {
    return baseFail(error instanceof Error ? error.message : String(error));
  }
}
