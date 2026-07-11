import "server-only";

import { getStoredDeliverable } from "@/lib/deliverables/store";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { getGoogleAccountAccessToken } from "@/lib/integrations/google/token-manager";
import { runWithAiBillingUsage } from "@/lib/billing/usage/request-context";

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
  isDriveCategoryId,
  isSupportedDriveFormat,
  parseDriveCategoryParam,
} from "./categories";
import { DRIVE_CATEGORY_FOLDERS } from "./constants";
import type {
  DriveAiClassification,
  DriveAiSearchHit,
  DriveAiSummary,
  DriveCategoryId,
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
  if (!isFeatureEnabled("google", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("google"),
    };
  }

  const { getBillingFeatureDenial } = await import("@/lib/billing/access");
  const denial = await getBillingFeatureDenial(
    input.userId,
    "google_integration",
  );
  if (denial) {
    return {
      status: "plan_required",
      message: denial.reason,
    };
  }

  const connection = getExternalServiceConnection(input.userId, "google");
  if (connection.status !== "connected") {
    return {
      status: "google_not_connected",
      message: "Googleを接続してください",
    };
  }

  const accessToken = await getGoogleAccountAccessToken(input.userId);
  if (!accessToken) {
    return {
      status: "google_not_connected",
      message: "Googleを接続してください",
    };
  }

  return { status: "ready", accessToken };
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
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  if (input.parentId) {
    const category = categoryForParent(input.parentId, folders);
    const children = await listDriveChildren({
      accessToken: access.accessToken,
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
          accessToken: access.accessToken,
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
      accessToken: access.accessToken,
      parentFolderId: folders.rootFolderId,
    });
  } else if (input.category !== "all") {
    folderItems = await listDriveFolders({
      accessToken: access.accessToken,
      parentFolderId: folders.categories[input.category].folderId,
    });
  }

  return {
    status: "ready",
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
}

export async function searchGoogleDriveForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  query: string;
  parentId?: string | null;
}): Promise<DriveFilesResult> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  const files = await searchDriveFiles({
    accessToken: access.accessToken,
    query: input.query,
    parentFolderId: input.parentId,
    folders,
  });

  return {
    status: "ready",
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
}

export async function getRecentGoogleDriveFilesForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  maxResults?: number;
}): Promise<
  | { status: "ready"; files: DriveFileItem[]; generatedAt: string }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  const files = await listRecentDriveFiles({
    accessToken: access.accessToken,
    maxResults: input.maxResults ?? 8,
    folders,
  });

  return {
    status: "ready",
    files,
    generatedAt: new Date().toISOString(),
  };
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
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const layout = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  const parentId = input.parentId?.trim() || layout.rootFolderId;
  const folders = await listDriveFolders({
    accessToken: access.accessToken,
    parentFolderId: parentId,
  });

  return { status: "ready", parentId, folders, layout };
}

export async function getGoogleDriveFileForUser(input: {
  userId: string;
  fileId: string;
  context: FeatureAccessContext;
  category?: DriveCategoryId;
}): Promise<DriveFileDetailResult> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const file = await getDriveFile({
    accessToken: access.accessToken,
    fileId: input.fileId,
    category: input.category,
  });

  if (!file) {
    return { status: "not_found", message: "ファイルが見つかりません" };
  }

  return { status: "ready", file };
}

export async function saveDeliverableToGoogleDriveForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  deliverableId: string;
  category?: DriveCategoryId;
  overwriteFileId?: string | null;
}): Promise<DriveSaveResult> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const stored = getStoredDeliverable(input.deliverableId);
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

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  const parentFolderId = folders.categories[category].folderId;

  const file = input.overwriteFileId
    ? await updateDriveFileContent({
        accessToken: access.accessToken,
        fileId: input.overwriteFileId,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        buffer: stored.buffer,
        category,
      })
    : await createDriveFile({
        accessToken: access.accessToken,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        buffer: stored.buffer,
        parentFolderId,
        category,
      });

  return {
    status: "ready",
    file,
    overwritten: Boolean(input.overwriteFileId),
    folderUrl: folders.categories[category].folderUrl,
  };
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
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  const category = input.category ?? "other";
  const parentFolderId =
    input.parentId?.trim() || folders.categories[category].folderId;

  const file = await createDriveFile({
    accessToken: access.accessToken,
    fileName: input.fileName,
    mimeType: input.mimeType || "application/octet-stream",
    buffer: input.buffer,
    parentFolderId,
    category,
  });

  return {
    status: "ready",
    file,
    overwritten: false,
    folderUrl: folders.categories[category].folderUrl,
  };
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
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  try {
    const downloaded = await downloadDriveFile({
      accessToken: access.accessToken,
      fileId: input.fileId,
    });
    return { status: "ready", ...downloaded };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    if (/not found/i.test(message)) {
      return { status: "not_found", message: "ファイルが見つかりません" };
    }
    throw error;
  }
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
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  const file = await moveDriveFile({
    accessToken: access.accessToken,
    fileId: input.fileId,
    destinationFolderId: input.destinationFolderId,
    category: categoryForParent(input.destinationFolderId, folders),
  });

  return { status: "ready", file };
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
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  const destination =
    input.destinationFolderId?.trim() || folders.categories.other.folderId;

  const file = await copyDriveFile({
    accessToken: access.accessToken,
    fileId: input.fileId,
    destinationFolderId: destination,
    newName: input.newName,
    category: categoryForParent(destination, folders),
  });

  return { status: "ready", file };
}

export async function deleteGoogleDriveFileForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileId: string;
}): Promise<
  | { status: "ready"; fileId: string }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  await trashDriveFile({
    accessToken: access.accessToken,
    fileId: input.fileId,
  });

  return { status: "ready", fileId: input.fileId };
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
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  try {
    const extracted = await extractDriveFileText({
      accessToken: access.accessToken,
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
    return { status: "ready", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summarize failed";
    if (/not found/i.test(message)) {
      return { status: "not_found", message: "ファイルが見つかりません" };
    }
    throw error;
  }
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
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  try {
    const extracted = await extractDriveFileText({
      accessToken: access.accessToken,
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
    return { status: "ready", classification };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classify failed";
    if (/not found/i.test(message)) {
      return { status: "not_found", message: "ファイルが見つかりません" };
    }
    throw error;
  }
}

export async function ensureGoogleDriveFoldersForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<DriveFilesResult> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  return {
    status: "ready",
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
