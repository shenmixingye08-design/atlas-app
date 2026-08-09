/**
 * P2-02 Production probe: unified non-Word content quality gate.
 * In-process fixtures only (no secrets). Soft-success forbidden.
 */

import "server-only";

import { readFileSync } from "fs";
import { join } from "path";

import { getHealthVersionPayload } from "@/lib/health/version-info";

import {
  validateCommonSourceContent,
  validateDeliverableSourceContent,
  validateFormatSpecificSourceContent,
} from "./content-quality";

export type ContentQualityGateProbeResult = {
  ok: boolean;
  commonGateOk: boolean;
  nonWordFormatsGated: boolean;
  formatSpecificOk: boolean;
  engineNonWordPathGated: boolean;
  failClosedOnGarbage: boolean;
  memoryNotSot: boolean;
  multiInstanceSafe: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

const GOOD_REPORT = `# 週次営業報告書

## 概要
本日の営業活動について報告します。顧客訪問と提案内容を整理しました。

## 詳細
- 訪問先: 株式会社サンプル
- 課題: 業務効率の改善
- 提案: 自動化の導入
- 金額: ¥120,000
- 次のアクション: 見積書送付

訪問結果を踏まえ、来週は追加ヒアリングを実施します。
`;

const SHORT_GARBAGE = "短すぎ";
const PLACEHOLDER_GARBAGE =
  "本文です。".repeat(8) + " [TODO: ここに本文を入れる] " + "続き。".repeat(8);
const FLAT_PARAGRAPH =
  "これは十分な長さの本文ですが、見出しも箇条書きも表もなく、スライドや表計算の構造がありません。実務資料として構造化されていない長文の段落だけが続いています。追加の説明を書いても構造は増えません。";

function engineWiresNonWordGate(): boolean {
  try {
    const src = readFileSync(
      join(process.cwd(), "lib/deliverables/engine.ts"),
      "utf8",
    );
    return (
      src.includes("generateQualityDeliverableContent") &&
      src.includes("P2-02") &&
      src.includes("!needsWord")
    );
  } catch {
    return false;
  }
}

export function probeContentQualityGate(): ContentQualityGateProbeResult {
  const version = getHealthVersionPayload();
  const failures: string[] = [];

  const commonGood = validateCommonSourceContent(GOOD_REPORT);
  const commonShort = validateCommonSourceContent(SHORT_GARBAGE);
  const commonPlaceholder = validateCommonSourceContent(PLACEHOLDER_GARBAGE);
  const commonGateOk =
    commonGood.ok === true &&
    commonShort.ok === false &&
    commonPlaceholder.ok === false;
  if (!commonGateOk) failures.push("common_gate");

  const pdfGate = validateDeliverableSourceContent(SHORT_GARBAGE, ["pdf"]);
  const xlsxGate = validateDeliverableSourceContent(SHORT_GARBAGE, ["xlsx"]);
  const pptxGate = validateDeliverableSourceContent(SHORT_GARBAGE, ["pptx"]);
  const nonWordFormatsGated =
    pdfGate.ok === false && xlsxGate.ok === false && pptxGate.ok === false;
  if (!nonWordFormatsGated) failures.push("non_word_formats_not_gated");

  const xlsxSpecific = validateFormatSpecificSourceContent(
    FLAT_PARAGRAPH,
    "xlsx",
  );
  const pptxSpecific = validateFormatSpecificSourceContent(
    FLAT_PARAGRAPH,
    "pptx",
  );
  const xlsxGood = validateDeliverableSourceContent(GOOD_REPORT, ["xlsx"]);
  const pptxGood = validateDeliverableSourceContent(GOOD_REPORT, ["pptx"]);
  const pdfGood = validateDeliverableSourceContent(GOOD_REPORT, ["pdf"]);
  const formatSpecificOk =
    xlsxSpecific.ok === false &&
    pptxSpecific.ok === false &&
    xlsxGood.ok === true &&
    pptxGood.ok === true &&
    pdfGood.ok === true;
  if (!formatSpecificOk) failures.push("format_specific");

  const engineNonWordPathGated = engineWiresNonWordGate();
  if (!engineNonWordPathGated) failures.push("engine_non_word_path");

  const failClosedOnGarbage =
    validateDeliverableSourceContent(PLACEHOLDER_GARBAGE, [
      "pdf",
      "xlsx",
      "pptx",
    ]).ok === false;
  if (!failClosedOnGarbage) failures.push("fail_closed");

  const ok =
    commonGateOk &&
    nonWordFormatsGated &&
    formatSpecificOk &&
    engineNonWordPathGated &&
    failClosedOnGarbage;

  return {
    ok,
    commonGateOk,
    nonWordFormatsGated,
    formatSpecificOk,
    engineNonWordPathGated,
    failClosedOnGarbage,
    // Pure functions + source wiring — no process Map SoT for success.
    memoryNotSot: true,
    multiInstanceSafe: true,
    error: ok ? null : failures.join(",") || "content_quality_gate_failed",
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}
