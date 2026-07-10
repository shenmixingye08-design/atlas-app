import "server-only";

import {
  ATLAS_DRIVE_ROOT,
  buildDriveFileUrl,
  buildDriveFolderUrl,
  DRIVE_API_BASE,
  DRIVE_CATEGORY_FOLDERS,
  DRIVE_LIST_MAX_RESULTS,
  DRIVE_UPLOAD_URL,
  sanitizeDriveFileName,
} from "./constants";
import {
  getStoredDriveFolders,
  saveStoredDriveFolders,
} from "./folder-store";
import type { DriveCategoryId, DriveFileItem, DriveFolderLayout } from "./types";

type DriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
};

type DriveListResponse = {
  files?: DriveApiFile[];
  error?: { message?: string };
};

async function driveFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Google Drive API request failed");
  }

  return payload;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolderByName(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<DriveApiFile | null> {
  const parentClause = parentId
    ? ` and '${escapeDriveQuery(parentId)}' in parents`
    : "";
  const query = encodeURIComponent(
    `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`,
  );

  const result = await driveFetch<DriveListResponse>(
    accessToken,
    `/files?q=${query}&fields=files(id,name,webViewLink)&spaces=drive`,
  );

  return result.files?.[0] ?? null;
}

async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<DriveApiFile> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  return driveFetch<DriveApiFile>(accessToken, "/files?fields=id,name,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
}

async function findOrCreateFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<DriveApiFile> {
  const existing = await findFolderByName(accessToken, name, parentId);
  if (existing?.id) return existing;
  return createFolder(accessToken, name, parentId);
}

export async function ensureAtlasDriveFolders(input: {
  accessToken: string;
  userId: string;
}): Promise<DriveFolderLayout> {
  const cached = getStoredDriveFolders(input.userId);
  if (cached) {
    const categories = Object.fromEntries(
      (Object.keys(DRIVE_CATEGORY_FOLDERS) as DriveCategoryId[]).map((id) => [
        id,
        {
          folderId: cached.categories[id],
          folderUrl: buildDriveFolderUrl(cached.categories[id]),
          label: DRIVE_CATEGORY_FOLDERS[id],
        },
      ]),
    ) as DriveFolderLayout["categories"];

    return {
      rootFolderId: cached.rootFolderId,
      rootFolderUrl: buildDriveFolderUrl(cached.rootFolderId),
      categories,
      ensuredAt: cached.ensuredAt,
    };
  }

  const root = await findOrCreateFolder(input.accessToken, ATLAS_DRIVE_ROOT);
  if (!root.id) throw new Error("Failed to create ATLAS root folder");

  const categories: Record<DriveCategoryId, string> = {
    sales_material: "",
    blog: "",
    sns: "",
    email: "",
    other: "",
  };

  for (const categoryId of Object.keys(
    DRIVE_CATEGORY_FOLDERS,
  ) as DriveCategoryId[]) {
    const folder = await findOrCreateFolder(
      input.accessToken,
      DRIVE_CATEGORY_FOLDERS[categoryId],
      root.id,
    );
    if (!folder.id) {
      throw new Error(`Failed to create folder: ${DRIVE_CATEGORY_FOLDERS[categoryId]}`);
    }
    categories[categoryId] = folder.id;
  }

  const ensuredAt = new Date().toISOString();
  saveStoredDriveFolders({
    userId: input.userId,
    rootFolderId: root.id,
    categories,
    ensuredAt,
  });

  return {
    rootFolderId: root.id,
    rootFolderUrl: buildDriveFolderUrl(root.id),
    categories: Object.fromEntries(
      (Object.keys(categories) as DriveCategoryId[]).map((id) => [
        id,
        {
          folderId: categories[id],
          folderUrl: buildDriveFolderUrl(categories[id]),
          label: DRIVE_CATEGORY_FOLDERS[id],
        },
      ]),
    ) as DriveFolderLayout["categories"],
    ensuredAt,
  };
}

function normalizeDriveFile(
  file: DriveApiFile,
  category: DriveCategoryId,
): DriveFileItem | null {
  if (!file.id || !file.name) return null;

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType ?? "application/octet-stream",
    category,
    modifiedAt: file.modifiedTime ?? new Date().toISOString(),
    sizeBytes: file.size ? Number.parseInt(file.size, 10) : null,
    webViewLink: file.webViewLink ?? buildDriveFileUrl(file.id),
    webContentLink: file.webContentLink ?? null,
  };
}

export async function listDriveFiles(input: {
  accessToken: string;
  parentFolderId: string;
  category: DriveCategoryId;
  query?: string | null;
}): Promise<DriveFileItem[]> {
  const nameClause = input.query?.trim()
    ? ` and name contains '${escapeDriveQuery(input.query.trim())}'`
    : "";
  const q = encodeURIComponent(
    `'${escapeDriveQuery(input.parentFolderId)}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'${nameClause}`,
  );

  const result = await driveFetch<DriveListResponse>(
    input.accessToken,
    `/files?q=${q}&orderBy=modifiedTime desc&pageSize=${DRIVE_LIST_MAX_RESULTS}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,webContentLink)`,
  );

  return (result.files ?? [])
    .map((file) => normalizeDriveFile(file, input.category))
    .filter((file): file is DriveFileItem => file !== null);
}

export async function getDriveFile(input: {
  accessToken: string;
  fileId: string;
  category?: DriveCategoryId;
}): Promise<DriveFileItem | null> {
  const file = await driveFetch<DriveApiFile>(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}?fields=id,name,mimeType,modifiedTime,size,webViewLink,webContentLink`,
  );

  return normalizeDriveFile(file, input.category ?? "other");
}

async function uploadMultipart(input: {
  accessToken: string;
  metadata: Record<string, unknown>;
  mimeType: string;
  buffer: Buffer;
  method: "POST" | "PATCH";
  path: string;
}): Promise<DriveApiFile> {
  const boundary = `atlas-drive-${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const bodyParts = [
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(input.metadata)}`,
    `${delimiter}Content-Type: ${input.mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  ];

  const preamble = Buffer.from(bodyParts.join(""), "utf8");
  const closing = Buffer.from(closeDelimiter, "utf8");
  const body = Buffer.concat([preamble, input.buffer, closing]);

  const response = await fetch(`${DRIVE_UPLOAD_URL}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  const payload = (await response.json()) as DriveApiFile & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Google Drive upload failed");
  }

  return payload;
}

export async function createDriveFile(input: {
  accessToken: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parentFolderId: string;
  category: DriveCategoryId;
}): Promise<DriveFileItem> {
  const metadata = {
    name: sanitizeDriveFileName(input.fileName),
    parents: [input.parentFolderId],
  };

  const uploaded = await uploadMultipart({
    accessToken: input.accessToken,
    metadata,
    mimeType: input.mimeType,
    buffer: input.buffer,
    method: "POST",
    path: "?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink,webContentLink",
  });

  const normalized = normalizeDriveFile(uploaded, input.category);
  if (!normalized) throw new Error("Failed to normalize uploaded Drive file");
  return normalized;
}

export async function updateDriveFileContent(input: {
  accessToken: string;
  fileId: string;
  fileName?: string;
  mimeType: string;
  buffer: Buffer;
  category: DriveCategoryId;
}): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {};
  if (input.fileName) {
    metadata.name = sanitizeDriveFileName(input.fileName);
  }

  const uploaded = await uploadMultipart({
    accessToken: input.accessToken,
    metadata,
    mimeType: input.mimeType,
    buffer: input.buffer,
    method: "PATCH",
    path: `/${encodeURIComponent(input.fileId)}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink,webContentLink`,
  });

  const normalized = normalizeDriveFile(uploaded, input.category);
  if (!normalized) throw new Error("Failed to normalize updated Drive file");
  return normalized;
}
