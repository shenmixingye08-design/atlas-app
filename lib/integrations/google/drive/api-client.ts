import "server-only";

import {
  ATLAS_DRIVE_ROOT,
  buildDriveFileUrl,
  buildDriveFolderUrl,
  DRIVE_API_BASE,
  DRIVE_CATEGORY_FOLDERS,
  DRIVE_LIST_MAX_RESULTS,
  DRIVE_UPLOAD_URL,
  GOOGLE_APPS_MIME,
  resolveDriveDocumentKind,
  sanitizeDriveFileName,
} from "./constants";
import {
  getStoredDriveFolders,
  saveStoredDriveFolders,
} from "./folder-store";
import type {
  DriveCategoryId,
  DriveFileItem,
  DriveFolderItem,
  DriveFolderLayout,
} from "./types";

type DriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  viewedByMeTime?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
};

type DriveListResponse = {
  files?: DriveApiFile[];
  error?: { message?: string };
};

const FILE_FIELDS =
  "id,name,mimeType,modifiedTime,viewedByMeTime,size,webViewLink,webContentLink,parents";

async function driveFetchJson<T>(
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

  if (response.status === 204) {
    return {} as T;
  }

  const payload = (await response.json()) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Google Drive API request failed");
  }

  return payload;
}

async function driveFetchBinary(
  accessToken: string,
  path: string,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const response = await fetch(`${DRIVE_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? "Google Drive download failed");
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type"),
  };
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
    `name='${escapeDriveQuery(name)}' and mimeType='${GOOGLE_APPS_MIME.folder}' and trashed=false${parentClause}`,
  );

  const result = await driveFetchJson<DriveListResponse>(
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
    mimeType: GOOGLE_APPS_MIME.folder,
  };
  if (parentId) metadata.parents = [parentId];

  return driveFetchJson<DriveApiFile>(
    accessToken,
    `/files?fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    },
  );
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

function resolveCategoryFromParents(
  parents: readonly string[],
  folders: DriveFolderLayout | null,
): DriveCategoryId {
  if (!folders) return "other";
  for (const categoryId of Object.keys(
    folders.categories,
  ) as DriveCategoryId[]) {
    if (parents.includes(folders.categories[categoryId].folderId)) {
      return categoryId;
    }
  }
  return "other";
}

export function normalizeDriveFile(
  file: DriveApiFile,
  category: DriveCategoryId = "other",
): DriveFileItem | null {
  if (!file.id || !file.name) return null;
  const mimeType = file.mimeType ?? "application/octet-stream";
  const kind = resolveDriveDocumentKind(mimeType);
  const parents = file.parents ?? [];

  return {
    id: file.id,
    name: file.name,
    mimeType,
    kind,
    category,
    modifiedAt: file.modifiedTime ?? file.viewedByMeTime ?? new Date().toISOString(),
    sizeBytes: file.size ? Number.parseInt(file.size, 10) : null,
    webViewLink: file.webViewLink ?? buildDriveFileUrl(file.id),
    webContentLink: file.webContentLink ?? null,
    parents,
    isFolder: kind === "folder",
  };
}

function normalizeFolderItem(file: DriveApiFile): DriveFolderItem | null {
  if (!file.id || !file.name) return null;
  return {
    id: file.id,
    name: file.name,
    webViewLink: file.webViewLink ?? buildDriveFolderUrl(file.id),
    modifiedAt: file.modifiedTime ?? new Date().toISOString(),
    parents: file.parents ?? [],
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
    `'${escapeDriveQuery(input.parentFolderId)}' in parents and trashed=false and mimeType!='${GOOGLE_APPS_MIME.folder}'${nameClause}`,
  );

  const result = await driveFetchJson<DriveListResponse>(
    input.accessToken,
    `/files?q=${q}&orderBy=modifiedTime desc&pageSize=${DRIVE_LIST_MAX_RESULTS}&fields=files(${FILE_FIELDS})`,
  );

  return (result.files ?? [])
    .map((file) => normalizeDriveFile(file, input.category))
    .filter((file): file is DriveFileItem => file !== null);
}

export async function listDriveFolders(input: {
  accessToken: string;
  parentFolderId: string;
}): Promise<DriveFolderItem[]> {
  const q = encodeURIComponent(
    `'${escapeDriveQuery(input.parentFolderId)}' in parents and trashed=false and mimeType='${GOOGLE_APPS_MIME.folder}'`,
  );

  const result = await driveFetchJson<DriveListResponse>(
    input.accessToken,
    `/files?q=${q}&orderBy=name&pageSize=${DRIVE_LIST_MAX_RESULTS}&fields=files(id,name,mimeType,modifiedTime,webViewLink,parents)`,
  );

  return (result.files ?? [])
    .map(normalizeFolderItem)
    .filter((folder): folder is DriveFolderItem => folder !== null);
}

export async function listDriveChildren(input: {
  accessToken: string;
  parentFolderId: string;
  category?: DriveCategoryId;
  query?: string | null;
}): Promise<{ files: DriveFileItem[]; folders: DriveFolderItem[] }> {
  const nameClause = input.query?.trim()
    ? ` and name contains '${escapeDriveQuery(input.query.trim())}'`
    : "";
  const q = encodeURIComponent(
    `'${escapeDriveQuery(input.parentFolderId)}' in parents and trashed=false${nameClause}`,
  );

  const result = await driveFetchJson<DriveListResponse>(
    input.accessToken,
    `/files?q=${q}&orderBy=folder,modifiedTime desc&pageSize=${DRIVE_LIST_MAX_RESULTS}&fields=files(${FILE_FIELDS})`,
  );

  const files: DriveFileItem[] = [];
  const folders: DriveFolderItem[] = [];
  const category = input.category ?? "other";

  for (const raw of result.files ?? []) {
    if (raw.mimeType === GOOGLE_APPS_MIME.folder) {
      const folder = normalizeFolderItem(raw);
      if (folder) folders.push(folder);
      continue;
    }
    const file = normalizeDriveFile(raw, category);
    if (file) files.push(file);
  }

  return { files, folders };
}

export async function searchDriveFiles(input: {
  accessToken: string;
  query: string;
  parentFolderId?: string | null;
  folders?: DriveFolderLayout | null;
}): Promise<DriveFileItem[]> {
  const trimmed = input.query.trim();
  if (!trimmed) return [];

  const parentClause = input.parentFolderId
    ? ` and '${escapeDriveQuery(input.parentFolderId)}' in parents`
    : "";
  const q = encodeURIComponent(
    `fullText contains '${escapeDriveQuery(trimmed)}' and trashed=false and mimeType!='${GOOGLE_APPS_MIME.folder}'${parentClause}`,
  );

  const result = await driveFetchJson<DriveListResponse>(
    input.accessToken,
    `/files?q=${q}&orderBy=modifiedTime desc&pageSize=${DRIVE_LIST_MAX_RESULTS}&fields=files(${FILE_FIELDS})`,
  );

  return (result.files ?? [])
    .map((file) =>
      normalizeDriveFile(
        file,
        resolveCategoryFromParents(file.parents ?? [], input.folders ?? null),
      ),
    )
    .filter((file): file is DriveFileItem => file !== null);
}

export async function listRecentDriveFiles(input: {
  accessToken: string;
  maxResults?: number;
  folders?: DriveFolderLayout | null;
}): Promise<DriveFileItem[]> {
  const pageSize = Math.min(input.maxResults ?? 10, DRIVE_LIST_MAX_RESULTS);
  const q = encodeURIComponent(
    `trashed=false and mimeType!='${GOOGLE_APPS_MIME.folder}'`,
  );

  const result = await driveFetchJson<DriveListResponse>(
    input.accessToken,
    `/files?q=${q}&orderBy=viewedByMeTime desc&pageSize=${pageSize}&fields=files(${FILE_FIELDS})`,
  );

  return (result.files ?? [])
    .map((file) =>
      normalizeDriveFile(
        file,
        resolveCategoryFromParents(file.parents ?? [], input.folders ?? null),
      ),
    )
    .filter((file): file is DriveFileItem => file !== null);
}

export async function getDriveFile(input: {
  accessToken: string;
  fileId: string;
  category?: DriveCategoryId;
}): Promise<DriveFileItem | null> {
  const file = await driveFetchJson<DriveApiFile>(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}?fields=${FILE_FIELDS}`,
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
    path: `?uploadType=multipart&fields=${FILE_FIELDS}`,
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
    path: `/${encodeURIComponent(input.fileId)}?uploadType=multipart&fields=${FILE_FIELDS}`,
  });

  const normalized = normalizeDriveFile(uploaded, input.category);
  if (!normalized) throw new Error("Failed to normalize updated Drive file");
  return normalized;
}

export function resolveExportMimeType(mimeType: string): string | null {
  if (mimeType === GOOGLE_APPS_MIME.document) return "text/plain";
  if (mimeType === GOOGLE_APPS_MIME.spreadsheet) return "text/csv";
  if (mimeType === GOOGLE_APPS_MIME.presentation) return "text/plain";
  return null;
}

export async function downloadDriveFile(input: {
  accessToken: string;
  fileId: string;
}): Promise<{
  file: DriveFileItem;
  buffer: Buffer;
  contentType: string;
  fileName: string;
}> {
  const file = await getDriveFile({
    accessToken: input.accessToken,
    fileId: input.fileId,
  });
  if (!file) throw new Error("File not found");
  if (file.isFolder) throw new Error("Folders cannot be downloaded");

  const exportMime = resolveExportMimeType(file.mimeType);
  if (exportMime) {
    const exported = await driveFetchBinary(
      input.accessToken,
      `/files/${encodeURIComponent(input.fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`,
    );
    const extension =
      exportMime === "text/csv"
        ? ".csv"
        : exportMime === "text/plain"
          ? ".txt"
          : "";
    return {
      file,
      buffer: exported.buffer,
      contentType: exportMime,
      fileName: file.name.endsWith(extension)
        ? file.name
        : `${file.name}${extension}`,
    };
  }

  const downloaded = await driveFetchBinary(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}?alt=media`,
  );

  return {
    file,
    buffer: downloaded.buffer,
    contentType: downloaded.contentType ?? file.mimeType,
    fileName: file.name,
  };
}

export async function extractDriveFileText(input: {
  accessToken: string;
  fileId: string;
  maxChars?: number;
}): Promise<{ file: DriveFileItem; text: string }> {
  const maxChars = input.maxChars ?? 8000;
  const downloaded = await downloadDriveFile({
    accessToken: input.accessToken,
    fileId: input.fileId,
  });

  const exportMime = resolveExportMimeType(downloaded.file.mimeType);
  const isTextLike =
    Boolean(exportMime) ||
    downloaded.contentType.startsWith("text/") ||
    downloaded.file.mimeType.startsWith("text/") ||
    downloaded.file.mimeType === "application/json" ||
    downloaded.file.mimeType === "application/pdf";

  let text = "";
  if (isTextLike || exportMime) {
    text = downloaded.buffer.toString("utf8");
    // Strip obvious binary noise for PDF/Office when not exported
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text.slice(0, 200))) {
      text = text
        .replace(/[^\x09\x0A\x0D\x20-\x7E\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  if (!text.trim()) {
    text = `ファイル名: ${downloaded.file.name}\n種類: ${downloaded.file.kind}\nMIME: ${downloaded.file.mimeType}`;
  }

  return {
    file: downloaded.file,
    text: text.slice(0, maxChars),
  };
}

export async function moveDriveFile(input: {
  accessToken: string;
  fileId: string;
  destinationFolderId: string;
  category?: DriveCategoryId;
}): Promise<DriveFileItem> {
  const current = await driveFetchJson<DriveApiFile>(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}?fields=id,parents`,
  );
  const previousParents = (current.parents ?? []).join(",");

  const moved = await driveFetchJson<DriveApiFile>(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}?addParents=${encodeURIComponent(input.destinationFolderId)}&removeParents=${encodeURIComponent(previousParents)}&fields=${FILE_FIELDS}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
  );

  const normalized = normalizeDriveFile(moved, input.category ?? "other");
  if (!normalized) throw new Error("Failed to move Drive file");
  return normalized;
}

export async function copyDriveFile(input: {
  accessToken: string;
  fileId: string;
  destinationFolderId?: string | null;
  newName?: string | null;
  category?: DriveCategoryId;
}): Promise<DriveFileItem> {
  const body: Record<string, unknown> = {};
  if (input.newName?.trim()) {
    body.name = sanitizeDriveFileName(input.newName.trim());
  }
  if (input.destinationFolderId) {
    body.parents = [input.destinationFolderId];
  }

  const copied = await driveFetchJson<DriveApiFile>(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}/copy?fields=${FILE_FIELDS}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const normalized = normalizeDriveFile(copied, input.category ?? "other");
  if (!normalized) throw new Error("Failed to copy Drive file");
  return normalized;
}

export async function trashDriveFile(input: {
  accessToken: string;
  fileId: string;
}): Promise<void> {
  await driveFetchJson(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
  );
}

export async function deleteDriveFilePermanently(input: {
  accessToken: string;
  fileId: string;
}): Promise<void> {
  await driveFetchJson(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}`,
    { method: "DELETE" },
  );
}
