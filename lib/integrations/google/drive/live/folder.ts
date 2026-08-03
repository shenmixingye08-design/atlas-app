import "server-only";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

import {
  ATLAS_DRIVE_ROOT,
  buildDriveFolderUrl,
  DRIVE_API_BASE,
  DRIVE_CATEGORY_FOLDERS,
  GOOGLE_APPS_MIME,
} from "../constants";
import { ensureAtlasDriveFolders } from "../api-client";
import type { DriveCategoryId } from "../types";
import type { DriveFolderResolution } from "./types";

type DriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  trashed?: boolean;
  webViewLink?: string;
  parents?: string[];
  error?: { message?: string; code?: number };
};

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithTimeout(`${DRIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    const status = response.status;
    throw new Error(
      `${status} ${payload.error?.message ?? "Google Drive folder request failed"}`,
    );
  }
  return payload;
}

export async function getDriveFolderMetadata(input: {
  accessToken: string;
  folderId: string;
}): Promise<DriveApiFile> {
  return driveJson<DriveApiFile>(
    input.accessToken,
    `/files/${encodeURIComponent(input.folderId)}?fields=id,name,mimeType,trashed,webViewLink,parents&supportsAllDrives=true`,
  );
}

async function createFolder(input: {
  accessToken: string;
  name: string;
  parentId?: string;
}): Promise<DriveApiFile> {
  const metadata: Record<string, unknown> = {
    name: input.name,
    mimeType: GOOGLE_APPS_MIME.folder,
  };
  if (input.parentId) metadata.parents = [input.parentId];
  return driveJson<DriveApiFile>(
    input.accessToken,
    `/files?fields=id,name,webViewLink,mimeType,trashed,parents&supportsAllDrives=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    },
  );
}

async function listFoldersByName(input: {
  accessToken: string;
  name: string;
  parentId: string;
}): Promise<DriveApiFile[]> {
  const q = encodeURIComponent(
    `name='${escapeDriveQuery(input.name)}' and mimeType='${GOOGLE_APPS_MIME.folder}' and trashed=false and '${escapeDriveQuery(input.parentId)}' in parents`,
  );
  const result = await driveJson<{ files?: DriveApiFile[] }>(
    input.accessToken,
    `/files?q=${q}&fields=files(id,name,webViewLink,parents,trashed)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  );
  return result.files ?? [];
}

/**
 * Resolve target folder.
 * Ambiguous same-name folders under a parent are rejected (never auto-pick).
 */
export async function resolveTargetFolder(input: {
  accessToken: string;
  userId: string;
  targetFolderId: string | null;
  folderPath: string | null;
  createFolderIfMissing: boolean;
  categoryId?: DriveCategoryId;
}): Promise<DriveFolderResolution> {
  if (input.targetFolderId && input.targetFolderId !== "root") {
    const folder = await getDriveFolderMetadata({
      accessToken: input.accessToken,
      folderId: input.targetFolderId,
    });
    if (!folder.id) {
      throw new Error("404 Drive folder not found");
    }
    if (folder.trashed) {
      throw new Error("404 Drive folder is trashed/deleted");
    }
    if (folder.mimeType !== GOOGLE_APPS_MIME.folder) {
      throw new Error("400 targetFolderId is not a folder");
    }
    return {
      folderId: folder.id,
      folderName: folder.name ?? folder.id,
      folderUrl: folder.webViewLink ?? buildDriveFolderUrl(folder.id),
      created: false,
    };
  }

  if (input.targetFolderId === "root") {
    return {
      folderId: "root",
      folderName: "My Drive",
      folderUrl: "https://drive.google.com/drive/my-drive",
      created: false,
    };
  }

  // Default ATLAS layout / optional path segments under ATLAS root.
  const layout = await ensureAtlasDriveFolders({
    accessToken: input.accessToken,
    userId: input.userId,
  });

  const categoryId = input.categoryId ?? "other";
  let parentId = layout.categories[categoryId]?.folderId ?? layout.rootFolderId;
  let folderName =
    layout.categories[categoryId]?.label ?? DRIVE_CATEGORY_FOLDERS.other;
  let created = false;

  const path = input.folderPath?.trim();
  if (path && path !== "root" && !path.startsWith("folder:")) {
    const segments = path
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part !== ATLAS_DRIVE_ROOT);

    for (const segment of segments) {
      const matches = await listFoldersByName({
        accessToken: input.accessToken,
        name: segment,
        parentId,
      });
      if (matches.length > 1) {
        throw new Error(
          `400 Ambiguous Drive folder name "${segment}" — specify targetFolderId`,
        );
      }
      if (matches.length === 1 && matches[0]?.id) {
        parentId = matches[0].id;
        folderName = matches[0].name ?? segment;
        continue;
      }
      if (!input.createFolderIfMissing) {
        throw new Error(`404 Drive folder does not exist: ${segment}`);
      }
      const createdFolder = await createFolder({
        accessToken: input.accessToken,
        name: segment,
        parentId,
      });
      if (!createdFolder.id) {
        throw new Error("Failed to create Drive folder");
      }
      parentId = createdFolder.id;
      folderName = createdFolder.name ?? segment;
      created = true;
    }
  }

  return {
    folderId: parentId,
    folderName,
    folderUrl: buildDriveFolderUrl(parentId),
    created,
  };
}
