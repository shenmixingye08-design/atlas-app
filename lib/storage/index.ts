export {
  assertArtifactAccess,
  assertSignedUrlOwner,
  assertOwnerImmutable,
  assertRevisionListAccess,
} from "./authz";
export type { StorageAuthzAction, StorageAuthzResult } from "./authz";

export { inspectArtifactIntegrity, contentHashSha256 } from "./integrity-matrix";
export type { IntegrityMatrixResult } from "./integrity-matrix";

export {
  createSignedDownloadToken,
  verifySignedDownloadToken,
  regenerateSignedDownloadToken,
  encodeSignedToken,
  decodeSignedToken,
  SIGNED_URL_TTL_MS,
} from "./signed-url";
export type { SignedDownloadToken } from "./signed-url";

export {
  planStorageCleanup,
  executeStorageCleanup,
  softDeleteArtifact,
  isSoftDeleted,
  trackTempUpload,
  trackThumbnail,
  trackExpiredSignedUrl,
  resetStorageCleanupForTests,
} from "./cleanup";
export type { CleanupCandidate, CleanupReport } from "./cleanup";

export { buildArtifactPreview } from "./preview";
export type { ArtifactPreviewResult } from "./preview";
