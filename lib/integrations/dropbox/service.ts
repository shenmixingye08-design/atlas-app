import "server-only";

import { extractTextFromPdfBuffer } from "@/lib/documents/extract-pdf-text";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";

import {
  analyzeDropboxPdfText,
  summarizeDropboxDocument,
} from "./ai-assistant";
import {
  createDropboxSharedLink,
  deleteDropboxPath,
  downloadDropboxFile,
  listDropboxFolder,
  searchDropboxFiles,
  uploadDropboxFile,
} from "./api-client";
import { getDropboxAccessToken } from "./oauth-service";
import type {
  DropboxAiSummary,
  DropboxFileItem,
  DropboxFilesResult,
  DropboxMutationResult,
  DropboxPdfAnalysis,
  DropboxShareResult,
} from "./types";

type DropboxAccess =
  | { status: "ready"; accessToken: string }
  | {
      status: Exclude<DropboxFilesResult["status"], "ready">;
      message: string;
    };

async function resolveDropboxAccess(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<DropboxAccess> {
  if (!isFeatureEnabled("dropbox", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("dropbox"),
    };
  }

  const connection = getExternalServiceConnection(input.userId, "dropbox");
  if (connection.status !== "connected") {
    return {
      status: "dropbox_not_connected",
      message: "Dropboxを接続してください",
    };
  }

  const accessToken = await getDropboxAccessToken(input.userId);
  if (!accessToken) {
    return {
      status: "dropbox_not_connected",
      message: "Dropboxを接続してください",
    };
  }

  return { status: "ready", accessToken };
}

export async function getDropboxFilesForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  path?: string | null;
  query?: string | null;
}): Promise<DropboxFilesResult> {
  const access = await resolveDropboxAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const path = input.path?.trim() || "";
  const query = input.query?.trim() || "";

  if (query) {
    const files = await searchDropboxFiles({
      accessToken: access.accessToken,
      query,
      path: path || undefined,
    });
    return {
      status: "ready",
      snapshot: {
        path,
        query,
        files,
        folders: [],
        generatedAt: new Date().toISOString(),
      },
    };
  }

  const entries = await listDropboxFolder({
    accessToken: access.accessToken,
    path,
  });

  return {
    status: "ready",
    snapshot: {
      path,
      query: null,
      files: entries.filter((item) => !item.isFolder),
      folders: entries.filter((item) => item.isFolder),
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function uploadDropboxFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileName: string;
  buffer: Buffer;
  parentPath?: string | null;
}): Promise<DropboxMutationResult> {
  const access = await resolveDropboxAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const parent = (input.parentPath?.trim() || "").replace(/\/$/, "");
  const safeName = input.fileName.replace(/[\\/]/g, "-");
  const path = `${parent}/${safeName}`.replace(/\/+/g, "/");

  const file = await uploadDropboxFile({
    accessToken: access.accessToken,
    path: path.startsWith("/") ? path : `/${path}`,
    buffer: input.buffer,
  });

  return { status: "ready", file };
}

export async function deleteDropboxFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  path: string;
}): Promise<
  | { status: "ready"; path: string; file: DropboxFileItem | null }
  | { status: Exclude<DropboxFilesResult["status"], "ready">; message: string }
> {
  const access = await resolveDropboxAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const file = await deleteDropboxPath({
    accessToken: access.accessToken,
    path: input.path,
  });

  return { status: "ready", path: input.path, file };
}

export async function shareDropboxFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  path: string;
}): Promise<DropboxShareResult> {
  const access = await resolveDropboxAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const shared = await createDropboxSharedLink({
    accessToken: access.accessToken,
    path: input.path,
  });

  return { status: "ready", file: shared.file, url: shared.url };
}

export async function summarizeDropboxFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  path: string;
}): Promise<
  | { status: "ready"; summary: DropboxAiSummary }
  | { status: Exclude<DropboxFilesResult["status"], "ready">; message: string }
  | { status: "not_found"; message: string }
> {
  const access = await resolveDropboxAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  try {
    const downloaded = await downloadDropboxFile({
      accessToken: access.accessToken,
      path: input.path,
    });

    let text = "";
    if (downloaded.file.kind === "pdf") {
      text = extractTextFromPdfBuffer(downloaded.buffer);
    } else {
      text = downloaded.buffer.toString("utf8");
      if (/[\u0000-\u0008]/.test(text.slice(0, 200))) {
        text = text
          .replace(/[^\x09\x0A\x0D\x20-\x7E\u3040-\u30FF\u4E00-\u9FFF]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    if (!text.trim()) {
      text = `ファイル名: ${downloaded.file.name}\n種類: ${downloaded.file.kind}`;
    }

    const summary = await summarizeDropboxDocument({
      file: downloaded.file,
      text: text.slice(0, 8000),
    });
    return { status: "ready", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summarize failed";
    if (/not_found|path/i.test(message)) {
      return { status: "not_found", message: "ファイルが見つかりません" };
    }
    throw error;
  }
}

export async function downloadDropboxFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  path: string;
}): Promise<
  | {
      status: "ready";
      file: DropboxFileItem;
      buffer: Buffer;
      fileName: string;
      contentType: string;
    }
  | { status: Exclude<DropboxFilesResult["status"], "ready">; message: string }
  | { status: "not_found"; message: string }
> {
  const access = await resolveDropboxAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  try {
    const downloaded = await downloadDropboxFile({
      accessToken: access.accessToken,
      path: input.path,
    });
    return {
      status: "ready",
      file: downloaded.file,
      buffer: downloaded.buffer,
      fileName: downloaded.file.name,
      contentType:
        downloaded.file.kind === "pdf"
          ? "application/pdf"
          : "application/octet-stream",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    if (/not_found|path/i.test(message)) {
      return { status: "not_found", message: "ファイルが見つかりません" };
    }
    throw error;
  }
}

export async function analyzeDropboxPdfForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  path: string;
}): Promise<
  | { status: "ready"; analysis: DropboxPdfAnalysis }
  | { status: Exclude<DropboxFilesResult["status"], "ready">; message: string }
  | { status: "not_found"; message: string }
  | { status: "unsupported"; message: string }
> {
  const access = await resolveDropboxAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  try {
    const downloaded = await downloadDropboxFile({
      accessToken: access.accessToken,
      path: input.path,
    });

    if (downloaded.file.kind !== "pdf") {
      return {
        status: "unsupported",
        message: "PDFファイルのみ解析できます",
      };
    }

    const text = extractTextFromPdfBuffer(downloaded.buffer);
    const analysis = await analyzeDropboxPdfText({
      file: downloaded.file,
      text,
    });
    return { status: "ready", analysis };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF analyze failed";
    if (/not_found|path/i.test(message)) {
      return { status: "not_found", message: "ファイルが見つかりません" };
    }
    throw error;
  }
}
