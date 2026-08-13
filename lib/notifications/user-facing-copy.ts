/**
 * User-facing notification copy helpers.
 * Never surface internal status names, error codes, or developer tokens.
 */

export type ArtifactKind = "word" | "excel" | "pdf" | "powerpoint" | "file";

const ARTIFACT_LABEL: Record<ArtifactKind, string> = {
  word: "Wordファイル",
  excel: "Excelファイル",
  pdf: "PDF",
  powerpoint: "PowerPoint",
  file: "ファイル",
};

export function looksLikeInternalCode(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/i.test(t)) return true;
  if (/^[A-Z][A-Z0-9_]{3,}$/.test(t)) return true;
  if (/\b(TypeError|ReferenceError|stack trace)\b/i.test(t)) return true;
  if (
    !/[ぁ-んァ-ン一-龯]/.test(t) &&
    /\b(error|failed|failure|exception)\b/i.test(t)
  ) {
    return true;
  }
  if (/^[a-z]+[A-Z][a-zA-Z]+$/.test(t)) return true;
  return false;
}

export function sanitizeUserFacingDetail(detail?: string | null): string | null {
  if (!detail) return null;
  const t = detail.trim();
  if (!t || looksLikeInternalCode(t)) return null;
  if (/[_`]/.test(t) && !/[ぁ-んァ-ン一-龯]/.test(t)) return null;
  return t.slice(0, 120);
}

export function inferArtifactKindFromFileName(
  fileName?: string | null,
): ArtifactKind {
  const n = (fileName ?? "").toLowerCase();
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) {
    return "excel";
  }
  if (n.endsWith(".docx") || n.endsWith(".doc")) return "word";
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".pptx") || n.endsWith(".ppt")) return "powerpoint";
  return "file";
}

export function artifactCompletedCopy(
  kind: ArtifactKind,
  fileName?: string | null,
): { title: string; message: string } {
  const label = ARTIFACT_LABEL[kind];
  return {
    title: `${label}が完成しました`,
    message: fileName
      ? `お待たせいたしました。「${fileName}」をご用意しました。通知から開いてご確認ください。`
      : `お待たせいたしました。${label}をご用意しました。通知から開いてご確認ください。`,
  };
}
