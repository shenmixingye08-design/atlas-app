import "server-only";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import {
  isGoogleAccessGateFailure,
  requireGoogleIntegrationAccess,
} from "@/lib/integrations/google/require-access";
import { GOOGLE_RECONNECT_REQUIRED_MESSAGE } from "@/lib/integrations/google/scopes";
import { getGoogleAccountAccessTokenResult } from "@/lib/integrations/google/token-manager";
import { runWithAiBillingUsage } from "@/lib/billing/usage/request-context";
import { GoogleDriveApiError } from "./errors";
import { deleteStoredDriveFolders } from "./folder-store";

import {
  classifyDriveDocument,
  searchDriveDocumentsWithAi,
  summarizeDriveDocument,
} from "./ai-assistant";
import {
  copyDriveFile,
  createDriveFile,
  downloadDriveFile,
  ensureAtlasDriveFolders,
  extractDriveFileText,
  getDriveFile,
  listDriveChildren,
  listDriveFiles,
  listDriveFolders,
  listRecentDriveFiles,
  moveDriveFile,
  searchDriveFiles,
  trashDriveFile,
  updateDriveFileContent,
} from "./api-client";
import {
  getDriveCategoryLabel,
  inferDriveCategoryFromFormat,
  isSupportedDriveFormat,
} from "./categories";
import { DRIVE_CATEGORY_FOLDERS } from "./constants";
import type {
  DriveAiClassification,
  DriveAiSearchHit,
  DriveAiSummary,
  DriveCategoryId,
  DriveFailureFields,
  DriveFetchStatus,
  DriveFileDetailResult,
  DriveFileItem,
  DriveFilesResult,
  DriveFolderItem,
  DriveSaveResult,
} from "./types";

export { parseDriveCategoryParam, isDriveCategoryId } from "./categories";

type DriveAccess =
  | { status: "ready"; accessToken: string }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string };

async function resolveGoogleDriveAccess(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<DriveAccess> {
  const result = await requireGoogleIntegrationAccess({
    userId: input.userId,
    context: input.context,
    capability: "drive",
  });
  if (isGoogleAccessGateFailure(result)) {
    return result;
  }
  return { status: "ready", accessToken: result.accessToken };
}

const FOLDER_RETRY_STAGES = new Set([
  "folder_cache_validate",
  "folder_search_root",
  "folder_create_root",
  "folder_search_category",
  "folder_create_category",
  "folder_list",
  "file_list",
]);

function toDriveFailure(error: unknown): DriveFailureFields {
  if (error instanceof GoogleDriveApiError) {
    const status: Exclude<DriveFetchStatus, "ready"> =
      error.resultStatus === "needs_reconnect"
        ? "needs_reconnect"
        : error.resultStatus === "insufficient_permission"
          ? "insufficient_permission"
          : error.resultStatus === "not_found"
            ? "not_found"
            : error.resultStatus === "rate_limited"
              ? "rate_limited"
              : error.resultStatus === "durable_unavailable"
                ? "durable_unavailable"
                : "provider_error";
    return {
      status,
      message: error.userMessage,
      diagnosticId: error.diagnosticId,
      failedStage: error.failedStage,
    };
  }
  throw error;
}

async function runDriveUserOp<T>(
  input: { userId: string; context: FeatureAccessContext },
  run: (accessToken: string) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; failure: DriveFailureFields }> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return {
      ok: false,
      failure: { status: access.status, message: access.message },
    };
  }

  try {
    return { ok: true, value: await run(access.accessToken) };
  } catch (error) {
    if (error instanceof GoogleDriveApiError && error.httpStatus === 401) {
      const refreshed = await getGoogleAccountAccessTokenResult(input.userId, {
        forceRefresh: true,
      });
      if (refreshed.status !== "ready") {
        return {
          ok: false,
          failure: {
            status: "needs_reconnect",
            message: GOOGLE_RECONNECT_REQUIRED_MESSAGE,
            failedStage: "token_refresh",
          },
        };
      }
      try {
        return { ok: true, value: await run(refreshed.accessToken) };
      } catch (retryError) {
        return { ok: false, failure: toDriveFailure(retryError) };
      }
    }

    if (
      error instanceof GoogleDriveApiError &&
      error.httpStatus === 404 &&
      FOLDER_RETRY_STAGES.has(error.failedStage)
    ) {
      deleteStoredDriveFolders(input.userId);
      try {
        return { ok: true, value: await run(access.accessToken) };
      } catch (retryError) {
        return { ok: false, failure: toDriveFailure(retryError) };
      }
    }

    return { ok: false, failure: toDriveFailure(error) };
  }
}

function categoryForParent(
  parentId: string,
  folders: Awaited<ReturnType<typeof ensureAtlasDriveFolders>>,
): DriveCategoryId {
  for (const id of Object.keys(folders.categories) as DriveCategoryId[]) {
    if (folders.categories[id].folderId === parentId) return id;
  }
  return "other";
}

export async function getGoogleDriveFilesForUser(input: {
  userId: string;
  category: DriveCategoryId | "all";
  context: FeatureAccessContext;
  query?: string | null;
  parentId?: string | null;
}): Promise<DriveFilesResult> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
  const folders = await ensureAtlasDriveFolders({
    accessToken,
    userId: input.userId,
  });

  if (input.parentId) {
    const category = categoryForParent(input.parentId, folders);
    const children = await listDriveChildren({
      accessToken,
      parentFolderId: input.parentId,
      category,
      query: input.query,
    });

    return {
      status: "ready",
      snapshot: {
        category,
        categoryLabel: getDriveCategoryLabel(category),
        query: input.query?.trim() || null,
        parentId: input.parentId,
        files: children.files,
        folderItems: children.folders,
        folders,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  const categoriesToScan =
    input.category === "all"
      ? (Object.keys(folders.categories) as DriveCategoryId[])
      : [input.category];

  const files = (
    await Promise.all(
      categoriesToScan.map((category) =>
        listDriveFiles({
          accessToken,
          parentFolderId: folders.categories[category].folderId,
          category,
          query: input.query,
        }),
      ),
    )
  )
    .flat()
    .sort(
      (a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
    );

  let folderItems: DriveFolderItem[] = [];
  if (input.category === "all" && !input.query?.trim()) {
    folderItems = await listDriveFolders({
      accessToken,
      parentFolderId: folders.rootFolderId,
    });
  } else if (input.category !== "all") {
    folderItems = await listDriveFolders({
      accessToken,
      parentFolderId: folders.categories[input.category].folderId,
    });
  }

  return {
    status: "ready" as const,
    snapshot: {
      category: input.category,
      categoryLabel: getDriveCategoryLabel(input.category),
      query: input.query?.trim() || null,
      parentId: null,
      files,
      folderItems,
      folders,
      generatedAt: new Date().toISOString(),
    },
  };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function searchGoogleDriveForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  query: string;
  parentId?: string | null;
}): Promise<DriveFilesResult> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
  const folders = await ensureAtlasDriveFolders({
    accessToken,
    userId: input.userId,
  });

  const files = await searchDriveFiles({
    accessToken,
    query: input.query,
    parentFolderId: input.parentId,
    folders,
  });

  return {
    status: "ready" as const,
    snapshot: {
      category: "all",
      categoryLabel: getDriveCategoryLabel("all"),
      query: input.query.trim(),
      parentId: input.parentId ?? null,
      files,
      folderItems: [],
      folders,
      generatedAt: new Date().toISOString(),
    },
  };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function getRecentGoogleDriveFilesForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  maxResults?: number;
}): Promise<
  | { status: "ready"; files: DriveFileItem[]; generatedAt: string }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
  const folders = await ensureAtlasDriveFolders({
    accessToken,
    userId: input.userId,
  });

  const files = await listRecentDriveFiles({
    accessToken,
    maxResults: input.maxResults ?? 8,
    folders,
  });

  return {
    status: "ready" as const,
    files,
    generatedAt: new Date().toISOString(),
  };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function getGoogleDriveFoldersForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  parentId?: string | null;
}): Promise<
  | {
      status: "ready";
      parentId: string;
      folders: DriveFolderItem[];
      layout: Awaited<ReturnType<typeof ensureAtlasDriveFolders>>;
    }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
  const layout = await ensureAtlasDriveFolders({
    accessToken,
    userId: input.userId,
  });

  const parentId = input.parentId?.trim() || layout.rootFolderId;
  const folders = await listDriveFolders({
    accessToken,
    parentFolderId: parentId,
  });

  return { status: "ready" as const, parentId, folders, layout };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function getGoogleDriveFileForUser(input: {
  userId: string;
  fileId: string;
  context: FeatureAccessContext;
  category?: DriveCategoryId;
}): Promise<DriveFileDetailResult> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
  const file = await getDriveFile({
    accessToken,
    fileId: input.fileId,
    category: input.category,
  });

  if (!file) {
    return { status: "not_found" as const, message: "ファイルが見つかりません" };
  }

  return { status: "ready" as const, file };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function saveDeliverableToGoogleDriveForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  deliverableId: string;
  category?: DriveCategoryId;
  overwriteFileId?: string | null;
}): Promise<DriveSaveResult> {
  // P0-03: never load another user's deliverable by id alone.
  const stored = await getStoredDeliverableForUser(
    input.deliverableId,
    input.userId,
  );
  if (!stored) {
    return {
      status: "not_found",
      message: "成果物が見つからないか、有効期限が切れています",
    };
  }

  if (!isSupportedDriveFormat(stored.format)) {
    return {
      status: "unsupported_format",
      message: "この形式はGoogle Drive保存に対応していません",
    };
  }

  const category =
    input.category ?? inferDriveCategoryFromFormat(stored.format);

  const executed = await runDriveUserOp(input, async (accessToken) => {
    const folders = await ensureAtlasDriveFolders({
      accessToken,
      userId: input.userId,
    });

    const parentFolderId = folders.categories[category].folderId;

    const file = input.overwriteFileId
      ? await updateDriveFileContent({
          accessToken,
          fileId: input.overwriteFileId,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          buffer: stored.buffer,
          category,
        })
      : await createDriveFile({
          accessToken,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          buffer: stored.buffer,
          parentFolderId,
          category,
        });

    return {
      status: "ready" as const,
      file,
      overwritten: Boolean(input.overwriteFileId),
      folderUrl: folders.categories[category].folderUrl,
    };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function uploadFileToGoogleDriveForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parentId?: string | null;
  category?: DriveCategoryId;
}): Promise<DriveSaveResult> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
    const folders = await ensureAtlasDriveFolders({
      accessToken,
      userId: input.userId,
    });

    const category = input.category ?? "other";
    const parentFolderId =
      input.parentId?.trim() || folders.categories[category].folderId;

    const { createHash } = await import("node:crypto");
    const { executeIdempotentSideEffect } = await import(
      "@/lib/side-effects/execute"
    );
    const contentHash = createHash("sha256")
      .update(input.buffer)
      .digest("hex")
      .slice(0, 24);
    const sideEffect = await executeIdempotentSideEffect(
      {
        userId: input.userId,
        provider: "drive",
        actionType: "upload",
        destination: `${parentFolderId}/${input.fileName}`,
        automationId: null,
        runId: null,
        occurrenceKey: null,
        discriminator: contentHash,
      },
      async () => {
        const file = await createDriveFile({
          accessToken,
          fileName: input.fileName,
          mimeType: input.mimeType || "application/octet-stream",
          buffer: input.buffer,
          parentFolderId,
          category,
        });
        return {
          providerResourceId: file.id,
          result: { file },
          evidence: { provider: "drive", contentHash, category },
        };
      },
    );

    return {
      status: "ready" as const,
      file: sideEffect.result.file,
      overwritten: false,
      folderUrl: folders.categories[category].folderUrl,
    };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function uploadBackupToGoogleDriveForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<DriveSaveResult> {
  return uploadFileToGoogleDriveForUser({
    ...input,
    category: "other",
  });
}

export async function downloadGoogleDriveFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileId: string;
}): Promise<
  | {
      status: "ready";
      file: DriveFileItem;
      buffer: Buffer;
      contentType: string;
      fileName: string;
    }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
  | { status: "not_found"; message: string }
> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
    const downloaded = await downloadDriveFile({
      accessToken,
      fileId: input.fileId,
    });
    return { status: "ready" as const, ...downloaded };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function moveGoogleDriveFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileId: string;
  destinationFolderId: string;
}): Promise<
  | { status: "ready"; file: DriveFileItem }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
    const folders = await ensureAtlasDriveFolders({
      accessToken,
      userId: input.userId,
    });

    const file = await moveDriveFile({
      accessToken,
      fileId: input.fileId,
      destinationFolderId: input.destinationFolderId,
      category: categoryForParent(input.destinationFolderId, folders),
    });

    return { status: "ready" as const, file };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function copyGoogleDriveFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileId: string;
  destinationFolderId?: string | null;
  newName?: string | null;
}): Promise<
  | { status: "ready"; file: DriveFileItem }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
    const folders = await ensureAtlasDriveFolders({
      accessToken,
      userId: input.userId,
    });

    const destination =
      input.destinationFolderId?.trim() || folders.categories.other.folderId;

    const file = await copyDriveFile({
      accessToken,
      fileId: input.fileId,
      destinationFolderId: destination,
      newName: input.newName,
      category: categoryForParent(destination, folders),
    });

    return { status: "ready" as const, file };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function deleteGoogleDriveFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileId: string;
}): Promise<
  | { status: "ready"; fileId: string }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
    await trashDriveFile({
      accessToken,
      fileId: input.fileId,
    });
    return { status: "ready" as const, fileId: input.fileId };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function summarizeGoogleDriveFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileId: string;
}): Promise<
  | { status: "ready"; summary: DriveAiSummary }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
  | { status: "not_found"; message: string }
> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
    const extracted = await extractDriveFileText({
      accessToken,
      fileId: input.fileId,
    });
    const summary = await runWithAiBillingUsage(
      {
        userId: input.userId,
        api: "google_drive",
        feature: "google_integration",
      },
      () => summarizeDriveDocument(extracted),
    );
    return { status: "ready" as const, summary };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function aiSearchGoogleDriveForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  query: string;
  category?: DriveCategoryId | "all";
}): Promise<
  | { status: "ready"; hits: DriveAiSearchHit[]; query: string }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const list = await getGoogleDriveFilesForUser({
    userId: input.userId,
    category: input.category ?? "all",
    context: input.context,
  });
  if (list.status !== "ready") {
    return { status: list.status, message: list.message };
  }

  const candidates = list.snapshot.files.slice(0, 12);
  const withText = await Promise.all(
    candidates.map(async (file) => {
      try {
        const extracted = await extractDriveFileText({
          accessToken: access.accessToken,
          fileId: file.id,
          maxChars: 2000,
        });
        return extracted;
      } catch {
        return {
          file,
          text: `ファイル名: ${file.name}\n種類: ${file.kind}`,
        };
      }
    }),
  );

  const hits = await runWithAiBillingUsage(
    {
      userId: input.userId,
      api: "google_drive",
      feature: "google_integration",
    },
    () =>
      searchDriveDocumentsWithAi({
        query: input.query,
        files: withText,
      }),
  );

  return { status: "ready", hits, query: input.query };
}

export async function classifyGoogleDriveFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileId: string;
}): Promise<
  | { status: "ready"; classification: DriveAiClassification }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
  | { status: "not_found"; message: string }
> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
    const extracted = await extractDriveFileText({
      accessToken,
      fileId: input.fileId,
    });
    const classification = await runWithAiBillingUsage(
      {
        userId: input.userId,
        api: "google_drive",
        feature: "google_integration",
      },
      () => classifyDriveDocument(extracted),
    );
    return { status: "ready" as const, classification };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export async function ensureGoogleDriveFoldersForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<DriveFilesResult> {
  const executed = await runDriveUserOp(input, async (accessToken) => {
  const folders = await ensureAtlasDriveFolders({
    accessToken,
    userId: input.userId,
  });

  return {
    status: "ready" as const,
    snapshot: {
      category: "all",
      categoryLabel: getDriveCategoryLabel("all"),
      query: null,
      parentId: null,
      files: [],
      folderItems: Object.entries(DRIVE_CATEGORY_FOLDERS).map(
        ([id, label]) => ({
          id: folders.categories[id as DriveCategoryId].folderId,
          name: label,
          webViewLink: folders.categories[id as DriveCategoryId].folderUrl,
          modifiedAt: folders.ensuredAt,
          parents: [folders.rootFolderId],
        }),
      ),
      folders,
      generatedAt: new Date().toISOString(),
    },
  };
  });
  if (!executed.ok) return executed.failure;
  return executed.value;
}

export function describeDriveKindLabel(kind: DriveFileItem["kind"]): string {
  switch (kind) {
    case "folder":
      return "フォルダ";
    case "pdf":
      return "PDF";
    case "word":
      return "Word";
    case "excel":
      return "Excel";
    case "powerpoint":
      return "PowerPoint";
    case "google_doc":
      return "Google Docs";
    case "google_sheet":
      return "Google Sheets";
    case "google_slide":
      return "Google Slides";
    default:
      return "その他";
  }
}
