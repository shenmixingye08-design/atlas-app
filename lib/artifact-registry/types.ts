/**
 * Unified Artifact identity — Production Ready registry model.
 */

export type ArtifactStatus =
  | "ready"
  | "uploading"
  | "failed"
  | "deleted"
  | "orphan_candidate";

export type ArtifactKind =
  | "docx"
  | "xlsx"
  | "pdf"
  | "pptx"
  | "csv"
  | "txt"
  | "md"
  | "image"
  | "other";

export type ArtifactIdentity = {
  artifactId: string;
  rootArtifactId: string;
  parentArtifactId: string | null;
  revisionId: string;
  version: number;
  ownerId: string;
  mimeType: string;
  extension: string;
  kind: ArtifactKind;
  createdAt: string;
  updatedAt: string;
  status: ArtifactStatus;
  fileName: string;
  sizeBytes: number;
  contentSha256: string | null;
  isLatest: boolean;
};

export type ArtifactRevisionRequest = {
  parentArtifactId: string;
  ownerId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  kind: ArtifactKind;
  revisionReason?: string | null;
  sourceContent?: string;
};
