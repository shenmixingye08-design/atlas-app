/**
 * Vision 解析結果の後処理（非AI）。
 * 分類補正・OCRフィールド補強・レイアウト補完・品質メタ付与。
 */

import type {
  VisionAnalysisResult,
  VisionDetectedType,
  VisionLayout,
} from "@/lib/vision/types";
import {
  extractStructuredOcrFields,
  mergeStructuredFields,
  estimateOcrAccuracy,
} from "@/lib/vision/vision-production/ocr-fields";
import { inspectVisionQuality } from "@/lib/vision/vision-production/quality-inspect";
import type { ImageQualityAssessment } from "@/lib/vision/vision-production/image-quality";

const OCR_TYPE_HINTS: Array<{ type: VisionDetectedType; patterns: RegExp[] }> = [
  { type: "receipt_voucher", patterns: [/領収書/, /領収証/, /receipt\s*voucher/i] },
  { type: "receipt", patterns: [/レシート/, /領\s*収/, / ass\s*\d/i, /レジ/] },
  { type: "invoice", patterns: [/請求書/, /invoice/i, /御請求/] },
  { type: "delivery_note", patterns: [/納品書/, /delivery\s*note/i] },
  { type: "contract", patterns: [/契約書/, /秘密保持/, /NDA/i, /合意書/] },
  { type: "business_card", patterns: [/名刺/, /TEL[:：]/i, /携帯[:：]/] },
  { type: "meeting_minutes", patterns: [/議事録/, /会議メモ/, /アジェンダ/] },
  { type: "identity_document", patterns: [/運転免許証/, /マイナンバー/, /passport/i] },
  { type: "construction_photo", patterns: [/施工/, /工事現場/, /建設/] },
  { type: "whiteboard", patterns: [/ホワイトボード/, /whiteboard/i] },
  { type: "screenshot", patterns: [/スクリーンショット/, /screenshot/i, /UI/] },
  { type: "estimate", patterns: [/見積/, /quotation/i] },
  { type: "table", patterns: [/\|.+\|/, /\t.+\t/] },
  { type: "chart", patterns: [/グラフ/, /chart/i, /円グラフ|棒グラフ/] },
];

/**
 * OCR / summary テキストから書類種別を補正する（固定分類の禁止）。
 */
export function refineDetectedType(input: {
  detectedType: VisionDetectedType;
  confidence: number;
  extractedText: string | null | undefined;
  summary: string;
  userHint?: VisionDetectedType;
}): { detectedType: VisionDetectedType; confidence: number; refined: boolean } {
  const corpus = `${input.extractedText ?? ""}\n${input.summary}`;
  let best: VisionDetectedType | null = null;
  for (const entry of OCR_TYPE_HINTS) {
    if (entry.patterns.some((re) => re.test(corpus))) {
      best = entry.type;
      break;
    }
  }

  // ユーザーヒントが明確なら優先（ただし unknown 以外）
  if (
    input.userHint &&
    input.userHint !== "unknown" &&
    (input.detectedType === "unknown" || input.confidence < 0.55)
  ) {
    return {
      detectedType: input.userHint,
      confidence: Math.max(input.confidence, 0.72),
      refined: input.userHint !== input.detectedType,
    };
  }

  if (!best) {
    return {
      detectedType: input.detectedType,
      confidence: input.confidence,
      refined: false,
    };
  }

  if (input.detectedType === "unknown" || input.confidence < 0.6) {
    return {
      detectedType: best,
      confidence: Math.max(input.confidence, 0.78),
      refined: best !== input.detectedType,
    };
  }

  if (best === input.detectedType) {
    return {
      detectedType: input.detectedType,
      confidence: Math.min(1, input.confidence + 0.05),
      refined: false,
    };
  }

  // 矛盾時は元の分類を維持しつつ confidence を少し下げる
  return {
    detectedType: input.detectedType,
    confidence: Math.max(0.4, input.confidence - 0.05),
    refined: false,
  };
}

function enrichLayout(
  layout: VisionLayout | null,
  extractedText: string | null | undefined,
  summary: string,
): VisionLayout {
  const base: VisionLayout = { ...(layout ?? {}) };
  const text = extractedText?.trim() ?? "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!base.title) {
    base.title = lines[0] || summary.slice(0, 80) || null;
  }
  if (!base.headings?.length && lines.length > 1) {
    base.headings = lines.filter((l) => l.length <= 40).slice(0, 5);
  }
  if (!base.paragraphs?.length && lines.length > 0) {
    base.paragraphs = lines.filter((l) => l.length > 20).slice(0, 8);
  }
  if (base.hasTable == null) {
    base.hasTable = /\|.+\|/.test(text) || /表|テーブル/.test(text);
  }
  if (!base.bulletLists?.length) {
    const bullets = lines.filter((l) => /^[-*・●○]\s?/.test(l));
    if (bullets.length) base.bulletLists = bullets.slice(0, 12);
  }
  if (!base.header && lines[0]) base.header = lines[0];
  if (!base.footer && lines.length > 2) {
    const last = lines[lines.length - 1]!;
    if (/page|頁|ページ|TEL|〒/i.test(last)) base.footer = last;
  }
  if (!base.pageNumbers?.length) {
    const pages = text.match(/(?:page|ページ|p\.?)\s*\d+/gi);
    if (pages?.length) base.pageNumbers = pages.slice(0, 5);
  }
  if (!base.signature && /署名|サイン|signature/i.test(text)) {
    base.signature = "署名あり";
  }
  if (!base.seal && /印|印影|社印|seal/i.test(text)) {
    base.seal = "印影あり";
  }
  return base;
}

/**
 * プロバイダ結果を Production Ready 品質へ後処理する。
 */
export function refineVisionAnalysisResult(input: {
  result: VisionAnalysisResult;
  userHint?: VisionDetectedType;
  imageQuality?: ImageQualityAssessment | null;
  recommendedFormats?: string[];
  timedOut?: boolean;
  retryCount?: number;
}): VisionAnalysisResult {
  const { result } = input;
  const typeRefine = refineDetectedType({
    detectedType: result.detectedType,
    confidence: result.confidence,
    extractedText: result.extractedText,
    summary: result.summary,
    userHint: input.userHint,
  });

  const structured = extractStructuredOcrFields(
    result.extractedText,
    result.fields,
  );
  const fields = mergeStructuredFields(result.fields, structured);
  const layout = enrichLayout(result.layout, result.extractedText, result.summary);

  const required =
    typeRefine.detectedType === "receipt" ||
    typeRefine.detectedType === "receipt_voucher" ||
    typeRefine.detectedType === "invoice"
      ? ["date", "total"]
      : typeRefine.detectedType === "business_card"
        ? ["name"]
        : [];

  const ocrAccuracy = estimateOcrAccuracy(
    result.extractedText,
    fields,
    required,
  );

  const warnings = [...result.warnings];
  if (input.imageQuality?.warnings.length) {
    for (const w of input.imageQuality.warnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }
  if (typeRefine.refined) {
    warnings.push(`type_refined:${result.detectedType}->${typeRefine.detectedType}`);
  }

  const refined: VisionAnalysisResult = {
    ...result,
    detectedType: typeRefine.detectedType,
    confidence: typeRefine.confidence,
    fields: {
      ...fields,
      ocrAccuracy,
      productionReady: true,
    },
    layout,
    warnings,
  };

  // formats 未指定時は成果物準備チェックをスキップ（バッチ段階で formats が決まる）
  if (input.recommendedFormats) {
    const quality = inspectVisionQuality({
      result: refined,
      imageQuality: input.imageQuality,
      timedOut: input.timedOut,
      retryCount: input.retryCount,
      recommendedFormats: input.recommendedFormats,
    });

    refined.fields = {
      ...refined.fields,
      qualityPassed: quality.passed,
      qualityOcrAccuracy: quality.ocrAccuracy,
      qualityMissing: quality.missingRequiredFields,
    };

    if (!quality.passed) {
      for (const issue of quality.issues) {
        if (issue.severity !== "info" && !refined.warnings.includes(issue.code)) {
          refined.warnings.push(issue.code);
        }
      }
    }
  } else {
    const ocrAcc = estimateOcrAccuracy(
      refined.extractedText,
      refined.fields,
      required,
    );
    refined.fields = {
      ...refined.fields,
      qualityOcrAccuracy: ocrAcc,
    };
  }

  return refined;
}
