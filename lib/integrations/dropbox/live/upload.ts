import "server-only";

import { createHash } from "node:crypto";

import {
  createDropboxSharedLink,
  getDropboxRawMetadata,
  uploadDropboxFileLive,
  type DropboxWriteMode,
} from "@/lib/integrations/dropbox/api-client";

import type { DropboxConflictPolicy } from "./types";

export function dropboxContentHash(buffer: Buffer): string {
  const BLOCK = 4 * 1024 * 1024;
  const hashes: Buffer[] = [];
  for (let i = 0; i < buffer.length; i += BLOCK) {
    hashes.push(
      createHash("sha256")
        .update(buffer.subarray(i, Math.min(i + BLOCK, buffer.length)))
        .digest(),
    );
  }
  return createHash("sha256").update(Buffer.concat(hashes)).digest("hex");
}

export type DropboxUploadedFile = {
  fileId: string;
  pathDisplay: string;
  rev: string;
  size: number;
  contentHash: string;
  fileName: string;
  deleted: boolean;
  providerRequestId: string | null;
  sharedLinkUrl: string | null;
};

function resolveWriteMode(
  conflictPolicy: DropboxConflictPolicy,
  existingRev: string | null,
): DropboxWriteMode {
  switch (conflictPolicy) {
    case "fail":
      return { tag: "add", autorename: false };
    case "rename":
    case "autorename":
      return { tag: "add", autorename: true };
    case "overwrite":
      return { tag: "overwrite" };
    case "revision":
      if (existingRev) {
        return { tag: "update", rev: existingRev };
      }
      return { tag: "add", autorename: false };
    default:
      return { tag: "add", autorename: false };
  }
}

export async function getExternalDropboxFile(input: {
  accessToken: string;
  fileId: string;
  path?: string;
}): Promise<DropboxUploadedFile> {
  const meta = await getDropboxRawMetadata({
    accessToken: input.accessToken,
    id: input.fileId,
    path: input.path,
  });
  if (!meta || meta.deleted) {
    throw new Error("Dropbox re-fetch missing or deleted file");
  }
  if (!meta.id || !meta.path_display || !meta.rev) {
    throw new Error("Dropbox re-fetch missing fileId/path_display/rev");
  }
  return {
    fileId: meta.id,
    pathDisplay: meta.path_display,
    rev: meta.rev,
    size: meta.size,
    contentHash: meta.content_hash,
    fileName: meta.name,
    deleted: meta.deleted,
    providerRequestId: null,
    sharedLinkUrl: null,
  };
}

export function verifyUploadedDropboxFile(input: {
  uploaded: DropboxUploadedFile;
  expected: {
    fileId?: string;
    pathDisplay: string;
    size: number;
    contentHash: string;
    rev?: string;
  };
}): void {
  if (input.expected.fileId && input.uploaded.fileId !== input.expected.fileId) {
    throw new Error("verification failed: fileId mismatch");
  }
  if (input.uploaded.pathDisplay !== input.expected.pathDisplay) {
    throw new Error("verification failed: path_display mismatch");
  }
  if (input.uploaded.size !== input.expected.size) {
    throw new Error("verification failed: size mismatch");
  }
  if (
    input.expected.contentHash &&
    input.uploaded.contentHash &&
    input.uploaded.contentHash !== input.expected.contentHash
  ) {
    throw new Error("verification failed: content_hash mismatch");
  }
  if (input.expected.rev && input.uploaded.rev !== input.expected.rev) {
    throw new Error("verification failed: rev mismatch");
  }
  if (input.uploaded.deleted) {
    throw new Error("verification failed: file is deleted");
  }
}

export async function uploadAndVerifyDropboxFile(input: {
  accessToken: string;
  targetPath: string;
  buffer: Buffer;
  conflictPolicy: DropboxConflictPolicy;
  contentHash: string;
  createSharedLink: boolean;
}): Promise<DropboxUploadedFile> {
  const existing = await getDropboxRawMetadata({
    accessToken: input.accessToken,
    path: input.targetPath,
  });

  if (existing && !existing.deleted && input.conflictPolicy === "fail") {
    throw new Error(
      `400 Dropbox file already exists: ${input.targetPath} (conflictPolicy=fail)`,
    );
  }

  const writeMode = resolveWriteMode(
    input.conflictPolicy,
    existing && !existing.deleted ? existing.rev : null,
  );

  const uploaded = await uploadDropboxFileLive({
    accessToken: input.accessToken,
    path: input.targetPath,
    buffer: input.buffer,
    writeMode,
  });

  const refetched = await getDropboxRawMetadata({
    accessToken: input.accessToken,
    id: uploaded.id,
    path: uploaded.path_display,
  });
  if (!refetched || refetched.deleted) {
    throw new Error("verification failed: provider re-fetch failed");
  }

  const result: DropboxUploadedFile = {
    fileId: refetched.id,
    pathDisplay: refetched.path_display,
    rev: refetched.rev,
    size: refetched.size,
    contentHash: refetched.content_hash,
    fileName: refetched.name,
    deleted: refetched.deleted,
    providerRequestId: null,
    sharedLinkUrl: null,
  };

  verifyUploadedDropboxFile({
    uploaded: result,
    expected: {
      fileId: uploaded.id,
      pathDisplay: uploaded.path_display,
      size: input.buffer.byteLength,
      contentHash: input.contentHash,
      rev: uploaded.rev,
    },
  });

  if (input.createSharedLink) {
    try {
      const link = await createDropboxSharedLink({
        accessToken: input.accessToken,
        path: refetched.path_display,
      });
      result.sharedLinkUrl = link.url;
    } catch {
      // Shared link is optional — upload verification already succeeded.
    }
  }

  return result;
}
