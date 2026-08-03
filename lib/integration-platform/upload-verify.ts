import { createHash } from "crypto";

import type { UploadVerification } from "@/lib/integration-platform/types";

export function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function verifyUploadRoundTrip(input: {
  original: Buffer;
  downloaded: Buffer | null;
  externalId: string | null;
  externalUrl: string | null;
  remoteMetadata?: {
    id?: string | null;
    name?: string | null;
    size?: number | null;
    expectedName?: string | null;
  };
}): UploadVerification {
  const checksumSha256 = sha256Buffer(input.original);
  if (!input.externalId || !input.externalUrl) {
    return {
      uploaded: false,
      externalId: input.externalId,
      externalUrl: input.externalUrl,
      checksumSha256,
      downloadVerified: false,
      metadataMatched: false,
      byteLengthMatched: false,
    };
  }

  if (!input.downloaded) {
    return {
      uploaded: true,
      externalId: input.externalId,
      externalUrl: input.externalUrl,
      checksumSha256,
      downloadVerified: false,
      metadataMatched: false,
      byteLengthMatched: false,
    };
  }

  const byteLengthMatched =
    input.downloaded.byteLength === input.original.byteLength;
  const checksumMatched =
    sha256Buffer(input.downloaded) === checksumSha256;
  const meta = input.remoteMetadata;
  const metadataMatched =
    (!meta?.id || meta.id === input.externalId) &&
    (!meta?.expectedName || meta.name === meta.expectedName) &&
    (meta?.size == null || meta.size === input.original.byteLength);

  return {
    uploaded: true,
    externalId: input.externalId,
    externalUrl: input.externalUrl,
    checksumSha256,
    downloadVerified: byteLengthMatched && checksumMatched,
    metadataMatched,
    byteLengthMatched,
  };
}

export function uploadVerificationOk(v: UploadVerification): boolean {
  return (
    v.uploaded &&
    Boolean(v.externalId) &&
    Boolean(v.externalUrl) &&
    v.downloadVerified &&
    v.metadataMatched &&
    v.byteLengthMatched
  );
}
