import "server-only";

import { getStoredDeliverable } from "@/lib/deliverables/store";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { getGoogleAccountAccessToken } from "@/lib/integrations/google/token-manager";

import {
  createDriveFile,
  ensureAtlasDriveFolders,
  getDriveFile,
  listDriveFiles,
  updateDriveFileContent,
} from "./api-client";
import {
  getDriveCategoryLabel,
  inferDriveCategoryFromFormat,
  isDriveCategoryId,
  isSupportedDriveFormat,
  parseDriveCategoryParam,
} from "./categories";
import type {
  DriveCategoryId,
  DriveFileDetailResult,
  DriveFilesResult,
  DriveSaveResult,
} from "./types";

export { parseDriveCategoryParam, isDriveCategoryId } from "./categories";

async function resolveGoogleDriveAccess(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ready"; accessToken: string }
  | { status: Exclude<DriveFilesResult["status"], "ready">; message: string }
> {
  if (!isFeatureEnabled("google", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("google"),
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

export async function getGoogleDriveFilesForUser(input: {
  userId: string;
  category: DriveCategoryId | "all";
  context: FeatureAccessContext;
  query?: string | null;
}): Promise<DriveFilesResult> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

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

  return {
    status: "ready",
    snapshot: {
      category: input.category,
      categoryLabel: getDriveCategoryLabel(input.category),
      query: input.query?.trim() || null,
      files,
      folders,
      generatedAt: new Date().toISOString(),
    },
  };
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

export async function uploadBackupToGoogleDriveForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<DriveSaveResult> {
  const access = await resolveGoogleDriveAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken: access.accessToken,
    userId: input.userId,
  });

  const parentFolderId = folders.categories.other.folderId;

  const file = await createDriveFile({
    accessToken: access.accessToken,
    fileName: input.fileName,
    mimeType: input.mimeType,
    buffer: input.buffer,
    parentFolderId,
    category: "other",
  });

  return {
    status: "ready",
    file,
    overwritten: false,
    folderUrl: folders.categories.other.folderUrl,
  };
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
      files: [],
      folders,
      generatedAt: new Date().toISOString(),
    },
  };
}
