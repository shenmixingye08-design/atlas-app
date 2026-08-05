import "server-only";

import {
  createDropboxFolder,
  downloadDropboxFile,
  ensureDropboxFolderPath,
  uploadDropboxFile,
} from "@/lib/integrations/dropbox/api-client";
import type { DropboxFileItem } from "@/lib/integrations/dropbox/types";
import { buildIdempotencyKey } from "@/lib/integrations/production/idempotency";
import { runIntegrationAction } from "@/lib/integrations/production/execute";

export type DropboxSaveMode = "add" | "update" | "overwrite";

export async function saveDropboxProduction(input: {
  userId: string;
  accessToken: string;
  path: string;
  buffer: Buffer;
  /** Default add = never overwrite existing (autorename off, mode add). */
  mode?: DropboxSaveMode;
  ensureFolders?: boolean;
  requestId?: string;
}): Promise<{
  value: DropboxFileItem;
  request_id: string;
  diagnosticId: string;
  duplicate: boolean;
  retry: number;
}> {
  const normalizedPath = input.path.startsWith("/")
    ? input.path
    : `/${input.path}`;
  const mode = input.mode ?? "add";
  const fingerprint = [
    normalizedPath,
    mode,
    String(input.buffer.length),
    input.buffer.subarray(0, 32).toString("hex"),
  ].join("|");

  const idempotencyKey = buildIdempotencyKey({
    integration: "dropbox",
    action: "upload",
    userId: input.userId,
    fingerprint,
  });

  const executed = await runIntegrationAction(
    {
      integration: "dropbox",
      action: "upload",
      userId: input.userId,
      idempotencyKey,
      requestId: input.requestId,
      preventDuplicate: true,
    },
    async () => {
      if (input.ensureFolders !== false) {
        await ensureDropboxFolderPath({
          accessToken: input.accessToken,
          filePath: normalizedPath,
        });
      }

      return uploadDropboxFile({
        accessToken: input.accessToken,
        path: normalizedPath,
        buffer: input.buffer,
        mode: mode === "overwrite" || mode === "update" ? "overwrite" : "add",
        autorename: mode === "add",
        mute: false,
      });
    },
  );

  return {
    value: executed.value,
    request_id: executed.request_id,
    diagnosticId: executed.diagnosticId,
    duplicate: executed.duplicate,
    retry: executed.retry,
  };
}

export async function downloadDropboxProduction(input: {
  userId: string;
  accessToken: string;
  path: string;
  requestId?: string;
}): Promise<{
  value: { file: DropboxFileItem; buffer: Buffer; rev: string | null };
  request_id: string;
  diagnosticId: string;
  duplicate: boolean;
  retry: number;
}> {
  const normalizedPath = input.path.startsWith("/")
    ? input.path
    : `/${input.path}`;

  const executed = await runIntegrationAction(
    {
      integration: "dropbox",
      action: "download",
      userId: input.userId,
      requestId: input.requestId,
      preventDuplicate: false,
    },
    async () => {
      const downloaded = await downloadDropboxFile({
        accessToken: input.accessToken,
        path: normalizedPath,
      });
      return {
        file: downloaded.file,
        buffer: downloaded.buffer,
        rev: downloaded.rev ?? null,
      };
    },
  );

  return {
    value: executed.value,
    request_id: executed.request_id,
    diagnosticId: executed.diagnosticId,
    duplicate: executed.duplicate,
    retry: executed.retry,
  };
}

export async function ensureFolderProduction(input: {
  userId: string;
  accessToken: string;
  folderPath: string;
  requestId?: string;
}): Promise<{
  value: DropboxFileItem | null;
  request_id: string;
  diagnosticId: string;
}> {
  const executed = await runIntegrationAction(
    {
      integration: "dropbox",
      action: "ensure_folder",
      userId: input.userId,
      requestId: input.requestId,
      preventDuplicate: false,
    },
    () =>
      createDropboxFolder({
        accessToken: input.accessToken,
        path: input.folderPath,
      }),
  );

  return {
    value: executed.value,
    request_id: executed.request_id,
    diagnosticId: executed.diagnosticId,
  };
}
