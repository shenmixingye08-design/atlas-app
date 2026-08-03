import {
  DELIVERABLE_EXTENSIONS,
  DELIVERABLE_MIME_TYPES,
  type DeliverableFormat,
} from "@/lib/deliverables/types";
import type { StoredDeliverable } from "@/lib/deliverables/store";
import type { DeliverableVersionRecord } from "@/lib/deliverables/versioning";
import type { ArtifactIdentity, ArtifactKind, ArtifactStatus } from "./types";

export function extensionForKind(kind: ArtifactKind): string {
  switch (kind) {
    case "docx":
      return ".docx";
    case "xlsx":
      return ".xlsx";
    case "pdf":
      return ".pdf";
    case "pptx":
      return ".pptx";
    case "csv":
      return ".csv";
    case "txt":
      return ".txt";
    case "md":
      return ".md";
    case "image":
      return ".png";
    default:
      return "";
  }
}

export function kindFromDeliverableFormat(format: DeliverableFormat): ArtifactKind {
  return format;
}

export function kindFromMimeAndName(
  mimeType: string,
  fileName: string,
): ArtifactKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || mimeType.includes("csv")) return "csv";
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(lower)) {
    return "image";
  }
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".txt")) return "txt";
  return "other";
}

export function mimeForKind(kind: ArtifactKind): string {
  if (kind === "csv") return "text/csv; charset=utf-8";
  if (kind === "image") return "image/png";
  if (kind === "other") return "application/octet-stream";
  if (kind in DELIVERABLE_MIME_TYPES) {
    return DELIVERABLE_MIME_TYPES[kind as DeliverableFormat];
  }
  return "application/octet-stream";
}

/**
 * Map a stored deliverable (+ optional version row) to ArtifactIdentity.
 * revisionId === artifactId (each binary is its own revision).
 * rootArtifactId === version groupId (or self when no group).
 */
export function toArtifactIdentity(input: {
  stored: StoredDeliverable;
  version?: DeliverableVersionRecord | null;
  rootArtifactId?: string | null;
  status?: ArtifactStatus;
}): ArtifactIdentity {
  const { stored, version } = input;
  const kind = kindFromDeliverableFormat(stored.format);
  const ext =
    DELIVERABLE_EXTENSIONS[stored.format] ?? extensionForKind(kind);
  const root =
    input.rootArtifactId ??
    version?.groupId ??
    stored.metadata?.versionGroupId ??
    stored.id;
  const now = new Date().toISOString();
  return {
    artifactId: stored.id,
    rootArtifactId: root,
    parentArtifactId:
      version?.parentDeliverableId ??
      stored.metadata?.parentDeliverableId ??
      null,
    revisionId: stored.id,
    version: version?.version ?? stored.metadata?.version ?? 1,
    ownerId: stored.userId,
    mimeType: stored.mimeType || mimeForKind(kind),
    extension: ext,
    kind,
    createdAt: stored.generatedAt,
    updatedAt: now,
    status: input.status ?? (stored.buffer.byteLength > 0 ? "ready" : "failed"),
    fileName: stored.fileName,
    sizeBytes: stored.buffer.byteLength,
    contentSha256: stored.contentSha256 ?? null,
    isLatest: version?.isLatest ?? true,
  };
}
