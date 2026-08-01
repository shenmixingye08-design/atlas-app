import type { DeliverableFormat } from "@/lib/deliverables/types";

import type {
  ArtifactCompletionStatus,
  ArtifactFormatState,
  ArtifactMissingField,
} from "./document";

const FORMAT_PURPOSE: Record<DeliverableFormat, string> = {
  docx: "Wordで編集",
  pdf: "PDFで共有",
  xlsx: "Excelで管理",
  pptx: "PowerPointで説明",
  md: "Markdownを保存",
  txt: "テキストを保存",
  csv: "CSVで受け渡し",
  png: "画像で共有",
  jpg: "画像で共有",
};

const FORMAT_LABEL: Record<DeliverableFormat, string> = {
  docx: "Word",
  pdf: "PDF",
  xlsx: "Excel",
  pptx: "PowerPoint",
  md: "Markdown",
  txt: "テキスト",
  csv: "CSV",
  png: "画像",
  jpg: "画像",
};

export function formatPurpose(format: DeliverableFormat): string {
  return FORMAT_PURPOSE[format];
}

export function formatShortLabel(format: DeliverableFormat): string {
  return FORMAT_LABEL[format];
}

export function buildFormatStates(input: {
  recommended: DeliverableFormat[];
  other: DeliverableFormat[];
  generated: Array<{
    format: DeliverableFormat;
    downloadUrl?: string;
    fileName?: string;
    sizeBytes?: number;
  }>;
  failed?: DeliverableFormat[];
  notApplicable?: DeliverableFormat[];
}): ArtifactFormatState[] {
  const generatedMap = new Map(
    input.generated.map((item) => [item.format, item]),
  );
  const failed = new Set(input.failed ?? []);
  const notApplicable = new Set(input.notApplicable ?? []);
  const all = [...input.recommended, ...input.other];
  const seen = new Set<DeliverableFormat>();

  return all
    .filter((format) => {
      if (seen.has(format)) return false;
      seen.add(format);
      return true;
    })
    .map((format) => {
      const recommended = input.recommended.includes(format);
      if (notApplicable.has(format)) {
        return {
          format,
          status: "not_applicable" as const,
          label: FORMAT_LABEL[format],
          purpose: FORMAT_PURPOSE[format],
          recommended,
        };
      }
      if (failed.has(format)) {
        return {
          format,
          status: "failed" as const,
          label: FORMAT_LABEL[format],
          purpose: FORMAT_PURPOSE[format],
          recommended,
          error: "生成に失敗しました",
        };
      }
      const file = generatedMap.get(format);
      if (file && (file.sizeBytes == null || file.sizeBytes > 0)) {
        return {
          format,
          status: "ready" as const,
          label: FORMAT_LABEL[format],
          purpose: FORMAT_PURPOSE[format],
          recommended,
          downloadUrl: file.downloadUrl,
          fileName: file.fileName,
        };
      }
      if (file && file.sizeBytes === 0) {
        return {
          format,
          status: "failed" as const,
          label: FORMAT_LABEL[format],
          purpose: FORMAT_PURPOSE[format],
          recommended,
          error: "空ファイルです",
        };
      }
      return {
        format,
        status: "pending" as const,
        label: FORMAT_LABEL[format],
        purpose: FORMAT_PURPOSE[format],
        recommended,
      };
    });
}

export function resolveCompletionStatus(input: {
  hasStructuredDocument: boolean;
  hasTemplate: boolean;
  hasPreview: boolean;
  formatStates: ArtifactFormatState[];
  missingFields: ArtifactMissingField[];
  leakDetected?: boolean;
}): ArtifactCompletionStatus {
  if (input.leakDetected || !input.hasStructuredDocument || !input.hasTemplate || !input.hasPreview) {
    return "failed";
  }

  const recommended = input.formatStates.filter((state) => state.recommended);
  const recommendedReady = recommended.filter((state) => state.status === "ready");
  const recommendedFailed = recommended.filter((state) => state.status === "failed");
  const allPending =
    recommended.length > 0 &&
    recommended.every(
      (state) => state.status === "pending" || state.status === "not_applicable",
    );

  // Invoice etc.: needs_input when critical letterhead fields are missing
  const criticalMissing = input.missingFields.some((field) =>
    ["bankAccount", "invoiceRegistrationNumber", "companyAddress"].includes(
      field.key,
    ),
  );
  if (criticalMissing) {
    return "needs_input";
  }

  // Structure-only analysis (files not generated yet) — treat as ready unless failed leak
  if (allPending) {
    return "ready";
  }

  if (recommendedFailed.length > 0 && recommendedReady.length > 0) {
    return "partial";
  }
  if (recommendedReady.length === 0) {
    return recommendedFailed.length > 0 ? "failed" : "needs_input";
  }
  if (input.formatStates.some((state) => state.status === "failed")) {
    return "partial";
  }
  return "ready";
}
